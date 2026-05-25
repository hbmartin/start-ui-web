import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { join } from 'remeda';
import { toast } from 'sonner';

import {
  FormField,
  FormFieldController,
  FormFieldHelper,
  FormFieldLabel,
  useAppFormContext,
} from '@/platform/components/form';

import {
  bookCoverAcceptedFileTypes,
  FormFieldsBook,
} from '@/modules/book/presentation/schema';
import { useCurrentScopeKey } from '@/modules/auth/client';
import { openDemoModeDrawer } from '@/modules/demo/presentation';
import { genreQueries } from '@/modules/genre/client';
import { envClient } from '@/platform/env/client';

export const FormBook = () => {
  useAppFormContext<FormFieldsBook>();
  const { t } = useTranslation(['book']);
  const scopeKey = useCurrentScopeKey();

  const genresQuery = useQuery(genreQueries.getAllList({ scopeKey }));

  return (
    <div className="flex flex-col gap-4">
      <FormField>
        <FormFieldLabel>{t('book:common.title.label')}</FormFieldLabel>
        <FormFieldController type="text" name="title" autoFocus />
      </FormField>
      <FormField>
        <FormFieldLabel>{t('book:common.author.label')}</FormFieldLabel>
        <FormFieldController type="text" name="author" />
      </FormField>

      <FormField>
        <FormFieldLabel>{t('book:common.genre.label')}</FormFieldLabel>
        <FormFieldController
          type="combobox"
          name="genreId"
          items={(genresQuery.data?.items ?? []).map((genre) => ({
            value: genre.id,
            label: genre.name,
          }))}
        />
      </FormField>

      <FormField>
        <FormFieldLabel>{t('book:common.publisher.label')}</FormFieldLabel>
        <FormFieldController type="text" name="publisher" />
      </FormField>

      <FormField>
        <FormFieldLabel>{t('book:common.uploadCover.label')}</FormFieldLabel>
        <FormFieldController
          type="upload-input"
          name="coverId"
          uploadRoute="bookCover"
          inputProps={{
            accept: join(bookCoverAcceptedFileTypes, ','),
          }}
          onError={() => {
            if (envClient.VITE_IS_DEMO) {
              openDemoModeDrawer();
              return;
            }
            toast.error(t('book:manager.uploadErrors.failed'));
          }}
        />
        <FormFieldHelper>{t('book:common.uploadCover.helper')}</FormFieldHelper>
      </FormField>
    </div>
  );
};
