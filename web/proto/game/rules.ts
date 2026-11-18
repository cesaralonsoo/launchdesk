// v8 game rules (PLAN.md 5). Pure: no DOM, no fetch, no storage. `computeGame(snapshot)` turns what the server already
// told the client (project, escrow proof, kit, offices view, this browser's project list) into rooms lit, the stage,
// the 8 badges and the one "Next:" action. A field that is missing means "not yet": nothing is ever guessed.
// localStorage never feeds this file; it only remembers which level-up moments were already shown (game/levelup.ts).
import type { FloorRoomId, Milestone, OfficeId, RoomId, Stage } from "./types";

export type Verdict = "go" | "pivot" | "no-go";
export type JobStatus = "queued" | "working" | "done" | "error";

/** Everything the rules may look at. Built by game/store.ts from server answers (or from the tour's sample data). */
export interface GameSnapshot {
  projectId: string;
  /** Tour / practice run: shown with a `Sample` tag, nothing persisted, no level-up saved. */
  sample: boolean;
  /** A read-only finished example (ex-*): shown, never counted as the visitor's own. */
  example: boolean;
  /** Company name for the HUD (brand once the kit names it, else the idea's short title). */
  name: string;
  project: null | {
    /** payments.validate / payments.build as the server stored them (txid "dev-…"/"test-…" = no money moved). */
    paid: { validate?: { txid: string } | null; build?: { txid: string } | null };
    /** results.v7.status (null before the research starts). */
    status: "planning" | "researching" | "analysing" | "judging" | "done" | "error" | null;
    /** Analyst ids in roster order (room r0..r3 = roster index; a 5th analyst shares r3). */
    roster: string[];
    work: Array<{ analyst: string; status: JobStatus }>;
    /** Only once the report is delivered (status done). */
    report: { score: number; verdict: Verdict } | null;
    /** CEO notes: one row per steer; `before`/`after` = the score change the server reported, if any. */
    steers: Array<{ status: "working" | "done" | "error"; before?: number | null; after?: number | null }>;
    steerLimit: number;
  };
  /** Escrow proof of the 10¢ (GET /api/escrow/:id/validate or the example's snapshot). null = none (non-escrow build). */
  proof: null | { state: "quoted" | "funded" | "released" | "refunded"; fundingTxid?: string | null; releaseTxid?: string | null; reportHash?: string | null };
  /** GET /api/projects/:id/kit (null = no kit). */
  kit: null | {
    logo: JobStatus | null;
    logoChosen: boolean;
    site: JobStatus | null;
    siteUrl: string | null;
    plan: JobStatus | null;
    planDone: boolean;
  };
  /** GET /api/offices/:sid (null = offices never opened). */
  offices: null | { inbox: Array<{ office: OfficeId; status: "quoted" | "working" | "done" | "error"; txid?: string | null; test?: boolean }> };
  /** The cheapest task of each office, in cents (from the catalog the server serves). */
  officeFrom: Record<OfficeId, number>;
  /** This browser's own projects (examples and samples excluded). `reported` = its report was delivered. */
  mine: Array<{ id: string; reported: boolean }>;
}

export type RoomGameState = "locked" | "idle" | "working" | "done";
export interface RoomInfo {
  id: RoomId;
  state: RoomGameState;
  /** Counts in rooms lit N/total (an unused research room, roster < 4, does not). */
  counts: boolean;
}
export interface Badge {
  id: Milestone;
  name: string;
  earned: boolean;
  /** The line shown once earned (or the unlock rule while not). */
  line: string;
  proof?: { label: string; href?: string };
}
export type NextAct = "pay1" | "wait" | "kit" | "logo" | "offices" | "new" | "campus" | null;
export interface NextStep {
  text: string;
  price: string;
  act: NextAct;
  /** For act "offices": which office the step points at. */
  office?: OfficeId;
}
export interface StageInfo {
  id: Stage;
  name: string;
  unlocked: boolean;
  lit: number;
  total: number;
  /** The exact rule, for the drawer. */
  rule: string;
}
export interface GameState {
  projectId: string;
  sample: boolean;
  example: boolean;
  name: string;
  /** Highest stage reached (null = lobby only). */
  stage: Stage | null;
  stageName: string;
  stages: StageInfo[];
  rooms: RoomInfo[];
  lit: number;
  total: number;
  badges: Badge[];
  next: NextStep;
  nogo: boolean;
  steersLeft: number | null;
  /** Something is running on the server: the store keeps polling. */
  inFlight: boolean;
}

export const STAGES: readonly Stage[] = ["research", "studio", "offices", "campus"];
export const STAGE_NAME: Record<Stage, string> = { research: "Research", studio: "Launch kit", offices: "Offices", campus: "Campus" };
export const STAGE_RULE: Record<Stage, string> = {
  research: "Opens when your 10¢ is locked on Bitcoin Cash",
  studio: "Opens when the 50¢ kit is paid",
  offices: "Opens when your first office task is done",
  campus: "Opens when a second idea gets its report",
};
export const OFFICE_IDS: readonly OfficeId[] = ["marketing", "research", "money", "customers"];
export const OFFICE_NAME: Record<OfficeId, string> = { marketing: "Marketing", research: "Research", money: "Money", customers: "Customers" };
export const VERDICT_LABEL: Record<Verdict, string> = { go: "Go", pivot: "Test first", "no-go": "No-go" };
const RESEARCH_ROOMS = ["r0", "r1", "r2", "r3"] as const;
const STUDIO_ROOMS = ["nova", "dex", "launch"] as const;

/** A txid that is a real Bitcoin Cash transaction (dev-/test- ids from local runs move no money). */
export const isRealTxid = (t: string | null | undefined): t is string => !!t && /^[0-9a-f]{64}$/i.test(t);
export const explorerTx = (txid: string) => `https://blockchair.com/bitcoin-cash/transaction/${encodeURIComponent(txid)}`;
export const shortHash = (h: string) => `${h.slice(0, 4)}…${h.slice(-2)}`;
export const centsLabel = (c: number) => (c >= 100 ? `$${(c / 100).toFixed(2)}` : `${c}¢`);
const one = (n: number) => (Math.round(n * 10) / 10).toFixed(1);

function txProof(txid: string | null | undefined, label: string): Badge["proof"] {
  return isRealTxid(txid) ? { label, href: explorerTx(txid) } : undefined;
}
/** A payment badge's line: the real one, or the honest practice line when no money moved (dev-/test- ids). */
const paidLine = (txid: string | null | undefined, real: string) => (isRealTxid(txid) ? real : "Practice run: no money moved.");

/** The research rooms in use: one per analyst in roster order (max 4). Before the team is picked: all 4. */
function researchRooms(s: GameSnapshot): Array<{ id: (typeof RESEARCH_ROOMS)[number]; analysts: string[] }> {
  const roster = s.project?.roster ?? [];
  if (!roster.length) return RESEARCH_ROOMS.map((id) => ({ id, analysts: [] }));
  const n = Math.min(4, roster.length);
  return RESEARCH_ROOMS.slice(0, n).map((id, i) => ({ id, analysts: i === 3 ? roster.slice(3) : [roster[i]!] }));
}

export function computeGame(s: GameSnapshot): GameState {
  const p = s.project;
  const exists = !!p || s.example;
  const paid1 = !!(p?.paid.validate?.txid || s.proof?.fundingTxid || (s.proof && s.proof.state !== "quoted"));
  const report = p?.status === "done" ? p.report : null;
  const nogo = report?.verdict === "no-go";
  const paid2 = !!p?.paid.build?.txid;
  const inbox = s.offices?.inbox ?? [];
  const doneOffices = new Set(inbox.filter((i) => i.status === "done").map((i) => i.office));
  const workingOffices = new Set(inbox.filter((i) => i.status === "working").map((i) => i.office));
  const reportedMine = s.mine.filter((m) => m.reported).length;

  // ── rooms
  const rooms: RoomInfo[] = [{ id: "lobby", state: exists ? "done" : "idle", counts: true }];
  const used = researchRooms(s);
  for (const id of RESEARCH_ROOMS) {
    const r = used.find((u) => u.id === id);
    if (!r) {
      rooms.push({ id, state: paid1 ? "idle" : "locked", counts: false });
      continue;
    }
    let state: RoomGameState = paid1 ? "idle" : "locked";
    if (paid1 && r.analysts.length) {
      const st = r.analysts.map((a) => p?.work.find((w) => w.analyst === a)?.status ?? "queued");
      if (st.every((x) => x === "done")) state = "done";
      else if (st.some((x) => x === "working" || x === "queued") && p?.status !== "done" && p?.status !== "error") state = "working";
    }
    // a delivered report means every block was delivered, even if a work row is missing from an older payload
    if (report && paid1 && r.analysts.length) state = "done";
    rooms.push({ id, state, counts: true });
  }
  const k = s.kit;
  const studioPart: Record<(typeof STUDIO_ROOMS)[number], { done: boolean; job: JobStatus | null }> = {
    nova: { done: !!k && k.logo === "done" && k.logoChosen, job: k?.logo ?? null },
    dex: { done: !!k && k.site === "done" && !!k.siteUrl, job: k?.site ?? null },
    launch: { done: !!k && k.plan === "done" && k.planDone, job: k?.plan ?? null },
  };
  for (const id of STUDIO_ROOMS) {
    const part = studioPart[id];
    const state: RoomGameState = !paid2 ? "locked" : part.done ? "done" : part.job === "working" || part.job === "queued" ? "working" : "idle";
    rooms.push({ id, state, counts: true });
  }
  for (const o of OFFICE_IDS) {
    const state: RoomGameState = doneOffices.has(o) ? "done" : workingOffices.has(o) ? "working" : "locked";
    rooms.push({ id: `office:${o}`, state, counts: true });
  }
  const counted = rooms.filter((r) => r.counts);
  const lit = counted.filter((r) => r.state === "done").length;
  const total = counted.length;

  // ── stages (each unlocked only by its one real event)
  const unlocked: Record<Stage, boolean> = {
    research: paid1,
    studio: paid2,
    offices: doneOffices.size > 0,
    campus: reportedMine >= 2,
  };
  const roomsOf = (st: Stage): RoomInfo[] =>
    st === "research"
      ? counted.filter((r) => (RESEARCH_ROOMS as readonly string[]).includes(r.id))
      : st === "studio"
        ? counted.filter((r) => (STUDIO_ROOMS as readonly string[]).includes(r.id))
        : st === "offices"
          ? counted.filter((r) => r.id.startsWith("office:"))
          : [];
  const stages: StageInfo[] = STAGES.map((id) => {
    const rs = roomsOf(id);
    return id === "campus"
      ? { id, name: STAGE_NAME[id], unlocked: unlocked.campus, lit: unlocked.campus ? 1 : 0, total: 1, rule: STAGE_RULE[id] }
      : { id, name: STAGE_NAME[id], unlocked: unlocked[id], lit: rs.filter((r) => r.state === "done").length, total: rs.length, rule: STAGE_RULE[id] };
  });
  // the company's own stage (campus belongs to the browser, not to one company: it shows on the track and in the drawer)
  const stage = [...STAGES].reverse().find((x) => x !== "campus" && unlocked[x]) ?? null;

  // ── badges (each one only from its server field)
  const fundingTxid = s.proof?.fundingTxid ?? p?.paid.validate?.txid ?? null;
  const steersDone = (p?.steers ?? []).filter((x) => x.status === "done");
  const diff = [...steersDone].reverse().find((x) => x.before != null && x.after != null && x.before !== x.after);
  const firstTask = inbox.find((i) => i.status === "done");
  const badges: Badge[] = [
    {
      id: "money-locked",
      name: "Money locked",
      earned: paid1,
      line: paid1 ? paidLine(fundingTxid, s.proof?.fundingTxid ? "10¢ in a Bitcoin Cash contract." : "10¢ paid on Bitcoin Cash.") : "Lock 10¢ on Bitcoin Cash to start the research.",
      proof: txProof(fundingTxid, "Funding tx"),
    },
    nogo
      ? {
          id: "dodged-bad-idea",
          name: "Dodged a bad idea",
          earned: true,
          line: "An honest No-go. Cheaper than finding out later.",
          proof: txProof(s.proof?.releaseTxid, "Release tx"),
        }
      : {
          id: "report-delivered",
          name: "Report delivered",
          earned: !!report,
          line: report ? (s.proof?.reportHash ? `Fingerprint on-chain: ${shortHash(s.proof.reportHash)}` : "Your report is in.") : "Your report arrives about 2 minutes after the 10¢.",
          proof: report ? txProof(s.proof?.releaseTxid, "Release tx") : undefined,
        },
    {
      id: "ceo-note",
      name: "CEO note",
      earned: steersDone.length > 0,
      line: steersDone.length ? `You steered your team.${diff ? ` ${one(diff.before!)} → ${one(diff.after!)}` : ""}` : "Send your team a note after the report. Free.",
    },
    {
      id: "kit-paid",
      name: "Kit paid",
      earned: paid2,
      line: paid2 ? (isRealTxid(p?.paid.build?.txid) ? "The studio is yours." : "The studio is yours. Practice run: no money moved.") : "Get the launch kit for 50¢.",
      proof: txProof(p?.paid.build?.txid, "Kit tx"),
    },
    {
      id: "site-live",
      name: "Site live",
      earned: studioPart.dex.done,
      line: studioPart.dex.done ? "Your site is online." : "Comes with the launch kit.",
      proof: studioPart.dex.done && k?.siteUrl ? { label: "Open site", href: k.siteUrl } : undefined,
    },
    {
      id: "first-office-task",
      name: "First office task",
      earned: !!firstTask,
      line: firstTask ? "Your offices did their first job." : "Run any office task, from 2¢.",
      proof: firstTask ? (firstTask.test ? { label: "Test run · nothing charged" } : txProof(firstTask.txid, "Task tx")) : undefined,
    },
    {
      id: "all-offices",
      name: "All four offices",
      earned: doneOffices.size === 4,
      line: doneOffices.size === 4 ? "Marketing, Research, Money, Customers: all working for you." : `${doneOffices.size} of 4 offices have done a task.`,
    },
    {
      id: "second-idea",
      name: "Second idea",
      earned: reportedMine >= 2,
      line: reportedMine >= 2 ? "Two ideas, two buildings." : "Check a second idea for 10¢.",
    },
  ];

  // ── the one next action, with its price
  // the kit is "being made" from the 50¢ payment until every part is delivered (or failed): a missing part is not done
  const kitSettled = !!k && [k.logo, k.site, k.plan].every((x) => x === "done" || x === "error");
  const kitBusy = paid2 && !kitSettled;
  const minFrom = Math.min(...OFFICE_IDS.map((o) => s.officeFrom[o]));
  let next: NextStep;
  if (s.example) next = { text: "Check your own idea", price: "10¢", act: "new" };
  else if (!paid1) next = { text: "Check your idea", price: "10¢", act: "pay1" };
  else if (!report) next = p?.status === "error" ? { text: "Your team hit a snag: open the report screen", price: "nothing charged twice", act: "wait" } : { text: "Your team is researching", price: s.sample ? "sample run" : "~2 min", act: "wait" };
  else if (nogo && !paid2) next = { text: "Try another idea", price: "10¢", act: "new" };
  else if (!paid2) next = { text: "Get your launch kit", price: "50¢", act: "kit" };
  else if (k && k.logo === "done" && !k.logoChosen) next = { text: "Pick your logo", price: "included", act: "logo" };
  else if (kitBusy) next = { text: "Your kit is being made", price: "included", act: "wait" };
  else if (doneOffices.size === 0)
    next = workingOffices.size ? { text: "Your office is on it", price: "price quoted", act: "offices" } : { text: "Run an office task", price: `from ${centsLabel(minFrom)}`, act: "offices" };
  else if (doneOffices.size < 4) {
    const o = OFFICE_IDS.find((x) => !doneOffices.has(x))!;
    next = { text: `Try the ${OFFICE_NAME[o]} office`, price: `from ${centsLabel(s.officeFrom[o])}`, act: "offices", office: o };
  } else if (reportedMine < 2) next = { text: "Check a second idea", price: "10¢", act: "new" };
  else next = { text: "Walk through your campus", price: "free", act: "campus" };

  const steerBusy = (p?.steers ?? []).some((x) => x.status === "working");
  const researchBusy = paid1 && !!p && p.status !== "done" && p.status !== "error";
  return {
    projectId: s.projectId,
    sample: s.sample,
    example: s.example,
    name: s.name,
    stage,
    stageName: stage ? STAGE_NAME[stage] : "Lobby",
    stages,
    rooms,
    lit,
    total,
    badges,
    next,
    nogo,
    steersLeft: p && report ? Math.max(0, p.steerLimit - p.steers.length) : null,
    inFlight: !s.sample && !s.example && (researchBusy || steerBusy || kitBusy || workingOffices.size > 0),
  };
}

/** Floor-1 room states for world.setRooms (the 8 floor rooms). */
export const floorRooms = (g: GameState): Array<{ id: FloorRoomId; state: RoomGameState }> =>
  g.rooms.filter((r) => !r.id.startsWith("office:")).map((r) => ({ id: r.id as FloorRoomId, state: r.state }));

/** Office rooms for world.setOffices. `results` = done inbox items of that office. */
export function officeRooms(g: GameState, s: GameSnapshot): Array<{ id: OfficeId; state: "off" | "working" | "done"; results: number }> {
  const inbox = s.offices?.inbox ?? [];
  return OFFICE_IDS.map((id) => {
    const st = g.rooms.find((r) => r.id === `office:${id}`)!.state;
    return { id, state: st === "done" ? "done" : st === "working" ? "working" : "off", results: inbox.filter((i) => i.office === id && i.status === "done").length };
  });
}

/** Stages newly unlocked between two states of the same project (what a level-up may fire for). */
export function newlyUnlocked(prev: GameState | null, cur: GameState): Stage[] {
  if (!prev || prev.projectId !== cur.projectId) return [];
  return cur.stages.filter((x) => x.unlocked && !prev.stages.find((y) => y.id === x.id)!.unlocked).map((x) => x.id);
}
/** Badges newly earned between two states of the same project (for the small HUD toast). */
export function newlyEarned(prev: GameState | null, cur: GameState): Badge[] {
  if (!prev || prev.projectId !== cur.projectId) return [];
  return cur.badges.filter((b) => b.earned && !prev.badges.find((x) => x.id === b.id)?.earned);
}
