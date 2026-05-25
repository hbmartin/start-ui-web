import { z } from 'zod';

import { FormFieldController, useAppForm } from '@/platform/components/form';
import { onSubmit } from '@/platform/components/form/docs.utils';
import { Button } from '@/platform/components/ui/button';

import { Form, FormField, FormFieldHelper, FormFieldLabel } from '../';
const zFormSchema = () =>
  z.object({
    bears: z
      .array(z.string(), 'Required')
      .nonempty('Select at least one answer.'),
  });

const formOptions = {
  validators: { onSubmit: zFormSchema(), onBlur: zFormSchema() },
  defaultValues: {
    bears: [],
  } as z.infer<ReturnType<typeof zFormSchema>>,
} as const;

const options = [
  { value: 'bearstrong', label: 'Bearstrong' },
  { value: 'pawdrin', label: 'Buzz Pawdrin' },
  { value: 'grizzlyrin', label: 'Yuri Grizzlyrin' },
];

const Default = () => {
  const form = useAppForm(formOptions);

  return (
    <Form {...form} onSubmit={onSubmit}>
      <div className="flex flex-col gap-4">
        <FormField>
          <FormFieldLabel>Bearstronaut</FormFieldLabel>
          <FormFieldHelper>Select your favorite bearstronaut</FormFieldHelper>
          <FormFieldController
            type="checkbox-group"
            control={form.control}
            name="bears"
            options={options}
          />
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
      bears: ['pawdrin'],
    },
  });

  return (
    <Form {...form} onSubmit={onSubmit}>
      <div className="flex flex-col gap-4">
        <FormField>
          <FormFieldLabel>Bearstronaut</FormFieldLabel>
          <FormFieldHelper>Select your favorite bearstronaut</FormFieldHelper>
          <FormFieldController
            control={form.control}
            type="checkbox-group"
            name="bears"
            options={options}
          />
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
      bears: ['pawdrin'],
    },
  });

  return (
    <Form {...form} onSubmit={onSubmit}>
      <div className="flex flex-col gap-4">
        <FormField>
          <FormFieldLabel>Bearstronaut</FormFieldLabel>
          <FormFieldHelper>Select your favorite bearstronaut</FormFieldHelper>
          <FormFieldController
            control={form.control}
            type="checkbox-group"
            name="bears"
            options={options}
            disabled
          />
        </FormField>
        <div>
          <Button type="submit">Submit</Button>
        </div>
      </div>
    </Form>
  );
};

const Row = () => {
  const form = useAppForm(formOptions);

  return (
    <Form {...form} onSubmit={onSubmit}>
      <div className="flex flex-col gap-4">
        <FormField>
          <FormFieldLabel>Bearstronaut</FormFieldLabel>
          <FormFieldHelper>Select your favorite bearstronaut</FormFieldHelper>
          <FormFieldController
            control={form.control}
            type="checkbox-group"
            name="bears"
            options={options}
            className="flex-row gap-6"
          />
        </FormField>
        <div>
          <Button type="submit">Submit</Button>
        </div>
      </div>
    </Form>
  );
};

const WithDisabledOption = () => {
  const form = useAppForm(formOptions);

  const optionsWithDisabled = [
    { value: 'bearstrong', label: 'Bearstrong' },
    { value: 'pawdrin', label: 'Buzz Pawdrin' },
    { value: 'grizzlyrin', label: 'Yuri Grizzlyrin', disabled: true },
  ];

  return (
    <Form {...form} onSubmit={onSubmit}>
      <div className="flex flex-col gap-4">
        <FormField>
          <FormFieldLabel>Bearstronaut</FormFieldLabel>
          <FormFieldHelper>Select your favorite bearstronaut</FormFieldHelper>
          <FormFieldController
            control={form.control}
            type="checkbox-group"
            name="bears"
            options={optionsWithDisabled}
          />
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
  Row,
  WithDisabledOption,
};
