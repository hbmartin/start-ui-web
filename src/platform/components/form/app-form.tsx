import { createFormHook } from '@tanstack/react-form';
import type { ComponentProps } from 'react';

import { FieldType } from '@/platform/components/form/_fields';
import {
  fieldContext,
  formContext,
  getAppFormSubmitValues,
} from '@/platform/components/form/app-form-context';
import { FormFieldController } from '@/platform/components/form/form-field-controller';

type BoundFieldProps<TType extends FieldType> = Omit<
  ComponentProps<typeof FormFieldController>,
  'type' | 'fieldApi'
> & {
  type?: TType;
};

function makeBoundField<TType extends FieldType>(type: TType) {
  return function BoundField(props: BoundFieldProps<TType>) {
    return <FormFieldController {...(props as ExplicitAny)} type={type} />;
  };
}

const appForm = createFormHook({
  fieldContext,
  formContext,
  fieldComponents: {
    TextField: makeBoundField('text'),
    EmailField: makeBoundField('email'),
    TextareaField: makeBoundField('textarea'),
    SelectField: makeBoundField('select'),
    ComboboxField: makeBoundField('combobox'),
    ComboboxMultipleField: makeBoundField('combobox-multiple'),
    NumberField: makeBoundField('number'),
    OtpField: makeBoundField('otp'),
    DateField: makeBoundField('date'),
    CheckboxField: makeBoundField('checkbox'),
    CheckboxGroupField: makeBoundField('checkbox-group'),
    RadioGroupField: makeBoundField('radio-group'),
    UploadInputField: makeBoundField('upload-input'),
  },
  formComponents: {},
});

type AppFormOptions<TFormData> = Record<string, ExplicitAny> & {
  onSubmit?: (props: {
    value: TFormData;
    formApi: ExplicitAny;
    meta: ExplicitAny;
  }) => ExplicitAny | Promise<ExplicitAny>;
};

export function useAppForm<TFormData = Record<string, unknown>>(
  props: AppFormOptions<TFormData>
) {
  const form = appForm.useAppForm({
    ...props,
    onSubmit: props.onSubmit
      ? (submitProps: ExplicitAny) =>
          props.onSubmit?.({
            ...submitProps,
            value: getAppFormSubmitValues(
              submitProps.formApi,
              submitProps.value
            ),
          })
      : undefined,
  });
  return Object.assign(form, { control: undefined }) as ExplicitAny & {
    state: typeof form.state & { values: TFormData };
    store: ExplicitAny;
    control: undefined;
  };
}

export const { withForm, withFieldGroup, useTypedAppFormContext, extendForm } =
  appForm;
