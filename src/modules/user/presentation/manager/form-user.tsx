import { useTranslation } from 'react-i18next';

import {
  FormField,
  FormFieldController,
  FormFieldHelper,
  FormFieldLabel,
  useAppFormContext,
} from '@/platform/components/form';

import { rolesNames } from '@/modules/auth';
import { useAuthSession } from '@/modules/auth/client';
import { FormFieldsUser } from '@/modules/user/presentation/schema';

export const FormUser = (props: { userId?: string }) => {
  const { t } = useTranslation(['user']);
  const session = useAuthSession();
  useAppFormContext<FormFieldsUser>();
  const isCurrentUser = props.userId === session.data?.user.id;

  return (
    <div className="flex flex-col gap-4">
      <FormField>
        <FormFieldLabel>{t('user:common.name.label')}</FormFieldLabel>
        <FormFieldController type="text" name="name" autoFocus />
      </FormField>
      <FormField>
        <FormFieldLabel>{t('user:common.email.label')}</FormFieldLabel>
        <FormFieldController type="email" name="email" />
      </FormField>
      <FormField>
        <FormFieldLabel>{t('user:common.role.label')}</FormFieldLabel>
        <FormFieldController
          type="select"
          name="role"
          disabled={isCurrentUser}
          items={rolesNames.map((role) => ({
            value: role,
            label: role,
          }))}
        />
        {isCurrentUser && (
          <FormFieldHelper>
            {t('user:common.role.cannotUpdateOwnRole')}
          </FormFieldHelper>
        )}
      </FormField>
    </div>
  );
};
