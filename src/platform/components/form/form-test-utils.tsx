import { ReactNode } from 'react';
import { z, ZodType } from 'zod';

import { Form, useAppForm } from '@/platform/components/form';

type TestForm<TValues> = ReturnType<typeof useAppForm<TValues>> & {
  control: undefined;
};

export const FormMocked = <T extends ZodType>({
  children,
  schema,
  useFormOptions = {},
  onSubmit,
}: {
  children(options: { form: TestForm<z.infer<T>> }): ReactNode;
  schema: T;
  useFormOptions?: Record<string, ExplicitAny> & {
    defaultValues?: z.infer<T>;
  };
  onSubmit?: (values: z.infer<T>) => void | Promise<void>;
}) => {
  const defaultValues = useFormOptions?.defaultValues;
  const defaultValueKeys =
    defaultValues && typeof defaultValues === 'object'
      ? Object.keys(defaultValues)
      : [];
  const handleSubmit:
    | ((values: z.infer<T>) => void | Promise<void>)
    | undefined = onSubmit
    ? (values) =>
        onSubmit({
          ...Object.fromEntries(
            defaultValueKeys.map((key) => [key, undefined])
          ),
          ...((values ?? {}) as Record<string, unknown>),
        } as z.infer<T>)
    : undefined;
  const form = useAppForm<z.infer<T>>({
    defaultValues: useFormOptions.defaultValues,
    validators: {
      onSubmit: schema,
      onBlur: schema,
    },
    onSubmit: async ({ value }) => {
      await handleSubmit?.(value);
    },
    ...useFormOptions,
  }) as TestForm<z.infer<T>>;
  form.control = undefined;

  return (
    <Form form={form}>
      {children({ form })}
      <button type="submit">Submit</button>
    </Form>
  );
};
