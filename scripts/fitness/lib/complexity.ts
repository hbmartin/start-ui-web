/**
 * Cyclomatic + cognitive complexity per function, aggregated per module.
 *
 * Each function-like node is measured independently over its own body (nested
 * functions are measured separately, never folded into the parent). Cognitive
 * complexity follows a SonarSource-inspired, nesting-aware approximation: it is
 * a stable, monotonic trend signal rather than a certified SonarQube replica.
 */

import {
  type BinaryExpression,
  Node,
  type SourceFile,
  SyntaxKind,
} from 'ts-morph';

import type { ComplexityMetrics, ComplexityStat } from './types';

const DECISION_KINDS = new Set<SyntaxKind>([
  SyntaxKind.IfStatement,
  SyntaxKind.ConditionalExpression,
  SyntaxKind.ForStatement,
  SyntaxKind.ForInStatement,
  SyntaxKind.ForOfStatement,
  SyntaxKind.WhileStatement,
  SyntaxKind.DoStatement,
  SyntaxKind.CatchClause,
  SyntaxKind.CaseClause,
]);

const LOGICAL_OPERATORS = new Set<SyntaxKind>([
  SyntaxKind.AmpersandAmpersandToken,
  SyntaxKind.BarBarToken,
  SyntaxKind.QuestionQuestionToken,
]);

const isFunctionLike = (node: Node): boolean =>
  Node.isFunctionDeclaration(node) ||
  Node.isFunctionExpression(node) ||
  Node.isArrowFunction(node) ||
  Node.isMethodDeclaration(node) ||
  Node.isConstructorDeclaration(node) ||
  Node.isGetAccessorDeclaration(node) ||
  Node.isSetAccessorDeclaration(node);

const isLogicalBinary = (node: Node): node is BinaryExpression =>
  Node.isBinaryExpression(node) &&
  LOGICAL_OPERATORS.has(node.getOperatorToken().getKind());

const getFunctionBody = (fn: Node): Node | undefined => {
  if (
    Node.isFunctionDeclaration(fn) ||
    Node.isFunctionExpression(fn) ||
    Node.isArrowFunction(fn) ||
    Node.isMethodDeclaration(fn) ||
    Node.isConstructorDeclaration(fn) ||
    Node.isGetAccessorDeclaration(fn) ||
    Node.isSetAccessorDeclaration(fn)
  ) {
    return fn.getBody();
  }
  return undefined;
};

const cyclomaticOf = (fn: Node): number => {
  let count = 1;
  const visit = (node: Node): void => {
    node.forEachChild((child) => {
      if (isFunctionLike(child)) return;
      if (DECISION_KINDS.has(child.getKind())) count += 1;
      else if (isLogicalBinary(child)) count += 1;
      visit(child);
    });
  };
  const body = getFunctionBody(fn);
  if (body) visit(body);
  return count;
};

/** Counts each contiguous sequence of like logical operators once. */
const countLogicalSequences = (expression: Node | undefined): number => {
  if (!expression) return 0;
  let count = 0;
  const visit = (node: Node): void => {
    if (isLogicalBinary(node)) {
      const operator = node.getOperatorToken().getKind();
      const parent = node.getParent();
      const parentIsSameOperator =
        !!parent &&
        isLogicalBinary(parent) &&
        parent.getOperatorToken().getKind() === operator;
      if (!parentIsSameOperator) count += 1;
    }
    node.forEachChild(visit);
  };
  visit(expression);
  return count;
};

const cognitiveOf = (fn: Node): number => {
  let score = 0;

  const visitIf = (ifNode: Node, nesting: number): void => {
    if (!Node.isIfStatement(ifNode)) return;
    score += 1 + nesting;
    score += countLogicalSequences(ifNode.getExpression());
    visit(ifNode.getThenStatement(), nesting + 1);

    const elseStatement = ifNode.getElseStatement();
    if (!elseStatement) return;
    if (Node.isIfStatement(elseStatement)) {
      // `else if` — +1 flat continuation, no extra nesting for the chain.
      score += 1;
      score += countLogicalSequences(elseStatement.getExpression());
      visit(elseStatement.getThenStatement(), nesting + 1);
      const chained = elseStatement.getElseStatement();
      if (chained) {
        if (Node.isIfStatement(chained)) visitIf(chained, nesting);
        else {
          score += 1;
          visit(chained, nesting + 1);
        }
      }
    } else {
      score += 1; // plain `else`
      visit(elseStatement, nesting + 1);
    }
  };

  function visit(node: Node | undefined, nesting: number): void {
    if (!node) return;
    node.forEachChild((child) => {
      if (isFunctionLike(child)) {
        visit(getFunctionBody(child), nesting + 1);
        return;
      }
      const kind = child.getKind();
      switch (kind) {
        case SyntaxKind.IfStatement:
          visitIf(child, nesting);
          return;
        case SyntaxKind.ForStatement:
        case SyntaxKind.ForInStatement:
        case SyntaxKind.ForOfStatement:
        case SyntaxKind.WhileStatement:
        case SyntaxKind.DoStatement:
        case SyntaxKind.SwitchStatement:
        case SyntaxKind.CatchClause:
        case SyntaxKind.ConditionalExpression:
          score += 1 + nesting;
          visit(child, nesting + 1);
          return;
        default:
          if (isLogicalBinary(child)) {
            const parent = child.getParent();
            const parentIsSame =
              !!parent &&
              isLogicalBinary(parent) &&
              parent.getOperatorToken().getKind() ===
                child.getOperatorToken().getKind();
            if (!parentIsSame) score += 1;
          }
          visit(child, nesting);
      }
    });
  }

  visit(getFunctionBody(fn), 0);
  return score;
};

const percentile = (sortedValues: number[], fraction: number): number => {
  if (sortedValues.length === 0) return 0;
  const rank = Math.ceil(fraction * sortedValues.length);
  const index = Math.min(Math.max(rank - 1, 0), sortedValues.length - 1);
  return sortedValues[index] ?? 0;
};

const summarize = (values: number[]): ComplexityStat => {
  if (values.length === 0) return { max: 0, mean: 0, p90: 0 };
  const sorted = [...values].sort((left, right) => left - right);
  const sum = sorted.reduce((total, value) => total + value, 0);
  const max = sorted[sorted.length - 1] ?? 0;
  return {
    max,
    mean: Math.round((sum / sorted.length) * 100) / 100,
    p90: percentile(sorted, 0.9),
  };
};

export const computeModuleComplexity = (
  sourceFiles: SourceFile[]
): ComplexityMetrics => {
  const cyclomatic: number[] = [];
  const cognitive: number[] = [];

  for (const sourceFile of sourceFiles) {
    sourceFile.forEachDescendant((node) => {
      if (!isFunctionLike(node)) return;
      cyclomatic.push(cyclomaticOf(node));
      cognitive.push(cognitiveOf(node));
    });
  }

  return {
    cyclomatic: summarize(cyclomatic),
    cognitive: summarize(cognitive),
    files: sourceFiles.length,
    functions: cyclomatic.length,
  };
};

/** Per-file cognitive complexity (sum over the file's functions), keyed by
 * repo-relative posix path. Used by the churn/hotspot collector. */
export const computePerFileCognitive = (
  sourceFiles: SourceFile[],
  cwd: string
): Map<string, number> => {
  const byFile = new Map<string, number>();
  for (const sourceFile of sourceFiles) {
    let total = 0;
    sourceFile.forEachDescendant((node) => {
      if (isFunctionLike(node)) total += cognitiveOf(node);
    });
    const relative = relativePosix(cwd, sourceFile.getFilePath());
    byFile.set(relative, total);
  }
  return byFile;
};

const relativePosix = (cwd: string, absolute: string): string => {
  const normalizedCwd = cwd.replaceAll('\\', '/').replace(/\/$/, '');
  const normalized = absolute.replaceAll('\\', '/');
  return normalized.startsWith(`${normalizedCwd}/`)
    ? normalized.slice(normalizedCwd.length + 1)
    : normalized;
};
