import { expect, test } from 'vitest';

import {
  FormField,
  FormFieldController,
  FormFieldError,
  FormFieldLabel,
} from '@/components/form';
import { FormMocked } from '@/components/form/form-test-utils';

import { zFormFieldsBook } from '@/modules/book/presentation/schema';
import { page, render, setupUser } from '@/tests/utils';

test('book form translates the schema title-required error code at render', async () => {
  const user = setupUser();

  render(
    <FormMocked
      schema={zFormFieldsBook()}
      useFormOptions={{
        defaultValues: {
          title: '',
          author: 'a',
          publisher: undefined,
          coverId: undefined,
          genreId: 'g',
        },
        mode: 'onSubmit',
      }}
    >
      {({ form }) => (
        <FormField>
          <FormFieldLabel>Title</FormFieldLabel>
          <FormFieldController
            type="text"
            control={form.control}
            name="title"
          />
          <FormFieldError control={form.control} name="title" />
        </FormField>
      )}
    </FormMocked>
  );

  await user.click(page.getByRole('button', { name: 'Submit' }));

  await expect.element(page.getByText('Title is required')).toBeInTheDocument();
});
