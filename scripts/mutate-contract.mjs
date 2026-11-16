// Mutation check for the escrow contract: removes each require(...) line of contracts/LaunchDeskEscrow.cash in turn,
// recompiles it with cashc, and runs the named attack tests (test/escrow-attacks.test.ts) against that weaker
// contract. A mutant is "caught" when at least one attack test fails, which proves that test depends on the line.
//
// Run: npm run mutate        (offline: every transaction is checked by a local mock network, nothing is broadcast)
//
// Everything runs in a temporary copy of server/ and the test file, so the repo's contract and artifact are never
// changed, even if the script is stopped half way.
import { compileString } from "cashc";
import { spawnSync } from "node:child_process";
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const SRC = readFileSync(join(ROOT, "contracts", "LaunchDeskEscrow.cash"), "utf8");
const TEST = "test/escrow-attacks.test.ts";

const tmp = mkdtempSync(join(tmpdir(), "launchdesk-mutate-"));
const cleanup = () => rmSync(tmp, { recursive: true, force: true });
process.on("SIGINT", () => (cleanup(), process.exit(130)));
cpSync(join(ROOT, "server"), join(tmp, "server"), { recursive: true });
mkdirSync(join(tmp, "test"), { recursive: true });
cpSync(join(ROOT, TEST), join(tmp, TEST));
cpSync(join(ROOT, "package.json"), join(tmp, "package.json"));
symlinkSync(join(ROOT, "node_modules"), join(tmp, "node_modules"), "dir");
const TSX = join(ROOT, "node_modules", ".bin", "tsx");

const artifactTs = (a) =>
  `// mutant (scripts/mutate-contract.mjs)\nexport const escrowArtifact = ${JSON.stringify(a, null, 2)} as const;\n`;
function runTests(artifact) {
  writeFileSync(join(tmp, "server", "escrow", "artifact.ts"), artifactTs(artifact));
  const r = spawnSync(TSX, [TEST], { cwd: tmp, encoding: "utf8", env: { ...process.env, MOCK_AI: "1" }, timeout: 300_000 });
  const fails = [...(r.stdout ?? "").matchAll(/^not ok \d+ - (.+)$/gm)].map((m) => m[1]);
  return { ok: r.status === 0, fails };
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
    console.log(`Contract: contracts/LaunchDeskEscrow.cash · ${targets.length} require lines · tests: ${TEST}\n`);
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
