import { ThemeProvider } from 'next-themes';
import type { ReactNode } from 'react';
import '@/lib/dayjs/config';
import '@/lib/i18n';
import '@fontsource-variable/inter';

import { Sonner } from '@/components/ui/sonner';

import { envClient } from '@/env/client';
import {
  DemoModeDrawer,
  openDemoModeDrawer,
  useIsDemoModeDrawerVisible,
} from '@/modules/demo/presentation';
import { isServerFnError } from '@/modules/kernel/client';
import {
  createQueryClient,
  QueryClientProvider,
} from '@/modules/kernel/presentation';

const handleDemoModeError = (error: unknown) => {
  if (isServerFnError(error) && error.message === 'DEMO_MODE_ENABLED') {
    openDemoModeDrawer();
  }
};

export const queryClient = createQueryClient({
  onError: handleDemoModeError,
});

export const Providers = (props: {
  children: ReactNode;
  forcedTheme?: string;
}) => {
  const isDemoModeDrawerVisible = useIsDemoModeDrawerVisible();
  return (
    <ThemeProvider
      attribute="class"
      storageKey="theme"
      disableTransitionOnChange
      forcedTheme={props.forcedTheme}
    >
      <QueryClientProvider client={queryClient}>
        {props.children}
        {!isDemoModeDrawerVisible && <Sonner />}
        {envClient.VITE_IS_DEMO && <DemoModeDrawer />}
      </QueryClientProvider>
    </ThemeProvider>
  );
};
