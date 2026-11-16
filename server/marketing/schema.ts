// WP3 · Marketing plan v2: the shape of "Your 30-day plan", its JSON schema for the writer call, and the pure
// clean-up that enforces the honesty rules in code (no node imports: the web view imports the types from here).
//
// Honesty rules (same as Validate): a local fact, place or event counts only with a source number that exists in the
// research's numbered pages; a claim the model could not source is moved to `assumptions` ("to test"), never shown
// as a fact. Numbers that are the founder's own choices (prices, budget, targets, hours) are plans, not claims.

export type ChannelRole = "awareness" | "first sales" | "proof" | "repeat";
export type CountFrom = "bch payments" | "website" | "by hand";
export type CopyRef = "post-1" | "post-2" | "post-3" | "message" | "email" | "flyer" | "profile" | "press";

export interface PlanSource { n: number; url: string; title: string }

export interface PlanV2 {
  lang: string;
  currency: string;
  /** One sentence: the whole plan for a busy person. */
  headline: string;
  goal: { metric: string; target: number; unit: string; by_day: number; why: string; how_counted: string };
  customer: { who: string; places: Array<{ place: string; when: string; source: number | null }> };
  channels: Array<{ name: string; role: ChannelRole; why: string; source: number | null; weekly_hours: number; cost: number; first_action: string }>;
  rejected: Array<{ name: string; why_not: string }>;
  budget: { tiers: Array<{ amount: number; label: string; lines: Array<{ channel: string; amount: number; for: string }> }>; reserve_pct: number; reallocate_rule: string };
  weeks: Array<{ n: number; theme: string; aim: string; days: Array<{ day: number; time: string; channel: string; action: string; copy: CopyRef | null; hours: number }> }>;
  kpis: Array<{ name: string; target: string; how_to_count: string; count_from: CountFrom }>;
  copy: {
    posts: Array<{ channel: string; hook: string; body: string; cta: string }>;
    message: string;
    email: { subject: string; body: string };
    flyer: { headline: string; lines: string[] };
    profile: string;
    press: string;
  };
  local: Array<{ fact: string; source: number }>;
  events: Array<{ name: string; date: string; where: string; source: number }>;
  /** Things the plan assumes and the founder should check (unsourced claims end up here). */
  assumptions: string[];
  decision: { scale_if: string; adjust_if: string; stop_if: string };
  /** Set in code from the report (withValidateFirst): its verdict, deciding reason and "validate first" checks, with
   *  the plan day that runs each one. The plan view shows it first. Absent on plans made without a report. */
  gate?: PlanGate;
}
export interface PlanGate {
  verdict: "go" | "pivot" | "no-go";
  reason?: string;
  checks: Array<{ what: string; passIf: string; day: number | null }>;
}

// ───────────────────────────────────────────────────────────── JSON schema (structured output)

const str = { type: "string" } as const;
const num = { type: "number" } as const;
/** Source number, 0 = none (a nullable union makes the compiled grammar too large for this schema). */
const srcN = { type: "integer" } as const;
const obj = (properties: Record<string, unknown>) => ({ type: "object", properties, required: Object.keys(properties), additionalProperties: false });
const arr = (items: unknown) => ({ type: "array", items });

export const PLAN_SCHEMA = obj({
  headline: str,
  goal: obj({ metric: str, target: num, unit: str, by_day: { type: "integer" }, why: str, how_counted: str }),
  customer: obj({ who: str, places: arr(obj({ place: str, when: str, source: srcN })) }),
  channels: arr(obj({ name: str, role: str, why: str, source: srcN, weekly_hours: num, cost: num, first_action: str })),
  rejected: arr(obj({ name: str, why_not: str })),
  budget: obj({ tiers: arr(obj({ amount: num, label: str, lines: arr(obj({ channel: str, amount: num, for: str })) })), reserve_pct: num, reallocate_rule: str }),
  weeks: arr(
    obj({
      n: { type: "integer" },
      theme: str,
      aim: str,
      days: arr(obj({ day: { type: "integer" }, time: str, channel: str, action: str, copy: str, hours: num })),
    }),
  ),
  kpis: arr(obj({ name: str, target: str, how_to_count: str, count_from: str })),
  copy: obj({
    posts: arr(obj({ channel: str, hook: str, body: str, cta: str })),
    message: str,
    email: obj({ subject: str, body: str }),
    flyer: obj({ headline: str, lines: arr(str) }),
    profile: str,
    press: str,
  }),
  local: arr(obj({ fact: str, source: srcN })),
  events: arr(obj({ name: str, date: str, where: str, source: srcN })),
  assumptions: arr(str),
  decision: obj({ scale_if: str, adjust_if: str, stop_if: str }),
});

/** The whole schema compiles to a grammar the API refuses ("too large"), so the writer runs in two steps:
 *  A = strategy (everything but weeks and copy), B = the 4-week calendar and the copy, written from A. */
const pick = (keys: string[]) => {
  const all = PLAN_SCHEMA.properties as Record<string, unknown>;
  return obj(Object.fromEntries(keys.map((k) => [k, all[k]])));
};
export const PLAN_B_KEYS = ["weeks", "copy"] as const;
export const PLAN_SCHEMA_A = pick(Object.keys(PLAN_SCHEMA.properties).filter((k) => !(PLAN_B_KEYS as readonly string[]).includes(k)));
export const PLAN_SCHEMA_B = pick([...PLAN_B_KEYS]);

// ───────────────────────────────────────────────────────────── clean-up (pure)

/** Words that make a plan sound like a template; the writer is told not to use them, the cleaner reports them. */
export const BANNED = ["leverage", "unlock", "game-changing", "game changer", "seamless", "synergy", "use social media", "go viral", "revolutionary", "cutting-edge"];
export const COPY_LIMITS = { postWords: 70, emailWords: 140, profileChars: 750, pressSentences: 3, flyerLines: 3 } as const;

const words = (s: string) => s.trim().split(/\s+/).filter(Boolean).length;
const capWords = (s: string, n: number) => {
  const w = s.trim().split(/\s+/);
  return w.length <= n ? s.trim() : w.slice(0, n).join(" ").replace(/[,;:]$/, "") + "…";
};
/** One-line text, cut at a word boundary with "…" when longer than max. */
const clean = (s: unknown, max = 600) => {
  if (typeof s !== "string") return "";
  const t = s.replace(/\s+/g, " ").trim();
  return t.length <= max ? t : t.slice(0, max - 1).replace(/\s+\S*$/, "").replace(/[,;:]$/, "") + "…";
};
const cleanBlock = (s: unknown, max = 2000) => (typeof s === "string" ? s.replace(/[ \t]+/g, " ").replace(/\n{3,}/g, "\n\n").trim().slice(0, max) : "");
const n0 = (v: unknown, max = 1e7) => (typeof v === "number" && Number.isFinite(v) ? Math.min(max, Math.max(0, v)) : 0);
/** Strips [n] markers the model put inside prose (sources live in the `source` fields). */
const noMarks = (s: string) => s.replace(/\s*\[(?:S)?\d+\]/g, "").trim();

/** A fact-like sentence: a number that is not an obvious plan figure (day, time, hours) in a claim about the world. */
export const claimsNumber = (s: string) => /\d/.test(s.replace(/\b(day|días?|week|semana)\s*\d+/gi, "").replace(/\b\d{1,2}[:.h]\d{2}\b/g, ""));

export interface CleanReport { plan: PlanV2; warnings: string[] }

/** "We assume" in the plan's language (the marker for an unsourced reason). */
const ASSUME: Record<string, string> = { en: "We assume", es: "Suponemos", ca: "Suposem", fr: "Nous supposons", pt: "Supomos", it: "Supponiamo", de: "Wir nehmen an" };
export const assumeWord = (lang: string) => ASSUME[lang] ?? ASSUME.en!;
/** An English "we assume" left inside a non-English text becomes the local word. */
const localAssume = (s: string, lang: string) => (lang === "en" ? s : s.replace(/\bwe assume( that)?\b/gi, (m) => (m[0] === "W" ? assumeWord(lang) : assumeWord(lang).toLowerCase())));

/**
 * Enforces the plan rules on a raw writer answer: valid source numbers only (unsourced places, facts and events are
 * dropped or moved to assumptions), 3–4 channels, ≤2 rejected, 3 budget tiers whose lines never exceed the tier,
 * 4 weeks with days 1–30 in order, ≤5 KPIs, copy within limits. Returns what it had to fix as warnings.
 */
export function cleanPlan(raw: unknown, sources: readonly PlanSource[], ctx: { lang: string; currency: string }): CleanReport {
  const r = (raw ?? {}) as Record<string, any>;
  const warnings: string[] = [];
  const known = new Set(sources.map((s) => s.n));
  const src = (v: unknown): number | null => (typeof v === "number" && known.has(v) ? v : null);
  const assumptions: string[] = Array.isArray(r.assumptions) ? r.assumptions.map((a: unknown) => noMarks(clean(a, 240))).filter(Boolean) : [];

  const goal = r.goal ?? {};
  const places = (Array.isArray(r.customer?.places) ? r.customer.places : []).slice(0, 4).map((p: any) => ({ place: noMarks(clean(p?.place, 160)), when: noMarks(clean(p?.when, 120)), source: src(p?.source) })).filter((p: any) => p.place);

  let channels = (Array.isArray(r.channels) ? r.channels : []).map((c: any) => {
    const source = src(c?.source);
    if (c?.source != null && c.source !== 0 && source == null) warnings.push(`channel "${clean(c?.name, 40)}": unknown source ${c.source} removed`);
    return { name: clean(c?.name, 60), role: (["awareness", "first sales", "proof", "repeat"].includes(c?.role) ? c.role : "awareness") as ChannelRole, why: localAssume(noMarks(clean(c?.why, 320)), ctx.lang), source, weekly_hours: n0(c?.weekly_hours, 40), cost: n0(c?.cost), first_action: noMarks(clean(c?.first_action, 240)) };
  }).filter((c: any) => c.name && c.why);
  if (channels.length > 4) { warnings.push(`${channels.length} channels cut to 4`); channels = channels.slice(0, 4); }
  if (channels.length < 3) warnings.push(`only ${channels.length} channels`);

  const rejected = (Array.isArray(r.rejected) ? r.rejected : []).slice(0, 2).map((x: any) => ({ name: clean(x?.name, 60), why_not: noMarks(clean(x?.why_not, 240)) })).filter((x: any) => x.name);

  const tiers = (Array.isArray(r.budget?.tiers) ? r.budget.tiers : []).slice(0, 3).map((t: any) => {
    const amount = n0(t?.amount);
    let lines = (Array.isArray(t?.lines) ? t.lines : []).map((l: any) => ({ channel: clean(l?.channel, 60), amount: n0(l?.amount), for: noMarks(clean(l?.for, 160)) })).filter((l: any) => l.channel);
    const sum = lines.reduce((s: number, l: any) => s + l.amount, 0);
    if (sum > amount + 0.5) {
      warnings.push(`budget tier ${amount}: lines added up to ${sum}, scaled down`);
      const k = sum ? amount / sum : 0;
      lines = lines.map((l: any) => ({ ...l, amount: Math.floor(l.amount * k) }));
    }
    return { amount, label: clean(t?.label, 80), lines };
  }).sort((a: any, b: any) => a.amount - b.amount);
  if (tiers.length !== 3) warnings.push(`${tiers.length} budget tiers`);

  const weeks = (Array.isArray(r.weeks) ? r.weeks : []).slice(0, 4).map((w: any, i: number) => ({
    n: i + 1,
    theme: clean(w?.theme, 60),
    aim: noMarks(clean(w?.aim, 200)),
    days: (Array.isArray(w?.days) ? w.days : [])
      .map((d: any) => ({ day: Math.round(n0(d?.day, 30)) || 1, time: clean(d?.time, 30), channel: clean(d?.channel, 60), action: noMarks(clean(d?.action, 300)), copy: (["post-1", "post-2", "post-3", "message", "email", "flyer", "profile", "press"].includes(d?.copy) ? d.copy : null) as CopyRef | null, hours: n0(d?.hours, 12) }))
      .filter((d: any) => d.action)
      .sort((a: any, b: any) => a.day - b.day),
  }));
  if (weeks.length !== 4) warnings.push(`${weeks.length} weeks`);

  let kpis = (Array.isArray(r.kpis) ? r.kpis : []).map((k: any) => ({ name: clean(k?.name, 80), target: clean(k?.target, 60), how_to_count: noMarks(clean(k?.how_to_count, 200)), count_from: (["bch payments", "website", "by hand"].includes(k?.count_from) ? k.count_from : "by hand") as CountFrom })).filter((k: any) => k.name);
  if (kpis.length > 5) { warnings.push(`${kpis.length} KPIs cut to 5`); kpis = kpis.slice(0, 5); }

  const c = r.copy ?? {};
  const posts = (Array.isArray(c.posts) ? c.posts : []).slice(0, 3).map((p: any) => {
    const body = cleanBlock(p?.body, 900);
    if (words(body) > COPY_LIMITS.postWords) warnings.push(`post "${clean(p?.channel, 30)}" over ${COPY_LIMITS.postWords} words, trimmed`);
    return { channel: clean(p?.channel, 40), hook: clean(p?.hook, 140), body: capWords(body, COPY_LIMITS.postWords), cta: clean(p?.cta, 120) };
  });
  const emailBody = cleanBlock(c.email?.body, 1400);
  const profile = clean(c.profile, 2000);
  const pressSent = clean(c.press, 1200).split(/(?<=[.!?])\s+/).filter(Boolean);
  const copy = {
    posts,
    message: cleanBlock(c.message, 700),
    email: { subject: clean(c.email?.subject, 90), body: words(emailBody) > COPY_LIMITS.emailWords ? capWords(emailBody, COPY_LIMITS.emailWords) : emailBody },
    flyer: { headline: clean(c.flyer?.headline, 80), lines: (Array.isArray(c.flyer?.lines) ? c.flyer.lines : []).slice(0, COPY_LIMITS.flyerLines).map((l: unknown) => clean(l, 90)).filter(Boolean) },
    profile: profile.length > COPY_LIMITS.profileChars ? profile.slice(0, COPY_LIMITS.profileChars - 1).replace(/\s+\S*$/, "") + "…" : profile,
    press: pressSent.slice(0, COPY_LIMITS.pressSentences).join(" "),
  };

  // Facts and events need a real source; an unsourced one becomes something to check.
  const local: PlanV2["local"] = [];
  for (const f of Array.isArray(r.local) ? r.local : []) {
    const fact = noMarks(clean(f?.fact, 260));
    if (!fact) continue;
    const s = src(f?.source);
    if (s == null) { warnings.push(`local fact without a valid source moved to assumptions`); assumptions.push(fact); continue; }
    local.push({ fact, source: s });
  }
  const events: PlanV2["events"] = [];
  for (const e of Array.isArray(r.events) ? r.events : []) {
    const name = clean(e?.name, 120);
    if (!name) continue;
    const s = src(e?.source);
    if (s == null) { warnings.push(`event "${name}" without a valid source dropped`); continue; }
    events.push({ name, date: clean(e?.date, 60), where: clean(e?.where, 120), source: s });
  }
  events.splice(0, events.length, ...datedEvents(events, sources, assumptions, warnings, ctx.lang));
  // An unsourced number in a channel's reason is a claim; flag it (the writer was told to cite or say "we assume").
  for (const ch of channels) if (ch.source == null && claimsNumber(ch.why) && !/(assum|supon|supos|suppo|asumi|nehmen an|\btest|prueba)/i.test(ch.why)) warnings.push(`channel "${ch.name}": number without a source`);
  for (const p of places) if (p.source == null && claimsNumber(p.place + " " + p.when)) warnings.push(`place "${p.place}": number without a source`);

  const all = JSON.stringify({ channels, weeks, copy, rejected });
  for (const b of BANNED) if (new RegExp(`\\b${b.replace(/[-\s]/g, "[-\\s]")}\\b`, "i").test(all)) warnings.push(`banned phrase "${b}"`);

  const plan: PlanV2 = {
    lang: ctx.lang,
    currency: ctx.currency,
    headline: noMarks(clean(r.headline, 220)),
    goal: { metric: clean(goal.metric, 120), target: n0(goal.target), unit: clean(goal.unit, 40), by_day: 30, why: noMarks(clean(goal.why, 300)), how_counted: noMarks(clean(goal.how_counted, 200)) },
    customer: { who: noMarks(clean(r.customer?.who, 260)), places },
    channels,
    rejected,
    budget: { tiers, reserve_pct: Math.min(30, n0(r.budget?.reserve_pct, 100)), reallocate_rule: noMarks(clean(r.budget?.reallocate_rule, 260)) },
    weeks,
    kpis,
    copy,
    local: local.slice(0, 6),
    events: events.slice(0, 5),
    assumptions: [...new Set(assumptions)].slice(0, 6),
    decision: { scale_if: noMarks(clean(r.decision?.scale_if, 240)), adjust_if: noMarks(clean(r.decision?.adjust_if, 240)), stop_if: noMarks(clean(r.decision?.stop_if, 240)) },
  };
  return { plan, warnings };
}

/** The source numbers a plan really uses (the view lists only these). */
/**
 * An event whose year differs from the year of the page it cites was probably carried over from an old edition
 * (a 2025 article quoted as a 2026 date). It is dropped from the calendar and listed as something to check.
 */
export function datedEvents(events: PlanV2["events"], sources: readonly PlanSource[], assumptions: string[], warnings: string[], lang = "en"): PlanV2["events"] {
  const yearsIn = (s: string) => [...s.matchAll(/\b(20\d\d)\b/g)].map((m) => Number(m[1]));
  return events.filter((e) => {
    const src = sources.find((s) => s.n === e.source);
    const pageYears = src ? yearsIn(`${src.url} ${src.title}`) : [];
    const ev = yearsIn(e.date)[0];
    if (ev == null || !pageYears.length || pageYears.includes(ev)) return true;
    warnings.push(`event "${e.name}" dated ${ev} but its source is from ${Math.max(...pageYears)}: dropped`);
    const y = Math.max(...pageYears);
    assumptions.push(lang === "es" ? `Comprueba la fecha de ${e.name}: la fuente que encontramos es de ${y}.` : `Check the date of ${e.name}: the source we found is from ${y}.`);
    return false;
  });
}

export function usedSources(p: PlanV2): number[] {
  const s = new Set<number>();
  for (const x of p.customer.places) if (x.source != null) s.add(x.source);
  for (const x of p.channels) if (x.source != null) s.add(x.source);
  for (const x of p.local) s.add(x.source);
  for (const x of p.events) s.add(x.source);
  return [...s].sort((a, b) => a - b);
}

// ───────────────────────────────────────────────────────────── report gate + day sanity (pure)

/** What the plan needs from the report's decision: the verdict, the deciding reason and the "validate first" checks. */
export interface ReportGate {
  verdict?: "go" | "pivot" | "no-go";
  mainReason?: string;
  validateFirst?: Array<{ what: string; how: string; passIf: string }>;
}

type Day = PlanV2["weeks"][number]["days"][number];
const STOP = new Set("about after again also before being from have into just more most once only other over same some than that their them then there these they this those very what when where which while with without your yours would could should first every each week weeks month".split(" "));
/** Content words (≥ 4 letters, lower case, light plural strip) for keyword overlap. */
export const keyWords = (s: string): string[] =>
  [...new Set((s.toLowerCase().match(/\p{L}[\p{L}-]{3,}/gu) ?? []).map((w) => w.replace(/(?<=\p{L}{3})s$/u, "")).filter((w) => !STOP.has(w)))];
const overlap = (a: string, b: string) => { const kb = new Set(keyWords(b)); return keyWords(a).filter((w) => kb.has(w)).length; };

/** Text a writer garbled: too short, repeated words, leftover markup or labels, or cut mid-sentence. */
export function garbled(s: string): boolean {
  const t = s.trim();
  if (words(t) < 4) return true;
  // repeated word, Unicode-aware ("más más" counts, not only ASCII words)
  if (/(?<![\p{L}\p{N}])([\p{L}\p{N}]+)\s+\1(?![\p{L}\p{N}])/iu.test(t) && !/\b(very very|no no)\b/i.test(t)) return true;
  if (/[{}<>]|\b(undefined|null|NaN|TODO|lorem)\b|\[(?:S)?\d+\]/.test(t)) return true;
  if (/(.)\1{4,}/.test(t)) return true;
  if (/\b(and|or|the|to|with|a|an|of|for|y|el|la|de|con|para)$/i.test(t.replace(/[.,;:!?…]+$/, ""))) return true;
  const letters = (t.match(/\p{L}/gu) ?? []).length;
  return letters / t.length < 0.55;
}

/** Which copy text implies which kind of channel; a day that uses it under an unrelated label is relabelled. */
const COPY_CHANNEL: Partial<Record<CopyRef, { re: RegExp; en: string; es: string }>> = {
  profile: { re: /google|maps|profile|listing|perfil|ficha/i, en: "Google Business Profile", es: "Perfil de Google" },
  email: { re: /e-?mail|newsletter|waitlist|list|correo|lista/i, en: "Email to your list", es: "Email a tu lista" },
  press: { re: /press|newsletter|media|paper|journal|prensa|medios|blog/i, en: "Local press", es: "Prensa local" },
  message: { re: /whatsapp|message|friends|network|word of mouth|contacts|mensaje|amigos|boca/i, en: "Personal messages", es: "Mensajes personales" },
};

/**
 * Code-side check of the calendar: a day whose channel label does not fit its own text is relabelled (to the plan
 * channel the text names, else a plain label for the copy it uses), and a garbled or empty action is replaced by the
 * nearest template line. `fallback` = the template plan's days for the same business.
 */
export function saneDays(plan: PlanV2, fallback: readonly Day[], warnings: string[] = []): PlanV2 {
  const names = plan.channels.map((c) => c.name);
  const lang = plan.lang === "es" ? "es" : plan.lang === "en" ? "en" : null;
  const used = new Set<string>();
  const fix = (d: Day): Day => {
    let { channel, action } = d;
    if (garbled(action)) {
      // the template lines are English: a plan in another language gets a short line in its own language instead
      if (lang !== "en") {
        warnings.push(lang === "es" ? `day ${d.day}: unclear task replaced by a plain line` : `day ${d.day}: unclear task kept (no template in this language)`);
        return lang === "es" ? { ...d, action: "Cuenta lo que trajo cada canal hasta hoy y apúntalo.", copy: null } : d;
      }
      const near = [...fallback].filter((f) => !used.has(f.action)).sort((a, b) => Math.abs(a.day - d.day) - Math.abs(b.day - d.day))[0];
      warnings.push(`day ${d.day}: unclear task replaced by a template line`);
      if (near) { used.add(near.action); return { ...d, channel: near.channel, action: near.action, copy: near.copy }; }
      return { ...d, action: "Count what each channel brought so far and write it down." };
    }
    const rule = d.copy ? COPY_CHANNEL[d.copy] : undefined;
    if (rule && !rule.re.test(channel) && names.includes(channel) && !rule.re.test(action)) {
      // a channel the plan chose, with a task that does not name the copy's kind: the copy reference is the mistake
      warnings.push(`day ${d.day}: the ${d.copy} text dropped (it does not fit "${channel}")`);
      return { ...d, channel, action, copy: null };
    } else if (rule && !rule.re.test(channel)) {
      const named = names.find((n) => rule.re.test(n));
      const to = named ?? (lang ? rule[lang] : null);
      if (to && to !== channel) { warnings.push(`day ${d.day}: channel "${channel}" relabelled "${to}" (the task uses the ${d.copy} text)`); channel = to; }
    } else if (names.includes(channel) && overlap(channel, action) === 0) {
      const best = names.map((n) => ({ n, s: overlap(n, action) })).sort((a, b) => b.s - a.s)[0];
      if (best && best.s >= 2) { warnings.push(`day ${d.day}: channel "${channel}" relabelled "${best.n}"`); channel = best.n; }
    }
    return { ...d, channel, action };
  };
  return { ...plan, weeks: plan.weeks.map((w) => ({ ...w, days: w.days.map(fix) })) };
}

/** Rough language of a short text: "es" or "en" by common function words (null when it cannot tell). */
export function textLang(s: string): "es" | "en" | null {
  const t = ` ${s.toLowerCase()} `;
  const n = (re: RegExp) => (t.match(re) ?? []).length;
  const en = n(/\s(?:the|and|of|to|at|for|with|is|are|if|or|from|your|least|before)(?=[\s,.;:])/g);
  const es = n(/\s(?:el|la|los|las|de|del|que|y|en|con|para|por|si|una|un|al|tu|antes)(?=[\s,.;:])/g);
  return en === es ? null : en > es ? "en" : "es";
}
/** The deciding reason as a plain sentence: no verdict word in front, no [S#] ids, no in-words source notes. */
export function gateReason(r: string | undefined): string {
  return String(r ?? "")
    .replace(/^\s*(?:test first|no-go|go|pivot)\s*[:.—–-]\s*/i, "")
    .replace(/\s*\[S\d+\]/g, "")
    .replace(/\s*[;,]\s*no source (?:id|cited)\b/gi, "")
    .replace(/\s*\((?=[^()]*(?:\.(?:com|org|net|es|cat|eu|io|guide|info)\b|\bundated\b|\b(?:19|20)\d{2}\s*(?:;\s*estimate)?\)))[^()]{1,90}\)/gi, "")
    .replace(/\s+([.,;:])/g, "$1")
    .replace(/\s+/g, " ")
    .trim();
}
/** "Check 2", "check #2", "Comprobación 2", "comprobación nº 2": a day the writer marked as running report check n. */
const checkMark = (n: number) => new RegExp(`\\b(?:check|comprobaci[oó]n)\\s*(?:n[ºo.°]?\\s*|#\\s*)?${n}\\b`, "i");

/**
 * On a No-go or Pivot, week 1 starts with the report's "validate first" checks (before opening or spending money).
 * A check the writer already put in week 1 (shared key words) is not repeated. Go: the plan is unchanged.
 */
export function withValidateFirst(plan: PlanV2, gate: ReportGate | undefined): PlanV2 {
  const checks = (gate?.validateFirst ?? []).filter((v) => v?.what && v?.how).slice(0, 3);
  if (!gate?.verdict || !plan.weeks.length) return plan;
  const es = plan.lang === "es";
  const reason = gateReason(gate.mainReason);
  const first = (s: string) => (s.trim().match(/^.*?[.!?](?=\s|$)/)?.[0] ?? s.trim()).replace(/\s*\((?:estimate|estimación)\)/gi, "").replace(/\.?\s*$/, ".");
  const allDays = plan.weeks.flatMap((w) => w.days);
  const w1 = plan.weeks[0]!;
  // Covered when a day names the check ("Check 2", "Comprobación 2"), or most of its own key words are in week 1
  // (sharing "kiosk" or "exit" is not enough). Key words only compare within one language.
  const have = new Set(keyWords(w1.days.map((d) => d.action).join(" ")));
  const share = (s: string) => { const k = keyWords(s); return k.length ? k.filter((w) => have.has(w)).length / k.length : 0; };
  const bestW1 = (c: { what: string; how: string }) => {
    const ranked = w1.days.map((d) => ({ d, s: overlap(`${c.what} ${c.how}`, d.action) })).sort((a, b) => b.s - a.s);
    return ranked[0]?.d.day ?? null;
  };
  const found = checks.map((c, i) => {
    const marked = allDays.find((d) => checkMark(i + 1).test(d.action));
    if (marked) return marked.day;
    if (share(c.what) >= 0.6 || share(c.how) >= 0.6) return bestW1(c);
    return null;
  });
  const out = (p: PlanV2, days: Array<number | null>): PlanV2 => ({
    ...p,
    gate: { verdict: gate.verdict!, ...(reason ? { reason } : {}), checks: checks.map((c, i) => ({ what: first(c.what).replace(/\.$/, ""), passIf: c.passIf?.trim() ? first(c.passIf) : "", day: days[i] ?? null })) },
  });
  const missing = checks.map((c, i) => ({ c, i })).filter(({ i }) => found[i] == null);
  // Go: the plan is the writer's; the checks are shown first, with the day that runs each one when there is one.
  if (gate.verdict === "go" || !missing.length) return checks.length ? out(plan, found) : out(plan, []);
  const free = (n: number, taken: Set<number>) => { while (taken.has(n) && n < 7) n++; taken.add(n); return n; };
  const taken = new Set<number>();
  const label = es ? "Comprobar primero" : "Check first";
  const days = [...found];
  const added: Day[] = missing.map(({ c, i }, k) => {
    const day = free(k + 1, taken);
    days[i] = day;
    const lead = k === 0 ? (es ? "Antes de abrir o gastar dinero: " : "Before you open or spend money: ") : "";
    // A check written in another language than the plan is referred to by number, never mixed into the plan's text.
    const sameLang = (textLang(`${c.how} ${c.passIf}`) ?? (es ? "es" : "en")) === (es ? "es" : "en");
    const action = sameLang
      ? c.passIf?.trim()
        ? `${lead}${first(c.how)} ${es ? "Sigue solo si" : "Go ahead only if"}: ${first(c.passIf).replace(/^./, (x) => x.toLowerCase())}`
        : `${lead}${first(c.how)} ${es ? "Apunta el resultado antes de seguir." : "Write down the result before you go on."}`
      : es
        ? `${lead}haz la comprobación ${i + 1} del informe y apunta el resultado. Sigue solo si pasa la marca que pone el informe.`
        : `${lead}run check ${i + 1} from the report and write down the result. Go ahead only if it meets the report's pass mark.`;
    return { day, time: "", channel: label, action: clean(action.replace(/^./, (x) => x.toUpperCase()), 420), copy: null, hours: 2 };
  });
  const shift = Math.max(...added.map((d) => d.day));
  // The writer's own week-1 days move after the checks so nothing opens before they pass.
  const rest = w1.days.map((d) => ({ ...d, day: Math.min(7, d.day + shift) }));
  for (const [i, d] of found.entries()) if (d != null && w1.days.some((x) => x.day === d)) days[i] = Math.min(7, d + shift);
  return out({ ...plan, weeks: [{ ...w1, days: [...added, ...rest].sort((a, b) => a.day - b.day) }, ...plan.weeks.slice(1)] }, days);
}
