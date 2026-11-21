// Mutation check for the escrow contract: removes each require(...) line of contracts/LaunchDeskEscrow.cash in turn,
// recompiles it with cashc, and runs the named attack tests (test/escrow-attacks.test.ts) against that weaker
// contract. A mutant is "caught" when at least one attack test fails, which proves that test depends on the line.
//
// Run: npm run mutate        (v1: contracts/LaunchDeskEscrow.cash against test/escrow-attacks.test.ts)
//      npm run mutate:v2     (v2: contracts/LaunchDeskEscrowV2.cash against test/escrow-v2.test.ts)
//                            (offline: every transaction is checked by a local mock network, nothing is broadcast)
//
// Everything runs in a temporary copy of server/ and the test file, so the repo's contract and artifact are never
// changed, even if the script is stopped half way.
import { compileString } from "cashc";
import { spawnSync } from "node:child_process";
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const V2 = process.argv.includes("--v2");
const CONTRACT = V2 ? "contracts/LaunchDeskEscrowV2.cash" : "contracts/LaunchDeskEscrow.cash";
const SRC = readFileSync(join(ROOT, CONTRACT), "utf8");
// v2: the 41 v1 attacks re-run against v2 (ESCROW_ATTACK_VERSION=2, coin at vout 1) plus the receipt attacks.
const TESTS = V2 ? ["test/escrow-attacks.test.ts", "test/escrow-v2.test.ts"] : ["test/escrow-attacks.test.ts"];
const TEST = TESTS.join(" + ");
const ARTIFACT_FILE = V2 ? "artifact-v2.ts" : "artifact.ts";
const ARTIFACT_NAME = V2 ? "escrowArtifactV2" : "escrowArtifact";
// node_modules may live in a parent folder (e.g. a git worktree inside the main checkout)
let MODULES = join(ROOT, "node_modules");
for (let d = ROOT; !existsSync(MODULES) && dirname(d) !== d; d = dirname(d)) MODULES = join(dirname(d), "node_modules");

const tmp = mkdtempSync(join(tmpdir(), "launchdesk-mutate-"));
const cleanup = () => rmSync(tmp, { recursive: true, force: true });
process.on("SIGINT", () => (cleanup(), process.exit(130)));
cpSync(join(ROOT, "server"), join(tmp, "server"), { recursive: true });
mkdirSync(join(tmp, "test"), { recursive: true });
for (const t of TESTS) cpSync(join(ROOT, t), join(tmp, t));
cpSync(join(ROOT, "package.json"), join(tmp, "package.json"));
symlinkSync(MODULES, join(tmp, "node_modules"), "dir");
const TSX = join(MODULES, ".bin", "tsx");

const artifactTs = (a) =>
  `// mutant (scripts/mutate-contract.mjs)\nexport const ${ARTIFACT_NAME} = ${JSON.stringify(a, null, 2)} as const;\n`;
function runTests(artifact) {
  writeFileSync(join(tmp, "server", "escrow", ARTIFACT_FILE), artifactTs(artifact));
  let ok = true;
  const fails = [];
  for (const t of TESTS) {
    const env = { ...process.env, MOCK_AI: "1", ...(V2 ? { ESCROW_ATTACK_VERSION: "2" } : {}) };
    const r = spawnSync(TSX, [t], { cwd: tmp, encoding: "utf8", env, timeout: 300_000 });
    fails.push(...[...(r.stdout ?? "").matchAll(/^not ok \d+ - (.+)$/gm)].map((m) => m[1]));
    if (r.status !== 0) ok = false;
  }
  return { ok, fails };
}

// the function each line belongs to, for the table
const lines = SRC.split("\n");
const fnAt = (i) => {
  for (let j = i; j >= 0; j--) {
    const m = /function\s+(\w+)\s*\(/.exec(lines[j]);
    if (m) return m[1];
  }
  return "?";
};
const targets = lines.map((l, i) => ({ l, i })).filter(({ l }) => /^\s*require\(/.test(l));

let exit = 0;
try {
  const base = runTests(compileString(SRC));
  if (!base.ok) {
    console.error(`The attack tests fail on the unchanged contract (${base.fails.length} failing). Fix that first.`);
    exit = 2;
  } else {
    console.log(`Contract: ${CONTRACT} · ${targets.length} require lines · tests: ${TEST}\n`);
    console.log("| # | function | removed line | result | first attack test that caught it |");
    console.log("|---|---|---|---|---|");
    let caught = 0;
    targets.forEach(({ l, i }, n) => {
      const mutant = lines.map((x, j) => (j === i ? x.replace(/require\(.*\);/, "// removed by mutation check") : x)).join("\n");
      let res;
      try {
        res = runTests(compileString(mutant));
      } catch (e) {
        console.log(`| ${n + 1} | ${fnAt(i)} | \`${l.trim()}\` | does not compile | ${String(e.message).split("\n")[0]} |`);
        return;
      }
      if (!res.ok) caught++;
      console.log(`| ${n + 1} | ${fnAt(i)} | \`${l.trim()}\` | ${res.ok ? "**MISSED**" : "caught"} | ${res.ok ? "" : (res.fails[0] ?? "(test run failed)")} |`);
    });
    console.log(`\n${caught} of ${targets.length} mutants caught.`);
    if (caught < targets.length) exit = 1;
  }
} finally {
  cleanup();
}
process.exit(exit);
