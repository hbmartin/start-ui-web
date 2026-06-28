/**
 * Coupling + abstractness + distance-from-main-sequence per module.
 *
 * - Ca / Ce / Instability come from dependency-cruiser's NATIVE folder metrics
 *   (enabled by passing `metrics: true` to cruise at call time; the shared
 *   `.dependency-cruiser.cjs` is left untouched).
 * - Abstractness A is computed with ts-morph at the DECLARATION level, because
 *   domain files interleave abstract types and concrete functions in one file.
 * - Distance D = |A + I - 1| (Robert C. Martin's main-sequence distance).
 */

import { cruise } from 'dependency-cruiser';
import extractDepcruiseOptions from 'dependency-cruiser/config-utl/extract-depcruise-options';
import path from 'node:path';
import { Node, type SourceFile } from 'ts-morph';

import { groupModulePath, MODULES_ROOT } from './module-classify';
import type { CouplingMetrics } from './types';

const DEPCRUISE_CONFIG_FILE = '.dependency-cruiser.cjs';

type DepcruiseFolder = {
  name: string;
  afferentCouplings?: number;
  efferentCouplings?: number;
  instability?: number;
};

type DepcruiseModule = {
  source: string;
  instability?: number;
  dependencies?: Array<{ resolved?: string }>;
};

export type DepcruiseMetricsOutput = {
  folders?: DepcruiseFolder[];
  modules: DepcruiseModule[];
};

/** Mirrors `loadDependencyCruiserReport` but turns folder-level metrics on. */
export const loadDependencyCruiserReportWithMetrics = async (
  cwd = process.cwd()
): Promise<DepcruiseMetricsOutput> => {
  const options = await extractDepcruiseOptions(
    path.resolve(cwd, DEPCRUISE_CONFIG_FILE)
  );
  const result = await cruise([MODULES_ROOT], { ...options, metrics: true });

  if (
    !result.output ||
    typeof result.output === 'string' ||
    !Array.isArray(result.output.modules)
  ) {
    throw new Error('dependency-cruiser did not return a module report.');
  }

  return result.output as DepcruiseMetricsOutput;
};

const isFunctionValued = (initializer: Node | undefined): boolean =>
  !!initializer &&
  (Node.isArrowFunction(initializer) || Node.isFunctionExpression(initializer));

/**
 * Counts abstract vs concrete declarations across a module's source files.
 * Abstract: interfaces, type aliases, abstract classes.
 * Concrete: non-abstract classes, functions, enums, function-valued top-level
 * variables (plain value constants are ignored to keep the denominator focused
 * on behaviour-bearing declarations).
 */
export const countModuleAbstractness = (
  sourceFiles: SourceFile[]
): { abstractTypes: number; concreteTypes: number } => {
  let abstractTypes = 0;
  let concreteTypes = 0;

  for (const sourceFile of sourceFiles) {
    abstractTypes += sourceFile.getInterfaces().length;
    abstractTypes += sourceFile.getTypeAliases().length;

    for (const declaration of sourceFile.getClasses()) {
      if (declaration.isAbstract()) {
        abstractTypes += 1;
      } else {
        concreteTypes += 1;
      }
    }

    concreteTypes += sourceFile.getFunctions().length;
    concreteTypes += sourceFile.getEnums().length;

    for (const statement of sourceFile.getVariableStatements()) {
      for (const declaration of statement.getDeclarations()) {
        if (isFunctionValued(declaration.getInitializer())) {
          concreteTypes += 1;
        }
      }
    }
  }

  return { abstractTypes, concreteTypes };
};

const round = (value: number, digits = 4): number => {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
};

/** Edge-graph fallback for Ca/Ce when a folder metric is missing. */
const computeEdgeCoupling = (
  output: DepcruiseMetricsOutput
): Map<string, { afferent: number; efferent: number }> => {
  const dependsOn = new Map<string, Set<string>>();
  const dependedOnBy = new Map<string, Set<string>>();

  for (const moduleInfo of output.modules) {
    const fromNode = groupModulePath(moduleInfo.source);
    if (!fromNode) continue;
    for (const dependency of moduleInfo.dependencies ?? []) {
      if (!dependency.resolved) continue;
      const toNode = groupModulePath(dependency.resolved);
      if (!toNode || toNode.moduleName === fromNode.moduleName) continue;

      (
        dependsOn.get(fromNode.moduleName) ??
        setIn(dependsOn, fromNode.moduleName)
      ).add(toNode.moduleName);
      (
        dependedOnBy.get(toNode.moduleName) ??
        setIn(dependedOnBy, toNode.moduleName)
      ).add(fromNode.moduleName);
    }
  }

  const result = new Map<string, { afferent: number; efferent: number }>();
  const modules = new Set([...dependsOn.keys(), ...dependedOnBy.keys()]);
  for (const moduleName of modules) {
    result.set(moduleName, {
      afferent: dependedOnBy.get(moduleName)?.size ?? 0,
      efferent: dependsOn.get(moduleName)?.size ?? 0,
    });
  }
  return result;
};

const setIn = (map: Map<string, Set<string>>, key: string): Set<string> => {
  const set = new Set<string>();
  map.set(key, set);
  return set;
};

export type CouplingResult = {
  metrics: Map<string, CouplingMetrics>;
  warnings: string[];
};

export const computeCoupling = (
  output: DepcruiseMetricsOutput,
  abstractnessByModule: Map<
    string,
    { abstractTypes: number; concreteTypes: number }
  >,
  modules: string[]
): CouplingResult => {
  const warnings: string[] = [];
  const folderByName = new Map<string, DepcruiseFolder>();
  for (const folder of output.folders ?? []) {
    folderByName.set(folder.name, folder);
  }
  const edgeCoupling = computeEdgeCoupling(output);
  const metrics = new Map<string, CouplingMetrics>();

  for (const moduleName of modules) {
    const folder = folderByName.get(`${MODULES_ROOT}/${moduleName}`);
    const fallback = edgeCoupling.get(moduleName) ?? {
      afferent: 0,
      efferent: 0,
    };

    let afferent: number;
    let efferent: number;
    let instability: number;
    let source: CouplingMetrics['source'];

    if (
      folder &&
      typeof folder.afferentCouplings === 'number' &&
      typeof folder.efferentCouplings === 'number'
    ) {
      afferent = folder.afferentCouplings;
      efferent = folder.efferentCouplings;
      const denominator = afferent + efferent;
      instability =
        typeof folder.instability === 'number'
          ? folder.instability
          : denominator === 0
            ? 0
            : efferent / denominator;
      source = 'dependency-cruiser-metrics';
    } else {
      afferent = fallback.afferent;
      efferent = fallback.efferent;
      const denominator = afferent + efferent;
      instability = denominator === 0 ? 0 : efferent / denominator;
      source = 'edge-graph-fallback';
      warnings.push(
        `coupling: module "${moduleName}" missing dependency-cruiser folder metrics; used edge-graph fallback`
      );
    }

    const abstractCounts = abstractnessByModule.get(moduleName) ?? {
      abstractTypes: 0,
      concreteTypes: 0,
    };
    const typeTotal =
      abstractCounts.abstractTypes + abstractCounts.concreteTypes;
    const abstractness =
      typeTotal === 0 ? 0 : abstractCounts.abstractTypes / typeTotal;
    const distance = Math.abs(abstractness + instability - 1);

    metrics.set(moduleName, {
      afferent,
      efferent,
      instability: round(instability),
      abstractness: round(abstractness),
      distance: round(distance),
      abstractTypes: abstractCounts.abstractTypes,
      concreteTypes: abstractCounts.concreteTypes,
      source,
    });
  }

  return { metrics, warnings };
};
