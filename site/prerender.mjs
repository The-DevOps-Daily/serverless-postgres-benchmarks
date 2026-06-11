/**
 * Prerenders the dashboard into dist/index.html after `vite build`, so the
 * full content (numbers, charts, findings) is present in the HTML for search
 * engines and AI crawlers instead of an empty root div. The result data is
 * embedded ahead of the bundle; the client hydrates the same markup without
 * any fetch.
 */
import { readFileSync, writeFileSync, rmSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { buildSync } from "esbuild";

const site = dirname(fileURLToPath(import.meta.url));
const dist = join(site, "dist");
const root = join(site, "..");

const manifest = JSON.parse(readFileSync(join(root, "results/manifest.json"), "utf8"));
const files = manifest.files.map((f) => ({
  file: f,
  data: JSON.parse(readFileSync(join(root, "results", f), "utf8")),
}));

// Bundle the SSR entry for node (App + charts are plain JSX, no css imports)
const ssrBundle = join(site, ".ssr-bundle.mjs");
buildSync({
  entryPoints: [join(site, "src/ssr-entry.jsx")],
  bundle: true,
  platform: "node",
  format: "esm",
  jsx: "automatic",
  external: ["react", "react-dom"],
  outfile: ssrBundle,
  logLevel: "silent",
});

globalThis.window = { __BENCH_DATA__: files };
const { render } = await import(pathToFileURL(ssrBundle).href);
const markup = render();
rmSync(ssrBundle);

let html = readFileSync(join(dist, "index.html"), "utf8");
html = html.replace('<div id="root"></div>', `<div id="root">${markup}</div>`);
html = html.replace(
  "<body>",
  `<body>\n<script id="bench-data">window.__BENCH_DATA__ = ${JSON.stringify(files)}</script>`,
);
writeFileSync(join(dist, "index.html"), html);
console.log(
  `prerendered index.html: ${(html.length / 1024).toFixed(0)} KB, ` +
    `${(markup.length / 1024).toFixed(0)} KB markup, ${files.length} result files embedded`,
);
