import { getUiState } from '@bearstudio/ui-state';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AlertCircleIcon } from 'lucide-react';
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
import { Skeleton } from '@/platform/components/ui/skeleton';

import { useAuthSession, useCurrentScopeKey } from '@/modules/auth/client';
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

export const PageUserUpdate = (props: { params: { id: string } }) => {
  const { t } = useTranslation(['user']);
  const { navigateBack } = useNavigateBack();
  const session = useAuthSession();
  const queryClient = useQueryClient();
  const scopeKey = useCurrentScopeKey();
  const userQuery = useQuery(
    userQueries.getById({ id: props.params.id, scopeKey })
  );
  const userUpdate = useMutation(userQueries.updateById());
  const form = useAppForm<FormFieldsUser>({
    defaultValues: {
      name: userQuery.data?.name ?? '',
      email: userQuery.data?.email ?? '',
      role: userQuery.data?.role ?? 'user',
    } satisfies FormFieldsUser,
    validators: {
      onSubmit: zFormFieldsUser(),
    },
    onSubmit: async ({ value, formApi }) => {
      try {
        const data = await userUpdate.mutateAsync({
          id: props.params.id,
          ...value,
        });
        // Update session if user is the connected user
        if (data.id === session.data?.user.id) {
          session.refetch();
        }

        await Promise.all([
          // Invalidate User
          queryClient.invalidateQueries({
            queryKey: userQueries.getById({ id: props.params.id, scopeKey })
              .queryKey,
          }),
          // Invalidate Users list
          queryClient.invalidateQueries({
            queryKey: userQueries.getAll(scopeKey),
            type: 'all',
          }),
        ]);

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

        toast.error(t('user:manager.update.updateError'));
      }
    },
  });
  const isDirty = useAppFormState(form, (state) => state.isDirty);

  const ui = getUiState((set) => {
    if (userQuery.status === 'pending') return set('pending');
    if (
      userQuery.status === 'error' &&
      isServerFnError(userQuery.error) &&
      userQuery.error.code === 'NOT_FOUND'
    )
      return set('not-found');
    if (userQuery.status === 'error') return set('error');

    return set('default', { user: userQuery.data });
  });

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
                loading={userUpdate.isPending}
              >
                {t('user:manager.update.updateButton.label')}
              </Button>
            }
          >
            <PageLayoutTopBarTitle>
              {ui
                .match('pending', () => <Skeleton className="h-4 w-48" />)
                .match(['not-found', 'error'], () => (
                  <AlertCircleIcon className="size-4 text-muted-foreground" />
                ))
                .match('default', ({ user }) => <>{user.name || user.email}</>)
                .exhaustive()}
            </PageLayoutTopBarTitle>
          </PageLayoutTopBar>
          <PageLayoutContent>
            <Card>
              <CardContent>
                <FormUser userId={props.params.id} />
              </CardContent>
            </Card>
          </PageLayoutContent>
        </PageLayout>
      </Form>
    </>
  );
};
