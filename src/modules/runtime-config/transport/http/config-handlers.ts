import { getRuntimeConfigUseCases } from '@/composition/runtime-config';

const env = () => getRuntimeConfigUseCases().get();

export type ConfigHandlers = {
  env: typeof env;
};

export const handlers: ConfigHandlers = {
  env,
};
