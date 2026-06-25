import { execFileSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';

// License-compliance gate (OWASP A09 supply-chain hardening).
//
// Fails CI when an installed dependency carries a license that is neither on
// the permissive allowlist nor explicitly accepted below. The license data
// comes from `pnpm licenses list --json`, so the result reflects the packages
// actually installed for the current platform (CI = Linux). Platform-specific
// native binaries (esbuild, oxide, lightningcss, @sentry/cli, ...) differ
// between macOS and Linux, so per-package exceptions match by NAME PREFIX to
// cover every `<pkg>-<platform>-<arch>` variant.

// SPDX identifiers that are unconditionally acceptable for an MIT template:
// permissive, no copyleft, no source-disclosure obligation.
export const ALLOWED_LICENSES = new Set([
  '0BSD',
  'Apache-2.0',
  'BlueOak-1.0.0',
  'BSD-2-Clause',
  'BSD-3-Clause',
  'CC0-1.0',
  'ISC',
  'MIT',
  'MIT-0',
  'Python-2.0',
  'Unlicense',
]);

// Packages allowed despite a non-allowlisted license. Keyed by package name;
// a key matches `name === key` OR `name.startsWith(key + '-')` so that
// platform-native sibling packages are covered without re-listing each one.
// Keep this list small and justified — every entry is a deliberate acceptance.
export const LICENSE_EXCEPTIONS = [
  {
    name: '@sentry/cli',
    license: 'FSL-1.1-MIT',
    reason:
      'Build-time CLI for sourcemap upload; Functional Source License is source-available and converts to MIT after two years. Not linked into shipped app code.',
  },
  {
    name: 'lightningcss',
    license: 'MPL-2.0',
    reason:
      'Build-time CSS transformer pulled via Tailwind/Vite. MPL-2.0 is file-level weak copyleft; the package is used unmodified, so no source-disclosure obligation is triggered.',
  },
  {
    name: 'eslint-plugin-sonarjs',
    license: 'LGPL-3.0-only',
    reason:
      'Dev-only ESLint plugin. Not distributed with or linked into the application; LGPL obligations do not attach to our shipped code.',
  },
  {
    name: 'caniuse-lite',
    license: 'CC-BY-4.0',
    reason:
      'Browser-compatibility dataset used by build tooling (browserslist). Attribution-only content license, no code-copyleft.',
  },
  {
    name: 'spdx-exceptions',
    license: 'CC-BY-3.0',
    reason:
      'SPDX license-list dataset. Attribution-only content license, no code-copyleft.',
  },
  {
    name: '@fontsource-variable/inter',
    license: 'OFL-1.1',
    reason:
      'Inter web font. SIL Open Font License explicitly permits embedding and redistribution of the font files.',
  },
];

function matchesException(packageName) {
  return LICENSE_EXCEPTIONS.find(
    (entry) =>
      packageName === entry.name || packageName.startsWith(`${entry.name}-`)
  );
}

// Evaluate a single SPDX license expression against the allowlist.
// Handles single ids and simple `OR` / `AND` expressions (the only shapes that
// appear in the tree). For `OR`, any acceptable disjunct passes; for `AND`,
// every conjunct must be acceptable. Unknown/missing licenses never pass.
export function isLicenseAllowed(expression) {
  if (!expression) return false;

  const normalized = expression.replaceAll('(', '').replaceAll(')', '').trim();

  if (/\sOR\s/i.test(normalized)) {
    return normalized
      .split(/\sOR\s/i)
      .some((part) => isLicenseAllowed(part.trim()));
  }

  if (/\sAND\s/i.test(normalized)) {
    return normalized
      .split(/\sAND\s/i)
      .every((part) => isLicenseAllowed(part.trim()));
  }

  return ALLOWED_LICENSES.has(normalized);
}

// Flatten `pnpm licenses list --json` (a map of license -> package[]) into a
// list of violations: installed packages whose license is neither allowed nor
// excepted. Pure function so it can be unit-tested without spawning pnpm.
export function findLicenseViolations(licenseReport) {
  const violations = [];

  for (const [license, packages] of Object.entries(licenseReport)) {
    if (isLicenseAllowed(license)) continue;

    for (const pkg of packages) {
      if (matchesException(pkg.name)) continue;

      const versions = Array.isArray(pkg.versions)
        ? pkg.versions.join(', ')
        : '';
      violations.push({
        name: pkg.name,
        versions,
        license: pkg.license ?? license,
      });
    }
  }

  return violations;
}

function readLicenseReport() {
  const raw = execFileSync('pnpm', ['licenses', 'list', '--json'], {
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
  });

  const report = JSON.parse(raw);
  if (report === null || typeof report !== 'object') {
    throw new Error('Unexpected `pnpm licenses list --json` output.');
  }
  return report;
}

function main() {
  let report;
  try {
    report = readLicenseReport();
  } catch (error) {
    console.error(
      'License compliance check failed to read `pnpm licenses list --json`:'
    );
    console.error(error.message);
    process.exit(1);
  }

  const violations = findLicenseViolations(report);

  if (violations.length > 0) {
    console.error('License compliance policy failed: disallowed licenses:');
    for (const violation of violations) {
      console.error(
        `- ${violation.name}@${violation.versions} → ${violation.license}`
      );
    }
    console.error(
      'Allow the license in ALLOWED_LICENSES, add a justified package exception in LICENSE_EXCEPTIONS, or replace the dependency (scripts/check-license-compliance.mjs).'
    );
    process.exit(1);
  }

  const distinctLicenses = Object.keys(report).filter((license) =>
    isLicenseAllowed(license)
  ).length;
  console.log(
    `License compliance policy passed (${distinctLicenses} allowlisted license families, ${LICENSE_EXCEPTIONS.length} accepted exceptions).`
  );
}

if (
  process.argv[1] &&
  pathToFileURL(process.argv[1]).href === import.meta.url
) {
  main();
}
