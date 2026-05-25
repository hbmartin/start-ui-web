import { z } from 'zod';

import { zu } from '@/platform/lib/zod/zod-utils';

import { FormFieldController, useAppForm } from '@/platform/components/form';
import { onSubmit } from '@/platform/components/form/docs.utils';
import { Button } from '@/platform/components/ui/button';

import { Form, FormField, FormFieldHelper, FormFieldLabel } from '../';
const zFormSchema = () =>
  z.object({
    description: zu.fieldText.required({ error: 'Description is required' }),
  });

const formOptions = {
  validators: { onSubmit: zFormSchema(), onBlur: zFormSchema() },
  defaultValues: {
    description: '',
  },
} as const;

const Default = () => {
  const form = useAppForm(formOptions);

  return (
    <Form {...form} onSubmit={onSubmit}>
      <div className="flex flex-col gap-4">
        <FormField>
          <FormFieldLabel>Description</FormFieldLabel>
          <FormFieldController
            type="textarea"
            control={form.control}
            name="description"
            placeholder="Buzz Pawdrin"
          />
          <FormFieldHelper>Help</FormFieldHelper>
        </FormField>
        <div>
          <Button type="submit">Submit</Button>
        </div>
      </div>
    </Form>
  );
};

const DefaultValue = () => {
  const form = useAppForm({
    ...formOptions,
    defaultValues: {
      description: 'Default description',
    },
  });

  return (
    <Form {...form} onSubmit={onSubmit}>
      <div className="flex flex-col gap-4">
        <FormField>
          <FormFieldLabel>Description</FormFieldLabel>
          <FormFieldController
            control={form.control}
            type="textarea"
            name="description"
            placeholder="Buzz Pawdrin"
          />
          <FormFieldHelper>Help</FormFieldHelper>
        </FormField>
        <div>
          <Button type="submit">Submit</Button>
        </div>
      </div>
    </Form>
  );
};

const Disabled = () => {
  const form = useAppForm({
    ...formOptions,
    defaultValues: {
      description: 'Default Value',
    },
  });

  return (
    <Form {...form} onSubmit={onSubmit}>
      <div className="flex flex-col gap-4">
        <FormField>
          <FormFieldLabel>Description</FormFieldLabel>
          <FormFieldController
            control={form.control}
            type="textarea"
            name="description"
            placeholder="Buzz Pawdrin"
            disabled
          />
          <FormFieldHelper>Help</FormFieldHelper>
        </FormField>
        <div>
          <Button type="submit">Submit</Button>
        </div>
      </div>
    </Form>
  );
};

const ReadOnly = () => {
  const form = useAppForm({
    ...formOptions,
    defaultValues: {
      description: 'Default Value',
    },
  });

  return (
    <Form {...form} onSubmit={onSubmit}>
      <div className="flex flex-col gap-4">
        <FormField>
          <FormFieldLabel>Description</FormFieldLabel>
          <FormFieldController
            control={form.control}
            type="textarea"
            name="description"
            placeholder="Buzz Pawdrin"
            readOnly
          />
          <FormFieldHelper>Help</FormFieldHelper>
        </FormField>
        <div>
          <Button type="submit">Submit</Button>
        </div>
      </div>
    </Form>
  );
};

export default {
  Default,
  DefaultValue,
  Disabled,
  ReadOnly,
};
