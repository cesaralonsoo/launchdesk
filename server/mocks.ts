// Sample answers used when the AI runs in MOCK mode (local development, no API cost).
// Idea: "A specialty coffee kiosk for commuters in Barcelona". All figures are labelled estimates.
import type { DeptResults, DexDesign, LeoOpportunity, MiaPlan, NovaBrand, RaeLaunch, SamModel } from "./types.js";
import type { AiDept } from "./ai.js";

export const MOCK_IDEA = "A specialty coffee kiosk for commuters in Barcelona";

const mia: MiaPlan = {
  title: "Specialty coffee kiosk in Barcelona",
  one_liner: "Specialty coffee in 90 seconds for commuters, open from 7:00.",
  brief: {
    concept: "A 40 m² takeaway-first specialty coffee kiosk next to a busy metro exit in Eixample.",
    for: "Commuters and remote workers aged 25–45 who want great coffee fast on the way to work.",
    goal: "Validate demand and price, then open pre-orders for 100 Morning Passes in 4 weeks.",
  },
  weeks: [
    { dept: "mia", week: 1, task: "Brief and plan" },
    { dept: "leo", week: 1, task: "Count morning footfall" },
    { dept: "sam", week: 1, task: "Price the menu" },
    { dept: "leo", week: 2, task: "Interview 20 commuters" },
    { dept: "sam", week: 2, task: "Model break-even" },
    { dept: "nova", week: 2, task: "Name and identity" },
    { dept: "dex", week: 2, task: "Design logo" },
    { dept: "mia", week: 2, task: "Go / no-go review" },
    { dept: "dex", week: 3, task: "Build landing page" },
    { dept: "nova", week: 3, task: "Cup and signage" },
    { dept: "rae", week: 3, task: "Plan 30-day campaign" },
    { dept: "pip", week: 3, task: "Publish landing page" },
    { dept: "rae", week: 4, task: "Run launch posts" },
    { dept: "pip", week: 4, task: "Take pre-orders" },
    { dept: "mia", week: 4, task: "Review first 100" },
  ],
};

const leo: LeoOpportunity = {
  score: 7.8,
  verdict: "go",
  headline: "Focus on the 7–9 am commuter gap.",
  summary:
    "Morning demand near metro exits is strong and few specialty cafés open before 9:00. Premium prices are accepted if service takes under two minutes.",
  signals: [
    { name: "Demand", score: 8.7 },
    { name: "Competition gap", score: 7.2 },
    { name: "Price acceptance", score: 8.1 },
    { name: "Channel", score: 6.8 },
    { name: "Timing", score: 8.3 },
  ],
  why_go: "Strong morning demand, almost no early-opening specialty cafés and a premium price commuters already pay.",
  risks: [
    "Rent is high: start with a 40 m² takeaway-first kiosk, no seating.",
    "Morning-only traffic: add a 13:00–15:00 lunch coffee push to use the afternoon.",
    "Queue time kills the habit: pre-orders and a two-drink morning menu keep service under 90 s.",
  ],
  next_step: "Visit 3 kiosks under 45 m² near Provença and Enric Granados this week and count footfall from 7:00 to 9:00.",
  market_facts: [
    {
      fact: "A metro exit in central Eixample can see several thousand passers-by between 7:00 and 9:00.",
      source: "Estimate from typical central-station footfall — verify with a 2-hour count",
      is_estimate: true,
    },
    {
      fact: "Specialty flat whites in central Barcelona typically sell for €3.00–€3.80.",
      source: "Estimate from typical menu prices in the area",
      is_estimate: true,
    },
    {
      fact: "Most specialty cafés in the area open at 8:30 or later.",
      source: "Estimate — confirm by checking opening hours on map listings",
      is_estimate: true,
    },
  ],
  competitors: [
    { name: "Station chain cafés", note: "Fast, but generic coffee", price: 4.5, differentiation: 2.5 },
    { name: "Third-wave cafés in Eixample", note: "Great coffee, open after 8:30", price: 7.5, differentiation: 8 },
    { name: "Bakery counters", note: "Cheap, average coffee, long queues", price: 3, differentiation: 3.5 },
    { name: "Supermarket grab-and-go", note: "Cheapest, no fresh espresso", price: 1.5, differentiation: 1 },
    { name: "Office coffee machines", note: "Free, but nobody enjoys it", price: 0.5, differentiation: 0.5 },
  ],
  you: { price: 6, differentiation: 8.5 },
};

const sam: SamModel = {
  currency: "€",
  canvas: {
    customer: "Commuters and remote workers near Passeig de Gràcia",
    value: "Specialty coffee ready in 90 s, from 7:00",
    revenue: "Coffee and pastries + Morning Pass (€39/month)",
    channels: "Street kiosk + order-ahead page",
    costs: "Rent, beans, 2 baristas, machine lease",
    unit_economics: "~210 cups/day at break-even",
  },
  price: { value: "€3.20", note: "Flat white · avg ticket €4.60" },
  startup_cost: { value: "€38k", note: "Fit-out, machine, licences, stock" },
  break_even: { month: 6, note: "~210 cups/day at break-even" },
  months: [
    { month: 1, revenue: 9200, costs: 21500 },
    { month: 2, revenue: 13100, costs: 21800 },
    { month: 3, revenue: 16400, costs: 22000 },
    { month: 4, revenue: 19300, costs: 22200 },
    { month: 5, revenue: 21400, costs: 22400 },
    { month: 6, revenue: 23100, costs: 22600 },
    { month: 7, revenue: 24800, costs: 22800 },
    { month: 8, revenue: 26300, costs: 23400 },
    { month: 9, revenue: 27200, costs: 23600 },
    { month: 10, revenue: 28100, costs: 23700 },
    { month: 11, revenue: 29200, costs: 23900 },
    { month: 12, revenue: 31000, costs: 24000 },
  ],
  year1: {
    revenue: "€269k",
    costs: "€274k",
    result: "−€4.8k",
    monthly_profit_m12: "€7.0k",
    payback: "Month 19",
  },
  main_risk:
    "Everything depends on reaching ~210 cups a day: run a 2-week pop-up cart at the metro exit before signing the lease.",
};

const nova: NovaBrand = {
  names: [
    {
      name: "Pausa",
      why: "Says the promise in one word and works in Catalan, Spanish and English.",
      tagline: "Your 90-second pause.",
      palette: [
        { name: "Primary", hex: "#2B211C" },
        { name: "Accent", hex: "#C8813A" },
        { name: "Background", hex: "#F4EADF" },
        { name: "Extra", hex: "#6E8B74" },
      ],
    },
    {
      name: "Andén",
      why: "The platform: where the morning ritual happens.",
      tagline: "Coffee for the platform.",
      palette: [
        { name: "Primary", hex: "#1E2A38" },
        { name: "Accent", hex: "#E0A43B" },
        { name: "Background", hex: "#F6F3EE" },
        { name: "Extra", hex: "#B5523B" },
      ],
    },
    {
      name: "Siete",
      why: "Open at seven — the reason commuters choose it.",
      tagline: "Open at seven. Sharp.",
      palette: [
        { name: "Primary", hex: "#20302A" },
        { name: "Accent", hex: "#D9653B" },
        { name: "Background", hex: "#F3EFE6" },
        { name: "Extra", hex: "#9AA88C" },
      ],
    },
  ],
  chosen: 0,
  typography: { headline: "Sora", body: "Plus Jakarta Sans" },
  voice: {
    traits: ["Warm", "Clear", "Local", "Confident"],
    rules: "Say it like a neighbour, not a corporation: short sentences, real details, one call to action.",
    sample: "Opening 7:00 sharp.",
  },
};

const dex: DexDesign = {
  logos: [
    { concept: "A steaming cup inside a round badge with the name underneath.", icon: "cup", shape: "emblem", monogram: "P" },
    { concept: "A bold P monogram in a rounded square, like a metro sign.", icon: "cup", shape: "monogram", monogram: "P" },
    { concept: "A lowercase wordmark with a small steam line over the first letter.", icon: "spark", shape: "wordmark", monogram: "PA" },
  ],
  landing: {
    headline: "Great coffee before your train.",
    subheadline: "Specialty coffee ready in 90 seconds at the Provença metro exit, from 7:00.",
    bullets: ["Ready in 90 seconds, order ahead", "Single-origin beans roasted in Barcelona", "Morning Pass: one coffee every weekday"],
    cta: "Pre-order · Pay with BCH",
    offer: "First 100 Morning Passes at €29 (normally €39)",
    price_hint_usd: 31.5,
  },
};

function rae(): RaeLaunch {
  const start = new Date(Date.now() + 86_400_000);
  const day = (n: number, time: string) => {
    const t = new Date(start.getTime() + (n - 1) * 86_400_000);
    return `${t.toISOString().slice(0, 10)}T${time}`;
  };
  return {
    start_date: start.toISOString().slice(0, 10),
    handle: "@pausa.bcn",
    posts: [
      { day: 1, channel: "IG", title: "Teaser" },
      { day: 2, channel: "TT", title: "Founder story" },
      { day: 4, channel: "IG", title: "Poll" },
      { day: 5, channel: "TT", title: "Behind the scenes" },
      { day: 7, channel: "IG", title: "Countdown" },
      { day: 8, channel: "ALL", title: "Opening day" },
      { day: 9, channel: "IG", title: "Thank-you recap" },
      { day: 11, channel: "TT", title: "First reactions" },
      { day: 12, channel: "Mail", title: "Offer reminder" },
      { day: 14, channel: "IG", title: "How it works" },
      { day: 15, channel: "LI", title: "Partner shout-out" },
      { day: 17, channel: "TT", title: "Mini guide" },
      { day: 18, channel: "IG", title: "Testimonial" },
      { day: 20, channel: "Mail", title: "Pre-order nudge" },
      { day: 21, channel: "TT", title: "Behind the scenes" },
      { day: 23, channel: "IG", title: "Live Q&A" },
      { day: 25, channel: "LI", title: "Week-3 numbers" },
      { day: 27, channel: "IG", title: "Customer repost" },
      { day: 28, channel: "Mail", title: "Last call" },
      { day: 30, channel: "ALL", title: "Month-1 recap" },
    ],
    first_posts: [
      {
        kind: "Teaser",
        title: "Opening 7:00 sharp",
        text: "Something is brewing on Carrer de Provença. Doors open at 7:00, before your metro. Pre-order your Morning Pass today.",
        date: day(1, "08:30"),
        channel: "IG",
      },
      {
        kind: "Behind the scenes",
        title: "Meet our beans",
        text: "Single-origin from Huila, Colombia, roasted 6 km away. Taste it on day one — link in bio.",
        date: day(5, "08:30"),
        channel: "TT",
      },
      {
        kind: "Launch week",
        title: "Free cortado for the first 100",
        text: "Show this post at the counter. Pre-order your Morning Pass with BCH and skip the queue all month.",
        date: day(8, "08:30"),
        channel: "ALL",
      },
    ],
  };
}

const MOCKS: { [K in AiDept]: () => NonNullable<DeptResults[K]> } = {
  mia: () => mia,
  leo: () => leo,
  sam: () => sam,
  nova: () => nova,
  dex: () => dex,
  rae,
};

/** A fresh deep copy of the mock answer for one department. */
export function mockFor<K extends AiDept>(dept: K): NonNullable<DeptResults[K]> {
  return structuredClone(MOCKS[dept]()) as NonNullable<DeptResults[K]>;
}
