// Dev-only sample data matching web/src/types.ts (fake txids). Used only by demo pages and visual checks;
// it lives outside web/src so it can never end up in a production bundle.
// The real app always renders what the server returns.
import type { Project, SiteData } from "../../web/src/types";

const NOW = Date.UTC(2026, 10, 14, 9, 30, 0);

export const SAMPLE_PROJECT: Project = {
  id: "demo-pausa",
  idea: "A specialty coffee kiosk for commuters in Barcelona",
  created_at: NOW,
  payments: {
    validate: { txid: "9d46c0a1f3b27e58d0c4a9f1e6b3d27c58a0e4f1b9c6d3a2e7f0b4c8d1a5e9f2", sats: 43478, cents: 10, at: NOW + 12_000 },
    build: { txid: "1b2ef7a9c3d48e05f6a1b9c2d7e3f04a8b5c6d1e2f3a4b5c6d7e8f9a0b1c2d3e", sats: 86957, cents: 20, at: NOW + 140_000 },
  },
  status: { mia: "done", leo: "done", sam: "done", nova: "done", dex: "done", rae: "done", pip: "done" },
  timings: {
    validate: { started: NOW + 14_000, finished: NOW + 70_000 },
    build: { started: NOW + 142_000, finished: NOW + 236_000 },
  },
  models: {
    mia: "claude-sonnet-5-5", leo: "claude-sonnet-5-5", sam: "claude-sonnet-5-5",
    nova: "claude-opus-5-5", dex: "claude-sonnet-5-5", rae: "claude-sonnet-5-5", pip: "no AI · publisher",
  },
  results: {
    mia: {
      title: "Specialty coffee kiosk in Barcelona",
      one_liner: "Specialty coffee for commuters, ready in 90 seconds from 7:00.",
      brief: {
        concept: "A takeaway-first specialty coffee kiosk in Eixample, built for speed.",
        for: "Commuters and remote workers aged 25–45 who want great coffee fast.",
        goal: "Validate demand, price it, then open pre-orders for a Morning Pass.",
      },
      weeks: [
        { dept: "mia", week: 1, task: "Brief & plan" },
        { dept: "leo", week: 1, task: "Map 5 rivals" },
        { dept: "sam", week: 1, task: "Price & costs" },
        { dept: "leo", week: 2, task: "Street counts 7–9 am" },
        { dept: "nova", week: 2, task: "Name & palette" },
        { dept: "dex", week: 2, task: "Logo & landing" },
        { dept: "sam", week: 2, task: "Break-even model" },
        { dept: "pip", week: 3, task: "Landing live" },
        { dept: "rae", week: 3, task: "Teaser posts" },
        { dept: "mia", week: 3, task: "Visit 3 kiosks" },
        { dept: "rae", week: 4, task: "Opening week" },
        { dept: "pip", week: 4, task: "Pre-order check" },
        { dept: "mia", week: 4, task: "Go / no-go review" },
      ],
    },
    leo: {
      score: 7.8,
      verdict: "go",
      headline: "Focus on the 7–9 am commuter gap.",
      summary: "Strong morning demand, very few early openers nearby, and premium prices are accepted in the area.",
      signals: [
        { name: "Demand", score: 8.7 },
        { name: "Competition gap", score: 7.2 },
        { name: "Price acceptance", score: 8.1 },
        { name: "Channel", score: 6.8 },
        { name: "Timing", score: 8.3 },
      ],
      why_go: "Morning commuters pass by in high volume and most specialty cafés nearby open at 9:00 or later.",
      risks: ["Rent is high in Eixample: keep it a 40 m² takeaway-first kiosk.", "Weather and August holidays reduce footfall."],
      next_step: "Visit 3 kiosks under 45 m² on Provença / Enric Granados this week.",
      market_facts: [
        { fact: "Specialty coffee keeps growing as a share of out-of-home coffee in Spain.", source: "Industry reports (SCA Spain)", is_estimate: false },
        { fact: "~60% of nearby cafés open at 9:00 or later.", source: "Leo's scan of listed opening hours", is_estimate: true },
        { fact: "€3.00–3.60 typical price for a flat white in Eixample.", source: "Public menus of 5 nearby cafés", is_estimate: true },
      ],
      competitors: [
        { name: "Grano Norte", note: "Opens 9:00 · sit-down only", price: 6.5, differentiation: 7.2 },
        { name: "Café Mirador", note: "Chain · average coffee", price: 4.0, differentiation: 3.0 },
        { name: "Tueste & Co", note: "Roaster, no takeaway", price: 8.2, differentiation: 8.0 },
        { name: "Nómada", note: "Laptop café · opens 10:00", price: 6.8, differentiation: 5.5 },
        { name: "Barra 18", note: "Bar, basic coffee", price: 2.2, differentiation: 1.8 },
      ],
      you: { price: 5.6, differentiation: 8.4 },
    },
    sam: {
      currency: "€",
      canvas: {
        customer: "Commuters & remote workers near Passeig de Gràcia",
        value: "Specialty coffee ready in 90 s, from 7:00",
        revenue: "Coffee & pastries + Morning Pass (€39/mo)",
        channels: "Street kiosk + order-ahead page",
        costs: "Rent, beans, 2 baristas, machine lease",
        unit_economics: "~210 cups/day at break-even",
      },
      price: { value: "€3.20", note: "flat white · avg ticket €4.60" },
      startup_cost: { value: "€38k", note: "fit-out, machine, licences, stock" },
      break_even: { month: 6, note: "~210 cups/day at break-even" },
      months: [
        { month: 1, revenue: 9200, costs: 22000 },
        { month: 2, revenue: 13400, costs: 22000 },
        { month: 3, revenue: 16900, costs: 22000 },
        { month: 4, revenue: 19800, costs: 22000 },
        { month: 5, revenue: 21300, costs: 22300 },
        { month: 6, revenue: 22800, costs: 22600 },
        { month: 7, revenue: 24600, costs: 22800 },
        { month: 8, revenue: 26700, costs: 23400 },
        { month: 9, revenue: 27900, costs: 23600 },
        { month: 10, revenue: 29000, costs: 23800 },
        { month: 11, revenue: 30300, costs: 24000 },
        { month: 12, revenue: 31600, costs: 24600 },
      ],
      year1: { revenue: "€273k", costs: "€278k", result: "−€5.1k", monthly_profit_m12: "€7.0k", payback: "Month 17" },
      main_risk: "Rent: if the kiosk costs more than €3.5k/month, break-even moves past month 9.",
    },
    nova: {
      names: [
        {
          name: "Pausa",
          why: "Short, Catalan-Spanish friendly, says the 90-second break you get.",
          tagline: "Your 90-second pause.",
          palette: [
            { name: "Espresso", hex: "#2B211C" },
            { name: "Caramel", hex: "#C8813A" },
            { name: "Oat milk", hex: "#F4EADF" },
            { name: "Sage", hex: "#6E8B74" },
          ],
        },
        {
          name: "Andén",
          why: "Means platform — the coffee before your train.",
          tagline: "Coffee before the platform.",
          palette: [
            { name: "Ink", hex: "#1D2A3A" },
            { name: "Signal", hex: "#E9B44C" },
            { name: "Paper", hex: "#F3F1EC" },
            { name: "Tile", hex: "#4F7C82" },
          ],
        },
        {
          name: "Siete",
          why: "We open at seven. Easy to remember, easy to say.",
          tagline: "Open at seven. Gone by nine.",
          palette: [
            { name: "Night", hex: "#18181B" },
            { name: "Sunrise", hex: "#F26B3A" },
            { name: "Chalk", hex: "#FAF7F2" },
            { name: "Plum", hex: "#7A4E6E" },
          ],
        },
      ],
      chosen: 0,
      typography: { headline: "Sora ExtraBold", body: "Plus Jakarta Sans" },
      voice: {
        traits: ["Warm", "Clear", "Local", "Confident"],
        rules: "Say it like a neighbour, not a corporation. Short sentences, real details, one call to action.",
        sample: "Opening 7:00 sharp.",
      },
    },
    dex: {
      logos: [
        { concept: "Round café emblem with cup and steam", icon: "cup", shape: "emblem", monogram: "P" },
        { concept: "Bold P monogram for the app icon", icon: "cup", shape: "monogram", monogram: "P" },
        { concept: "Lowercase wordmark with caramel underline", icon: "cup", shape: "wordmark", monogram: "P" },
      ],
      landing: {
        headline: "Specialty coffee, ready before your metro.",
        subheadline: "Single-origin espresso on Carrer de Provença from 7:00. Order ahead and skip the line.",
        bullets: ["Ready in 90 seconds", "Single-origin beans, roasted in Barcelona", "Morning Pass · €39/mo"],
        cta: "Pre-order · Pay with BCH",
        offer: "First 100 Morning Passes at €29",
        price_hint_usd: 32,
      },
    },
    rae: {
      start_date: "2026-11-15",
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
        { day: 22, channel: "TT", title: "Behind the scenes" },
        { day: 23, channel: "IG", title: "Live Q&A" },
        { day: 25, channel: "LI", title: "Week-3 numbers" },
        { day: 27, channel: "IG", title: "Customer repost" },
        { day: 28, channel: "Mail", title: "Last call" },
        { day: 30, channel: "ALL", title: "Month-1 recap" },
      ],
      first_posts: [
        { kind: "Teaser", title: "Opening 7:00 sharp", text: "Something is brewing on Carrer de Provença. Doors open at 7:00, before your metro.", date: "2026-11-15T08:30", channel: "IG" },
        { kind: "Behind the scenes", title: "Meet our beans", text: "Single-origin from Huila, Colombia, roasted 6 km away. Taste it on day one.", date: "2026-11-19T08:30", channel: "TT" },
        { kind: "Launch week", title: "Free cortado for the first 100", text: "Show this post at the counter. Pre-order your Morning Pass with BCH.", date: "2026-11-22T08:30", channel: "ALL" },
      ],
    },
    pip: { slug: "pausa-ae48", url: "/s/pausa-ae48", live_at: new Date(NOW + 236_000).toISOString() },
  },
};

/** Same project, stopped at the gate (Stage 1 only). */
export const SAMPLE_STAGE1: Project = {
  ...SAMPLE_PROJECT,
  id: "demo-stage1",
  payments: { validate: SAMPLE_PROJECT.payments.validate },
  status: { mia: "done", leo: "done", sam: "done" },
  timings: { validate: SAMPLE_PROJECT.timings.validate },
  results: { mia: SAMPLE_PROJECT.results.mia, leo: SAMPLE_PROJECT.results.leo, sam: SAMPLE_PROJECT.results.sam },
};

export const SAMPLE_SITE: SiteData = {
  slug: "pausa-ae48",
  name: "Pausa",
  tagline: "Your 90-second pause.",
  palette: SAMPLE_PROJECT.results.nova!.names[0].palette,
  logo: SAMPLE_PROJECT.results.dex!.logos[0],
  landing: SAMPLE_PROJECT.results.dex!.landing,
  founderAddress: "bitcoincash:qr6m7j9njldwwzlg9v7v53unlr4jkmx6eylep8ekg2",
  bchUsd: 412.35,
};
