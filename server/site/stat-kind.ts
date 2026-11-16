// Which sourced numbers belong on a customer-facing page. Shared by the kit digest (kit.ts) and the page brief (custom.ts).

/** Population, rent, fees, taxes, rules, wages: true facts for the report, but they say nothing to a customer. */
const CONTEXT_STAT = /population|inhabitants|residents|census|\brent(s|al|ed)?\b|m²|\bm2\b|per sq|sq ?m\b|\bvat\b|\btax(es)?\b|\bfees?\b|commission|insurance|\bcover\b|permit|licen[cs]e|regulat|registration|social security|payout|\bwages?\b|salar|footprint|assumed|planned|startup|break-?even|margin|documents?|training|requir/i;
const PRICE_STAT = /[€$£¥]|\b(eur|usd|gbp)\b|\bprice|\bcosts?\b|per (walk|cup|hour|session|visit|month)/i;
/** Sorts a stat for the customer-facing pages: "demand" (about the customer), "price" (market prices) or "context". */
export function statKind(s: { value: string; label: string }): "demand" | "price" | "context" {
  const t = `${s.value} ${s.label}`;
  if (CONTEXT_STAT.test(s.label)) return "context";
  if (PRICE_STAT.test(t)) return "price";
  return "demand";
}
