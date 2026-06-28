import { cruise } from 'dependency-cruiser';
import extractDepcruiseOptions from 'dependency-cruiser/config-utl/extract-depcruise-options';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const DEPCRUISE_TEST_TIMEOUT_MS = 15_000;

describe('dependency-cruiser architecture rules', () => {
  it(
    'has zero dependency violations',
    async () => {
      const options = await extractDepcruiseOptions(
        path.resolve(process.cwd(), '.dependency-cruiser.cjs')
      );
      const result = await cruise(['src'], options);

      expect(result.exitCode).toBe(0);
    },
    DEPCRUISE_TEST_TIMEOUT_MS
  );

  it('scopes kernel module regex exceptions to the kernel path segment', () => {
    const config = readFileSync(
      path.resolve(process.cwd(), '.dependency-cruiser.cjs'),
      'utf8'
    );

    expect(config).not.toContain('(?!kernel)');
    expect(config).toContain('(?!kernel/)');
  });
});

describe('dependency-cruiser folder metrics contract', () => {
  it(
    'exposes folder-level coupling metrics when metrics are enabled',
    async () => {
      const options = await extractDepcruiseOptions(
        path.resolve(process.cwd(), '.dependency-cruiser.cjs')
      );
      const result = await cruise(['src/modules'], {
        ...options,
        metrics: true,
      });
      const output = result.output;

      expect(typeof output).not.toBe('string');
      if (typeof output === 'string') return;

      const folders = (output as { folders?: Array<{ name: string }> }).folders;
      expect(Array.isArray(folders)).toBe(true);

      const bookFolder = folders?.find(
        (folder) => folder.name === 'src/modules/book'
      ) as
        | {
            afferentCouplings?: number;
            efferentCouplings?: number;
            instability?: number;
          }
        | undefined;
      expect(bookFolder).toBeDefined();
      expect(typeof bookFolder?.instability).toBe('number');
      expect(typeof bookFolder?.afferentCouplings).toBe('number');
      expect(typeof bookFolder?.efferentCouplings).toBe('number');
    },
    DEPCRUISE_TEST_TIMEOUT_MS
  );
});
