/**
 * Builds snapshot.html from the production bundle in dist/: JS, CSS, fonts,
 * and results data all inlined, so it renders over file:// with no server.
 * Used for screenshots (headless chromium can't fetch from localhost
 * everywhere) and as a single-file shareable preview.
 *
 *   npm run build && npm run snapshot
 */
import { readFileSync, writeFileSync, readdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const site = dirname(fileURLToPath(import.meta.url));
const dist = join(site, "dist");
const root = join(site, "..");

const manifest = JSON.parse(readFileSync(join(root, "results/manifest.json"), "utf8"));
const files = manifest.files.map((f) => ({
  file: f,
  data: JSON.parse(readFileSync(join(root, "results", f), "utf8")),
}));

let html = readFileSync(join(dist, "index.html"), "utf8");

// Inline the bundle
html = html.replace(/<script type="module"[^>]*src="\.\/(assets\/[^"]+\.js)"[^>]*><\/script>/, (_, src) => {
  const js = readFileSync(join(dist, src), "utf8");
  return `<script type="module">${js}</script>`;
});

// Inline app styles
html = html.replace(/<link rel="stylesheet"[^>]*href="\.\/(assets\/[^"]+\.css)"[^>]*>/, (_, href) => {
  const css = readFileSync(join(dist, href), "utf8");
  return `<style>${css}</style>`;
});

// Inline fonts.css with base64 woff2
html = html.replace(/<link rel="stylesheet" href="\.\/fonts\.css"[^>]*>/, () => {
  const fontsCss = readFileSync(join(dist, "fonts.css"), "utf8").replace(
    /url\((fonts\/[^)]+\.woff2)\)/g,
    (_, rel) => `url(data:font/woff2;base64,${readFileSync(join(dist, rel)).toString("base64")})`,
  );
  return `<style>${fontsCss}</style>`;
});

// Embed the data ahead of the bundle (prerender.mjs may have done it already)
if (!html.includes("__BENCH_DATA__")) {
  html = html.replace("<script type=\"module\">", `<script>window.__BENCH_DATA__ = ${JSON.stringify(files)}</script>\n<script type="module">`);
}

// Freeze entrance animations so screenshots capture the final state
html = html.replace("</head>", `<style>.bar-grow,.dot-in,.fade-in{animation:none !important}</style></head>`);

writeFileSync(join(site, "snapshot.html"), html);
console.log(`snapshot.html: ${(html.length / 1024).toFixed(0)} KB, ${files.length} result files inlined`);
