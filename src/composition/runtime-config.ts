import {
  createRuntimeConfigUseCases,
  type RuntimeConfigSource,
} from '@/modules/runtime-config';
import { RuntimeConfigSourceEnv } from '@/modules/runtime-config/infrastructure/env/runtime-config-env';

import { hasDefinedOverrides } from './shared/overrides';
import { createCachedFactory } from './shared/singleton';

export type RuntimeConfigCompositionOverrides = {
  source?: RuntimeConfigSource;
};

const buildRuntimeConfigUseCases = (
  overrides?: RuntimeConfigCompositionOverrides
) => {
  return createRuntimeConfigUseCases({
    source: overrides?.source ?? new RuntimeConfigSourceEnv(),
  });
};

const getCachedRuntimeConfigUseCases = createCachedFactory(() =>
  buildRuntimeConfigUseCases()
);

export function getRuntimeConfigUseCases(options?: {
  overrides?: RuntimeConfigCompositionOverrides;
}) {
  const overrides = options?.overrides;
  if (hasDefinedOverrides(overrides)) {
    return buildRuntimeConfigUseCases(overrides);
  }
  return getCachedRuntimeConfigUseCases(false);
}
