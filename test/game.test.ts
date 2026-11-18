// v8 game rules (web/proto/game/rules.ts + seen.ts): pure functions, no server, no DOM.
// Run: npx tsx test/game.test.ts
import assert from "node:assert/strict";
import { computeGame, floorRooms, officeRooms, type GameSnapshot } from "../web/proto/game/rules";
import { createSeen, levelUpsToPlay, SEEN_KEY, type KV } from "../web/proto/game/seen";

const TX = (c: string) => c.repeat(64);
const FROM = { marketing: 9, research: 20, money: 15, customers: 2 };
const base = (over: Partial<GameSnapshot> = {}): GameSnapshot => ({
  projectId: "abcd1234",
  sample: false,
  example: false,
  name: "Pausa",
  project: { paid: {}, status: null, roster: [], work: [], report: null, steers: [], steerLimit: 3 },
  proof: null,
  kit: null,
  offices: null,
  officeFrom: FROM,
  mine: [{ id: "abcd1234", reported: false }],
  ...over,
});
const proj = (p: Partial<NonNullable<GameSnapshot["project"]>>) => ({ ...base().project!, ...p });
const roster4 = ["demand", "competition", "pricing", "viability"];
const done = (ids: string[]) => ids.map((analyst) => ({ analyst, status: "done" as const }));
const badge = (g: ReturnType<typeof computeGame>, id: string) => g.badges.find((b) => b.id === id)!;

// ── lobby only: one room lit of 12, nothing earned, next = pay 10¢
{
  const g = computeGame(base());
  assert.equal(g.lit, 1);
  assert.equal(g.total, 12);
  assert.equal(g.stage, null);
  assert.equal(g.stageName, "Lobby");
  assert.ok(g.badges.every((b) => !b.earned), "no badge without its server field");
  assert.deepEqual([g.next.text, g.next.price], ["Check your idea", "10¢"]);
  assert.ok(floorRooms(g).filter((r) => r.id !== "lobby").every((r) => r.state === "locked"));
  assert.equal(g.inFlight, false);
}

// ── no badge without its server field: each one flips only with its own field
{
  const g = computeGame(base({ project: proj({ status: "done", roster: roster4, work: done(roster4) }) }));
  // a "done" status with no report and no payment: still nothing
  assert.equal(badge(g, "money-locked").earned, false);
  assert.equal(badge(g, "report-delivered").earned, false);
  assert.equal(g.stages[0]!.unlocked, false);
  const k = computeGame(base({ kit: { logo: "done", logoChosen: true, site: "done", siteUrl: "https://x/s/a", plan: "done", planDone: true } }));
  assert.equal(badge(k, "kit-paid").earned, false, "a kit payload is not a kit payment");
  assert.ok(floorRooms(k).filter((r) => ["nova", "dex", "launch"].includes(r.id)).every((r) => r.state === "locked"));
  const o = computeGame(base({ offices: { inbox: [{ office: "money", status: "working" }] } }));
  assert.equal(badge(o, "first-office-task").earned, false, "a running task is not a done task");
  assert.equal(o.stages[2]!.unlocked, false);
}

// ── paid research, running: research unlocked, rooms working, in flight, tx is a receipt
{
  const g = computeGame(
    base({
      project: proj({ paid: { validate: { txid: TX("a") } }, status: "analysing", roster: roster4, work: [{ analyst: "demand", status: "done" }, { analyst: "competition", status: "working" }] }),
    }),
  );
  assert.equal(g.stage, "research");
  assert.equal(g.inFlight, true);
  const fr = Object.fromEntries(floorRooms(g).map((r) => [r.id, r.state]));
  assert.equal(fr.r0, "done");
  assert.equal(fr.r1, "working");
  assert.equal(g.lit, 2);
  const m = badge(g, "money-locked");
  assert.equal(m.earned, true);
  assert.ok(m.proof?.href?.includes(TX("a")), "a payment badge links its tx");
  assert.equal(g.next.act, "wait");
}

// ── a dev/test payment never shows a tx link
{
  const g = computeGame(base({ project: proj({ paid: { validate: { txid: "dev-123" } } }) }));
  assert.equal(badge(g, "money-locked").earned, true);
  assert.equal(badge(g, "money-locked").proof?.href, undefined);
}

// ── escrow proof: funding + fingerprint from the proof, release tx linked
{
  const g = computeGame(
    base({
      project: proj({ paid: { validate: { txid: TX("a") } }, status: "done", roster: roster4, work: done(roster4), report: { score: 5.5, verdict: "pivot" } }),
      proof: { state: "released", fundingTxid: TX("b"), releaseTxid: TX("c"), reportHash: "8447cc7290ece01c91673ef4eb8137c9332581040af710030aa3c9195350ecd5" },
    }),
  );
  assert.equal(g.lit, 5);
  assert.equal(badge(g, "report-delivered").line, "Fingerprint on-chain: 8447…d5");
  assert.ok(badge(g, "report-delivered").proof?.href?.includes(TX("c")));
  assert.ok(badge(g, "money-locked").proof?.href?.includes(TX("b")));
  assert.deepEqual([g.next.text, g.next.price], ["Get your launch kit", "50¢"]);
  assert.equal(g.steersLeft, 3);
}

// ── No-go path: progress, not punishment
{
  const g = computeGame(base({ project: proj({ paid: { validate: { txid: "dev-1" } }, status: "done", roster: roster4, work: done(roster4), report: { score: 3.1, verdict: "no-go" } }) }));
  assert.equal(g.nogo, true);
  assert.equal(badge(g, "dodged-bad-idea").earned, true);
  assert.equal(g.badges.some((b) => b.id === "report-delivered"), false);
  assert.equal(g.badges.length, 8);
  assert.deepEqual([g.next.text, g.next.price, g.next.act], ["Try another idea", "10¢", "new"]);
  assert.equal(g.lit, 5, "a No-go still lights the research rooms that delivered");
}

// ── roster of 3: 11 rooms in total, r3 unused and not counted
{
  const r3 = ["demand", "competition", "pricing"];
  const g = computeGame(base({ project: proj({ paid: { validate: { txid: "dev-1" } }, status: "done", roster: r3, work: done(r3), report: { score: 6.2, verdict: "go" } }) }));
  assert.equal(g.total, 11);
  assert.equal(g.lit, 4);
  assert.equal(g.rooms.find((r) => r.id === "r3")!.counts, false);
  // a 5th analyst shares r3: 4 research rooms
  const r5 = [...roster4, "location"];
  const h = computeGame(base({ project: proj({ paid: { validate: { txid: "dev-1" } }, status: "analysing", roster: r5, work: [...done(roster4), { analyst: "location", status: "working" }] }) }));
  assert.equal(h.total, 12);
  assert.equal(h.rooms.find((r) => r.id === "r3")!.state, "working");
}

// ── CEO note with a real diff
{
  const g = computeGame(
    base({ project: proj({ paid: { validate: { txid: "dev-1" } }, status: "done", roster: roster4, work: done(roster4), report: { score: 5.8, verdict: "go" }, steers: [{ status: "done", before: 5.5, after: 5.8 }] }) }),
  );
  assert.equal(badge(g, "ceo-note").line, "You steered your team. 5.5 → 5.8");
  assert.equal(g.steersLeft, 2);
}

// ── kit: rooms light per real part; logo first, then site, then plan
{
  const p = proj({ paid: { validate: { txid: "dev-1" }, build: { txid: TX("d") } }, status: "done", roster: roster4, work: done(roster4), report: { score: 7, verdict: "go" } });
  const a = computeGame(base({ project: p, kit: { logo: "done", logoChosen: false, site: "working", siteUrl: null, plan: "queued", planDone: false } }));
  assert.equal(a.stage, "studio");
  assert.equal(a.next.text, "Pick your logo");
  assert.equal(badge(a, "kit-paid").earned, true);
  assert.equal(badge(a, "site-live").earned, false);
  assert.equal(a.inFlight, true);
  const b = computeGame(base({ project: p, kit: { logo: "done", logoChosen: true, site: "done", siteUrl: "https://ld/s/pausa", plan: "done", planDone: true } }));
  assert.equal(b.lit, 8);
  assert.equal(badge(b, "site-live").proof?.href, "https://ld/s/pausa");
  assert.deepEqual([b.next.text, b.next.price], ["Run your first office task", "from 2¢"]);
  // offices
  const c = computeGame(base({ project: p, kit: { logo: "done", logoChosen: true, site: "done", siteUrl: "https://ld/s/pausa", plan: "done", planDone: true }, offices: { inbox: [{ office: "money", status: "done", txid: "test-1", test: true }] } }));
  assert.equal(c.stage, "offices");
  assert.equal(c.lit, 9);
  assert.equal(badge(c, "first-office-task").proof?.label, "Test run · nothing charged");
  assert.deepEqual([c.next.text, c.next.price], ["Give the Marketing office a task", "from 9¢"]);
  assert.deepEqual(officeRooms(c, base({ offices: { inbox: [{ office: "money", status: "done" }] } })).find((r) => r.id === "money"), { id: "money", state: "done", results: 1 });
}

// ── second idea opens the campus (only reported ideas of this browser count)
{
  const g = computeGame(base({ mine: [{ id: "a", reported: true }, { id: "b", reported: false }] }));
  assert.equal(g.stages[3]!.unlocked, false);
  const h = computeGame(base({ mine: [{ id: "a", reported: true }, { id: "b", reported: true }] }));
  assert.equal(h.stages[3]!.unlocked, true);
  assert.equal(badge(h, "second-idea").earned, true);
}

// ── level-ups: once per project per stage; a reload replays none; samples persist nothing
{
  const mem = new Map<string, string>();
  const kv: KV = { getItem: (k) => mem.get(k) ?? null, setItem: (k, v) => void mem.set(k, v) };
  const lobby = computeGame(base());
  const paid = computeGame(base({ project: proj({ paid: { validate: { txid: "dev-1" } }, status: "planning" }) }));
  const seen = createSeen(kv);
  assert.deepEqual(levelUpsToPlay(null, lobby, seen, { tour: false }), []);
  assert.deepEqual(levelUpsToPlay(lobby, paid, seen, { tour: false }), ["research"]);
  assert.deepEqual(levelUpsToPlay(lobby, paid, seen, { tour: false }), [], "never twice");
  // reload: a fresh page, first look at an already paid project replays nothing
  const seen2 = createSeen(kv);
  assert.deepEqual(levelUpsToPlay(null, paid, seen2, { tour: false }), []);
  assert.deepEqual(levelUpsToPlay(lobby, paid, seen2, { tour: false }), []);
  // first look at a project in another browser marks its stages seen silently
  const mem3 = new Map<string, string>();
  const seen3 = createSeen({ getItem: (k) => mem3.get(k) ?? null, setItem: (k, v) => void mem3.set(k, v) });
  assert.deepEqual(levelUpsToPlay(null, paid, seen3, { tour: false }), []);
  assert.ok(JSON.parse(mem3.get(SEEN_KEY)!).includes("abcd1234:research"));

  // sample: nothing fires outside the tour, nothing is ever written
  const smem = new Map<string, string>();
  const sseen = createSeen({ getItem: (k) => smem.get(k) ?? null, setItem: (k, v) => void smem.set(k, v) });
  const sLobby = computeGame(base({ sample: true, projectId: "pausa" }));
  const sPaid = computeGame(base({ sample: true, projectId: "pausa", project: proj({ paid: { validate: { txid: "sample" } }, status: "planning" }) }));
  assert.deepEqual(levelUpsToPlay(sLobby, sPaid, sseen, { tour: false }), []);
  assert.deepEqual(levelUpsToPlay(sLobby, sPaid, sseen, { tour: true }), ["research"]);
  assert.equal(smem.size, 0, "sample persists nothing");
  assert.equal(sPaid.inFlight, false, "a sample never polls");
  // examples never fire and never poll
  const ex = computeGame(base({ example: true, projectId: "ex-coffee-bcn", project: proj({ paid: { validate: { txid: "dev-1" } }, status: "planning" }) }));
  assert.deepEqual(levelUpsToPlay(lobby, ex, seen, { tour: true }), []);
  assert.equal(ex.inFlight, false);
}

console.log("game.test.ts: ok");
