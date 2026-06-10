/** Copies ../results into public/results so the built site is self-contained. */
import { cpSync, mkdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const site = dirname(fileURLToPath(import.meta.url));
const dest = join(site, "public", "results");
mkdirSync(dest, { recursive: true });
cpSync(join(site, "..", "results"), dest, { recursive: true });
console.log("results copied to public/results");
