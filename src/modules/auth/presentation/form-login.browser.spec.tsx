import { expect, test } from 'vitest';

import {
  FormField,
  FormFieldController,
  FormFieldError,
  FormFieldLabel,
} from '@/components/form';
import { FormMocked } from '@/components/form/form-test-utils';

import { zFormFieldsLogin } from '@/modules/auth/presentation/schema';
import { page, render, setupUser } from '@/tests/utils';

test('login form translates the schema email-invalid error code at render', async () => {
  const user = setupUser();

  render(
    <FormMocked
      schema={zFormFieldsLogin()}
      useFormOptions={{ defaultValues: { email: '' }, mode: 'onSubmit' }}
    >
      {({ form }) => (
        <FormField>
          <FormFieldLabel>Email</FormFieldLabel>
          <FormFieldController
            type="email"
            control={form.control}
            name="email"
          />
          <FormFieldError control={form.control} name="email" />
        </FormField>
      )}
    </FormMocked>
  );

  const input = page.getByLabelText('Email');
  await user.type(input.element() as HTMLInputElement, 'not-an-email');
  await user.click(page.getByRole('button', { name: 'Submit' }));

  await expect.element(page.getByText('Email is invalid')).toBeInTheDocument();
});

test('login form translates the schema email-required error code at render', async () => {
  const user = setupUser();

  render(
    <FormMocked
      schema={zFormFieldsLogin()}
      useFormOptions={{ defaultValues: { email: '' }, mode: 'onSubmit' }}
    >
      {({ form }) => (
        <FormField>
          <FormFieldLabel>Email</FormFieldLabel>
          <FormFieldController
            type="email"
            control={form.control}
            name="email"
          />
          <FormFieldError control={form.control} name="email" />
        </FormField>
      )}
    </FormMocked>
  );

  await user.click(page.getByRole('button', { name: 'Submit' }));

  await expect.element(page.getByText('Email is required')).toBeInTheDocument();
});
