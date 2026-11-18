// v8 game store (PLAN.md 7 WP-C). Listens to the flow (`ld:step` + onChange), reads what the server already serves
// (project, escrow proof, kit, offices view, this browser's project list), runs game/rules.ts and is the SINGLE caller
// of world.setRooms / setOffices / setCampus / unlockWing / levelUp. It polls every 4 s only while something is in
// flight. Samples (tour, practice runs) are computed from the flow's own sample data and never fetch or persist.
import { FLOW_STEPS_V7, STEER_LIMIT, type FlowStepV7, type ProjectV7, type WorldV7 } from "../contracts";
import type { ProtoFlowV7 } from "../flow";
import type { WorldV8 } from "../world/api-v8";
import type { InboxItem, OfficesView } from "../../../server/offices/types";
import type { Kit } from "../../../server/kit-contract";
import type { Project } from "../../src/types";
import { api } from "../../src/api";
import { projects as saved, shortTitle } from "../../src/app/projects";
import { computeGame, floorRooms, newlyEarned, officeRooms, OFFICE_IDS, type Badge, type GameSnapshot, type GameState } from "./rules";
import { createSeen, levelUpsToPlay } from "./seen";
import { STEP_EVENT, type OfficeId, type Stage, type StepDetail } from "./types";

type World = WorldV7 & WorldV8;
type KitPayload = { kit: Kit | null; slug: string | null; siteUrl: string | null; running: boolean };
type Proof = NonNullable<GameSnapshot["proof"]>;
export type ExampleCard = { id: string; title: string; verdict: { score: number; verdict: "go" | "pivot" | "no-go" } | null };

const POLL_MS = 4000;
/** Cheapest task per office (server/offices/catalog.ts prices, quoted before every run). Replaced by the live catalog
 *  as soon as an offices view arrives. */
const FROM_FALLBACK: Record<OfficeId, number> = { marketing: 9, research: 20, money: 15, customers: 2 };
const ESCROW = (import.meta as unknown as { env?: Record<string, string | undefined> }).env?.VITE_ESCROW === "1";
/** Steps where the home owns the world (WP-A's showcase): the game draws nothing there. */
const HOME_STEPS: readonly FlowStepV7[] = ["bedroom", "idea"];
const isExampleId = (id: string) => /^ex-/.test(id);
const at = (s: FlowStepV7) => FLOW_STEPS_V7.indexOf(s);
const STAGE_BADGES: readonly string[] = ["money-locked", "kit-paid", "second-idea"];

export interface GameEvents {
  /** A stage unlocked while watching (not seen before): play the level-up moment. */
  levelUp?(stage: Stage, g: GameState): void;
  /** A non-stage badge was earned while watching: a small HUD toast. */
  badge?(b: Badge, g: GameState): void;
  /** A task result landed in an office: light its room. */
  officeDone?(office: OfficeId, g: GameState): void;
}

export interface GameStore {
  readonly state: GameState | null;
  readonly snapshot: GameSnapshot | null;
  readonly step: FlowStepV7;
  /** The HUD is visible (a project is on screen and the home is not). */
  readonly visible: boolean;
  /** The latest offices view of the current project (null = offices never opened). */
  readonly offices: OfficesView | null;
  /** The server runs sample AI data (MOCK_AI): real runs there are practice runs, the HUD says so. */
  readonly mockServer: boolean;
  /** The real finished examples (GET /api/examples), for the switcher and the campus. */
  readonly examples: ReadonlyArray<ExampleCard>;
  subscribe(cb: (g: GameState | null) => void): () => void;
  on(e: GameEvents): () => void;
  /** ui/offices.ts pushes every view it receives (poll, task paid, task done). */
  pushOffices(v: OfficesView): void;
  /** Fetch again now (after a payment, on return to the tab). */
  refresh(): void;
  /** Marks a stage moment as shown (the offices card plays when the floor is first opened, not on a data change). */
  markSeen(stage: Stage): boolean;
  dispose(): void;
}

export function createGameStore(world: World, flow: ProtoFlowV7): GameStore {
  const seen = createSeen(safeStorage());
  const subs = new Set<(g: GameState | null) => void>();
  const evs = new Set<GameEvents>();
  let step: FlowStepV7 = flow.state.step;
  let projectId = flow.state.projectId;
  let sample = flow.demo || !flow.live;
  let state: GameState | null = null;
  let snap: GameSnapshot | null = null;
  let prev: GameState | null = null;
  // server answers for the current project
  let server: Project | null = null;
  let kit: KitPayload | null = null;
  let proof: Proof | null = null;
  let offices: OfficesView | null = null;
  let examples: ExampleCard[] = [];
  let mockServer = false;
  let loadedFor: string | null = null;
  let timer = 0;
  let seq = 0;
  let disposed = false;
  let sent = { rooms: "", offices: "", campus: "", wings: "" };

  const visible = () => !!state && !HOME_STEPS.includes(step);

  // ── snapshots
  function mineList(): GameSnapshot["mine"] {
    return saved
      .list()
      .filter((r) => !isExampleId(r.id))
      .map((r) => ({ id: r.id, reported: r.score != null || r.stage === "validated" || r.stage === "building" || r.stage === "live" }));
  }
  function officeFrom(): Record<OfficeId, number> {
    if (!offices) return FROM_FALLBACK;
    const out = { ...FROM_FALLBACK };
    for (const o of offices.offices) if (o.tasks.length) out[o.id] = Math.min(...o.tasks.map((t) => t.cents));
    return out;
  }
  function sampleSnapshot(): GameSnapshot {
    const p = flow.project;
    const r = flow.report;
    const roster = flow.roster.map((a) => a.id);
    const reported = at(step) >= at("report") && !!r;
    // evidence: an analyst's room is done once all its findings were shown
    const work = roster.map((a) => {
      const idx = flow.findings.map((f, i) => (f.analyst === a ? i : -1)).filter((i) => i >= 0);
      const shown = idx.length > 0 && idx.every((i) => i < flow.revealed);
      return { analyst: a, status: (reported || shown ? "done" : "working") as "done" | "working" };
    });
    const built = at(step) >= at("build");
    const builder = flow.state.builder;
    const bi = builder ? ["nova", "dex", "rae", "pip"].indexOf(builder) : -1;
    const partDone = (i: number) => at(step) >= at("live") || (step === "build" && (bi > i || (bi === i && flow.state.phase === "result")));
    return {
      projectId: p.id,
      sample: true,
      example: false,
      name: p.sign.kind === "brand" ? p.sign.name : p.title,
      project: {
        paid: at(step) >= at("hire") ? { validate: { txid: "sample" }, ...(built ? { build: { txid: "sample" } } : {}) } : {},
        status: reported ? "done" : at(step) >= at("hire") ? "analysing" : null,
        roster: at(step) >= at("hire") ? roster.slice(0, Math.max(flow.hired, reported ? roster.length : 0)) : [],
        work,
        report: reported && r ? { score: r.score, verdict: r.verdict } : null,
        steers: flow.steers.map((x) => ({ status: x.status, ...scoreDiff(x) })),
        steerLimit: STEER_LIMIT,
      },
      proof: null,
      kit: built ? { logo: partDone(0) ? "done" : "working", logoChosen: partDone(0), site: partDone(1) ? "done" : "queued", siteUrl: partDone(1) ? "sample" : null, plan: partDone(3) ? "done" : "queued", planDone: partDone(3) } : null,
      offices: null,
      officeFrom: FROM_FALLBACK,
      mine: [],
    };
  }
  function realSnapshot(): GameSnapshot | null {
    // nothing until the first full fetch (project + kit + proof + offices) of this project landed: the first look must
    // see everything at once, or a part arriving late would look like news (a toast replayed on reload)
    if (loadedFor !== projectId) return null;
    // the flow's live run is fresher than our own fetch while it polls
    const lp = flow.live && flow.live.id === projectId ? flow.live.server : null;
    const p = lp ?? server;
    if (!p || p.id !== projectId) return null;
    const v7 = (p.results as unknown as { v7?: ProjectV7["v7"] & { status?: NonNullable<GameSnapshot["project"]>["status"] } }).v7;
    const status = v7?.status;
    const k = kit?.kit ?? null;
    const brand = k?.brand.name?.trim();
    const row = saved.get(projectId);
    return {
      projectId,
      sample: false,
      example: !!p.example || isExampleId(projectId),
      name: brand || row?.title || shortTitle(p.idea) || "Your idea",
      project: {
        paid: { validate: p.payments.validate ? { txid: p.payments.validate.txid } : null, build: p.payments.build ? { txid: p.payments.build.txid } : null },
        status: status ?? null,
        roster: v7?.roster?.map((a) => a.id) ?? [],
        work: (v7?.work ?? []).map((w) => ({ analyst: w.analyst, status: w.status })),
        report: status === "done" && v7?.report ? { score: v7.report.score, verdict: v7.report.verdict } : null,
        steers: (v7?.steers ?? []).map((x) => ({ status: x.status, ...scoreDiff(x) })),
        steerLimit: STEER_LIMIT,
      },
      proof,
      kit: kit?.kit
        ? {
            logo: k?.status.logo ?? null,
            logoChosen: !!k?.logo?.chosen,
            site: k?.status.site ?? null,
            siteUrl: kit.siteUrl,
            plan: k?.status.marketing ?? null,
            planDone: !!k?.marketing?.plan,
          }
        : null,
      offices: offices && offices.projectId === projectId ? { inbox: offices.inbox.map(inboxRow) } : null,
      officeFrom: officeFrom(),
      mine: mineList(),
    };
  }

  // ── compute + paint the world
  function recompute() {
    if (disposed) return;
    const s = sample ? sampleSnapshot() : realSnapshot();
    snap = s;
    const g = s ? computeGame(s) : null;
    const before = state;
    state = g;
    if (g && s) paintWorld(g, s);
    if (g && s && before && before.projectId === g.projectId) {
      for (const st of levelUpsToPlay(prev, g, seen, { tour: flow.demo })) evs.forEach((e) => e.levelUp?.(st, g));
      // stage badges (money locked, kit paid, second idea) come with their level-up card; the others get a toast
      for (const b of newlyEarned(prev, g)) if (!STAGE_BADGES.includes(b.id)) evs.forEach((e) => e.badge?.(b, g));
      for (const o of OFFICE_IDS) if (officeResults(s, o) > officeResults(snapPrev, o)) evs.forEach((e) => e.officeDone?.(o, g));
    } else if (g) levelUpsToPlay(null, g, seen, { tour: flow.demo }); // first look: mark what is already open, play nothing
    prev = g;
    snapPrev = s;
    subs.forEach((cb) => cb(g));
    schedule();
  }
  let snapPrev: GameSnapshot | null = null;
  const officeResults = (s: GameSnapshot | null, o: OfficeId) => s?.offices?.inbox.filter((i) => i.office === o && i.status === "done").length ?? 0;

  function paintWorld(g: GameState, s: GameSnapshot) {
    if (HOME_STEPS.includes(step)) return; // the home hero owns the world there
    const rooms = JSON.stringify(floorRooms(g));
    if (rooms !== sent.rooms) {
      sent.rooms = rooms;
      // wings already open when we first look at the project open without a show (no replay on reload)
      const wings = `${g.projectId}:${g.stages[0]!.unlocked}:${g.stages[1]!.unlocked}`;
      if (wings !== sent.wings) {
        const first = !sent.wings.startsWith(`${g.projectId}:`);
        sent.wings = wings;
        if (first) {
          if (g.stages[0]!.unlocked) void world.unlockWing("research", { animate: false });
          if (g.stages[1]!.unlocked) void world.unlockWing("studio", { animate: false });
        }
      }
      world.setRooms(floorRooms(g));
    }
    const off = JSON.stringify([officeRooms(g, s), g.sample]);
    if (off !== sent.offices) {
      sent.offices = off;
      world.setOffices(officeRooms(g, s), { sample: g.sample });
    }
    const camp = campusItems(g);
    const cj = JSON.stringify(camp);
    if (cj !== sent.campus) {
      sent.campus = cj;
      world.setCampus(camp);
    }
  }

  /** Campus: this browser's own ideas (a mini stack at their real stage), then the real finished examples (labelled by
   *  their `ex-` id). Empty plots are the world's dashed "Your next idea". */
  function campusItems(g: GameState): Parameters<WorldV8["setCampus"]>[0] {
    if (g.sample) return [];
    const own = saved
      .list()
      .filter((r) => !isExampleId(r.id))
      .slice(0, 4)
      .map((r) => {
        const cur = r.id === g.projectId;
        const stage = (cur ? (g.stages[2]!.unlocked ? 3 : g.stages[1]!.unlocked ? 2 : g.stages[0]!.unlocked ? 1 : 0) : r.stage === "live" || r.stage === "building" ? 2 : r.stage === "new" ? 0 : 1) as 0 | 1 | 2 | 3;
        return { id: r.id, name: cur ? g.name : r.title, ...(r.score != null ? { score: r.score } : {}), ...(r.verdict ? { verdict: r.verdict } : {}), stage, nogo: r.verdict === "no-go" };
      });
    const ex = examples.slice(0, Math.max(0, 5 - own.length)).map((x) => ({
      id: x.id,
      name: x.title,
      ...(x.verdict ? { score: x.verdict.score, verdict: x.verdict.verdict } : {}),
      stage: 2 as const,
      nogo: x.verdict?.verdict === "no-go",
    }));
    return [...own, ...ex];
  }

  // ── fetching (real projects only)
  async function fetchAll() {
    if (sample || disposed) return recompute();
    const id = projectId;
    const my = ++seq;
    const ex = isExampleId(id);
    const [p, k, pr] = await Promise.all([
      flow.live && flow.live.id === id && flow.live.server ? Promise.resolve(flow.live.server) : api.get(id).catch(() => null),
      getJson<KitPayload>(`/api/projects/${encodeURIComponent(id)}/kit`),
      ex ? getJson<Proof>(`/api/examples/${encodeURIComponent(id)}/proof`) : ESCROW ? getJson<Proof>(`/api/escrow/${encodeURIComponent(id)}/validate`, saved.ownerKey(id)) : Promise.resolve(null),
    ]);
    if (my !== seq || id !== projectId) return;
    server = p;
    kit = k;
    proof = pr ? { state: pr.state, fundingTxid: pr.fundingTxid ?? null, releaseTxid: pr.releaseTxid ?? null, reportHash: pr.reportHash ?? null } : null;
    // offices: the view of this project, once it can have one (report ready + kit paid, owner key in this browser)
    const key = saved.ownerKey(id);
    if (!ex && key && p?.payments.build && (!offices || offices.projectId !== id)) {
      const v = await postJson<{ view: OfficesView }>("/api/offices/from-project", { projectId: id }, key);
      if (my !== seq) return;
      if (v?.view) offices = v.view;
    } else if (offices && offices.projectId === id && offices.inbox.some((i) => i.status === "working")) {
      const v = await getJson<OfficesView>(`/api/offices/${encodeURIComponent(offices.id)}`, key);
      if (my !== seq) return;
      if (v) offices = v;
    }
    loadedFor = id;
    if (!examples.length) {
      const [e, c] = await Promise.all([getJson<{ examples: ExampleCard[] }>("/api/examples"), getJson<{ mockAi?: boolean }>("/api/config")]);
      examples = e?.examples ?? [];
      mockServer = !!c?.mockAi;
    }
    recompute();
  }
  function schedule() {
    if (timer) clearTimeout(timer);
    timer = 0;
    if (disposed || sample || !state?.inFlight || document.hidden) return;
    timer = window.setTimeout(() => void fetchAll(), POLL_MS);
  }

  // ── wiring
  const onStep = (e: CustomEvent<StepDetail>) => {
    const d = e.detail;
    const switched = d.projectId !== projectId;
    step = d.step;
    projectId = d.projectId;
    // the tour and the practice worlds are samples; a real run attached to the flow (and a finished example) is not
    sample = flow.demo || (!isExampleId(d.projectId) && !(flow.live && flow.live.id === d.projectId));
    if (switched) {
      loadedFor = null;
      server = null;
      kit = null;
      proof = null;
      if (offices && offices.projectId !== projectId) offices = null;
      prev = null;
      snapPrev = null;
      sent = { rooms: "", offices: "", campus: "", wings: "" };
    }
    void fetchAll();
  };
  addEventListener(STEP_EVENT, onStep);
  // live runs and the tour change inside a step (findings land, builders finish): recompute from what we have
  let raf = 0;
  const offFlow = flow.onChange(() => {
    if (raf) return;
    raf = requestAnimationFrame(() => {
      raf = 0;
      recompute();
    });
  });
  const onVis = () => !document.hidden && state?.inFlight && void fetchAll();
  document.addEventListener("visibilitychange", onVis);
  const offSaved = saved.onChange(() => recompute());
  // first paint: the flow may already be on a step (deep link) before the HUD mounted
  queueMicrotask(() => void fetchAll());

  return {
    get state() { return state; },
    get snapshot() { return snap; },
    get step() { return step; },
    get visible() { return visible(); },
    get offices() { return offices; },
    get examples() { return examples; },
    get mockServer() { return mockServer; },
    subscribe(cb) {
      subs.add(cb);
      cb(state);
      return () => subs.delete(cb);
    },
    on(e) {
      evs.add(e);
      return () => evs.delete(e);
    },
    pushOffices(v) {
      if (v.projectId !== projectId) return;
      offices = v;
      recompute();
    },
    refresh: () => void fetchAll(),
    markSeen(stage) {
      if (!state || state.example || (state.sample && !flow.demo)) return false;
      if (seen.has(state.projectId, stage)) return false;
      seen.add(state.projectId, stage, !state.sample);
      return true;
    },
    dispose() {
      disposed = true;
      if (timer) clearTimeout(timer);
      if (raf) cancelAnimationFrame(raf);
      removeEventListener(STEP_EVENT, onStep);
      document.removeEventListener("visibilitychange", onVis);
      offFlow();
      offSaved();
      subs.clear();
      evs.clear();
    },
  };
}

function scoreDiff(x: { changes?: Array<{ what: string; before: string | number | null; after: string | number | null }> }): { before?: number | null; after?: number | null } {
  const c = x.changes?.find((ch) => ch.what === "score");
  if (!c) return {};
  const n = (v: string | number | null) => (v == null ? null : Number(v));
  return { before: n(c.before), after: n(c.after) };
}
const inboxRow = (i: InboxItem) => ({ office: i.office, status: i.status, txid: i.paid?.txid ?? null, test: !!i.paid?.test });

async function getJson<T>(url: string, key?: string | null): Promise<T | null> {
  try {
    const r = await fetch(url, { cache: "no-store", headers: key ? { "x-owner-key": key } : {} });
    return r.ok ? ((await r.json()) as T) : null;
  } catch {
    return null;
  }
}
async function postJson<T>(url: string, body: unknown, key: string): Promise<T | null> {
  try {
    const r = await fetch(url, { method: "POST", headers: { "content-type": "application/json", "x-owner-key": key }, body: JSON.stringify(body) });
    return r.ok ? ((await r.json()) as T) : null;
  } catch {
    return null;
  }
}
function safeStorage() {
  try {
    const s = window.localStorage;
    s.getItem("x");
    return s;
  } catch {
    return null;
  }
}
