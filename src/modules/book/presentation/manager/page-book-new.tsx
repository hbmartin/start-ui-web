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
import { useIsUploadingFiles } from '@/platform/components/upload/utils';

import { useCurrentScopeKey } from '@/modules/auth/client';
import { FormBook } from '@/modules/book/presentation/manager/form-book';
import { FormBookCover } from '@/modules/book/presentation/manager/form-book-cover';
import {
  FormFieldsBook,
  zFormFieldsBook,
} from '@/modules/book/presentation/schema';
import { isServerFnError } from '@/modules/kernel/client';
import {
  ManagerPageLayout as PageLayout,
  ManagerPageLayoutContent as PageLayoutContent,
  ManagerPageLayoutTopBar as PageLayoutTopBar,
  ManagerPageLayoutTopBarTitle as PageLayoutTopBarTitle,
} from '@/modules/shell/presentation';

import { bookQueries } from '../queries';

export const PageBookNew = () => {
  const { t } = useTranslation(['book']);
  const { navigateBack } = useNavigateBack();
  const queryClient = useQueryClient();
  const scopeKey = useCurrentScopeKey();
  const bookCreate = useMutation(bookQueries.create());
  const form = useAppForm<FormFieldsBook>({
    defaultValues: {
      title: '',
      author: '',
      genreId: '',
      publisher: '',
      coverId: '',
    } satisfies FormFieldsBook,
    validators: {
      onSubmit: zFormFieldsBook(),
    },
    onSubmit: async ({ value, formApi }) => {
      try {
        await bookCreate.mutateAsync(value);
        // Invalidate books list
        await queryClient.invalidateQueries({
          queryKey: bookQueries.getAll(scopeKey),
          type: 'all',
        });

        // Redirect
        navigateBack({ ignoreBlocker: true });
      } catch (error) {
        if (isServerFnError(error) && error.code === 'CONFLICT') {
          const target = error.data?.target;
          const isTitleConflict =
            target === 'title' ||
            (Array.isArray(target) && target.includes('title'));

          if (isTitleConflict) {
            setAppFormFieldError(
              formApi,
              'title',
              t('book:manager.form.titleAlreadyExist')
            );
            return;
          }
        }

        toast.error(t('book:manager.new.createError'));
      }
    },
  });
  const isDirty = useAppFormState(form, (state) => state.isDirty);

  const isUploadingFiles = useIsUploadingFiles('bookCover');

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
                loading={bookCreate.isPending}
                disabled={isUploadingFiles}
              >
                {t('book:manager.new.createButton.label')}
              </Button>
            }
          >
            <PageLayoutTopBarTitle>
              {t('book:manager.new.title')}
            </PageLayoutTopBarTitle>
          </PageLayoutTopBar>
          <PageLayoutContent>
            <div className="flex flex-col gap-4 xs:flex-row">
              <div className="flex-2">
                <Card>
                  <CardContent>
                    <FormBook />
                  </CardContent>
                </Card>
              </div>
              <div
                aria-hidden
                className="mx-auto w-full max-w-64 min-w-48 flex-1"
              >
                <FormBookCover />
              </div>
            </div>
          </PageLayoutContent>
        </PageLayout>
      </Form>
    </>
  );
};
