import { useMutation } from '@tanstack/react-query';
import { ReactElement, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';

import {
  Form,
  FormField,
  FormFieldController,
  FormFieldLabel,
  useAppForm,
} from '@/platform/components/form';
import { Button } from '@/platform/components/ui/button';
import {
  ResponsiveDrawer,
  ResponsiveDrawerBody,
  ResponsiveDrawerContent,
  ResponsiveDrawerDescription,
  ResponsiveDrawerFooter,
  ResponsiveDrawerHeader,
  ResponsiveDrawerTitle,
  ResponsiveDrawerTrigger,
} from '@/platform/components/ui/responsive-drawer';

import {
  FormFieldsAccountUpdateName,
  zFormFieldsAccountUpdateName,
} from '@/modules/account/presentation/schema';
import { useAuthSession } from '@/modules/auth/client';

import { accountQueries } from './queries';

export const ChangeNameDrawer = (props: { children: ReactElement }) => {
  const { t } = useTranslation(['account']);
  const [open, setOpen] = useState(false);
  const session = useAuthSession();
  const updateUser = useMutation({
    ...accountQueries.updateInfo(),
    onError: () => toast.error(t('account:changeNameDrawer.errorMessage')),
  });
  const form = useAppForm<FormFieldsAccountUpdateName>({
    defaultValues: {
      name: session.data?.user.name ?? '',
    } satisfies FormFieldsAccountUpdateName,
    validators: {
      onSubmit: zFormFieldsAccountUpdateName(),
    },
    onSubmit: async ({ value: { name }, formApi }) => {
      await updateUser.mutateAsync({ name });
      await session.refetch();
      toast.success(t('account:changeNameDrawer.successMessage'));
      formApi.reset();
      setOpen(false);
    },
  });

  return (
    <ResponsiveDrawer
      open={open}
      onOpenChange={(isOpen: boolean) => {
        setOpen(isOpen);
        form.reset();
      }}
    >
      <ResponsiveDrawerTrigger render={props.children} />

      <ResponsiveDrawerContent className="sm:max-w-xs">
        <Form form={form} className="flex flex-col gap-4">
          <ResponsiveDrawerHeader>
            <ResponsiveDrawerTitle>
              {t('account:changeNameDrawer.title')}
            </ResponsiveDrawerTitle>
            <ResponsiveDrawerDescription className="sr-only">
              {t('account:changeNameDrawer.description')}
            </ResponsiveDrawerDescription>
          </ResponsiveDrawerHeader>
          <ResponsiveDrawerBody>
            <FormField>
              <FormFieldLabel className="sr-only">
                {t('account:changeNameDrawer.label')}
              </FormFieldLabel>
              <FormFieldController
                type="text"
                name="name"
                size="lg"
                autoFocus
              />
            </FormField>
          </ResponsiveDrawerBody>
          <ResponsiveDrawerFooter>
            <Button
              type="submit"
              className="w-full"
              size="lg"
              loading={updateUser.isPending}
            >
              {t('account:changeNameDrawer.submitButton')}
            </Button>
          </ResponsiveDrawerFooter>
        </Form>
      </ResponsiveDrawerContent>
    </ResponsiveDrawer>
  );
};
