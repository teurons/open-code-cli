/* eslint-env node */
module.exports = {
  root: true,
  parserOptions: {
    sourceType: 'module',
  },
  parser: '@typescript-eslint/parser',
  plugins: ['@typescript-eslint', 'prettier', 'jest', 'unused-imports'],
  extends: ['eslint:recommended', 'plugin:@typescript-eslint/recommended', 'prettier'],
  rules: {
    'no-console': 1,
    'prettier/prettier': 2,
    '@typescript-eslint/no-unused-vars': 'off',
    'unused-imports/no-unused-imports': 'error',
  },
  env: {
    node: true,
    'jest/globals': true,
  },
  ignores: [
    // Logs
    'logs',
    '*.log',
    'npm-debug.log*',
    'yarn-debug.log*',
    'yarn-error.log*',
    'lerna-debug.log*',
    '.pnpm-debug.log*',
    
    // Diagnostic reports
    'report.[0-9]*.[0-9]*.[0-9]*.[0-9]*.json',
    
    // Runtime data
    'pids',
    '*.pid',
    '*.seed',
    '*.pid.lock',
    
    // Coverage
    'lib-cov',
    'coverage',
    '*.lcov',
    '.nyc_output',
    
    // Build tools
    '.grunt',
    'bower_components',
    '.lock-wscript',
    'build/Release',
    
    // Dependencies
    'node_modules/',
    'jspm_packages/',
    'web_modules/',
    
    // TypeScript
    '*.tsbuildinfo',
    
    // Caches
    '.npm',
    '.eslintcache',
    '.stylelintcache',
    '.rpt2_cache/',
    '.rts2_cache_cjs/',
    '.rts2_cache_es/',
    '.rts2_cache_umd/',
    '.node_repl_history',
    
    // Package files
    '*.tgz',
    '.yarn-integrity',
    
    // Environment
    '.env',
    '.env.development.local',
    '.env.test.local',
    '.env.production.local',
    '.env.local',
    
    // Build caches
    '.cache',
    '.parcel-cache',
    '.next',
    'out',
    '.nuxt',
    'dist',
    '.cache/',
    '.vuepress/dist',
    '.temp',
    '.docusaurus',
    
    // Serverless
    '.serverless/',
    '.fusebox/',
    '.dynamodb/',
    '.tern-port',
    '.vscode-test',
    
    // Yarn
    '.yarn/cache',
    '.yarn/unplugged',
    '.yarn/build-state.yml',
    '.yarn/install-state.gz',
    '.pnp.*',
    '.yarn',
    
    // Custom
    'bundle',
    'dist',
    'TODO'
  ]
}
