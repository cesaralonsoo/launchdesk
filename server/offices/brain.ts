// The "project brain": what every office knows about the business. Built either from a created project (report +
// launch kit, no questions) or from a short form about a business the owner already runs (then up to 3 follow-up
// questions, only for what is missing). The brain is turned into one stable text block that real runs cache.
import type { Kit, ReportDigest } from "../kit-contract.js";
import type { Project } from "../types.js";
import type { Brain, FollowUp } from "./types.js";

const clip = (s: unknown, n: number) => (typeof s === "string" ? s.replace(/\s+/g, " ").trim().slice(0, n) : "");

/** (A) Continue from a created project: the report digest and the kit brand fill the brain. Zero questions. */
export function brainFromProject(p: Project, digest: ReportDigest | null, kit: Kit | null): Brain {
  const mia = p.results.mia;
  const sam = p.results.sam;
  const facts: string[] = [];
  if (mia?.brief.concept) facts.push(mia.brief.concept);
  if (mia?.brief.goal) facts.push(`Goal: ${mia.brief.goal}`);
  for (const s of digest?.stats ?? []) if (facts.length < 8) facts.push(`${s.value}: ${s.label}`);
  for (const r of digest?.risks ?? []) if (facts.length < 10) facts.push(`Risk: ${r}`);
  const currency = kit?.brand.currency || sam?.currency || mia?.market.currency || "€";
  return {
    name: clip(kit?.brand.name || mia?.title || p.idea, 60),
    what: clip(mia?.one_liner || p.idea, 240),
    where: clip(kit?.brand.city || mia?.market.city || "", 80) || "online",
    customer: clip(digest?.customer || mia?.brief.for, 240) || undefined,
    price: digest?.offer.price ? `${currency}${digest.offer.price} (${clip(digest.offer.what, 80)})` : sam?.price.display || undefined,
    stage: "just launched",
    goal: clip(mia?.brief.goal, 200) || undefined,
    voice: clip(kit?.brand.voice, 160) || undefined,
    competitors: (digest?.competitors ?? []).slice(0, 5).map((c) => ({ name: clip(c.name, 60), note: clip(c.gap, 160) })),
    facts: facts.map((f) => clip(f, 200)),
    lang: kit?.brand.lang || mia?.market.language || "en",
    currency,
  };
}

export type BroughtForm = { what: string; where: string; link?: string };

/** Validates the short form. Throws a plain-English message. */
export function readForm(b: Record<string, unknown>): BroughtForm {
  const what = clip(b.what, 400);
  const where = clip(b.where, 120);
  let link = clip(b.link, 300);
  if (what.length < 8) throw new Error("Tell us in a sentence what your business does.");
  if (!where) throw new Error("Tell us where it runs: a town, a neighbourhood, or online.");
  if (link && !/^https?:\/\//i.test(link)) link = "https://" + link;
  if (link) {
    try {
      const u = new URL(link);
      if (!/^https?:$/.test(u.protocol) || !u.hostname.includes(".")) throw new Error();
      link = u.toString();
    } catch {
      throw new Error("That link does not look right. Leave it empty if you have none.");
    }
  }
  return { what, where, ...(link ? { link } : {}) };
}

/** A first name for the business from the owner's sentence ("A small bakery in Ruzafa" → "Your bakery"). */
function nameOf(what: string): string {
  const quoted = what.match(/["“']([^"”']{2,40})["”']/)?.[1];
  if (quoted) return quoted;
  const called = what.match(/\bcalled\s+([A-Z][\w'&-]*(?:\s+[A-Z][\w'&-]*){0,3})/)?.[1];
  if (called) return called;
  const noun = what.toLowerCase().match(/\b(bakery|café|cafe|shop|studio|salon|bar|restaurant|kiosk|business|dog[- ]walking|walks|classes|agency|store|clinic|gym)\b/)?.[1];
  if (noun && /^dog/.test(noun)) return "Your dog walking business";
  return noun ? `Your ${noun.replace(/-/g, " ")}` : "Your business";
}

export function brainFromForm(f: BroughtForm): Brain {
  const t = `${f.what} ${f.where}`.toLowerCase();
  const currency = /\$|usd|dollar|new york|usa|us\b/.test(t) ? "$" : /£|london|uk\b/.test(t) ? "£" : "€";
  return { name: nameOf(f.what), what: f.what, where: f.where, ...(f.link ? { link: f.link } : {}), competitors: [], facts: [], lang: "en", currency };
}

const QUESTIONS: Record<FollowUp["id"], FollowUp> = {
  customer: { id: "customer", question: "Who buys from you most?", hint: "For example: neighbours on their way to work, families at weekends" },
  price: { id: "price", question: "What do you sell most, and for how much?", hint: "For example: your best seller and its price" },
  goal: { id: "goal", question: "What do you want more of in the next 30 days?", hint: "For example: 20 more regulars, more bookings on weekdays" },
  stage: { id: "stage", question: "How long have you been open?", hint: "For example: 2 years, 6 months, just started" },
};

/** Mock (and the real fallback): ask only for what the sentence did not already say. At most 3, always the same. */
export function mockQuestions(b: Brain): FollowUp[] {
  const t = b.what.toLowerCase();
  const out: FollowUp[] = [];
  if (!b.customer) out.push(QUESTIONS.customer);
  if (!b.price && !/[€$£]\s?\d|\d\s?(€|eur|euros|dollars|\$)/.test(t)) out.push(QUESTIONS.price);
  if (!b.goal) out.push(QUESTIONS.goal);
  if (out.length < 3 && !b.stage) out.push(QUESTIONS.stage);
  return out.slice(0, 3);
}

/** Folds the owner's answers into the brain. Empty answers are skipped. */
export function applyAnswers(b: Brain, qs: FollowUp[], answers: Record<string, unknown>): Brain {
  const next = { ...b, facts: [...b.facts] };
  for (const q of qs) {
    const a = clip(answers[q.id], 240);
    if (!a) continue;
    if (q.id === "customer") next.customer = a;
    if (q.id === "price") next.price = a;
    if (q.id === "goal") next.goal = a;
    if (q.id === "stage") next.stage = a;
  }
  return next;
}

/** The brain as one stable text block (first in every prompt, cached on real runs). Same brain, same bytes. */
export function brainText(b: Brain): string {
  const line = (k: string, v?: string) => (v ? `${k}: ${v}\n` : "");
  return (
    `<business>\n` +
    line("Name", b.name) +
    line("What it does", b.what) +
    line("Where", b.where) +
    line("Website", b.link) +
    line("Main customers", b.customer) +
    line("Main product and price", b.price) +
    line("How long it has run", b.stage) +
    line("Goal for the next 30 days", b.goal) +
    line("Voice", b.voice) +
    line("Currency", b.currency) +
    (b.competitors.length ? `Competitors:\n${b.competitors.map((c) => `- ${c.name}: ${c.note}`).join("\n")}\n` : "") +
    (b.facts.length ? `Facts:\n${b.facts.map((f) => `- ${f}`).join("\n")}\n` : "") +
    `</business>`
  );
}
