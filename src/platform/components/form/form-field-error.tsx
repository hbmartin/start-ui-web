import { AlertCircleIcon } from 'lucide-react';
import { ComponentProps, ReactNode, use } from 'react';
import { useTranslation } from 'react-i18next';

import { cn } from '@/platform/lib/tailwind/utils';

import {
  useAppFormContext,
  useMaybeAppFormContext,
} from '@/platform/components/form/app-form-context';
import { useFormFieldUnsafe } from '@/platform/components/form/form-field';

import {
  AppControllerFieldState,
  FormFieldControllerContext,
} from './form-field-controller/context';

type FormFieldErrorProps = Omit<ComponentProps<'div'>, 'children'> & {
  children?: (params: {
    error?: AppControllerFieldState['error'];
  }) => ReactNode;
  control?: unknown;
  name?: string;
};

export const FormFieldError = ({
  className,
  children,

  ...props
}: FormFieldErrorProps) => {
  const fieldCtx = useFormFieldUnsafe();
  const { t } = useTranslation();
  const controllerCtx = use(FormFieldControllerContext);
  const form = useMaybeAppFormContext();
  const name = props.name;

  if (!name && !controllerCtx) {
    throw new Error(
      'Missing <FormFieldController /> parent component or "name" prop on <FormFieldError />'
    );
  }

  if (name && !controllerCtx && form) {
    return (
      <StandaloneFormFieldError {...props} className={className} name={name}>
        {children}
      </StandaloneFormFieldError>
    );
  }

  const error = controllerCtx?.fieldState.error;
  const rawMessage = error?.message;
  const errorMessage = rawMessage
    ? t(rawMessage, { defaultValue: rawMessage })
    : undefined;

  if (!errorMessage) {
    return null;
  }

  if (controllerCtx?.displayError === false) {
    return null;
  }

  if (children) {
    return children({ error });
  }

  const { control: _, name: __, ...rest } = props;

  return (
    <div
      id={fieldCtx?.errorId}
      className={cn(
        'flex animate-in gap-1 text-sm text-negative-600 slide-in-from-top-1 dark:text-negative-400',
        className
      )}
      role="alert"
      {...rest}
    >
      <AlertCircleIcon size="1em" className="my-0.5 flex-none" />
      {errorMessage}
    </div>
  );
};

function StandaloneFormFieldError({
  name,
  ...props
}: FormFieldErrorProps & { name: string }) {
  const form = useAppFormContext();
  return (
    <form.Field name={name}>
      {(fieldApi: ExplicitAny) => (
        <FormFieldControllerContext
          value={{
            type: 'text',
            displayError: true,
            fieldApi,
            field: {
              name,
              value: fieldApi.state.value,
              disabled: undefined,
              ref: () => undefined,
              onChange: (value) => fieldApi.handleChange(value),
              onBlur: () => fieldApi.handleBlur(),
            },
            fieldState: {
              invalid: !fieldApi.state.meta.isValid,
              error: getFirstErrorMessage(fieldApi.state.meta.errors),
              errors: fieldApi.state.meta.errors,
            },
          }}
        >
          <FormFieldError {...props} />
        </FormFieldControllerContext>
      )}
    </form.Field>
  );
}

function getFirstErrorMessage(errors: Array<unknown>) {
  for (const error of errors) {
    const message = getErrorMessage(error);
    if (message) return { message };
  }
  return undefined;
}

function getErrorMessage(error: unknown): string | undefined {
  if (!error) return undefined;
  if (typeof error === 'string') return error;
  if (Array.isArray(error)) {
    for (const item of error) {
      const message = getErrorMessage(item);
      if (message) return message;
    }
  }
  if (typeof error === 'object' && 'message' in error) {
    const message = (error as { message?: unknown }).message;
    return typeof message === 'string' ? message : undefined;
  }
  return undefined;
}
