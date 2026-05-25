import {
  AnyFormApi,
  createFormHookContexts,
  useStore,
} from '@tanstack/react-form';
import { use } from 'react';

const disabledFieldNames = new WeakMap<AnyFormApi, Set<string>>();

export const {
  fieldContext,
  formContext,
  useFieldContext: useAppFieldContext,
} = createFormHookContexts();

export function useAppFormContext<TFormData = Record<string, unknown>>() {
  const form = use(formContext as React.Context<AnyFormApi | null>);

  if (!form) {
    throw new Error('useAppFormContext must be used within a <Form />');
  }

  return form as ExplicitAny & {
    state: AnyFormApi['state'] & { values: TFormData };
  };
}

export function useMaybeAppFormContext() {
  return use(formContext as React.Context<AnyFormApi | null>);
}

export function useAppFormStore<TSelected>(
  selector: (state: AnyFormApi['state']) => TSelected
) {
  const form = useAppFormContext();
  return useAppFormState(form, selector);
}

export function useAppFormState<TSelected>(
  form: { store: ExplicitAny },
  selector: (state: ExplicitAny) => TSelected
) {
  return useStore(form.store as never, selector as never) as TSelected;
}

export function setAppFormFieldDisabled(
  form: AnyFormApi,
  name: string,
  disabled: boolean
) {
  let fields = disabledFieldNames.get(form);
  if (!fields) {
    fields = new Set();
    disabledFieldNames.set(form, fields);
  }

  if (disabled) fields.add(name);
  else fields.delete(name);
}

export function getAppFormSubmitValues<TValues>(
  form: AnyFormApi,
  values: TValues
): TValues {
  const disabledFields = disabledFieldNames.get(form);
  if (!disabledFields?.size || !values || typeof values !== 'object') {
    return values;
  }

  const nextValues = { ...(values as Record<string, unknown>) };
  for (const name of disabledFields) {
    setValueAtPath(nextValues, name, undefined);
  }

  return nextValues as TValues;
}

export function setAppFormFieldError(
  form: AnyFormApi,
  name: string,
  message: string
) {
  form.setFieldMeta(name as never, (previous) => ({
    ...previous,
    errorMap: {
      ...previous.errorMap,
      onSubmit: message,
    },
    errorSourceMap: {
      ...previous.errorSourceMap,
      onSubmit: 'field',
    },
  }));
}

function setValueAtPath(
  values: Record<string, unknown>,
  path: string,
  value: unknown
) {
  const segments = path.split('.');
  let cursor = values;

  for (let index = 0; index < segments.length - 1; index += 1) {
    const segment = segments[index] ?? path;
    const next = cursor[segment];

    if (!next || typeof next !== 'object') {
      cursor[segment] = {};
    }

    cursor = cursor[segment] as Record<string, unknown>;
  }

  cursor[segments[segments.length - 1] ?? path] = value;
}
