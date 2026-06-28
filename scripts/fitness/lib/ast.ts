/**
 * Shared ts-morph project used by the abstractness and complexity collectors.
 *
 * Files are parsed syntactically only (no type-checker / dependency resolution)
 * which keeps a full pass over ~570 module files fast. Test, spec and fixture
 * files are excluded so the metrics reflect production code.
 */

import path from 'node:path';
import { Project, type SourceFile } from 'ts-morph';

import { groupModulePath, MODULES_ROOT } from './module-classify';

const EXCLUDED_FILE_PATTERN = /\.(spec|test|fixture|stories)\.[cm]?[jt]sx?$/;

export const createModuleProject = (cwd = process.cwd()): Project => {
  const project = new Project({
    tsConfigFilePath: path.resolve(cwd, 'tsconfig.json'),
    skipAddingFilesFromTsConfig: true,
    skipFileDependencyResolution: true,
  });
  project.addSourceFilesAtPaths(
    path.resolve(cwd, MODULES_ROOT, '**/*.{ts,tsx}').replaceAll('\\', '/')
  );
  return project;
};

export type ModuleSourceFiles = Map<string, SourceFile[]>;

/**
 * Groups parsed source files by their owning module, excluding presentation
 * `.tsx` files by default (React UI is all-concrete and washes out the
 * abstractness signal) when `includePresentationTsx` is false.
 */
export const groupSourceFilesByModule = (
  project: Project,
  cwd = process.cwd(),
  { includePresentationTsx = false }: { includePresentationTsx?: boolean } = {}
): ModuleSourceFiles => {
  const byModule: ModuleSourceFiles = new Map();

  for (const sourceFile of project.getSourceFiles()) {
    const absolute = sourceFile.getFilePath();
    const relative = path.relative(cwd, absolute).replaceAll('\\', '/');
    if (EXCLUDED_FILE_PATTERN.test(relative)) continue;

    const node = groupModulePath(relative);
    if (!node) continue;

    if (
      !includePresentationTsx &&
      node.layerName === 'presentation' &&
      relative.endsWith('.tsx')
    ) {
      continue;
    }

    const existing = byModule.get(node.moduleName);
    if (existing) {
      existing.push(sourceFile);
    } else {
      byModule.set(node.moduleName, [sourceFile]);
    }
  }

  return byModule;
};
