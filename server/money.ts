// One currency per idea, decided in code from the idea's own words (never by a model, never with an invented rate).
// Order: the idea's price ("$25 a month", "900 pesos"), then the place it names, then US dollars.
// Pure, no app imports, so web/proto can mirror the small parts it needs.

export type CurrencyWhy = "price" | "place" | "default";

const MEXICO = /\b(m[eé]xico|cdmx|guadalajara|monterrey|puebla|tijuana|canc[uú]n|m[eé]rida)\b/i;

/** Price or money words in the idea, first match wins (order matters: "MX$" before "$"). */
const PRICE_RULES: Array<[RegExp, string | ((idea: string) => string)]> = [
  [/MX\$|\bMXN\b/, "MXN"],
  [/\bpesos?\b/i, (t) => (/\bargentin/i.test(t) ? "ARS" : /\bcolombi/i.test(t) ? "COP" : /\bchile/i.test(t) ? "CLP" : "MXN")],
  [/\$/, (t) => (MEXICO.test(t) ? "MXN" : "")],
  [/\b(?:C\$|CA\$)|\bCAD\b/, "CAD"],
  [/\b(?:A\$|AU\$)|\bAUD\b/, "AUD"],
  [/\bR\$|\bBRL\b|\breais\b/i, "BRL"],
  [/₹|\bINR\b|\brupees?\b/i, "INR"],
  [/¥|\bJPY\b|\byen\b/i, "JPY"],
  [/\bCHF\b/, "CHF"],
  [/€|\bEUR\b|\beuros?\b/i, "EUR"],
  [/£|\bGBP\b/, "GBP"],
  [/US\$|\bUSD\b|\$\s?\d|\d\s?\$|\d\s?(?:dollars?|bucks)\b/i, "USD"],
  [/\d[\d.,]*\s?(?:pounds? sterling|quid)\b|\d[\d.,]*\s?pounds? (?:a|per|each|\/)\s?(?:month|week|year|session|hour|class|box)\b/i, "GBP"],
];

/** No price: the place the idea names. */
const PLACE_RULES: Array<[RegExp, string]> = [
  [MEXICO, "MXN"],
  [/\b(UK|U\.K\.|united kingdom|england|scotland|wales|london|manchester|birmingham|edinburgh|glasgow|bristol|leeds|liverpool)\b/i, "GBP"],
  [/\b(spain|espa[nñ]a|france|germany|deutschland|italy|italia|portugal|ireland|netherlands|holland|belgium|austria|finland|greece|madrid|barcelona|val[eè]ncia|sevilla|seville|m[aá]laga|bilbao|zaragoza|lisbon|lisboa|porto|paris|lyon|berlin|munich|m[uü]nchen|rome|roma|milan|milano|amsterdam|dublin|ruzafa|russafa)\b/i, "EUR"],
  [/\b(canada|toronto|vancouver|montreal|ottawa|calgary)\b/i, "CAD"],
  [/\b(australia|sydney|melbourne|brisbane|perth)\b/i, "AUD"],
  [/\b(brazil|brasil|s[aã]o paulo|rio de janeiro)\b/i, "BRL"],
  [/\b(india|mumbai|delhi|bangalore|bengaluru)\b/i, "INR"],
  [/\b(japan|tokyo|osaka)\b/i, "JPY"],
  [/\b(switzerland|zurich|z[uü]rich|geneva)\b/i, "CHF"],
  [/\b(argentina|buenos aires)\b/i, "ARS"],
  [/\b(colombia|bogot[aá]|medell[ií]n)\b/i, "COP"],
  [/\b(chile|santiago de chile)\b/i, "CLP"],
];

/** Pure: the idea's currency (ISO 4217) and why. A price only in BCH/sats falls to the place, else USD. */
export function currencyOf(idea: string): { code: string; why: CurrencyWhy } {
  const t = String(idea ?? "");
  for (const [re, out] of PRICE_RULES) {
    if (!re.test(t)) continue;
    const code = typeof out === "string" ? out : out(t);
    if (code) return { code, why: "price" };
  }
  for (const [re, code] of PLACE_RULES) if (re.test(t)) return { code, why: "place" };
  return { code: "USD", why: "default" };
}

const SYMBOLS: Record<string, string> = { USD: "$", EUR: "€", GBP: "£", MXN: "MX$", CAD: "CA$", AUD: "A$", BRL: "R$", INR: "₹", JPY: "¥" };

/** "USD" → "$", "MXN" → "MX$"; a code with no short symbol is returned as is ("CHF"). */
export function symbolFor(code: string): string {
  const k = String(code ?? "").trim().toUpperCase();
  return SYMBOLS[k] ?? k;
}

/** The reverse: "$" → "USD", "€" → "EUR", "MX$" → "MXN"; 3-letter codes pass through; unknown → "". */
export function codeFor(symbolOrCode: string): string {
  const k = String(symbolOrCode ?? "").trim().toUpperCase();
  if (!k) return "";
  for (const [code, sym] of Object.entries(SYMBOLS)) if (sym.toUpperCase() === k) return code;
  if (k === "US$") return "USD";
  if (k === "AU$") return "AUD";
  if (k === "C$") return "CAD";
  return /^[A-Z]{3}$/.test(k) ? k : "";
}

/** 23 → "€23.00", 2000 → "MX$2,000" (two decimals under 100, none from 100). EUR output equals the old "€" format. */
export function fmtMoney(x: number, code = "EUR"): string {
  const d = Math.abs(x) < 100 ? 2 : 0;
  const c = /^[A-Z]{3}$/.test(String(code)) ? code : "EUR";
  try {
    return new Intl.NumberFormat("en-US", { style: "currency", currency: c, minimumFractionDigits: d, maximumFractionDigits: d }).format(x);
  } catch {
    return `${c} ${x.toLocaleString("en-US", { minimumFractionDigits: d, maximumFractionDigits: d })}`;
  }
}

/** A money sign in text: "€", "$", "£", "¥", "₹", "MX$", "CA$", "R$"… */
export const MONEY_SIGN_SRC = "(?:[A-Z]{1,2})?[€$£¥₹]";

/** The three budget choices a plan offers (the founder's own budget, not a fact about the world). */
export function budgetTiersFor(code: string): [number, number, number] {
  switch (String(code ?? "").toUpperCase()) {
    case "MXN": return [0, 2000, 10000];
    case "BRL": return [0, 500, 2500];
    case "INR": return [0, 5000, 25000];
    case "JPY": return [0, 10000, 50000];
    default: return [0, 100, 500];
  }
}
