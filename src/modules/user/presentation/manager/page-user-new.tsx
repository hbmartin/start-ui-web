import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';

import { useNavigateBack } from '@/platform/hooks/use-navigate-back';

import { BackButton } from '@/platform/components/back-button';
import {
  Form,
  setAppFormFieldError,
  useAppForm,
  useAppFormState,
} from '@/platform/components/form';
import { PreventNavigation } from '@/platform/components/prevent-navigation';
import { Button } from '@/platform/components/ui/button';
import { Card, CardContent } from '@/platform/components/ui/card';

import { useCurrentScopeKey } from '@/modules/auth/client';
import { isServerFnError } from '@/modules/kernel/client';
import {
  ManagerPageLayout as PageLayout,
  ManagerPageLayoutContent as PageLayoutContent,
  ManagerPageLayoutTopBar as PageLayoutTopBar,
  ManagerPageLayoutTopBarTitle as PageLayoutTopBarTitle,
} from '@/modules/shell/presentation';
import { FormUser } from '@/modules/user/presentation/manager/form-user';
import {
  FormFieldsUser,
  zFormFieldsUser,
} from '@/modules/user/presentation/schema';

import { userQueries } from '../queries';

export const PageUserNew = () => {
  const { t } = useTranslation(['user']);
  const { navigateBack } = useNavigateBack();
  const queryClient = useQueryClient();
  const scopeKey = useCurrentScopeKey();
  const userCreate = useMutation(userQueries.create());
  const form = useAppForm<FormFieldsUser>({
    defaultValues: {
      name: '',
      email: '',
      role: 'user',
    } satisfies FormFieldsUser,
    validators: {
      onSubmit: zFormFieldsUser(),
    },
    onSubmit: async ({ value, formApi }) => {
      try {
        await userCreate.mutateAsync(value);
        // Invalidate Users list
        await queryClient.invalidateQueries({
          queryKey: userQueries.getAll(scopeKey),
          type: 'all',
        });

        // Redirect
        navigateBack({ ignoreBlocker: true });
      } catch (error) {
        if (
          isServerFnError(error) &&
          error.code === 'CONFLICT' &&
          Array.isArray(error.data?.target) &&
          error.data.target.includes('email')
        ) {
          setAppFormFieldError(
            formApi,
            'email',
            t('user:manager.form.emailAlreadyExist')
          );
          return;
        }

        toast.error(t('user:manager.new.createError'));
      }
    },
  });
  const isDirty = useAppFormState(form, (state) => state.isDirty);

  return (
    <>
      <PreventNavigation shouldBlock={isDirty} />
      <Form form={form}>
        <PageLayout>
          <PageLayoutTopBar
            startActions={<BackButton />}
            endActions={
              <Button
                size="sm"
                type="submit"
                className="min-w-20"
                loading={userCreate.isPending}
              >
                {t('user:manager.new.createButton.label')}
              </Button>
            }
          >
            <PageLayoutTopBarTitle>
              {t('user:manager.new.title')}
            </PageLayoutTopBarTitle>
          </PageLayoutTopBar>
          <PageLayoutContent>
            <Card>
              <CardContent>
                <FormUser />
              </CardContent>
            </Card>
          </PageLayoutContent>
        </PageLayout>
      </Form>
    </>
  );
};
