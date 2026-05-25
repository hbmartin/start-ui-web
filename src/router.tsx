import { createRouter } from '@tanstack/react-router';

import { createClientQueryClient } from '@/composition/client-query';
import { initSentryForRouter } from '@/composition/sentry';

import { routeTree } from './routeTree.gen';

export function getRouter() {
  const queryClient = createClientQueryClient();
  const router = createRouter({
    context: {
      queryClient,
    },
    defaultPreload: 'intent',
    // Since we're using React Query, we don't want loader calls to ever be stale
    // This will ensure that the loader is always called when the route is preloaded or visited
    defaultPreloadStaleTime: 0,
    scrollRestoration: true,
    routeTree,
  });

  initSentryForRouter(router);

  return router;
}
