// Report the gzipped, tree-shaken size of each package entry on its own, the
// script-tag build, and the stylesheet. Uses Vite's build API (already a devDep).
// The numbers are also saved in docs/src/data/size.json, for the docs as `size.js`, `size.css` and `size.total`.
//
//   npm run size
//
// Note: the entries share most of their code (core, charts, annotations), so
// the standalone numbers OVERLAP and do not add up.
import { build } from 'vite';
import { gzipSync } from 'node:zlib';
import { writeFileSync, readFileSync, rmSync, mkdtempSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

// Entries use paths relative to the repo root (the cwd of `npm run`), so Vite
// bundles the source instead of treating it as an external import.
const entries = {
	'init':              { code: `export { init } from './src/js/index';` },
	'create':            { code: `export { create } from './src/js/index';` },
	'tablechart':        { code: `export * from './src/js/index';` },
	'tablechart/core':   { code: `export * from './src/js/blocks';` },
	'Both entries':      { code: `export * from './src/js/index';\nexport * from './src/js/blocks';` },
	// Built from the file itself: package.json's `sideEffects` would drop a bare import.
	'Script tag (IIFE)': { file: './src/js/index.iife.ts', iife: true },
	// The additional types on their own, with the helpers they share with the core.
	'tablechart/additional-types': { code: `export * from './src/js/additional-types';` },
	// Takes the helpers from the core's script, as it ships.
	'Additional types script tag': { file: './src/js/additional-types.iife.ts', iife: true, kit: true },
};
const kit = (id) => /[/\\]kit(\.ts)?$/.test(id);

const rows = [];
let css = null;
let i = 0;
for (const [label, { code, file, iife, kit: fromCore }] of Object.entries(entries)) {
	const entry = file ?? `./.size-entry-${i++}.mjs`;
	const out = mkdtempSync(join(tmpdir(), 'tablechart-size-'));
	if (!file) writeFileSync(entry, code);
	try {
		await build({
			configFile: false,
			logLevel: 'silent',
			build: {
				outDir: out,
				emptyOutDir: false,
				minify: 'terser',
				cssCodeSplit: false,
				target: 'es2020',
				// The same browsers as the real build in vite.config.js, so the stylesheet is measured as it ships.
				cssTarget: ['chrome123', 'edge123', 'firefox120', 'safari17.5'],
				lib: iife
					? { entry, formats: ['iife'], name: 'Tablechart', fileName: () => 'out.js' }
					: { entry, formats: ['es'], fileName: 'out' },
				rollupOptions: fromCore ? { external: kit, output: { globals: () => 'Tablechart.kit' } } : {},
			},
		});
		const files = readdirSync(out);
		const js = files.find((f) => /\.(mjs|js)$/.test(f));
		const raw = readFileSync(join(out, js));
		rows.push({ label, gzip: gzipSync(raw, { level: 9 }).length, raw: raw.length });
		const cssFile = files.find((f) => f.endsWith('.css'));
		if (!css && cssFile) {
			const rawCss = readFileSync(join(out, cssFile));
			css = { label: 'Stylesheet (CSS)', gzip: gzipSync(rawCss, { level: 9 }).length, raw: rawCss.length };
		}
	} finally {
		if (!file) rmSync(entry, { force: true });
		rmSync(out, { recursive: true, force: true });
	}
}
if (css) rows.push(css);

// In kB with two decimals, gzipped, so the docs can round once. The JavaScript is the full `tablechart` entry.
const round = (n) => Math.round((n / 1024) * 100) / 100;
const gzipOf = (label) => rows.find((r) => r.label === label)?.gzip ?? 0;
const size = {
	js: round(gzipOf('tablechart')),
	css: round(css?.gzip ?? 0),
	total: round(gzipOf('tablechart') + (css?.gzip ?? 0)),
	entries: Object.fromEntries(rows.map((r) => [r.label, round(r.gzip)])),
};
const data = fileURLToPath(new URL('../docs/src/data/size.json', import.meta.url));
writeFileSync(data, JSON.stringify({ size }, null, '\t') + '\n');

const kb = (n) => (n / 1024).toFixed(1) + ' kB';
console.log('\ngzipped size (tree-shaken, terser):\n');
for (const r of rows) {
	console.log(`  ${r.label.padEnd(28)} ${kb(r.gzip).padStart(8)}   (raw ${kb(r.raw)})`);
}
console.log('\nThe entries share most of their code, so standalone sizes overlap and');
console.log('do not add up.\n');
console.log('Saved in docs/src/data/size.json.\n');
