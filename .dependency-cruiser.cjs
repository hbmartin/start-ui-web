module.exports = {
  forbidden: [
    {
      name: 'domain-no-react-or-router',
      severity: 'error',
      from: { path: '^src/modules/[^/]+/domain' },
      to: {
        path: '^(react|react-dom|@tanstack/react-router|@tanstack/react-query)',
      },
    },
    {
      name: 'domain-no-infrastructure-or-sdks',
      severity: 'error',
      from: { path: '^src/modules/[^/]+/domain' },
      to: {
        path: '(^src/modules/[^/]+/infrastructure|^drizzle-orm|^pg|^postgres)',
      },
    },
    {
      name: 'domain-no-transport',
      severity: 'error',
      from: { path: '^src/modules/[^/]+/domain' },
      to: { path: '^src/modules/[^/]+/transport' },
    },
    {
      name: 'application-no-infrastructure',
      severity: 'error',
      from: { path: '^src/modules/[^/]+/application' },
      to: { path: '^src/modules/[^/]+/infrastructure' },
    },
    {
      name: 'application-no-transport',
      severity: 'error',
      from: { path: '^src/modules/[^/]+/application' },
      to: { path: '^src/modules/[^/]+/transport' },
    },
    {
      name: 'application-no-react-or-router',
      severity: 'error',
      from: { path: '^src/modules/[^/]+/application' },
      to: { path: '^(react|@tanstack/react-router|@tanstack/react-query)' },
    },
    {
      name: 'no-cross-feature-deep-import',
      severity: 'error',
      comment:
        'Cross-module imports must go through module public files: index.ts, presentation.ts, server.ts, or client.ts',
      from: { path: '^src/modules/([^/]+)/' },
      to: {
        path: '^src/modules/(?!\\1)([^/]+)/(?!index\\.|presentation\\.|server\\.|client\\.)',
        pathNot: '^src/modules/kernel/',
      },
    },
    {
      name: 'presentation-no-infrastructure',
      severity: 'error',
      from: { path: '^src/modules/[^/]+/presentation' },
      to: { path: '^src/modules/(?!kernel)[^/]+/infrastructure' },
    },
    {
      name: 'transport-no-infrastructure',
      severity: 'error',
      from: { path: '^src/modules/[^/]+/transport' },
      to: { path: '^src/modules/(?!kernel)[^/]+/infrastructure' },
    },
    {
      name: 'kernel-no-feature-imports',
      severity: 'error',
      from: { path: '^src/modules/kernel' },
      to: { path: '^src/modules/(?!kernel)' },
    },
    {
      name: 'routes-no-direct-infrastructure',
      severity: 'error',
      from: { path: '^src/(routes|components|hooks|lib)' },
      to: { path: '^src/modules/(?!kernel)[^/]+/infrastructure' },
    },
    {
      name: 'no-src-features',
      severity: 'error',
      comment:
        'src/features/ was retired in favor of modules. Add new code under src/modules/<feature>/ following the hex layout.',
      from: {},
      to: { path: '^src/features' },
    },
    {
      name: 'routes-use-module-public-api',
      severity: 'error',
      from: { path: '^src/(routes|components|hooks|lib|layout)' },
      to: {
        path: '^src/modules/(?!kernel)[^/]+/(?!index\\.|presentation\\.|server\\.|client\\.)',
      },
    },
    {
      name: 'ui-kernel-no-module-internals',
      severity: 'error',
      comment:
        'src/components, src/hooks, src/lib are the UI kernel — they may import other modules only through public gates, never their domain/application/infrastructure/transport.',
      from: { path: '^src/(components|hooks|lib)' },
      to: {
        path: '^src/modules/(?!kernel)[^/]+/(domain|application|infrastructure|transport)',
      },
    },
    {
      name: 'presentation-schema-no-i18n',
      severity: 'error',
      comment:
        'presentation/schema.ts must emit error codes, not translated strings. Translation happens at render in src/components/form/form-field-error.tsx.',
      from: { path: '^src/modules/[^/]+/presentation/schema\\.ts$' },
      to: { path: 'node_modules/(?:i18next|react-i18next)/' },
    },
    {
      name: 'better-auth-server-confined',
      severity: 'error',
      comment:
        'better-auth server APIs may only be imported from src/modules/auth/ and src/composition/auth.ts. better-auth/react and better-auth/client/plugins are allowed in auth/presentation/.',
      from: {
        pathNot: '^(src/modules/auth/|src/composition/auth\\.ts$)',
      },
      to: { path: 'node_modules/better-auth/' },
    },
    {
      name: 'legacy-server-entrypoints-removed',
      severity: 'error',
      from: {},
      to: { path: '^src/server' },
    },
    {
      name: 'drizzle-confined-to-infrastructure',
      severity: 'error',
      from: {
        pathNot:
          '^src/(modules/[^/]+/infrastructure|modules/kernel/infrastructure|composition|drizzle)',
      },
      to: { path: '^drizzle-orm' },
    },
    {
      name: 'server-only-from-client',
      severity: 'error',
      from: { path: '\\.client\\.(ts|tsx)$' },
      to: { path: '\\.server\\.(ts|tsx)$|^src/modules/[^/]+/infrastructure' },
    },
    {
      name: 'no-circular',
      severity: 'error',
      from: {},
      to: { circular: true },
    },
  ],
  options: {
    doNotFollow: {
      path: 'node_modules',
    },
    tsConfig: {
      fileName: 'tsconfig.json',
    },
    enhancedResolveOptions: {
      conditionNames: ['import', 'types', 'node', 'default'],
      extensions: ['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs', '.json'],
      exportsFields: ['exports'],
    },
  },
};
