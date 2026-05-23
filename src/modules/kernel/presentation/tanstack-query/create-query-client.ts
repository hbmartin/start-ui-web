import { MutationCache, QueryCache, QueryClient } from '@tanstack/react-query';

export type CreateQueryClientOptions = {
  onError?: (error: unknown) => void;
};

export const createQueryClient = (options?: CreateQueryClientOptions) => {
  const networkMode = import.meta.env.DEV ? 'always' : undefined;

  return new QueryClient({
    queryCache: new QueryCache({
      onError: options?.onError,
    }),
    mutationCache: new MutationCache({
      onError: options?.onError,
    }),
    defaultOptions: {
      queries: {
        networkMode,
      },
      mutations: {
        networkMode,
      },
    },
  });
};
