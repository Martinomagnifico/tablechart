import { defineConfig } from 'vite';
import { resolve } from "path";
import vituum from "vituum";
import pug from '@vituum/vite-plugin-pug';
import { viteStaticCopy } from 'vite-plugin-static-copy';

const SITE_URL = 'https://martinomagnifico.github.io/tablechart/';

export default defineConfig(({ mode }) => {
	const isDev = mode === 'development';
    const isProd = mode === 'production';

	return {
		base: isProd ? '/tablechart/' : '/',
		build: {
	        outDir: "dist",
	        emptyOutDir: false,
			// Browsers that support light-dark(), so the build does not rewrite it.
			cssTarget: ['chrome123', 'edge123', 'firefox120', 'safari17.5'],
	        rollupOptions: {
	            input: [
					resolve(__dirname, "src/views/**/[!_]*.pug"),
	                resolve(__dirname, "src/assets/styles/[!_]*.scss"),
	                resolve(__dirname, "src/assets/scripts/[!_]*.js")
	            ],
	            output: {
	                entryFileNames: (chunkInfo) => {
	                    if (chunkInfo.name === 'main') {
	                        return "assets/scripts/main.js";
	                    }
	                    if (chunkInfo.name === 'copybutton') {
	                        return "assets/scripts/copybutton.js";
	                    }
	                    return "assets/scripts/[name].js";
	                },
	                assetFileNames: (assetInfo) => {
	                    if (/\.css$/.test(assetInfo.names[0])) {
	                        return "assets/style/[name].[ext]";
	                    }
	                    return "assets/[name].[ext]";
	                },
	            }
	        },
	    },
		plugins: [
			{
				name: 'og-url',
				transformIndexHtml(html, ctx) {
					const path = (ctx.path || '/')
						.replace(/^\//, '')
						.replace(/^src\/views\//, '')
						.replace(/\.pug\.html$/, '.html');
					const url = SITE_URL + (path === 'index.html' ? '' : path);
					return html.replace(
						'<meta property="og:type"',
						`<meta property="og:url" content="${url}">\n<link rel="canonical" href="${url}">\n<meta property="og:type"`
					);
				},
			},
			{
				name: 'pug-full-reload',
				configureServer(server) {
					server.watcher.add(resolve(__dirname, 'src/**/*.pug'));
					server.watcher.add(resolve(__dirname, 'src/data/*.json'));
				},
				handleHotUpdate({ file, server, modules }) {
					// The pug plugin reads src/data/*.json again on each render, so the sidebar follows nav.json.
					if (file.endsWith('.pug') || /src\/data\/[^/]+\.json$/.test(file)) {
						modules.forEach(mod => server.moduleGraph.invalidateModule(mod));
						server.moduleGraph.invalidateAll();
						const hot = server.hot ?? server.ws;
						setTimeout(() => hot.send({ type: 'full-reload' }), 150);
					}
				}
			},
            viteStaticCopy({
                targets: [
                { src: '../dist/tablechart.js', dest: 'lib' },
                { src: '../dist/tablechart.css', dest: 'lib' },
                { src: 'node_modules/panelset/dist/panelset.js', dest: 'lib' },
                { src: 'node_modules/panelset/dist/panelset.css', dest: 'lib' },
                { src: 'node_modules/@highlightjs/cdn-assets/highlight.min.js', dest: 'lib' },
                { src: 'node_modules/@highlightjs/cdn-assets/styles/github.min.css', dest: 'lib' },
                { src: 'node_modules/@highlightjs/cdn-assets/styles/github-dark.min.css', dest: 'lib' },
                { src: 'node_modules/highlightjs-line-numbers.js/dist/highlightjs-line-numbers.min.js', dest: 'lib' }
                ]
            }),
			vituum({
	            pages: {
	                dir: "src/views",
	                normalizeBasePath: true,
	            },
	        }),
	        pug({
	            root: "src",
				globals: {
					isProd: isProd,
					basePath: isProd ? '/tablechart/' : '/',
					siteUrl: SITE_URL, // absolute, for Open Graph: a relative og:image is ignored
					url: (h) => (isProd ? '/tablechart/' : '/') + String(h).replace(/^\//, ''),
				},
	            options: {
	                pretty: true,
	                cache: false,
	                doctype: 'html',
	            }
	        })
		],
	    server: {
	        host: true,
	        open: "index.html",
	    },
		css: {
	        preprocessorOptions: {
	            scss: {
	                api: "modern"
	            }
	        }
	    },
		resolve: {
			alias: {
				// PanelSet comes from npm, for the sidebar and tabs. Tablechart is this
				// project's own library: its source while developing, its build otherwise.
				'@martinomagnifico/tablechart': isDev
					? resolve(__dirname, '../src/js/index.ts')
					: resolve(__dirname, '../dist/tablechart.mjs')
			}
		}
	};
});