// Fail when a public CSS variable that the library reads is missing from the CSS variables page.
//
//   npm run check:variables
//
// Old names (the warning map in src/js/init.ts) and the palette numbers after --tablechart-color-1 are left out.
import { readFileSync, readdirSync } from 'node:fs';
import { join, extname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const PAGE = join(ROOT, 'docs/src/views/reference/variables.pug');

const files = (dir) =>
	readdirSync(dir, { withFileTypes: true }).flatMap((entry) =>
		entry.isDirectory() ? files(join(dir, entry.name)) : [join(dir, entry.name)]
	);

const source = files(join(ROOT, 'src'))
	.filter((file) => ['.scss', '.ts'].includes(extname(file)))
	.map((file) => readFileSync(file, 'utf8'))
	.join('\n');

const init = readFileSync(join(ROOT, 'src/js/init.ts'), 'utf8');
const oldNames = new Set([...init.matchAll(/\["(--tablechart-[\w-]+)", "--tablechart-/g)].map((m) => m[1]));

const used = new Set(
	[...source.matchAll(/--tablechart-[\w-]*\w/g)]
		.map((m) => m[0])
		.filter((name) => !oldNames.has(name) && !/^--tablechart-color-(\d+|n)$/.test(name))
);

const page = readFileSync(PAGE, 'utf8');
const rows = [...page.matchAll(/\['(--tablechart-[\w-]+)'/g)].map((m) => m[1]);
const listed = new Set(rows);
const twice = [...listed].filter((name) => rows.indexOf(name) !== rows.lastIndexOf(name));
const missing = [...used].filter((name) => !listed.has(name)).sort();
const unknown = [...listed].filter((name) => !used.has(name) && name !== '--tablechart-color-1').sort();

if (missing.length || unknown.length || twice.length) {
	if (twice.length) console.error(`On the CSS variables page more than once:\n  ${twice.join('\n  ')}`);
	if (missing.length) console.error(`Not on the CSS variables page:\n  ${missing.join('\n  ')}`);
	if (unknown.length) console.error(`On the CSS variables page, but not read by the library:\n  ${unknown.join('\n  ')}`);
	process.exit(1);
}
console.log(`✓ The CSS variables page lists all ${listed.size} variables.`);
