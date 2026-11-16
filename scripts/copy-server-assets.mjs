// B3: tsc only emits .js, but the server reads fixtures at run time (brand / marketing / site fixtures JSON, the
// custom-site reference page and saved pages, the CC0 photos, the seed examples). This copies every non-TypeScript
// file under server/ into dist/server at the same path, so code that resolves files next to itself
// (import.meta.url) finds them in production. Run by `npm run build` after tsc.
import { cpSync, existsSync, readdirSync, statSync } from "node:fs";
import { dirname, extname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const SRC = join(ROOT, "server");
const OUT = join(ROOT, "dist", "server");
const SKIP = new Set(["tsconfig.json"]); // build config, not a runtime file

if (!existsSync(OUT)) {
  console.error("[assets] dist/server is missing: run tsc first");
  process.exit(1);
}

let n = 0;
let bytes = 0;
const walk = (dir) => {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    const st = statSync(p);
    if (st.isDirectory()) walk(p);
    else if (extname(name) !== ".ts" && !SKIP.has(relative(SRC, p)) && name !== ".DS_Store") {
      cpSync(p, join(OUT, relative(SRC, p)));
      n++;
      bytes += st.size;
    }
  }
};
walk(SRC);
console.log(`[assets] copied ${n} server files (${Math.round(bytes / 1024)} KB) into dist/server`);

// Must-haves: fail the build (and so the deploy) rather than ship a server that silently degrades.
const required = [
  "site/fixtures/custom/exemplar.html",
  "site/fixtures/photos/credits.json",
  "site/fixtures/dogwalk-en.json",
  "brand/fixtures",
  "marketing/fixtures",
];
const missing = required.filter((f) => !existsSync(join(OUT, f)));
if (missing.length) {
  console.error(`[assets] missing in dist/server: ${missing.join(", ")}`);
  process.exit(1);
}

// B2: the escrow switches must agree. VITE_ESCROW is baked into the web app by the build that just ran.
const env = process.env;
if ((env.VITE_ESCROW === "1") !== (env.ESCROW === "1"))
  console.warn(`[assets] WARNING: ESCROW=${env.ESCROW ?? "(unset)"} and VITE_ESCROW=${env.VITE_ESCROW ?? "(unset)"} disagree. Set both to 1 or both off, or validate payments fail.`);
