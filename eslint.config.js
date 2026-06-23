import js from '@eslint/js'
import globals from 'globals'
import prettier from 'eslint-config-prettier'

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
  prettier,
]
