import { defineConfig } from 'vite'

// Monta a extensão em dist-extension/: os arquivos de extension/ (copiados como estão) + engine.js,
// que é o motor do Toki (src/extension/engine.ts) num script clássico exposto como globalThis.TokiEngine.
export default defineConfig({
  publicDir: 'extension',
  build: {
    outDir: 'dist-extension',
    emptyOutDir: true,
    copyPublicDir: true,
    lib: { entry: 'src/extension/engine.ts', name: 'TokiEngine', formats: ['iife'], fileName: () => 'engine.js' },
  },
})
