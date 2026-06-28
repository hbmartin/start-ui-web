/**
 * Module discovery + classification helpers.
 *
 * Re-exports the canonical classifier from the existing module dependency
 * graph generator so the fitness collector and the graph share ONE source of
 * truth for "which module/layer does this file belong to".
 */

import { readdirSync } from 'node:fs';
import path from 'node:path';

export type {
  DependencyCruiserReport,
  ModuleLayerNode,
} from '../../generate-module-dependency-graph';
export {
  groupModulePath,
  loadDependencyCruiserReport,
} from '../../generate-module-dependency-graph';

export const MODULES_ROOT = 'src/modules';

export const MODULE_LAYERS = [
  'application',
  'domain',
  'infrastructure',
  'presentation',
  'transport',
] as const;

/**
 * The set of business-capability modules, discovered from the filesystem so a
 * newly added module is never silently omitted from the scorecard.
 */
export const discoverModules = (cwd = process.cwd()): string[] => {
  const modulesDir = path.resolve(cwd, MODULES_ROOT);
  return readdirSync(modulesDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort((left, right) => left.localeCompare(right, 'en'));
};
