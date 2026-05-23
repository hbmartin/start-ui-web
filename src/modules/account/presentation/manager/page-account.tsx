import { useTranslation } from 'react-i18next';

import { Button } from '@/components/ui/button';

import {
  BuildInfoDrawer,
  BuildInfoVersion,
} from '@/modules/build-info/presentation';
import {
  PageLayout,
  PageLayoutContent,
  PageLayoutTopBar,
  PageLayoutTopBarTitle,
} from '@/layout/manager/page-layout';
import { DisplayPreferences } from '@/modules/account/presentation/display-preferences';
import { UserCard } from '@/modules/account/presentation/user-card';

export const PageAccount = () => {
  const { t } = useTranslation(['account']);
  return (
    <PageLayout>
      <PageLayoutTopBar>
        <PageLayoutTopBarTitle>{t('account:title')}</PageLayoutTopBarTitle>
      </PageLayoutTopBar>
      <PageLayoutContent>
        <div className="flex flex-col gap-4">
          <UserCard />
          <DisplayPreferences />
          <BuildInfoDrawer>
            <Button variant="ghost" size="xs" className="opacity-60">
              <BuildInfoVersion />
            </Button>
          </BuildInfoDrawer>
        </div>
      </PageLayoutContent>
    </PageLayout>
  );
};
