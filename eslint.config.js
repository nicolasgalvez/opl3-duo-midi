import js from '@eslint/js'
import globals from 'globals'
import prettier from 'eslint-config-prettier'
import tseslint from 'typescript-eslint'

// The CLI/backend TypeScript tree (web-app has its own toolchain and is
// deliberately out of scope here).
const TS_FILES = ['tools/midi/src/**/*.ts', 'tools/midi/tests/**/*.ts', 'tools/midi/*.ts']

// Flat config. Formatting (semicolons, quotes, indent) is owned by Prettier;
// eslint-config-prettier turns off ESLint's stylistic rules so they don't fight.
export default [
  { ignores: ['**/node_modules/**', '.pio/**', 'tools/midi/test-results/**', 'tools/midi/playwright-report/**'] },
  js.configs.recommended,
  {
    // tools/midi is Node, but it also embeds browser code in Playwright
    // page.evaluate()/waitForFunction() callbacks and ships the web/ UI, so
    // both Node and browser globals are legitimately in play here.
    files: ['tools/midi/**/*.{js,mjs}'],
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
      globals: { ...globals.node, ...globals.browser },
    },
    rules: { 'no-unused-vars': ['warn', { argsIgnorePattern: '^_' }] },
  },
  ...tseslint.configs.recommended.map((c) => ({ ...c, files: TS_FILES })),
  {
    files: TS_FILES,
    languageOptions: {
      globals: { ...globals.node, ...globals.browser },
    },
    rules: {
      // ignoreRestSiblings: `const { flag, global: _g, ...rest } = opt` is the
      // idiomatic way to omit keys from a spread copy.
      '@typescript-eslint/no-unused-vars': ['warn', { argsIgnorePattern: '^_', ignoreRestSiblings: true }],
    },
  },
  prettier,
]
