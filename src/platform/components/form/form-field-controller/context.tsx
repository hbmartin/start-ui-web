import { createContext, use } from 'react';
import type { AnyFieldApi } from '@tanstack/react-form';

import { FieldType } from '@/platform/components/form/_fields';

export type AppControllerField = {
  name: string;
  value: ExplicitAny;
  onChange: (...args: Array<ExplicitAny>) => void;
  onBlur: (...args: Array<ExplicitAny>) => void;
  disabled?: boolean;
  ref: (node: unknown) => void;
};

export type AppControllerFieldState = {
  invalid: boolean;
  error?: { message?: string };
  errors: Array<unknown>;
};

export type NonGenericFormFieldControllerContextValue =
  FormFieldControllerContextValue;

export type FormFieldControllerContextValue = {
  type: FieldType;
  field: AppControllerField;
  fieldState: AppControllerFieldState;
  fieldApi: AnyFieldApi;
  displayError?: boolean;
};

export const FormFieldControllerContext =
  createContext<FormFieldControllerContextValue | null>(null);

export function useFormFieldController() {
  const context = use(FormFieldControllerContext);

  if (!context)
    throw new Error(
      'useFormFieldController must be used within a <FormFieldController />'
    );

  return context;
}
