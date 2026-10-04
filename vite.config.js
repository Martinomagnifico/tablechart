// vite.config.ts
import { defineConfig, build } from 'vite';
import { resolve } from 'path';
import dts from 'vite-plugin-dts';

const iifeBuild = () => ({
  name: 'iife-build',
  closeBundle: async () => {
    await build({
      configFile: false,
      build: {
        lib: {
          entry: resolve(__dirname, 'src/js/index.iife.ts'),
          name: 'Tablechart',
          formats: ['iife'],
          fileName: () => 'tablechart.js'
        },
        emptyOutDir: false,
        sourcemap: false,
        minify: 'terser',
        terserOptions: {
          // Smaller bundle.
          mangle: { properties: { regex: /^_/ } },
          compress: { passes: 3 }
        },
        target: 'es2020'
      }
    });
  }
});



export default defineConfig({
  plugins: [
    // The types in one file per entry: dist/tablechart.d.ts and tablechart-core.d.ts.
    dts({
      bundleTypes: true,
      outDirs: 'dist',
      entryRoot: 'src/js',
      entries: { tablechart: 'src/js/index.ts', 'tablechart-core': 'src/js/blocks.ts' },
      include: ['src/js/**/*'],
      exclude: ['src/js/index.iife.ts']
    }),
    iifeBuild()
  ],
  build: {
    // One ES module per entry: dist/tablechart.mjs for init() and create(), and
    // dist/tablechart-core.mjs for the building blocks under them. The stylesheet
    // is dist/tablechart.css.
    lib: {
      entry: {
        tablechart: resolve(__dirname, 'src/js/index.ts'),
        'tablechart-core': resolve(__dirname, 'src/js/blocks.ts'),
      },
      formats: ['es'],
      fileName: (_format, name) => `${name}.mjs`,
      cssFileName: 'tablechart',
    },
    rollupOptions: {
      // Both entries use the same code, so it is in one shared file that they
      // both import: dist/tablechart-shared.mjs.
      output: { chunkFileNames: 'tablechart-shared.mjs' },
    },
    sourcemap: false,
    minify: 'oxc',
    target: 'es2020'
  },
  server: {
    host: true,
    open: "index.html",
}
});