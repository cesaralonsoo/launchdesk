// v6 · Display view of any Project (WS-B). The cards render a View, so the live run (PAUSA) and every past project
// in "Your projects" share one design. Nothing is invented: every value is a field of the project or derived from one.
import type { Project } from "../../src/types";
import type { Dept } from "../contracts";
import { v6 } from "../data/v6";

export type View = ReturnType<typeof makeView>;

const FALLBACK_PAL = [
  { name: "Primary", hex: "#1B1D22" }, { name: "Accent", hex: "#0AC18E" }, { name: "Background", hex: "#F4F2EE" }, { name: "Extra", hex: "#8A94A6" },
];

export function makeView(p: Project) {
  const R = p.results ?? {};
  const X = v6(p) ?? {};
  const mia = R.mia, leo = R.leo, sam = R.sam, memo = R.memo, nova = R.nova, dex = R.dex, rae = R.rae, pip = R.pip;
  /** v6 extras (optional: old projects lack them) */
  const gate = X.mia?.gate ?? null;
  const leo6 = X.leo ? { weights: X.leo.signals.map((s) => s.weight ?? null), kill: X.leo.kill_criteria ?? [], math: X.leo.score_math ?? null, rule: X.leo.verdict_rule ?? null, confidence: X.leo.confidence ?? null } : null;
  const sam6 = X.sam ? { offer: X.sam.launch_offer ?? null, unit: X.sam.unit ?? null, be: X.sam.breakeven ?? null, headroom: X.sam.headroom ?? null, sens: X.sam.sensitivity ?? [], key: X.sam.key_assumption ?? null } : null;
  const positioning = X.nova?.positioning ?? null;
  const brand = nova ? nova.names[nova.chosen] ?? nova.names[0] ?? null : null;
  const palette = brand?.palette?.length ? brand.palette : FALLBACK_PAL;
  const pal = (name: string) => palette.find((c) => c.name === name)?.hex ?? palette[0]!.hex;
  const tasks = mia?.checklist ?? [];
  const weeks = [1, 2, 3, 4].map((w) => tasks.filter((t) => t.week === w));
  const hours = tasks.reduce((a, t) => a + (Number(t.est_hours) || 0), 0);
  const goalM = /(\d+)\s+(?:paid\s+)?pre-?orders/i.exec(mia?.brief.goal ?? "") ?? /(\d+)\s+pre-?orders/i.exec(dex?.landing.faq.map((f) => f.a).join(" ") ?? "");
  const preorderGoal = gate && /pre-?order/i.test(gate.metric) ? gate.target : goalM ? Number(goalM[1]) : null;
  const curve = sam ? [{ month: 0, cash: -sam.startup_cost.value }, ...sam.months.map((m) => ({ month: m.month, cash: m.cash }))] : [];
  const risk = (() => {
    if (!sam) return null;
    const i = sam.main_risk.indexOf(":");
    const r = (i > 0 ? sam.main_risk.slice(0, i) : sam.main_risk).trim().replace(/\.$/, "");
    const t = i > 0 ? sam.main_risk.slice(i + 1).trim().replace(/^./, (c) => c.toUpperCase()) : leo?.next_step ?? "";
    return { risk: r, test: t };
  })();
  const posts = rae?.posts ?? [];
  const channels = posts.reduce<Record<string, number>>((a, x) => ((a[x.channel] = (a[x.channel] ?? 0) + 1), a), {});
  const sourced = (leo?.sources.length ?? 0) > 0;
  const estimates = (leo?.market_facts.filter((f) => f.is_estimate).length ?? 0) + (sam?.assumptions.filter((a) => a.is_estimate).length ?? 0);
  const has = (d: Dept) => !!R[d];
  const name = brand?.name ?? mia?.title ?? p.idea.slice(0, 40);
  return {
    p, id: p.id, idea: p.idea, name, title: mia?.title ?? name, createdAt: p.created_at,
    mia, leo, sam, memo, nova, dex, rae, pip, brand, palette, pal, gate, leo6, sam6, positioning,
    fonts: nova?.typography ?? { display: "Fraunces", body: "Inter" },
    tasks, weeks, hours, preorderGoal, curve, risk, posts, channels, sourced, estimates, has,
    hasBuild: !!(nova || dex || rae || pip),
    cents: { validate: p.payments.validate?.cents ?? 10, build: p.payments.build?.cents ?? 20 },
  };
}

export const CHANNEL_LABEL: Record<string, string> = { instagram: "Instagram", tiktok: "TikTok", linkedin: "LinkedIn", x: "X", email: "Email" };
export const VERDICT_LABEL = { go: "Go", pivot: "Pivot", "no-go": "No-go" } as const;
export const usd = (cents: number) => `$${(cents / 100).toFixed(2)}`;
/** €54k · €3.2k · €940 · −€18k */
export function money(cur: string, n: number, cents = false): string {
  const sign = n < 0 ? "−" : "";
  const a = Math.abs(n);
  const s = a >= 10_000 ? `${Math.round(a / 1000)}k` : a >= 1000 ? `${(a / 1000).toFixed(1).replace(/\.0$/, "")}k` : cents ? a.toFixed(2) : String(Math.round(a));
  return `${sign}${cur}${s}`;
}
export const fmtDate = (ms: number | string) =>
  new Date(ms).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });

const loaded = new Set<string>();
/** Loads the brand's two Google families (Nova's pick, whitelisted server-side) once. */
export function ensureBrandFonts(v: View): void {
  for (const f of [v.fonts.display, v.fonts.body]) {
    if (!f || loaded.has(f)) continue;
    loaded.add(f);
    const l = document.createElement("link");
    l.rel = "stylesheet";
    l.href = `https://fonts.googleapis.com/css2?family=${encodeURIComponent(f).replace(/%20/g, "+")}:wght@400;500;600;700&display=swap`;
    document.head.appendChild(l);
  }
}
