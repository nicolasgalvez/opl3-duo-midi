import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// Dev server proxies the live backend (run `opl serve` on :7373 alongside `npm run dev`).
// Production: `npm run build` emits dist/, which tools/midi/opl.mjs serves directly.
const BACKEND = 'http://localhost:7373'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  base: './',
  build: { outDir: 'dist', emptyOutDir: true },
  server: {
    proxy: {
      '/events': BACKEND,
      '/api': BACKEND,
      '/art': BACKEND,
    },
  },
  // `test` is consumed by Vitest at runtime; Vite's own config type doesn't
  // declare it, so we attach it here without pulling Vitest's (duplicate) Vite types.
  // @ts-expect-error -- Vitest reads this; Vite ignores it.
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/test/setup.ts'],
    css: false,
  },
})
