// Sample answers used when the AI runs in MOCK mode (local development, demo server, no API cost). Owner: WS4.
// R9: three complete samples keyed by the three home chips (config.sampleIdeas). mockFor(dept, idea) picks the
// closest sample. Honesty: no sources, no URLs, no named real businesses; every figure is labelled an estimate.
import { deriveSam, type DeptResults, type DexDesign, type Memo, type MiaPlan, type NovaBrand, type Project, type RaeLaunch, type SamAssumptionKey, type SamDraft } from "./types.js";
import type { AiDept, LeoDraft, ModelOut } from "./ai.js";

export const MOCK_IDEA = "A specialty coffee kiosk at a Barcelona metro exit, €3 flat whites for commuters";

type SampleKey = "coffee" | "dog" | "bikes";
type PostSeed = [day: number, channel: RaeLaunch["posts"][number]["channel"], time: string, format: RaeLaunch["posts"][number]["format"], hook: string, caption: string, cta: string];
type Sample = {
  mia: MiaPlan;
  leo: LeoDraft;
  sam: SamDraft;
  nova: NovaBrand;
  dex: DexDesign;
  rae: { handle: string; posts: PostSeed[]; first: Array<[day: number, time: string, kind: string, title: string, text: string]> };
  memo: (r: DeptResults) => Memo;
};

const est = (key: SamAssumptionKey, label: string, value: number, unit: string, basis: string) => ({ key, label, value, unit, basis, is_estimate: true });
const fact = (f: string) => ({ fact: f, source_id: null, is_estimate: true });

// ---------------------------------------------------------------- coffee kiosk, Barcelona

const coffee: Sample = {
  mia: {
    title: "Specialty coffee kiosk in Barcelona",
    one_liner: "Specialty coffee in 90 seconds at the metro exit, open from 7:00.",
    brief: {
      concept: "A 40 m² takeaway-only specialty coffee kiosk next to a busy metro exit in Eixample.",
      for: "Commuters aged 25 to 45 who buy coffee on the way to work and hate queues.",
      goal: "Sell 60 cups at a pop-up cart and collect 30 pre-orders within 4 weeks.",
    },
    market: { city: "Barcelona", country_iso: "ES", currency: "€", language: "en" },
    checklist: [
      { week: 1, task: "Count morning footfall at two metro exits", how: "Stand at each exit from 7:00 to 9:00 on two weekdays and tally passers-by.", done_when: "Two full counts written down for each exit", helped_by: null, est_hours: 4 },
      { week: 1, task: "Interview 20 commuters about their last coffee", how: "Ask what they bought this week and what it cost, never what they would buy.", done_when: "20 interviews logged, 10 or more buy coffee on the way", helped_by: "leo", est_hours: 5 },
      { week: 1, task: "List three kiosks under 45 m² for rent", how: "Search listings and walk the streets around the two exits.", done_when: "Three kiosks with rent, size and licence status noted", helped_by: null, est_hours: 3 },
      { week: 2, task: "Run a pop-up cart for two mornings", how: "Borrow a cart and sell flat whites at €3.20 from 7:00 to 9:30.", done_when: "60 or more cups sold in two mornings", helped_by: "sam", est_hours: 8 },
      { week: 2, task: "Get two quotes for an espresso machine lease", how: "Call two local suppliers and ask for a 24-month lease with service.", done_when: "Two written quotes in hand", helped_by: "sam", est_hours: 2 },
      { week: 2, task: "Pick the name and order 50 sample cups", how: "Choose one of Nova's three names and print a short run of cups.", done_when: "Name chosen and cups ordered", helped_by: "nova", est_hours: 2 },
      { week: 3, task: "Send the pre-order page to 50 people", how: "Message everyone you interviewed and two local neighbourhood groups.", done_when: "50 people received the link", helped_by: "pip", est_hours: 2 },
      { week: 3, task: "Publish the first three launch posts", how: "Post on the planned days and answer every comment the same day.", done_when: "Three posts live, every comment answered", helped_by: "rae", est_hours: 3 },
      { week: 4, task: "Collect 30 pre-orders on the page", how: "Follow up in person with everyone who opened the page.", done_when: "30 pre-orders paid on-chain", helped_by: "pip", est_hours: 6 },
      { week: 4, task: "Decide whether to sign the lease", how: "Compare cart sales and pre-orders with the break-even line.", done_when: "Go or no-go written down with the numbers", helped_by: "sam", est_hours: 2 },
    ],
  },
  leo: {
    score: 7.8,
    verdict: "go",
    headline: "Win the 7 to 9 am commuter gap.",
    summary: "Morning demand at metro exits is strong and few specialty cafés open before 9:00. Commuters accept a premium price if service takes under two minutes.",
    signals: [
      { name: "Demand", score: 8.6, why: "Thousands pass a central metro exit every morning", source_id: null },
      { name: "Competition gap", score: 7.2, why: "Few specialty cafés open before 9:00", source_id: null },
      { name: "Price acceptance", score: 8.0, why: "Commuters already pay €3 or more for chain coffee", source_id: null },
      { name: "Channel", score: 6.6, why: "Street visibility is free, social reach is unproven", source_id: null },
      { name: "Timing", score: 8.2, why: "Office attendance keeps morning traffic steady", source_id: null },
    ],
    why_go: "Strong morning demand, almost no early-opening specialty cafés and a price commuters already pay.",
    risks: [
      { risk: "Rent next to metro exits is high.", mitigation: "Start with a 40 m² takeaway kiosk with no seating.", severity: "high" },
      { risk: "Most sales happen before 10:00.", mitigation: "Test a 13:00 to 15:00 coffee push during the cart week.", severity: "med" },
      { risk: "Queues kill the morning habit.", mitigation: "Keep a two-drink morning menu and time every order at the cart.", severity: "med" },
    ],
    pivot: null,
    next_step: "Run a two-morning pop-up cart at the busier exit and count cups sold at €3.20.",
    market_facts: [
      fact("A central metro exit in Eixample can see several thousand people between 7:00 and 9:00."),
      fact("Specialty flat whites in central Barcelona usually cost €3.00 to €3.80."),
      fact("Most specialty cafés in the area open at 8:30 or later."),
      fact("A takeaway kiosk needs one barista per 60 to 80 drinks an hour at peak."),
    ],
    competitors: [
      { name: "Station chain cafés", note: "Fast, but generic coffee", price: 4.5, differentiation: 2.5, url: null },
      { name: "Third-wave cafés in Eixample", note: "Great coffee, open after 8:30", price: 7.5, differentiation: 8, url: null },
      { name: "Bakery counters", note: "Cheap, average coffee, long queues", price: 3, differentiation: 3.5, url: null },
      { name: "Supermarket grab-and-go", note: "Cheapest, no fresh espresso", price: 1.5, differentiation: 1, url: null },
      { name: "Office coffee machines", note: "Free, but nobody enjoys it", price: 0.5, differentiation: 0.5, url: null },
    ],
    you: { price: 6, differentiation: 8.5 },
    interviews: {
      who: "Commuters leaving the busiest metro exit between 7:00 and 9:00",
      where: "At the exit itself and in two nearby co-working spaces",
      questions: [
        "When did you last buy a coffee on the way to work?",
        "Where did you buy it, and why there?",
        "How much did you pay for it?",
        "What annoyed you about it?",
        "What did you do the last time the queue was too long?",
      ],
      good_sign: "They name a place and a price without thinking, and complain about the queue or the taste.",
      target: 20,
    },
  },
  sam: {
    currency: "€",
    canvas: {
      customer: "Commuters and office workers at one Eixample metro exit",
      value: "Specialty coffee ready in 90 seconds, from 7:00",
      revenue: "Flat whites and filter coffee, pastries for one in five",
      channels: "The street itself plus an order-ahead page",
      costs: "Rent, two baristas, machine lease, beans and milk",
      unit_economics: "Each customer leaves about €2.40 after ingredients",
    },
    assumptions: [
      est("customers_per_day_m1", "Customers per day, month 1", 90, "per day", "A new kiosk before word of mouth"),
      est("customers_per_day_m12", "Customers per day, month 12", 330, "per day", "About 5% of morning footfall at a busy exit"),
      est("avg_ticket", "Average ticket", 3.4, "€", "Flat white at €3.20, pastry for one in five"),
      est("gross_margin_pct", "Gross margin", 70, "%", "Usual for specialty coffee after beans, milk and cups"),
      est("fixed_costs_month", "Fixed costs per month", 11500, "€", "Rent, two baristas, machine lease, utilities"),
      est("startup_cost", "Start-up cost", 32000, "€", "Fit-out, machine deposit, licences, first stock"),
      est("open_days_month", "Open days per month", 26, "days", "Monday to Saturday"),
    ],
    fixed_costs_breakdown: [
      { label: "Kiosk rent", value: 3800 },
      { label: "Two baristas, part time", value: 6200 },
      { label: "Machine lease and service", value: 700 },
      { label: "Utilities, card fees, insurance", value: 800 },
    ],
    price_note: "Flat white €3.20, average ticket €3.40",
    startup_note: "Fit-out, machine deposit, licences, stock",
    main_risk: "Everything rests on about 190 customers a day: run a two-week pop-up cart at the exit before signing a lease.",
  },
  nova: {
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
        why: "Open at seven, the reason commuters choose it.",
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
    typography: { display: "Fraunces", body: "Instrument Sans" },
    voice: {
      traits: ["Warm", "Clear", "Local", "Quick"],
      rules: "Talk like a neighbour behind the counter: short sentences, real details, one action.",
      sample: "Open at 7:00. Your flat white is already on its way.",
    },
  },
  dex: {
    logos: [
      { concept: "The name in a warm serif with a small cup to the left.", icon: "cup", shape: "wordmark", monogram: "P", wordmark: { weight: 600, letter_spacing_em: -0.02, case: "title", mark: "icon", placement: "left" } },
      { concept: "A bold P monogram above the name, like a metro sign.", icon: "cup", shape: "monogram", monogram: "P", wordmark: { weight: 700, letter_spacing_em: 0.06, case: "upper", mark: "monogram", placement: "above" } },
      { concept: "A steaming cup in a round badge, name in lowercase.", icon: "cup", shape: "emblem", monogram: "PA", wordmark: { weight: 500, letter_spacing_em: -0.01, case: "lower", mark: "icon", placement: "above" } },
    ],
    landing: {
      headline: "Great coffee before your train.",
      subheadline: "Specialty coffee ready in 90 seconds at the metro exit in Eixample, from 7:00.",
      bullets: ["Ready in 90 seconds, order ahead", "Beans roasted in Barcelona", "Open from 7:00, Monday to Saturday"],
      cta: "Pre-order for €2.50",
      offer: "First 300 opening-week flat whites at €2.50",
      offer_price: 2.5,
      normal_price: 3.2,
      price_hint_usd: 2.7,
      faq: [
        { q: "What do I get?", a: "One flat white during opening week, ready when you show the receipt." },
        { q: "When do you open?", a: "We open as soon as 30 pre-orders are in. We'll message you the date." },
        { q: "Can I get my money back?", a: "Yes. If we don't open, write to us and we send it back." },
      ],
      where_when: "Eixample, Monday to Saturday from 7:00",
    },
  },
  rae: {
    handle: "@pausa.bcn",
    posts: [
      [1, "instagram", "08:30", "post", "Something is brewing at the metro exit", "Doors will open at 7:00, before your train. Pre-order your first flat white for €2.50.", "Pre-order"],
      [3, "tiktok", "19:00", "reel", "Why we open at seven, not nine", "The 7 to 9 gap in 20 seconds, filmed at the exit.", "Follow for opening day"],
      [5, "instagram", "08:30", "story", "Flat white or cortado? Vote", "Help us pick the two drinks on the morning menu.", "Vote in the poll"],
      [6, "tiktok", "19:00", "reel", "Meet the beans roasted 6 km away", "Who roasts them, how they taste, why it matters at 7 am.", "Link in bio"],
      [8, "instagram", "07:00", "post", "Pop-up cart at the metro exit, Mon–Tue from 7:00", "Two drinks, 90 seconds, €3.20. Come taste it before we sign a lease.", "Come by from 7:00"],
      [10, "instagram", "07:30", "carousel", "90 seconds from order to cup", "We timed 50 orders at the pop-up cart. Here is how.", "Pre-order yours"],
      [11, "email", "08:00", "email", "Your pre-order is reserved", "Your €2.50 flat white is held for opening week. We'll email the date and what to show at the counter.", "Reply with a question"],
      [16, "linkedin", "09:00", "post", "What two mornings of 7 am coffee taught us", "Real numbers from the cart and what we changed.", "Read the numbers"],
      [19, "instagram", "08:30", "post", "Your first reviews, unedited", "What commuters said at the pop-up cart.", "Tag a friend who needs this"],
      [22, "tiktok", "19:00", "reel", "A morning behind the cart", "From 6:30 set-up to the 8:15 rush.", "Follow along"],
      [25, "instagram", "08:30", "story", "Ask us anything about Pausa", "Live Q&A on Instagram at 8:30.", "Send a question"],
      [26, "email", "08:00", "email", "Last week to pre-order at €2.50", "After Sunday the opening-week pre-order goes back to €3.20.", "Pre-order now"],
    ],
    first: [
      [1, "08:30", "Teaser", "Opening at 7:00 sharp", "Something is brewing at the metro exit. Doors will open at 7:00, before your train. Pre-order your first flat white for €2.50."],
      [3, "19:00", "Behind the scenes", "Why seven, not nine", "Most cafés here open at 8:30. Your train doesn't wait. That's why we'll open at 7:00. Follow for opening day."],
      [8, "07:00", "Pop-up test", "Pop-up cart, Mon–Tue from 7:00", "Find our cart at the metro exit on Monday and Tuesday from 7:00. Two drinks, 90 seconds, €3.20. Tell us what you think."],
    ],
  },
  memo: (r) => ({
    purpose: "A takeaway specialty coffee kiosk at a metro exit in Eixample, for commuters who want good coffee before 9:00.",
    problem: "Between 7:00 and 9:00 commuters pick between fast generic coffee and good coffee that opens too late. Queues at bakery counters make many skip it.",
    insight: "Almost no specialty café is open before 8:30, and commuters already pay €3 or more. A two-drink menu served in 90 seconds owns that window.",
    verdict_line: `Leo scores it ${r.leo?.score.toFixed(1) ?? "7.8"}/10: go, if you can reach about ${r.sam?.breakeven_units_per_day ?? 190} customers a day.`,
    next_7_days: ["Count footfall at two exits from 7:00 to 9:00", "Interview 20 commuters about their last coffee", "Book a pop-up cart for two mornings next week"],
  }),
};

// ---------------------------------------------------------------- dog-walking app, Madrid

const dog: Sample = {
  mia: {
    title: "Dog-walking service in Madrid",
    one_liner: "Reliable midday dog walks for busy Madrid professionals, booked in two taps.",
    brief: {
      concept: "A booking app and a small team of vetted walkers for 45-minute midday walks in Chamberí and Salamanca.",
      for: "Professionals aged 28 to 45 who work office hours and leave a dog alone from 9:00 to 18:00.",
      goal: "Get 25 paying owners and 3 reliable walkers in one neighbourhood within 4 weeks.",
    },
    market: { city: "Madrid", country_iso: "ES", currency: "€", language: "en" },
    checklist: [
      { week: 1, task: "Interview 15 dog owners in Chamberí", how: "Talk to owners in two parks at 8:00 and 20:00 about their last week.", done_when: "15 interviews logged, 6 or more pay for walks today", helped_by: "leo", est_hours: 5 },
      { week: 1, task: "Map the walkers owners use now", how: "Ask every owner who walks their dog and what they pay.", done_when: "A list of 10 current walkers with prices", helped_by: "leo", est_hours: 2 },
      { week: 1, task: "Recruit three walkers for a trial week", how: "Post in two local groups and meet each candidate in a park.", done_when: "Three walkers agreed to a paid trial", helped_by: null, est_hours: 4 },
      { week: 2, task: "Get a quote for walker liability insurance", how: "Ask two brokers for cover per walker and per dog.", done_when: "Two written quotes in hand", helped_by: "sam", est_hours: 2 },
      { week: 2, task: "Run 20 trial walks at €12", how: "Offer the first walk to interviewed owners and charge from the second.", done_when: "20 walks done, 8 or more paid", helped_by: "sam", est_hours: 6 },
      { week: 2, task: "Pick the name and print 100 flyers", how: "Choose one of Nova's names and print flyers for two vets and a pet shop.", done_when: "Flyers placed in three shops", helped_by: "nova", est_hours: 3 },
      { week: 3, task: "Share the booking page with 60 owners", how: "Send it to every owner you met and to the neighbourhood groups.", done_when: "60 owners received the link", helped_by: "pip", est_hours: 2 },
      { week: 3, task: "Post the first three launch posts", how: "Publish walk photos on the planned days with owner permission.", done_when: "Three posts live, every message answered", helped_by: "rae", est_hours: 3 },
      { week: 4, task: "Sell 25 first-walk pre-orders", how: "Follow up personally with owners who opened the page.", done_when: "25 pre-orders paid on-chain", helped_by: "pip", est_hours: 5 },
      { week: 4, task: "Decide on one neighbourhood or two", how: "Compare repeat bookings and walker hours with break-even.", done_when: "Decision written down with the numbers", helped_by: "sam", est_hours: 2 },
    ],
  },
  leo: {
    score: 6.1,
    verdict: "pivot",
    headline: "Crowded city-wide, open in one neighbourhood.",
    summary: "Owners pay for walks today, but large pet-sitting platforms already cover Madrid. A dense, trusted service in one neighbourhood is easier to win than a city-wide app.",
    signals: [
      { name: "Demand", score: 7.4, why: "Many owners leave dogs alone through office hours", source_id: null },
      { name: "Competition gap", score: 4.2, why: "Big platforms and local walkers already cover the city", source_id: null },
      { name: "Price acceptance", score: 6.8, why: "€10 to €15 a walk is common in central Madrid", source_id: null },
      { name: "Channel", score: 6.5, why: "Parks, vets and pet shops reach owners cheaply", source_id: null },
      { name: "Timing", score: 5.8, why: "Hybrid work lowers weekday demand on some days", source_id: null },
    ],
    why_go: "Owners already pay for walks and trust is local: a reliable team in one neighbourhood can win repeat weekly bookings.",
    risks: [
      { risk: "Large platforms already list hundreds of walkers.", mitigation: "Compete on one neighbourhood with the same walker every day.", severity: "high" },
      { risk: "Walker no-shows break trust fast.", mitigation: "Keep a back-up walker on call during the trial week.", severity: "high" },
      { risk: "Hybrid work cuts Monday and Friday demand.", mitigation: "Sell weekly plans for the days owners are in the office.", severity: "med" },
    ],
    pivot: { idea: "Group midday walks for one neighbourhood, sold as a monthly plan.", why: "Group walks lower the price per dog and a fixed weekly route builds the trust platforms lack." },
    next_step: "Interview 15 owners in two Chamberí parks this week and count how many pay for walks today.",
    market_facts: [
      fact("Central Madrid dog walks commonly cost €10 to €15 for 30 to 60 minutes."),
      fact("Most owners in office jobs leave their dog alone for 7 to 9 hours."),
      fact("A walker can manage 3 to 4 dogs per group walk in a park."),
    ],
    competitors: [
      { name: "Global pet-sitting apps", note: "Huge choice, a new walker each time", price: 6, differentiation: 5, url: null },
      { name: "Independent local walkers", note: "Trusted, but hard to find and book", price: 5, differentiation: 6.5, url: null },
      { name: "Dog daycare centres", note: "Full day, expensive, far from home", price: 8.5, differentiation: 7, url: null },
      { name: "Neighbours and family", note: "Free, but unreliable", price: 1, differentiation: 2, url: null },
    ],
    you: { price: 5.5, differentiation: 8 },
    interviews: {
      who: "Dog owners who work office hours in Chamberí and Salamanca",
      where: "Two parks at 8:00 and 20:00, and outside two vets",
      questions: [
        "Who walked your dog last Tuesday at midday?",
        "How did you find them?",
        "What did you pay for the last walk?",
        "What went wrong the last time a walk was missed?",
        "How do you book a walk today?",
      ],
      good_sign: "They already pay someone and can name a time it went wrong.",
      target: 15,
    },
  },
  sam: {
    currency: "€",
    canvas: {
      customer: "Office workers with one dog in Chamberí",
      value: "The same trusted walker every weekday at midday",
      revenue: "Single walks at €12, weekly plans at €55",
      channels: "Parks, vets, pet shops and owner referrals",
      costs: "Walker pay per walk, insurance, booking app",
      unit_economics: "Each walk leaves about €4.40 after walker pay",
    },
    assumptions: [
      est("customers_per_day_m1", "Walks per day, month 1", 12, "per day", "Trial owners from interviews"),
      est("customers_per_day_m12", "Walks per day, month 12", 70, "per day", "Three walkers, four group walks each"),
      est("avg_ticket", "Average price per walk", 12.5, "€", "Mix of single walks and weekly plans"),
      est("gross_margin_pct", "Margin after walker pay", 35, "%", "Walkers paid about €8 per walk"),
      est("fixed_costs_month", "Fixed costs per month", 2900, "€", "Insurance, app, part-time coordinator, ads"),
      est("startup_cost", "Start-up cost", 6500, "€", "Insurance set-up, gear, app set-up, legal"),
      est("open_days_month", "Walking days per month", 22, "days", "Weekdays only"),
    ],
    fixed_costs_breakdown: [
      { label: "Part-time coordinator", value: 2000 },
      { label: "Local ads and flyers", value: 500 },
      { label: "Liability insurance", value: 250 },
      { label: "Booking app", value: 150 },
    ],
    price_note: "Single walk €12, average €12.50",
    startup_note: "Insurance, gear, app set-up, legal",
    main_risk: "Margin depends on group walks: if most owners want solo walks, test a €15 solo price in week two.",
  },
  nova: {
    names: [
      {
        name: "Paseo",
        why: "The everyday Spanish word for a walk, warm and easy to say.",
        tagline: "Same walker, every weekday.",
        palette: [
          { name: "Primary", hex: "#1F3A2E" },
          { name: "Accent", hex: "#E07A3F" },
          { name: "Background", hex: "#F5F1E8" },
          { name: "Extra", hex: "#8FB39A" },
        ],
      },
      {
        name: "Correa",
        why: "The leash: simple, concrete, local.",
        tagline: "Midday walks, sorted.",
        palette: [
          { name: "Primary", hex: "#22304A" },
          { name: "Accent", hex: "#F2B441" },
          { name: "Background", hex: "#F4F4EF" },
          { name: "Extra", hex: "#7A8FB0" },
        ],
      },
      {
        name: "Mediodía",
        why: "Names the moment owners worry about most.",
        tagline: "Your dog's favourite hour.",
        palette: [
          { name: "Primary", hex: "#3A2A1F" },
          { name: "Accent", hex: "#4F9D8A" },
          { name: "Background", hex: "#FAF5EC" },
          { name: "Extra", hex: "#D8A06A" },
        ],
      },
    ],
    chosen: 0,
    typography: { display: "Bricolage Grotesque", body: "Inter" },
    voice: {
      traits: ["Friendly", "Reliable", "Local", "Plain"],
      rules: "Write like the walker texting the owner: who, when, how it went.",
      sample: "Luna walked 45 minutes in Parque del Oeste. Happy and tired.",
    },
  },
  dex: {
    logos: [
      { concept: "The name in a rounded grotesque with a paw to the left.", icon: "paw", shape: "wordmark", monogram: "P", wordmark: { weight: 700, letter_spacing_em: -0.03, case: "lower", mark: "icon", placement: "left" } },
      { concept: "A P monogram in a soft square, like a tag on a collar.", icon: "paw", shape: "monogram", monogram: "P", wordmark: { weight: 600, letter_spacing_em: 0.02, case: "title", mark: "monogram", placement: "left" } },
      { concept: "A paw inside a round badge, name below.", icon: "paw", shape: "emblem", monogram: "PS", wordmark: { weight: 600, letter_spacing_em: 0.08, case: "upper", mark: "icon", placement: "above" } },
    ],
    landing: {
      headline: "A happy dog while you work.",
      subheadline: "45-minute midday walks in Chamberí with the same vetted walker every weekday.",
      bullets: ["Same walker every day", "Photo and route after each walk", "Book or cancel in two taps"],
      cta: "Pre-order for €9",
      offer: "First walk €9 for the first 50 owners",
      offer_price: 9,
      normal_price: 12,
      price_hint_usd: 9.7,
      faq: [
        { q: "Who walks my dog?", a: "One of three walkers we met in person, insured, and the same one every week." },
        { q: "Which areas do you cover?", a: "Chamberí first. Salamanca opens once we have 25 regular owners." },
        { q: "What if I need to cancel?", a: "Cancel until 9:00 the same day at no cost." },
      ],
      where_when: "Chamberí, weekdays from 12:00 to 15:00",
    },
  },
  rae: {
    handle: "@paseo.mad",
    posts: [
      [1, "instagram", "13:00", "post", "Midday walks are coming to Chamberí", "Same walker, every weekday. First walk €9 for the first 50 owners.", "Pre-order"],
      [3, "instagram", "20:00", "story", "Who walks your dog at noon? Vote", "Neighbour, app, nobody? Tell us.", "Vote in the poll"],
      [5, "tiktok", "20:00", "reel", "A 45-minute walk in 15 seconds", "Route, water stop, happy dog.", "Follow for launch"],
      [7, "instagram", "13:00", "carousel", "Meet the three walkers", "Who they are, how we chose them, their own dogs.", "Say hi"],
      [9, "email", "08:00", "email", "Your first walk is booked", "What to leave out, how keys work, when the photo arrives.", "Confirm your slot"],
      [12, "instagram", "13:00", "post", "Week one: 40 walks, 0 missed", "Every walk on time, with a photo and route.", "Book a walk"],
      [15, "tiktok", "20:00", "reel", "What your dog does while you're in a meeting", "A day in Parque del Oeste.", "Book yours"],
      [18, "linkedin", "09:00", "post", "Why we started with one neighbourhood", "Trust is local. Numbers from our first two weeks.", "Read more"],
      [21, "instagram", "13:00", "post", "Owners say it better", "Three messages from week two, unedited.", "Tag a dog owner"],
      [25, "email", "08:00", "email", "Weekly plans now open", "Five walks a week for €55.", "Choose your days"],
      [28, "instagram", "20:00", "story", "Last week of the €9 first walk", "After Sunday the first walk is €12.", "Pre-order now"],
    ],
    first: [
      [1, "13:00", "Teaser", "Midday walks, Chamberí", "Midday walks are coming to Chamberí. Same walker, every weekday. First walk €9 for the first 50 owners."],
      [7, "13:00", "Behind the scenes", "Meet the three walkers", "We met every walker in a park with their own dog first. Here's who will walk yours."],
      [12, "13:00", "Launch week", "40 walks, none missed", "Week one: every walk on time, with a photo and the route. Book yours before the €9 offer ends."],
    ],
  },
  memo: (r) => ({
    purpose: "Midday dog walks with the same trusted walker, for office workers in one Madrid neighbourhood.",
    problem: "Owners who work office hours leave dogs alone for up to nine hours. Big apps give them a new stranger each time, and good local walkers are hard to book.",
    insight: "Trust is local. One neighbourhood, three walkers and the same face every weekday beats a city-wide marketplace on reliability.",
    verdict_line: `Leo scores it ${r.leo?.score.toFixed(1) ?? "6.1"}/10: pivot first. Start with group walks in Chamberí before building an app.`,
    next_7_days: ["Interview 15 owners in two Chamberí parks", "Recruit three walkers for a paid trial week", "Ask two brokers for walker insurance quotes"],
  }),
};

// ---------------------------------------------------------------- vintage road bikes, online

const bikes: Sample = {
  mia: {
    title: "Restored vintage road bikes online",
    one_liner: "Restored 1970s to 1990s road bikes, ready to ride, shipped across Spain.",
    brief: {
      concept: "An online shop selling 4 to 8 restored steel road bikes a month from a small workshop.",
      for: "Riders aged 30 to 55 who want a classic steel bike without restoring it themselves.",
      goal: "Restore 5 bikes and take 3 paid pre-orders within 4 weeks.",
    },
    market: { city: null, country_iso: "ES", currency: "€", language: "en" },
    checklist: [
      { week: 1, task: "Buy three donor bikes under €120 each", how: "Search second-hand listings and inspect frames in person.", done_when: "Three frames bought for €360 or less", helped_by: null, est_hours: 6 },
      { week: 1, task: "Interview 10 riders who bought a used bike", how: "Ask in two cycling clubs what they bought last and what went wrong.", done_when: "10 interviews logged", helped_by: "leo", est_hours: 4 },
      { week: 1, task: "Price 20 sold vintage bikes", how: "Note final prices of sold listings, not asking prices.", done_when: "A table of 20 sale prices", helped_by: "sam", est_hours: 3 },
      { week: 2, task: "Restore the first bike and time it", how: "Log every hour and every part you buy.", done_when: "One bike ready with hours and parts cost written down", helped_by: "sam", est_hours: 12 },
      { week: 2, task: "Photograph the bike in daylight", how: "Twelve photos: both sides, groupset, frame number, details.", done_when: "Twelve photos ready to publish", helped_by: "nova", est_hours: 2 },
      { week: 2, task: "Get two shipping quotes for a boxed bike", how: "Ask two couriers for door-to-door prices within Spain.", done_when: "Two written quotes in hand", helped_by: null, est_hours: 1 },
      { week: 3, task: "Share the pre-order page in two clubs", how: "Post the restored bike with its story and price.", done_when: "Page shared in two clubs and with interviewees", helped_by: "pip", est_hours: 2 },
      { week: 3, task: "Publish the first three launch posts", how: "Show the before and after of bike one.", done_when: "Three posts live, every question answered", helped_by: "rae", est_hours: 3 },
      { week: 4, task: "Take three paid pre-orders", how: "Offer the next three restorations at the launch price.", done_when: "Three pre-orders paid on-chain", helped_by: "pip", est_hours: 4 },
      { week: 4, task: "Decide on workshop space", how: "Compare hours per bike and margins with break-even.", done_when: "Decision written down with the numbers", helped_by: "sam", est_hours: 2 },
    ],
  },
  leo: {
    score: 7.1,
    verdict: "go",
    headline: "Sell the restoration, not just the bike.",
    summary: "Demand for classic steel bikes is steady and buyers fear hidden faults in private listings. A shop that shows every restoration step can charge a premium.",
    signals: [
      { name: "Demand", score: 6.9, why: "Steady interest in classic steel road bikes", source_id: null },
      { name: "Competition gap", score: 7.0, why: "Private listings rarely document the restoration", source_id: null },
      { name: "Price acceptance", score: 7.3, why: "Restored bikes sell for well above donor prices", source_id: null },
      { name: "Channel", score: 7.5, why: "Clubs and social video reach riders cheaply", source_id: null },
      { name: "Timing", score: 6.6, why: "Spring is peak season, winter is slow", source_id: null },
    ],
    why_go: "Riders pay for certainty: a documented restoration and a guarantee turn a risky used purchase into an easy one.",
    risks: [
      { risk: "Restoration hours eat the margin.", mitigation: "Time the first bike and cap labour at 10 hours per bike.", severity: "high" },
      { risk: "Shipping can damage bikes.", mitigation: "Get two courier quotes and test one boxed delivery.", severity: "med" },
      { risk: "Sales slow down in winter.", mitigation: "Offer restoration of customers' own bikes from November.", severity: "low" },
    ],
    pivot: null,
    next_step: "Restore one bike this week, log every hour and part, and price it from 20 recent sales.",
    market_facts: [
      fact("Unrestored steel road frames often sell second-hand for under €150."),
      fact("Fully restored classic road bikes commonly sell for €350 to €700."),
      fact("A full restoration takes an experienced mechanic about 8 to 12 hours."),
    ],
    competitors: [
      { name: "Private second-hand listings", note: "Cheap, but faults are hidden", price: 2.5, differentiation: 2, url: null },
      { name: "Local bike workshops", note: "Skilled, rarely sell restored bikes", price: 6, differentiation: 6, url: null },
      { name: "Collector auctions", note: "Rare frames, collector prices", price: 9, differentiation: 7.5, url: null },
      { name: "New entry-level road bikes", note: "Reliable, but no character", price: 5, differentiation: 3, url: null },
    ],
    you: { price: 5.5, differentiation: 8 },
    interviews: {
      who: "Riders who bought a used road bike in the last two years",
      where: "Two cycling clubs and a Sunday group ride",
      questions: [
        "Tell me about the last used bike you bought.",
        "Where did you find it?",
        "What did you pay, and what did you spend after?",
        "What went wrong in the first month?",
        "How did you check it before paying?",
      ],
      good_sign: "They spent money on repairs after buying and say they'd pay to avoid it.",
      target: 10,
    },
  },
  sam: {
    currency: "€",
    canvas: {
      customer: "Riders aged 30 to 55 across Spain",
      value: "A classic steel bike, restored, guaranteed, ready to ride",
      revenue: "Restored bikes at about €450, restoration service later",
      channels: "Own shop page, cycling clubs, short videos",
      costs: "Donor bikes, parts, workshop, shipping",
      unit_economics: "Each bike leaves about €190 after donor and parts",
    },
    assumptions: [
      est("customers_per_day_m1", "Bikes sold per day, month 1", 0.15, "per day", "About one bike a week at launch"),
      est("customers_per_day_m12", "Bikes sold per day, month 12", 0.9, "per day", "About 27 bikes a month with a helper"),
      est("avg_ticket", "Average sale price", 450, "€", "Middle of recent sale prices for restored bikes"),
      est("gross_margin_pct", "Margin after donor and parts", 42, "%", "Donor €120, parts and tyres about €140"),
      est("fixed_costs_month", "Fixed costs per month", 2600, "€", "Workshop, tools, photos, ads, fees"),
      est("startup_cost", "Start-up cost", 14000, "€", "First 20 donor bikes, tools, shop set-up"),
      est("open_days_month", "Selling days per month", 30, "days", "Online, every day"),
    ],
    fixed_costs_breakdown: [
      { label: "Workshop rent", value: 900 },
      { label: "Ads and photography", value: 900 },
      { label: "Platform and payment fees", value: 500 },
      { label: "Tools and consumables", value: 300 },
    ],
    price_note: "Restored road bike, average €450",
    startup_note: "20 donor bikes, tools, shop set-up",
    main_risk: "Margin depends on hours per bike: time the first restoration before buying more donors.",
  },
  nova: {
    names: [
      {
        name: "Acero",
        why: "Steel in Spanish: the material these bikes are loved for.",
        tagline: "Classic steel, ready to ride.",
        palette: [
          { name: "Primary", hex: "#1C2433" },
          { name: "Accent", hex: "#C2412D" },
          { name: "Background", hex: "#F2EEE6" },
          { name: "Extra", hex: "#8A9A86" },
        ],
      },
      {
        name: "Rueda Lenta",
        why: "Slow wheel: riding for pleasure, not for watts.",
        tagline: "Bikes with a past.",
        palette: [
          { name: "Primary", hex: "#2A2A28" },
          { name: "Accent", hex: "#2F6F8F" },
          { name: "Background", hex: "#F6F2EA" },
          { name: "Extra", hex: "#D9B26A" },
        ],
      },
      {
        name: "Lugged",
        why: "Names the craft detail fans look for in a frame.",
        tagline: "Restored by hand.",
        palette: [
          { name: "Primary", hex: "#20282A" },
          { name: "Accent", hex: "#B8862F" },
          { name: "Background", hex: "#F4F1EC" },
          { name: "Extra", hex: "#6F7F8A" },
        ],
      },
    ],
    chosen: 0,
    typography: { display: "Space Grotesk", body: "IBM Plex Sans" },
    voice: {
      traits: ["Precise", "Honest", "Nerdy", "Calm"],
      rules: "Write like a mechanic's notebook: part names, hours, what we fixed.",
      sample: "1987 frame, new bearings, 11 hours. Rides like it's new.",
    },
  },
  dex: {
    logos: [
      { concept: "The name in a firm grotesque with a small bike mark to the left.", icon: "bike", shape: "wordmark", monogram: "A", wordmark: { weight: 700, letter_spacing_em: 0.04, case: "upper", mark: "icon", placement: "left" } },
      { concept: "An A monogram like a head badge on a frame.", icon: "bike", shape: "monogram", monogram: "A", wordmark: { weight: 600, letter_spacing_em: 0.1, case: "upper", mark: "monogram", placement: "above" } },
      { concept: "A bike inside a round badge, name below.", icon: "bike", shape: "emblem", monogram: "AC", wordmark: { weight: 500, letter_spacing_em: -0.01, case: "title", mark: "icon", placement: "above" } },
    ],
    landing: {
      headline: "A classic bike, without the gamble.",
      subheadline: "Restored 1970s to 1990s steel road bikes, every step documented, shipped across Spain.",
      bullets: ["Every restoration photographed", "Six-month guarantee on parts", "Shipped boxed, ready in 10 minutes"],
      cta: "Pre-order for €395",
      offer: "Next three restorations at €395",
      offer_price: 395,
      normal_price: 450,
      price_hint_usd: 425,
      faq: [
        { q: "Can I choose my size?", a: "Yes. Tell us your height when you pre-order and we pick a matching frame." },
        { q: "How long does it take?", a: "About two weeks from pre-order to shipping." },
        { q: "What if it doesn't fit?", a: "Send it back within 14 days and we refund you." },
      ],
      where_when: null,
    },
  },
  rae: {
    handle: "@acero.bikes",
    posts: [
      [1, "instagram", "19:00", "carousel", "From €110 frame to ready to ride", "Before and after of bike one, with the hours it took.", "Pre-order the next one"],
      [3, "tiktok", "19:30", "reel", "11 hours in 30 seconds", "A full restoration, sped up.", "Follow the build"],
      [5, "instagram", "19:00", "story", "Which frame should we restore next?", "Three donors, you choose.", "Vote in the poll"],
      [8, "linkedin", "09:00", "post", "What a restored bike really costs", "Donor, parts, hours. Every euro.", "Read the numbers"],
      [10, "instagram", "19:00", "post", "Bike two: 1989 lugged steel", "Size 56, Shimano groupset, new tyres.", "Pre-order"],
      [13, "email", "09:00", "email", "Your bike is on the stand", "Photos from day one of your restoration.", "See the photos"],
      [16, "tiktok", "19:30", "reel", "How we box a bike so it arrives safe", "The packing, step by step.", "Follow along"],
      [20, "instagram", "19:00", "post", "First delivery, first ride", "A customer's first ride, shared with permission.", "Tag a rider"],
      [24, "x", "18:00", "post", "Three restoration mistakes we made", "And what we changed.", "Read the thread"],
      [28, "email", "09:00", "email", "Last launch slot at €395", "After this one the price is €450.", "Pre-order now"],
    ],
    first: [
      [1, "19:00", "Before and after", "From €110 frame to ride", "Bike one: a 1985 steel frame bought for €110. Eleven hours later, ready to ride. Pre-order the next restoration for €395."],
      [3, "19:30", "Behind the scenes", "11 hours in 30 seconds", "Every bearing, cable and tyre, sped up. This is what you get when you buy a bike from us."],
      [10, "19:00", "Launch", "Bike two is ready", "1989 lugged steel, size 56, new tyres and bearings. Three launch slots at €395."],
    ],
  },
  memo: (r) => ({
    purpose: "An online shop for restored classic steel road bikes, for riders who want character without the risk.",
    problem: "Used bikes from private listings often hide faults that cost money in the first month. Riders who love classic frames rarely have time to restore one.",
    insight: "Buyers pay for certainty. Showing every hour and part of each restoration makes a used bike feel as safe as a new one.",
    verdict_line: `Leo scores it ${r.leo?.score.toFixed(1) ?? "7.1"}/10: go, if a restoration stays under about 10 hours.`,
    next_7_days: ["Buy three donor bikes under €120 each", "Price 20 recently sold vintage bikes", "Interview 10 riders who bought a used bike"],
  }),
};

const SAMPLES: Record<SampleKey, Sample> = { coffee, dog, bikes };

/** R9: the sample closest to the idea text (chip sentences, or anything mentioning the same words). */
export function sampleKey(idea?: string): SampleKey {
  const t = (idea ?? "").toLowerCase();
  if (/\b(dog|dogs|walk|walker|walking|perro|paseo|pet)\b/.test(t)) return "dog";
  if (/\b(bike|bikes|bicycle|cycling|bici|vintage)\b/.test(t)) return "bikes";
  return "coffee";
}

function raeOf(s: Sample): RaeLaunch {
  // Posts start on the next Monday, so no sample business posts on a day it is closed (Mon–Sat kiosk).
  const start = new Date(Date.now() + 86_400_000);
  start.setUTCDate(start.getUTCDate() + ((8 - start.getUTCDay()) % 7));
  const startIso = start.toISOString().slice(0, 10);
  const at = (day: number, time: string) => `${new Date(start.getTime() + (day - 1) * 86_400_000).toISOString().slice(0, 10)}T${time}`;
  const chanOf = (day: number) => s.rae.posts.find((p) => p[0] === day)?.[1] ?? "instagram";
  return {
    start_date: startIso,
    handle: s.rae.handle,
    posts: s.rae.posts.map(([day, channel, time, format, hook, caption, cta]) => ({ day, channel, time, format, hook, caption, cta })),
    first_posts: s.rae.first.map(([day, time, kind, title, text]) => ({ kind, title, text, date: at(day, time), channel: chanOf(day) })),
  };
}

const MOCKS: { [K in AiDept]: (s: Sample) => ModelOut[K] } = {
  mia: (s) => s.mia,
  leo: (s) => s.leo,
  sam: (s) => s.sam,
  nova: (s) => s.nova,
  dex: (s) => s.dex,
  rae: raeOf,
};

/**
 * A fresh deep copy of the mock model answer (pre-sanitize shape, ModelOut) for one department, from the
 * sample closest to `idea`. runDept() passes it through sanitize() like a real answer.
 */
export function mockFor<K extends AiDept>(dept: K, idea?: string): ModelOut[K] {
  return structuredClone(MOCKS[dept](SAMPLES[sampleKey(idea)])) as ModelOut[K];
}

/** R7: the sample memo, quoting the (already derived) numbers in `prior`. */
export function mockMemo(idea: string | undefined, prior: DeptResults): Memo {
  return SAMPLES[sampleKey(idea)].memo(prior);
}

/**
 * F2: the free example pack (id `example`, slug `pausa`, read-only). Built from the coffee sample with the same
 * derivation as a real run. Payments are marked "dev-" (= not charged), so the receipt says "Not charged".
 */
export function exampleProject(now = Date.now()): Project {
  const s = coffee;
  const sam = deriveSam(structuredClone(s.sam));
  const leo = { ...structuredClone(s.leo), sources: [] };
  const results: DeptResults = {
    mia: structuredClone(s.mia),
    leo,
    sam,
    nova: structuredClone(s.nova),
    dex: structuredClone(s.dex),
    rae: raeOf(s),
    pip: { slug: "pausa", url: "/s/pausa", live_at: new Date(now - 60_000).toISOString() },
  };
  results.memo = s.memo(results);
  const t0 = now - 5 * 60_000;
  return {
    id: "example",
    idea: MOCK_IDEA,
    created_at: t0,
    payments: {
      validate: { txid: "dev-example-validate", sats: 0, cents: 10, at: t0 + 5_000 },
      build: { txid: "dev-example-build", sats: 0, cents: 20, at: t0 + 60_000 },
    },
    status: { mia: "done", leo: "done", sam: "done", nova: "done", dex: "done", rae: "done", pip: "done" },
    results,
    timings: { validate: { started: t0 + 5_000, finished: t0 + 21_000 }, build: { started: t0 + 60_000, finished: t0 + 78_000 } },
    models: { mia: "mock", leo: "mock", sam: "mock", nova: "mock", dex: "mock", rae: "mock", pip: "none" },
    share_id: null,
    example: true,
  };
}

/** F2 seed (contracts-v4 §2). Rae's dates are relative to server start. */
export const EXAMPLE_PROJECT: Project = exampleProject();
