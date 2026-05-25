import type { AnyFieldApi } from '@tanstack/react-form';
import { useEffect } from 'react';
import type { ReactNode } from 'react';

import {
  FieldComponentProps,
  fieldComponents,
  FieldType,
} from '@/platform/components/form/_fields';
import {
  setAppFormFieldDisabled,
  useAppFormContext,
} from '@/platform/components/form/app-form-context';

import {
  AppControllerField,
  AppControllerFieldState,
  FormFieldControllerContext,
  NonGenericFormFieldControllerContextValue,
} from './context';

type FormFieldControllerRenderProps = {
  field: AppControllerField;
  fieldState: AppControllerFieldState;
  formState: AnyFieldApi['form']['state'];
};

type FormFieldControllerProps = (
  | { [K in FieldType]: { type: K } & FieldComponentProps<K> }[FieldType]
  | {
      type: 'custom';
      render: (props: FormFieldControllerRenderProps) => ReactNode;
    }
) & {
  name?: string;
  control?: unknown;
  fieldApi?: AnyFieldApi;
  defaultValue?: unknown;
  validators?: ExplicitAny;
  disabled?: boolean;
  displayError?: boolean;
};

export function FormFieldController(props: FormFieldControllerProps) {
  const {
    name,
    fieldApi,
    defaultValue,
    validators,
    displayError = true,
  } = props;

  if (fieldApi) {
    const { fieldProps } = getControllerProps(props);
    return (
      <FormFieldControllerRender
        fieldApi={fieldApi}
        type={props.type}
        displayError={displayError}
        fieldProps={fieldProps}
        customRender={props.type === 'custom' ? props.render : undefined}
        disabled={props.disabled}
      />
    );
  }

  if (!name) {
    throw new Error('Missing "name" prop on <FormFieldController />');
  }

  const form = useAppFormContext();
  const { fieldProps } = getControllerProps(props);

  return (
    <form.Field name={name} defaultValue={defaultValue} validators={validators}>
      {(fieldApi: AnyFieldApi) => (
        <FormFieldControllerRender
          fieldApi={fieldApi}
          type={props.type}
          displayError={displayError}
          fieldProps={fieldProps}
          customRender={props.type === 'custom' ? props.render : undefined}
          disabled={props.disabled}
        />
      )}
    </form.Field>
  );
}

function FormFieldControllerRender({
  fieldApi,
  type,
  displayError,
  fieldProps,
  customRender,
  disabled,
}: {
  fieldApi: AnyFieldApi;
  type: FieldType | 'custom';
  displayError: boolean;
  fieldProps: Record<string, unknown>;
  customRender?: (props: FormFieldControllerRenderProps) => ReactNode;
  disabled?: boolean;
}) {
  useEffect(() => {
    setAppFormFieldDisabled(fieldApi.form, fieldApi.name, Boolean(disabled));
    return () => {
      setAppFormFieldDisabled(fieldApi.form, fieldApi.name, false);
    };
  }, [disabled, fieldApi.form, fieldApi.name]);

  const firstErrorMessage = getFirstErrorMessage(fieldApi.state.meta.errors);
  const field: AppControllerField = {
    name: fieldApi.name,
    value: fieldApi.state.value,
    disabled,
    ref: () => undefined,
    onChange: (value: ExplicitAny) => {
      fieldApi.handleChange(readInputValue(value));
    },
    onBlur: () => {
      fieldApi.handleBlur();
    },
  };
  const fieldState: AppControllerFieldState = {
    invalid: !fieldApi.state.meta.isValid,
    error: firstErrorMessage ? { message: firstErrorMessage } : undefined,
    errors: fieldApi.state.meta.errors,
  };
  const contextValue = { type, displayError, field, fieldState, fieldApi };

  const fieldContent =
    type === 'custom'
      ? customRender?.({
          field,
          fieldState,
          formState: fieldApi.form.state,
        })
      : (() => {
          const Field = fieldComponents[type];
          return (
            <Field {...(fieldProps as FieldComponentProps<ExplicitAny>)} />
          );
        })();

  return (
    <FormFieldControllerContext
      value={contextValue as NonGenericFormFieldControllerContextValue}
    >
      {fieldContent}
    </FormFieldControllerContext>
  );
}

function readInputValue(value: ExplicitAny) {
  if (
    value &&
    typeof value === 'object' &&
    'target' in value &&
    value.target &&
    typeof value.target === 'object'
  ) {
    const target = value.target as HTMLInputElement;
    if (target.type === 'checkbox') return target.checked;
    return target.value;
  }

  return value;
}

function getFirstErrorMessage(errors: Array<unknown>): string | undefined {
  for (const error of errors) {
    const message = getErrorMessage(error);
    if (message) return message;
  }
  return undefined;
}

function getControllerProps(props: FormFieldControllerProps) {
  const {
    defaultValue: _defaultValue,
    displayError: _displayError,
    control: _control,
    fieldApi: _fieldApi,
    name: _name,
    render: _render,
    type: _type,
    validators: _validators,
    ...fieldProps
  } = props as FormFieldControllerProps & { render?: unknown };

  return { fieldProps };
}

function getErrorMessage(error: unknown): string | undefined {
  if (!error) return undefined;
  if (typeof error === 'string') return error;
  if (Array.isArray(error)) return getFirstErrorMessage(error);
  if (typeof error === 'object' && 'message' in error) {
    const message = (error as { message?: unknown }).message;
    return typeof message === 'string' ? message : undefined;
  }
  return undefined;
}
