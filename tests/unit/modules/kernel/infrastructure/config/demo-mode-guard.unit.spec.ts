import { describe, expect, it } from 'vitest';

import { ConfigurationError } from '@/modules/kernel/domain/errors/configuration-error';
import { assertDemoModeNotInProduction } from '@/modules/kernel/infrastructure/config/demo-mode-guard';

describe('assertDemoModeNotInProduction', () => {
  it('throws when demo mode is enabled in production', () => {
    expect(() => assertDemoModeNotInProduction(true, true)).toThrow(
      ConfigurationError
    );
    expect(() => assertDemoModeNotInProduction(true, true)).toThrow(
      'VITE_IS_DEMO'
    );
  });

  it('allows demo mode outside production', () => {
    expect(() => assertDemoModeNotInProduction(false, true)).not.toThrow();
  });

  it('allows production without demo mode', () => {
    expect(() => assertDemoModeNotInProduction(true, false)).not.toThrow();
  });
});
