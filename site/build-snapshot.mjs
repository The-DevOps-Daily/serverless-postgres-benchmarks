/**
 * Builds site/snapshot.html: a fully self-contained copy of the dashboard
 * (data, script, styles, and fonts inlined) that renders over file:// with
 * no server. Used for screenshots and for sharing a single-file preview.
 *
 *   node site/build-snapshot.mjs   (from the repo root)
 */
import { readFileSync, writeFileSync, readdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const site = dirname(fileURLToPath(import.meta.url));
const root = join(site, "..");

const manifest = JSON.parse(readFileSync(join(root, "results/manifest.json"), "utf8"));
const files = manifest.files.map((f) => ({
  file: f,
  data: JSON.parse(readFileSync(join(root, "results", f), "utf8")),
}));

const appJs = readFileSync(join(site, "app.js"), "utf8");
const styles = readFileSync(join(site, "styles.css"), "utf8");
const fontsCss = readFileSync(join(site, "fonts.css"), "utf8").replace(
  /url\((fonts\/[^)]+\.woff2)\)/g,
  (_, rel) => {
    const b64 = readFileSync(join(site, rel)).toString("base64");
    return `url(data:font/woff2;base64,${b64})`;
  },
);

let html = readFileSync(join(site, "index.html"), "utf8");
html = html.replace(
  /<link rel="stylesheet" href="fonts.css" \/>\s*<link rel="stylesheet" href="styles.css" \/>/,
  `<style>${fontsCss}</style>\n<style>${styles}</style>`,
);
html = html.replace(
  '<script type="module" src="app.js"></script>',
  `<script>window.__BENCH_DATA__ = ${JSON.stringify(files)}</script>\n<script type="module">${appJs}</script>`,
);

writeFileSync(join(site, "snapshot.html"), html);
console.log(`snapshot.html: ${(html.length / 1024).toFixed(0)} KB, ${files.length} result files inlined`);
