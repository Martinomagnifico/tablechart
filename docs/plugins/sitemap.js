import { readdirSync } from 'fs';
import { join, relative } from 'path';

function pagesIn(dir, root = dir) {
	return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
		const path = join(dir, entry.name);
		if (entry.isDirectory()) return entry.name === 'templates' ? [] : pagesIn(path, root);
		if (!entry.name.endsWith('.pug') || entry.name.startsWith('_')) return [];
		return [relative(root, path).replace(/\.pug$/, '.html')];
	});
}

// The same URLs as the canonical links, so index.html at the root is the bare site URL.
export default function sitemap({ siteUrl, viewsDir }) {
	return {
		name: 'sitemap',
		apply: 'build',
		generateBundle() {
			const urls = pagesIn(viewsDir)
				.sort()
				.map((page) => siteUrl + (page === 'index.html' ? '' : page))
				.map((loc) => `\t<url><loc>${loc}</loc></url>`);
			const source = [
				'<?xml version="1.0" encoding="UTF-8"?>',
				'<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
				...urls,
				'</urlset>',
				'',
			].join('\n');
			this.emitFile({ type: 'asset', fileName: 'sitemap.xml', source });
			this.emitFile({ type: 'asset', fileName: 'robots.txt', source: `User-agent: *\nAllow: /\n\nSitemap: ${siteUrl}sitemap.xml\n` });
		},
	};
}
