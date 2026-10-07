// Shared by the tests: serves `dist/` with a page of our own, and runs code in it in headless Chrome over the DevTools protocol.
import { spawn } from "node:child_process";
import { createReadStream } from "node:fs";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { dirname, extname, join, resolve } from "node:path";
import { setTimeout as sleep } from "node:timers/promises";
import { fileURLToPath } from "node:url";

export const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");

const CHROME_CANDIDATES = [
	process.env.CHROME_PATH,
	"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
	"/Applications/Chromium.app/Contents/MacOS/Chromium",
	"/usr/bin/google-chrome",
	"/usr/bin/chromium",
].filter(Boolean);

const MIME = { ".html": "text/html", ".mjs": "text/javascript", ".js": "text/javascript", ".css": "text/css" };

/** A page that loads the built stylesheet and runs `script` as a module next to `dist/tablechart.mjs`. */
export const page = (body, script, style = "") => `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><link rel="stylesheet" href="/tablechart.css">
<style>body { margin: 0; width: 640px; font: 16px Helvetica, Arial, sans-serif; } ${style}</style></head>
<body>${body}<script type="module">${script}</script></body></html>`;

/** Serves `dist/`, and `html` at `/`. */
const serve = (html, port) => {
	const server = createServer((req, res) => {
		const path = decodeURIComponent(req.url.split("?")[0]);
		if (path === "/") {
			res.setHeader("Content-Type", "text/html");
			res.end(html);
			return;
		}
		const file = join(ROOT, "dist", path);
		res.setHeader("Content-Type", MIME[extname(file)] ?? "application/octet-stream");
		createReadStream(file)
			.on("error", () => {
				res.statusCode = 404;
				res.end();
			})
			.pipe(res);
	});
	return new Promise((ok) => server.listen(port, "127.0.0.1", () => ok(server)));
};

/**
 * Opens `html` in headless Chrome, waits until `window.done` is set, and returns its value.
 * Errors on the page fail the run.
 */
export async function run(html, { port = 4610, cdpPort = 9610, width = 1200, timeout = 120_000 } = {}) {
	const server = await serve(html, port);
	const chrome = CHROME_CANDIDATES[0];
	const proc = spawn(
		chrome,
		[
			"--headless=new",
			`--remote-debugging-port=${cdpPort}`,
			"--no-first-run",
			"--no-default-browser-check",
			`--window-size=${width},900`,
			`--user-data-dir=${join(tmpdir(), `tablechart-test-${cdpPort}`)}`,
			"about:blank",
		],
		{ stdio: "ignore" }
	);
	try {
		let target;
		for (let i = 0; i < 80 && !target; i++) {
			try {
				const r = await fetch(`http://127.0.0.1:${cdpPort}/json/new?${encodeURIComponent(`http://127.0.0.1:${port}/`)}`, { method: "PUT" });
				target = await r.json();
			} catch {
				await sleep(150);
			}
		}
		if (!target) throw new Error("Chrome did not start. Set CHROME_PATH if it is installed elsewhere.");

		const ws = new WebSocket(target.webSocketDebuggerUrl);
		await new Promise((ok, no) => {
			ws.onopen = ok;
			ws.onerror = no;
		});
		let id = 0;
		const pending = new Map();
		const errors = [];
		ws.onmessage = (m) => {
			const msg = JSON.parse(m.data);
			if (msg.id && pending.has(msg.id)) {
				pending.get(msg.id)(msg);
				pending.delete(msg.id);
			}
			if (msg.method === "Runtime.exceptionThrown") {
				errors.push(msg.params.exceptionDetails.exception?.description ?? msg.params.exceptionDetails.text);
			}
		};
		const send = (method, params = {}) =>
			new Promise((ok) => {
				const i = ++id;
				pending.set(i, ok);
				ws.send(JSON.stringify({ id: i, method, params }));
			});

		await send("Runtime.enable");
		const started = Date.now();
		while (Date.now() - started < timeout) {
			if (errors.length) throw new Error(`Error on the page: ${errors[0]}`);
			const r = await send("Runtime.evaluate", { expression: "window.done", returnByValue: true });
			const value = r.result?.result?.value;
			if (value !== undefined) {
				ws.close();
				return value;
			}
			await sleep(200);
		}
		throw new Error("The page did not finish in time.");
	} finally {
		proc.kill();
		server.close();
	}
}
