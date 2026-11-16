// Sample answers used when the AI runs in MOCK mode (local development, the hackathon demo, no API cost). Owner: WS-C.
// R9: complete samples keyed by idea. mockFor(dept, idea) picks the closest sample; the three home chips
// (config.sampleIdeas) map to coffee, dog and bikes; "bread" seeds the prototype's "Your projects" shelf.
// Honesty: no sources, no URLs, no named real businesses, no testimonials; every figure is an estimate and says so.
// v6 gold standard: Leo's score = weighted signals, Sam's breakdown adds up, the launch offer leaves money, Rae
// never reports a result before the plan gets there, and every derived number is quoted from deriveSam(), not typed.
import { deriveSam, type DeptResults, type DexDesign, type Memo, type MiaPlan, type NovaBrand, type Project, type RaeLaunch, type SamAssumptionKey } from "./types.js";
import type { AiDept, DexV6, LeoDraft, MiaV6, ModelOut, NovaV6, SamDraftV6 } from "./ai.js";

export const MOCK_IDEA = "A specialty coffee kiosk at a Barcelona metro exit, €3 flat whites for commuters";

export type SampleKey = "coffee" | "dog" | "bikes" | "bread" | "saas";
type PostSeed = [day: number, channel: RaeLaunch["posts"][number]["channel"], time: string, format: RaeLaunch["posts"][number]["format"], hook: string, caption: string, cta: string];
type Sample = {
  idea: string;
  mia: MiaPlan & MiaV6;
  leo: LeoDraft;
  sam: SamDraftV6;
  nova: NovaBrand & NovaV6;
  dex: Omit<DexDesign, "logos"> & DexV6;
  rae: { handle: string; posts: PostSeed[]; first: Array<[day: number, time: string, kind: string, title: string, text: string]> };
  memo: (r: DeptResults) => Memo;
};

const est = (key: SamAssumptionKey, label: string, value: number, unit: string, basis: string) => ({ key, label, value, unit, basis, is_estimate: true });
const fact = (f: string) => ({ fact: f, source_id: null, is_estimate: true });
const sig = (name: LeoDraft["signals"][number]["name"], score: number, why: string) => ({ name, score, why, source_id: null });
/** Derived numbers quoted in prose come from the model, never typed by hand. */
const be = (r: DeptResults, fb: number) => r.sam?.breakeven_units_per_day ?? fb;
const m12 = (r: DeptResults, fb: number) => r.sam?.assumptions.find((a) => a.key === "customers_per_day_m12")?.value ?? fb;
const beMonth = (r: DeptResults, fb: number) => Math.ceil(be(r, fb / 30) * 30);

// ---------------------------------------------------------------- coffee kiosk, Barcelona (the example run: Pausa)

const coffee: Sample = {
  idea: MOCK_IDEA,
  mia: {
    title: "Specialty coffee kiosk in Barcelona",
    one_liner: "Specialty coffee at the metro exit, open from 7:00.",
    brief: {
      concept: "A 12 m² takeaway-only specialty coffee kiosk at a busy Eixample metro exit, two-drink morning menu, €3 flat whites.",
      for: "Office commuters aged 25 to 45 who buy coffee on the way in and leave queues that take over 3 minutes.",
      goal: "Prove the pace with a pop-up cart selling 110+ cups a morning, and intent with 100 paid pre-orders, before any lease.",
    },
    market: { city: "Barcelona", country_iso: "ES", currency: "€", language: "en" },
    gate: { metric: "paid pre-orders", target: 100, by_week: 4 },
    checklist: [
      { week: 1, task: "Count 7:00–9:00 footfall at two metro exits", how: "Stand at each exit on Tuesday and Thursday and tally everyone leaving, in 15-minute blocks.", done_when: "Four 2-hour counts logged; busiest exit chosen", helped_by: null, est_hours: 8 },
      { week: 1, task: "Interview 20 commuters about yesterday's coffee", how: "Ask where they bought it, what it cost and what annoyed them; never ask if they would buy.", done_when: "20 logged; 8+ bought coffee on the way in", helped_by: "leo", est_hours: 5 },
      { week: 1, task: "Shortlist three kiosks or shopfronts under 15 m²", how: "Walk 300 m around the chosen exit and call every listing for rent, licence and term.", done_when: "Three options with rent, licence and earliest start", helped_by: "sam", est_hours: 4 },
      { week: 2, task: "Run a two-morning pop-up cart at the exit", how: "Rent a cart and machine for two days and sell flat whites at €3.00 from 7:00 to 9:30.", done_when: "110+ cups each morning; median wait under 2 minutes", helped_by: "sam", est_hours: 10 },
      { week: 2, task: "Get two espresso machine lease quotes", how: "Ask two local suppliers for a 24-month lease including service and grinder.", done_when: "Two written quotes, both under €700 a month", helped_by: "sam", est_hours: 2 },
      { week: 2, task: "Choose the name and print 200 cup sleeves", how: "Pick one of Nova's three names after asking ten cart customers which they remember.", done_when: "Name chosen; sleeves ordered", helped_by: "nova", est_hours: 2 },
      { week: 3, task: "Send the pre-order page to every contact", how: "Message all interviewees, cart customers and two neighbourhood groups with the €2.40 offer.", done_when: "Page sent to 150+ people", helped_by: "pip", est_hours: 3 },
      { week: 3, task: "Post the pre-order launch on Instagram and email", how: "Publish Rae's week-3 posts and reply to every comment within the hour.", done_when: "Offer posted; every comment answered", helped_by: "rae", est_hours: 3 },
      { week: 4, task: "Reach 100 paid pre-orders", how: "Hand cards at the exit 7:30–9:00 for three mornings and follow up anyone who opened the page.", done_when: "100 pre-orders paid on-chain", helped_by: "pip", est_hours: 8 },
      { week: 4, task: "Decide: sign a lease or stop", how: "Compare cart sales and pre-orders with Sam's break-even line and Leo's kill criteria.", done_when: "Decision written down with the numbers", helped_by: "sam", est_hours: 2 },
    ],
  },
  leo: {
    score: 7.3,
    verdict: "go",
    headline: "Own the 7–9 am gap before cafés open.",
    summary: "Commuters already pay about €3 for coffee, but most specialty cafés nearby open after 8:30. It works if one kiosk can serve a flat white in under two minutes.",
    signals: [
      sig("Demand", 7.5, "Thousands leave a central exit every weekday morning"),
      sig("Competition gap", 7.4, "Specialty options mostly open after 8:30"),
      sig("Price acceptance", 7.5, "Commuters already pay €2.50–€3.50 for worse coffee"),
      sig("Channel", 6.4, "The street sells; social reach is unproven"),
      sig("Timing", 7.2, "Office attendance steady midweek, weaker Mondays and Fridays"),
    ],
    why_go: "The demand walks past the door every morning, the price is already accepted, and the best competitors are closed at the moment that matters.",
    risks: [
      { risk: "Rent beside a metro exit can eat the margin.", mitigation: "Cap rent at €3,800; a 12 m² takeaway counter, no seating.", severity: "high" },
      { risk: "Queues over 3 minutes break the habit.", mitigation: "Two-drink menu; time 50 orders at the pop-up cart.", severity: "high" },
      { risk: "Most commuters have never paid in Bitcoin Cash.", mitigation: "QR on the cart and the sleeve; count reservations and payments separately.", severity: "med" },
    ],
    pivot: null,
    next_step: "Run a two-morning pop-up cart at the busier exit: 110 cups a morning at €3.00 is the bar.",
    market_facts: [
      fact("A central Eixample metro exit typically sees several thousand people leave between 7:00 and 9:00."),
      fact("Specialty flat whites in central Barcelona usually cost €2.80 to €3.80."),
      fact("Most nearby specialty cafés open between 8:00 and 9:00, after the commuter peak."),
      fact("One barista on a two-group machine can serve roughly 60 drinks an hour."),
      fact("Takeaway kiosks near busy exits usually rent for €2,500 to €4,500 a month."),
    ],
    competitors: [
      { name: "Station chain cafés", note: "Fast, but generic coffee", price: 5, differentiation: 2.5, url: null },
      { name: "Third-wave cafés in Eixample", note: "Great coffee, open after 8:30", price: 7.5, differentiation: 8.5, url: null },
      { name: "Bakery counters", note: "Cheap, average coffee, long queues", price: 3, differentiation: 3.5, url: null },
      { name: "Supermarket grab-and-go", note: "Cheapest, no fresh espresso", price: 1.5, differentiation: 1, url: null },
      { name: "Office coffee machine", note: "Free, but nobody looks forward to it", price: 0.5, differentiation: 0.5, url: null },
    ],
    you: { price: 5.5, differentiation: 8 },
    interviews: {
      who: "Commuters leaving the busiest exit between 7:00 and 9:00",
      where: "At the exit itself and in two nearby co-working lobbies",
      questions: [
        "Where did you get coffee yesterday morning, if anywhere?",
        "What did it cost?",
        "How long did you wait for it?",
        "When did you last skip coffee because of a queue?",
        "What did you have instead?",
      ],
      good_sign: "They name a place and a price instantly, and have skipped coffee because of a queue this month.",
      target: 20,
    },
    kill_criteria: [
      "Stop if fewer than 8 of 20 commuters bought coffee on the way in yesterday.",
      "Stop if the cart sells under 95 cups a morning, half the break-even pace.",
      "Stop if no kiosk near the exit rents for under €4,500 a month.",
    ],
  },
  sam: {
    currency: "€",
    canvas: {
      customer: "Office commuters at one Eixample metro exit, 7:00 to 10:00",
      value: "Specialty flat white in under two minutes, before cafés open",
      revenue: "Flat whites at €3.00; a pastry with one sale in five",
      channels: "The exit itself, pre-orders, a loyalty stamp card",
      costs: "Rent, founder and one barista, machine lease, beans and milk",
      unit_economics: "Each sale leaves about €2.38 after beans, milk and cup",
    },
    assumptions: [
      est("customers_per_day_m1", "Sales a day, month 1", 90, "per day", "New kiosk, no word of mouth yet"),
      est("customers_per_day_m12", "Sales a day, month 12", 300, "per day", "Two at the bar: ~120 an hour at peak"),
      est("avg_ticket", "Average ticket", 3.4, "€", "€3.00 flat white plus some pastries"),
      est("gross_margin_pct", "Gross margin", 70, "%", "Typical after beans, milk, cups, card fees"),
      est("fixed_costs_month", "Fixed costs a month", 11500, "€", "Sum of the four lines below"),
      est("startup_cost", "Start-up cost", 32000, "€", "Fit-out, machine deposit, licences, stock"),
      est("open_days_month", "Open days a month", 26, "days", "Monday to Saturday"),
    ],
    fixed_costs_breakdown: [
      { label: "Kiosk rent", value: 3800 },
      { label: "Founder and one barista, employer cost", value: 6200 },
      { label: "Machine lease and service", value: 700 },
      { label: "Utilities, insurance, fees", value: 800 },
    ],
    price_note: "Flat white €3.00; average ticket €3.40",
    startup_note: "Fit-out, machine deposit, licences, stock",
    main_risk: "Below break-even pace the kiosk loses money every month: sell from a pop-up cart for two mornings before signing a lease.",
    launch_offer: { item: "Opening-week flat white", price: 2.4, normal_price: 3, limit: 300 },
  },
  nova: {
    names: [
      {
        name: "Pausa",
        why: "The short stop before the train, named. Same word in Catalan, Spanish and Italian.",
        tagline: "A proper pause before the train.",
        palette: [
          { name: "Primary", hex: "#2B211C" },
          { name: "Accent", hex: "#C8813A" },
          { name: "Background", hex: "#F4EADF" },
          { name: "Extra", hex: "#6E8B74" },
        ],
      },
      {
        name: "Andén",
        why: "The platform: where the morning ritual starts. Local, short, unusual for coffee.",
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
        why: "Open at seven: the one reason commuters will switch, as the name.",
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
    positioning: "For Eixample commuters who want real coffee before work, Pausa is the takeaway kiosk at the metro exit that opens at 7:00, before the cafés.",
    typography: { display: "Fraunces", body: "Instrument Sans" },
    voice: {
      traits: ["Warm", "Exact", "Local", "Quick"],
      rules: "Talk like the barista who knows your order: short lines, real times, one action.",
      sample: "Open at 7:00. Your flat white, before your train.",
    },
  },
  dex: {
    logos: [
      { concept: "Two rounded pause bars in amber before a tight lowercase serif name: the breather, as a sign.", icon: "cup", shape: "emblem", monogram: "P", glyph: "pause", wordmark: { weight: 600, letter_spacing_em: -0.03, case: "lower", mark: "none", placement: "left" } },
      { concept: "A metro-style roundel: amber ring, dark bar carrying the P, wide capitals below.", icon: "cup", shape: "monogram", monogram: "P", glyph: "roundel", wordmark: { weight: 700, letter_spacing_em: 0.12, case: "upper", mark: "monogram", placement: "above" } },
      { concept: "Wordmark only, ending in an amber full stop: a pause written as punctuation.", icon: "cup", shape: "wordmark", monogram: "PA", glyph: "stop", wordmark: { weight: 600, letter_spacing_em: -0.02, case: "title", mark: "none", placement: "left" } },
    ],
    landing: {
      headline: "Great coffee before your train.",
      subheadline: "Specialty flat whites at the metro exit in Eixample, from 7:00, Monday to Saturday, ready before your train.",
      bullets: ["Two drinks, made properly", "Open 7:00, Monday to Saturday", "Full refund if we don't open"],
      cta: "Pre-order for €2.40",
      offer: "First 300 opening-week flat whites at €2.40",
      offer_price: 2.4,
      normal_price: 3,
      price_hint_usd: 2.6,
      faq: [
        { q: "What do I get, and when?", a: "One flat white during opening week. Show your receipt at the counter; we message you the date." },
        { q: "What if you never open?", a: "We open only after 100 pre-orders. If we don't, we refund every pre-order in full." },
        { q: "Will I miss my train?", a: "We keep two drinks on the menu and time every order. The pop-up cart tests a 2-minute wait first." },
      ],
      where_when: "Eixample, Monday to Saturday from 7:00",
    },
  },
  rae: {
    handle: "@pausa.bcn",
    posts: [
      [1, "instagram", "08:15", "post", "Where do you get coffee before 8?", "We're counting who leaves two Eixample metro exits between 7:00 and 9:00. Tell us where you buy coffee now.", "Answer in the poll"],
      [3, "tiktok", "19:00", "reel", "Why we'd open at seven, not nine", "Most cafés here open after 8:30. Trains don't wait. The 7–9 gap in 20 seconds.", "Follow the build"],
      [5, "instagram", "08:15", "story", "Flat white or cortado? You decide.", "The morning menu has room for two drinks. Vote and we'll pour the winner first.", "Vote in the poll"],
      [8, "instagram", "07:00", "post", "Pop-up cart at the exit today, 7:00–9:30", "Two drinks, €3.00, every order timed. Taste it before we sign anything.", "Come by before work"],
      [9, "tiktok", "19:00", "reel", "We timed every order this morning", "Stopwatch on the counter, every cup. What slowed us down and what we changed.", "Follow the build"],
      [11, "instagram", "08:15", "carousel", "Two mornings at the cart, in numbers", "Cups sold, median wait, the most-asked question. Straight from the notebook, good or bad.", "Follow for the result"],
      [15, "instagram", "08:15", "post", "Pre-orders are open: €2.40 flat whites", "The first 300 opening-week flat whites at €2.40. We open only at 100 pre-orders; if not, full refund.", "Pre-order yours"],
      [16, "email", "08:00", "email", "Pre-orders are open", "You told us where you buy coffee now. Here's the €2.40 opening-week offer and the refund rule.", "Pre-order now"],
      [18, "linkedin", "08:45", "post", "Why we're testing before signing a lease", "Footfall counts, 20 interviews, a two-morning cart, 100 pre-orders. Deciding with numbers, not hope.", "Read the method"],
      [22, "instagram", "08:15", "story", "Countdown to 100", "Every pre-order moves the bar. At 100 we sign; under 100 everyone is refunded.", "Pre-order yours"],
      [24, "tiktok", "19:00", "reel", "6:30 to 9:30 behind a coffee cart", "Set-up, the 8:15 rush, the last cup. One cart morning, sped up.", "Pre-order yours"],
      [26, "email", "08:00", "email", "Last week at €2.40", "Pre-orders close on Saturday. After that a flat white is €3.00 like every other day.", "Pre-order now"],
    ],
    first: [
      [1, "08:15", "Question", "Where do you get coffee before 8?", "We're counting who leaves two Eixample metro exits between 7:00 and 9:00, and asking where they buy coffee now. Tell us yours in the poll."],
      [3, "19:00", "Why seven", "Open before your train", "Most cafés around here open after 8:30. A lot of trains leave earlier. So we want to open at 7:00, with two drinks done properly. Follow the build."],
      [8, "07:00", "Pop-up test", "Find the cart today", "Pop-up cart at the metro exit today, 7:00 to 9:30. Flat white €3.00, every order timed. Taste it and tell us straight: should we open here?"],
    ],
  },
  memo: (r) => ({
    purpose: "A takeaway specialty coffee kiosk at an Eixample metro exit, for commuters who want good coffee before 9:00.",
    problem: "Between 7:00 and 9:00 commuters choose between fast generic coffee and good coffee that opens too late. Long bakery queues make many skip it.",
    insight: "The best competitors are closed at the exact moment demand peaks. A fast two-drink menu can own that window without competing on seating or food.",
    verdict_line: `Go, to test: it needs ${be(r, 186)} sales a day to break even, and the plan reaches ${m12(r, 300)} by month 12.`,
    next_7_days: ["Count 7:00–9:00 footfall at two metro exits", "Interview 20 commuters about yesterday's coffee", "Book a pop-up cart for two mornings"],
  }),
};

// ---------------------------------------------------------------- dog walking, Madrid (pivot)

const dog: Sample = {
  idea: "A dog-walking app for busy Madrid professionals, €12 a walk",
  mia: {
    title: "Dog-walking service in Madrid",
    one_liner: "The same trusted walker every weekday at midday, booked in two taps.",
    brief: {
      concept: "Vetted walkers doing 45-minute midday walks in Chamberí, booked through a simple page, €12 a group walk.",
      for: "Office workers aged 28 to 45 in Chamberí who leave a dog home alone from 9:00 to 18:00.",
      goal: "Get 25 owners to pay for a first walk and keep 10 on weekly plans after four weeks.",
    },
    market: { city: "Madrid", country_iso: "ES", currency: "€", language: "en" },
    gate: { metric: "paid first walks", target: 25, by_week: 4 },
    checklist: [
      { week: 1, task: "Interview 15 owners in two Chamberí parks", how: "Talk to owners at 8:00 and 20:00 about who walked their dog last week and what it cost.", done_when: "15 logged; 6+ pay someone today", helped_by: "leo", est_hours: 5 },
      { week: 1, task: "Map the walkers owners already use", how: "Ask every owner for their walker's price, frequency and last no-show.", done_when: "10 current walkers with prices listed", helped_by: "leo", est_hours: 2 },
      { week: 1, task: "Recruit three walkers for a paid trial", how: "Post in two local groups and meet each candidate in a park with their own dog.", done_when: "Three walkers signed for a trial week", helped_by: null, est_hours: 5 },
      { week: 2, task: "Get two walker liability insurance quotes", how: "Ask two brokers for cover per walker and per dog, group walks included.", done_when: "Two written quotes in hand", helped_by: "sam", est_hours: 2 },
      { week: 2, task: "Run 20 trial group walks at €12", how: "First walk free for interviewed owners, €12 from the second; one walker, three dogs max.", done_when: "20 walks done; 8+ paid", helped_by: "sam", est_hours: 8 },
      { week: 2, task: "Pick the name and print 100 collar tags", how: "Choose one of Nova's names and hand tags to every trial owner.", done_when: "Name chosen; tags handed out", helped_by: "nova", est_hours: 2 },
      { week: 3, task: "Send the booking page to 60 owners", how: "Message every owner met so far and two neighbourhood groups.", done_when: "60 owners received the link", helped_by: "pip", est_hours: 2 },
      { week: 3, task: "Post the first three launch posts", how: "Share walk photos with owner permission on the planned days.", done_when: "Three posts live; every message answered", helped_by: "rae", est_hours: 3 },
      { week: 4, task: "Sell 25 paid first walks", how: "Follow up personally with every owner who opened the page.", done_when: "25 first walks paid on-chain", helped_by: "pip", est_hours: 5 },
      { week: 4, task: "Decide: one neighbourhood or stop", how: "Compare repeat bookings and walker hours with break-even and the kill criteria.", done_when: "Decision written down with the numbers", helped_by: "sam", est_hours: 2 },
    ],
  },
  leo: {
    score: 6.1,
    verdict: "pivot",
    headline: "Win one neighbourhood, not the whole city.",
    summary: "Owners already pay for walks, but large pet-sitting platforms cover all of Madrid. A dense, trusted service in one neighbourhood is winnable; a city-wide app is not.",
    signals: [
      sig("Demand", 7.2, "Many owners leave dogs alone through office hours"),
      sig("Competition gap", 3.8, "Big platforms and independents already cover the city"),
      sig("Price acceptance", 6.6, "€10–€15 a walk is common centrally"),
      sig("Channel", 6.8, "Parks, vets and pet shops reach owners cheaply"),
      sig("Timing", 5.6, "Hybrid work thins Monday and Friday demand"),
    ],
    why_go: "Trust is local: the same walker in one neighbourhood every weekday beats a marketplace that sends a stranger.",
    risks: [
      { risk: "Platforms already list hundreds of walkers here.", mitigation: "Stay in Chamberí; same walker, same time, every day.", severity: "high" },
      { risk: "One walker no-show breaks trust fast.", mitigation: "Keep a back-up walker on call during the trial.", severity: "high" },
      { risk: "Hybrid work halves Monday and Friday bookings.", mitigation: "Sell Tuesday–Thursday plans first.", severity: "med" },
    ],
    pivot: { idea: "Group midday walks in Chamberí, sold as a weekly plan, no app.", why: "Fixes the competition gap: platforms sell single walks with strangers; a fixed weekly group with the same walker is different and cheaper per dog." },
    next_step: "Interview 15 owners in two Chamberí parks this week: 6 who pay today is the bar.",
    market_facts: [
      fact("Central Madrid dog walks commonly cost €10 to €15 for 30 to 60 minutes."),
      fact("Owners in office jobs typically leave a dog alone for 7 to 9 hours."),
      fact("A walker can usually handle 3 to 4 compatible dogs on a group walk."),
      fact("Walker liability insurance is usually priced per walker and per dog."),
    ],
    competitors: [
      { name: "Pet-sitting marketplaces", note: "Huge choice, a new face each time", price: 6, differentiation: 5, url: null },
      { name: "Independent local walkers", note: "Trusted, but full and hard to book", price: 5, differentiation: 6.5, url: null },
      { name: "Dog daycare centres", note: "Full day, pricey, far from home", price: 8.5, differentiation: 7, url: null },
      { name: "Neighbours and family", note: "Free, until they can't", price: 1, differentiation: 2, url: null },
    ],
    you: { price: 5, differentiation: 7.5 },
    interviews: {
      who: "Dog owners in Chamberí who work office hours",
      where: "Two parks at 8:00 and 20:00, and outside two vets",
      questions: [
        "Who walked your dog last Tuesday at midday?",
        "How did you find them?",
        "What did you pay for the last walk?",
        "Tell me about the last time a walk didn't happen.",
        "How do you book a walk today?",
      ],
      good_sign: "They pay someone already and can name a missed walk this month.",
      target: 15,
    },
    kill_criteria: [
      "Stop if fewer than 6 of 15 owners pay for walks today.",
      "Stop if under 8 of 20 trial walks convert to paid.",
    ],
  },
  sam: {
    currency: "€",
    canvas: {
      customer: "Office workers with one dog in Chamberí",
      value: "The same vetted walker every weekday at midday",
      revenue: "Group walks at €12, solo walks at €18",
      channels: "Parks, vets, pet shops, owner referrals",
      costs: "Walker pay per walk, insurance, coordinator, local ads",
      unit_economics: "Each walk leaves about €4.90 after walker pay",
    },
    assumptions: [
      est("customers_per_day_m1", "Walks a day, month 1", 10, "per day", "Trial owners from interviews"),
      est("customers_per_day_m12", "Walks a day, month 12", 60, "per day", "Four walkers, five groups of three"),
      est("avg_ticket", "Average price per walk", 13, "€", "Mostly €12 group walks, some €18 solo"),
      est("gross_margin_pct", "Margin after walker pay", 38, "%", "Walkers paid about €8 a walk"),
      est("fixed_costs_month", "Fixed costs a month", 2600, "€", "Sum of the five lines below"),
      est("startup_cost", "Start-up cost", 5500, "€", "Insurance set-up, gear, page, legal"),
      est("open_days_month", "Walking days a month", 22, "days", "Weekdays only"),
    ],
    fixed_costs_breakdown: [
      { label: "Founder as coordinator (minimum)", value: 1600 },
      { label: "Local ads and flyers", value: 450 },
      { label: "Liability insurance", value: 260 },
      { label: "Transport between parks", value: 200 },
      { label: "Booking software", value: 90 },
    ],
    price_note: "Group walk €12; average €13",
    startup_note: "Insurance, gear, booking page, legal",
    main_risk: "Margin depends on group walks: if most owners want solo walks, test an €18 solo price in week two.",
    launch_offer: { item: "First midday walk", price: 9, normal_price: 12, limit: 50 },
  },
  nova: {
    names: [
      {
        name: "Ronda",
        why: "A neighbourhood round: the same route, the same walker, every day.",
        tagline: "Same walker, every weekday.",
        palette: [
          { name: "Primary", hex: "#1F3A2E" },
          { name: "Accent", hex: "#E07A3F" },
          { name: "Background", hex: "#F5F1E8" },
          { name: "Extra", hex: "#8FB39A" },
        ],
      },
      {
        name: "Mediodía",
        why: "Names the hour owners worry about most.",
        tagline: "Your dog's favourite hour.",
        palette: [
          { name: "Primary", hex: "#3A2A1F" },
          { name: "Accent", hex: "#4F9D8A" },
          { name: "Background", hex: "#FAF5EC" },
          { name: "Extra", hex: "#D8A06A" },
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
    ],
    chosen: 0,
    positioning: "For Chamberí professionals who leave a dog alone all day, Ronda is the midday walk club that sends the same walker every weekday.",
    typography: { display: "Bricolage Grotesque", body: "Inter" },
    voice: {
      traits: ["Friendly", "Reliable", "Local", "Plain"],
      rules: "Write like the walker texting the owner: who, when, how it went.",
      sample: "Luna walked 45 minutes in the park. Happy and tired.",
    },
  },
  dex: {
    logos: [
      { concept: "A closed loop route with a start dot, then a rounded lowercase name: the daily round.", icon: "paw", shape: "emblem", monogram: "R", glyph: "route", wordmark: { weight: 700, letter_spacing_em: -0.03, case: "lower", mark: "none", placement: "left" } },
      { concept: "An R on a soft rounded tile, like the tag on a collar, name beside it.", icon: "paw", shape: "monogram", monogram: "R", glyph: "tile", wordmark: { weight: 600, letter_spacing_em: 0.02, case: "title", mark: "monogram", placement: "left" } },
      { concept: "Wordmark only, ending in a green full stop: same walker, same time, full stop.", icon: "paw", shape: "wordmark", monogram: "RO", glyph: "stop", wordmark: { weight: 600, letter_spacing_em: -0.02, case: "title", mark: "none", placement: "left" } },
    ],
    landing: {
      headline: "A happy dog while you work.",
      subheadline: "45-minute midday group walks in Chamberí with the same vetted walker, every weekday.",
      bullets: ["Same walker every day", "Photo and route after each walk", "Cancel until 9:00, no cost"],
      cta: "Pre-order for €9",
      offer: "First 50 group walks at €9",
      offer_price: 9,
      normal_price: 12,
      price_hint_usd: 9.7,
      faq: [
        { q: "What do I get, and when?", a: "One 45-minute group walk on a weekday you choose, within two weeks of booking." },
        { q: "What if it doesn't happen?", a: "If we can't walk your dog within two weeks, we refund you in full." },
        { q: "Is my dog safe in a group?", a: "Groups of three dogs at most, matched by size and temperament after a free meet-up." },
      ],
      where_when: "Chamberí, weekdays 12:00 to 15:00",
    },
  },
  rae: {
    handle: "@ronda.mad",
    posts: [
      [1, "instagram", "13:00", "post", "Midday walks are coming to Chamberí", "Same walker, every weekday, groups of three. First 50 walks at €9.", "Pre-order a walk"],
      [2, "instagram", "20:00", "story", "Who walks your dog at noon?", "Neighbour, app, nobody? Tell us honestly.", "Vote in the poll"],
      [4, "tiktok", "20:00", "reel", "How we pick a walker", "A park, their own dog, three questions. Here's what we look for.", "Follow for launch"],
      [5, "instagram", "13:00", "carousel", "Meet the three walkers", "Who they are, their own dogs, how they handle a group of three.", "Say hello"],
      [8, "instagram", "13:00", "post", "Trial week starts today", "Twenty trial walks this week in Chamberí. We'll share how it goes, late walks included.", "Book a slot"],
      [9, "email", "08:00", "email", "Your first walk: what happens", "Key handover, the route, when the photo arrives. Everything before day one.", "Pick your day"],
      [11, "tiktok", "20:00", "reel", "45 minutes in 15 seconds", "Route, water stop, one tired dog.", "Book a walk"],
      [15, "instagram", "13:00", "post", "Trial week, honestly", "Walks done, walks late, what we changed. Straight from our notes.", "Book yours"],
      [18, "linkedin", "09:00", "post", "Why we started with one neighbourhood", "Trust is local. What 15 owner interviews taught us.", "Read more"],
      [22, "email", "08:00", "email", "Weekly plans open", "Tuesday to Thursday, same walker, same time, from your second walk.", "Choose your days"],
      [24, "instagram", "13:00", "post", "One route, every weekday", "The Chamberí loop our groups walk at noon, and why we chose it.", "Pre-order a walk"],
      [26, "instagram", "20:00", "story", "Last days at €9", "After Friday a first walk is €12.", "Pre-order now"],
    ],
    first: [
      [1, "13:00", "Teaser", "Midday walks, Chamberí", "Midday walks are coming to Chamberí. The same walker every weekday, groups of three, a photo after every walk. First 50 walks at €9."],
      [4, "20:00", "Behind the scenes", "How we pick walkers", "We meet every walker in a park with their own dog before they meet yours. Three questions decide it. Follow along."],
      [5, "13:00", "Meet the team", "Three walkers, one route", "These are the three people who'll walk your dog, every weekday at midday. Say hello before your first walk."],
    ],
  },
  memo: (r) => ({
    purpose: "Midday group walks with the same trusted walker, for office workers in one Madrid neighbourhood.",
    problem: "Owners who work office hours leave dogs alone for up to nine hours. Marketplaces send a different stranger each time, and good independent walkers are full.",
    insight: "A city-wide app loses to platforms that already exist. A weekly group in one neighbourhood, with the same face every day, is something they don't offer.",
    verdict_line: `Pivot to one neighbourhood: break-even is about ${be(r, 24)} walks a day, which needs four steady walkers.`,
    next_7_days: ["Interview 15 owners in two Chamberí parks", "Recruit three walkers for a paid trial week", "Ask two brokers for walker insurance quotes"],
  }),
};

// ---------------------------------------------------------------- restored road bikes, online (go, launched)

const bikes: Sample = {
  idea: "An online shop for restored vintage road bikes, around €450 each",
  mia: {
    title: "Restored vintage road bikes online",
    one_liner: "Classic steel road bikes, restored with every hour and part documented.",
    brief: {
      concept: "A two-person workshop restoring 1970s–1990s steel road bikes and selling up to 26 a month online at about €460.",
      for: "Riders aged 30 to 55 who want a classic steel bike but not the risk or the hours of restoring one.",
      goal: "Restore three bikes, log the true hours, and sell 3 paid pre-orders at €395 in four weeks.",
    },
    market: { city: null, country_iso: "ES", currency: "€", language: "en" },
    gate: { metric: "paid bike pre-orders", target: 3, by_week: 4 },
    checklist: [
      { week: 1, task: "Price 20 recently sold vintage road bikes", how: "Record final sale prices of sold listings, not asking prices, by size and groupset.", done_when: "A table of 20 sale prices", helped_by: "sam", est_hours: 3 },
      { week: 1, task: "Buy three donor frames under €120 each", how: "Inspect frames in person for cracks and rust; check sizes riders ask for most.", done_when: "Three donors bought for €360 or less", helped_by: null, est_hours: 6 },
      { week: 1, task: "Interview 10 riders who bought a used bike", how: "Ask in two cycling clubs what they bought, what it cost, what failed in month one.", done_when: "10 logged; 5+ paid for repairs after", helped_by: "leo", est_hours: 4 },
      { week: 2, task: "Restore bike one and log every hour", how: "Time each step and record every part with its price.", done_when: "Bike ready; hours and parts cost written down", helped_by: "sam", est_hours: 12 },
      { week: 2, task: "Photograph bike one in daylight", how: "Twelve shots: both sides, groupset, frame number, every repaired detail.", done_when: "Twelve photos ready", helped_by: "nova", est_hours: 2 },
      { week: 2, task: "Get two boxed-bike shipping quotes", how: "Ask two couriers for door-to-door prices within Spain, with insurance.", done_when: "Two written quotes, both under €60", helped_by: null, est_hours: 1 },
      { week: 3, task: "Share the pre-order page in two clubs", how: "Post bike one's before-and-after with the hours log and the €395 launch slots.", done_when: "Page shared with 100+ riders", helped_by: "pip", est_hours: 2 },
      { week: 3, task: "Publish the first three launch posts", how: "Show the restoration of bike one, step by step.", done_when: "Three posts live; every question answered", helped_by: "rae", est_hours: 3 },
      { week: 4, task: "Sell three paid pre-orders", how: "Offer the next three restorations at €395, sized to the buyer.", done_when: "Three pre-orders paid on-chain", helped_by: "pip", est_hours: 4 },
      { week: 4, task: "Decide on workshop space", how: "Compare hours per bike and margin with break-even before renting.", done_when: "Decision written down with the numbers", helped_by: "sam", est_hours: 2 },
    ],
  },
  leo: {
    score: 7.1,
    verdict: "go",
    headline: "Sell the documented restoration, not just the bike.",
    summary: "Demand for classic steel bikes is steady, and buyers fear hidden faults in private listings. A shop that shows every hour and part can charge for that certainty.",
    signals: [
      sig("Demand", 6.8, "Steady niche interest in classic steel road bikes"),
      sig("Competition gap", 7.4, "Private listings rarely document the restoration"),
      sig("Price acceptance", 7.2, "Restored bikes sell well above donor prices"),
      sig("Channel", 7.5, "Clubs and restoration videos reach riders cheaply"),
      sig("Timing", 6.6, "Spring peaks; winter is slow"),
    ],
    why_go: "Riders pay for certainty: a documented restoration and a 14-day return turn a risky used purchase into an easy one.",
    risks: [
      { risk: "Restoration hours eat the margin.", mitigation: "Time bike one; cap labour at 10 hours a bike.", severity: "high" },
      { risk: "Bikes get damaged in shipping.", mitigation: "Test one insured boxed delivery to a friend.", severity: "med" },
      { risk: "Sales slow sharply in winter.", mitigation: "Offer restoration of customers' own bikes from November.", severity: "low" },
    ],
    pivot: null,
    next_step: "Restore one bike this week and log every hour and part: under 10 hours is the bar.",
    market_facts: [
      fact("Unrestored steel road frames often sell second-hand for under €150."),
      fact("Fully restored classic road bikes commonly sell for €350 to €700."),
      fact("A full restoration takes an experienced mechanic roughly 8 to 12 hours."),
      fact("Boxed bike courier delivery within Spain usually costs €40 to €70."),
    ],
    competitors: [
      { name: "Private second-hand listings", note: "Cheap, but faults are hidden", price: 2.5, differentiation: 2, url: null },
      { name: "Local bike workshops", note: "Skilled, rarely sell restored bikes", price: 6, differentiation: 6, url: null },
      { name: "Collector auctions", note: "Rare frames at collector prices", price: 9, differentiation: 7.5, url: null },
      { name: "New entry-level road bikes", note: "Reliable, but no character", price: 5, differentiation: 3, url: null },
    ],
    you: { price: 5.5, differentiation: 8 },
    interviews: {
      who: "Riders who bought a used road bike in the last two years",
      where: "Two cycling clubs and one Sunday group ride",
      questions: [
        "Tell me about the last used bike you bought.",
        "Where did you find it?",
        "What did you pay, and what did you spend after?",
        "What went wrong in the first month?",
        "How did you check it before paying?",
      ],
      good_sign: "They spent money on repairs after buying and say it unprompted.",
      target: 10,
    },
    kill_criteria: [
      "Stop if bike one takes more than 10 hours to restore.",
      "Stop if fewer than 2 of 3 launch slots sell in 30 days.",
    ],
  },
  sam: {
    currency: "€",
    canvas: {
      customer: "Riders aged 30 to 55 across Spain",
      value: "A classic steel bike, restored, documented, ready to ride",
      revenue: "Restored bikes at about €460; owner restorations later",
      channels: "Own shop page, cycling clubs, restoration videos",
      costs: "Donor frames, parts, founder and helper, workshop, ads",
      unit_economics: "Each bike leaves about €200 after donor and parts",
    },
    assumptions: [
      est("customers_per_day_m1", "Bikes sold a day, month 1", 0.15, "per day", "About one bike a week at launch"),
      est("customers_per_day_m12", "Bikes sold a day, month 12", 0.87, "per day", "26 a month: 260 h, founder plus helper"),
      est("avg_ticket", "Average sale price", 460, "€", "Middle of recent sold prices"),
      est("gross_margin_pct", "Margin after donor and parts", 44, "%", "Donor ~€120, parts ~€140; buyer pays shipping"),
      est("fixed_costs_month", "Fixed costs a month", 4900, "€", "Sum of the six lines below"),
      est("startup_cost", "Start-up cost", 12500, "€", "First 20 donors, tools, shop set-up"),
      est("open_days_month", "Selling days a month", 30, "days", "Online, every day"),
    ],
    fixed_costs_breakdown: [
      { label: "Founder, minimum pay", value: 1600 },
      { label: "Helper, part-time, 100 h", value: 900 },
      { label: "Workshop rent", value: 850 },
      { label: "Ads and photography", value: 700 },
      { label: "Platform and payment fees", value: 450 },
      { label: "Tools, consumables, insurance", value: 400 },
    ],
    price_note: "Restored road bike; average €460",
    startup_note: "20 donor frames, tools, shop set-up",
    main_risk: "Hours per bike decide everything; over 10 h the two of you can't reach break-even: time bike one first.",
    launch_offer: { item: "Launch restoration slot", price: 395, normal_price: 460, limit: 3 },
  },
  nova: {
    names: [
      {
        name: "Segunda Vuelta",
        why: "A second lap: an old bike's second life, and the rider's next ride.",
        tagline: "Classic steel, second life.",
        palette: [
          { name: "Primary", hex: "#1C2433" },
          { name: "Accent", hex: "#C2412D" },
          { name: "Background", hex: "#F2EEE6" },
          { name: "Extra", hex: "#8A9A86" },
        ],
      },
      {
        name: "Lugged",
        why: "Names the craft detail fans look for in a steel frame.",
        tagline: "Restored by hand.",
        palette: [
          { name: "Primary", hex: "#20282A" },
          { name: "Accent", hex: "#B8862F" },
          { name: "Background", hex: "#F4F1EC" },
          { name: "Extra", hex: "#6F7F8A" },
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
    ],
    chosen: 0,
    positioning: "For riders who love classic steel but not the gamble, Segunda Vuelta is the restoration shop that documents every hour and every part.",
    typography: { display: "Space Grotesk", body: "IBM Plex Sans" },
    voice: {
      traits: ["Precise", "Honest", "Nerdy", "Calm"],
      rules: "Write like a mechanic's notebook: part names, hours, what we fixed.",
      sample: "1987 frame, new bearings, 11 hours. Rides like it's new.",
    },
  },
  dex: {
    logos: [
      { concept: "A race-number roundel: red ring, dark bar carrying SV, spaced capitals below.", icon: "bike", shape: "monogram", monogram: "SV", glyph: "roundel", wordmark: { weight: 600, letter_spacing_em: 0.1, case: "upper", mark: "monogram", placement: "above" } },
      { concept: "A lap arrow closing its own circle, then a firm grotesque name: the second lap.", icon: "bike", shape: "emblem", monogram: "S", glyph: "loop", wordmark: { weight: 700, letter_spacing_em: -0.01, case: "title", mark: "none", placement: "left" } },
      { concept: "Wordmark only in firm capitals, ending in a red full stop, like a frame decal.", icon: "bike", shape: "wordmark", monogram: "SV", glyph: "stop", wordmark: { weight: 700, letter_spacing_em: 0.04, case: "upper", mark: "none", placement: "left" } },
    ],
    landing: {
      headline: "A classic bike, without the gamble.",
      subheadline: "Restored 1970s–1990s steel road bikes, every hour and part documented, shipped boxed across Spain at cost.",
      bullets: ["Hours log and parts list with every bike", "14-day return, full refund", "Sized to you before we start"],
      cta: "Pre-order for €395",
      offer: "First 3 launch restoration slots at €395",
      offer_price: 395,
      normal_price: 460,
      price_hint_usd: 425,
      faq: [
        { q: "What do I get, and when?", a: "A restored bike in your size, shipped about two weeks after you pre-order." },
        { q: "What if it doesn't fit?", a: "Send it back within 14 days in the same box and we refund you in full." },
        { q: "How do I know it's sound?", a: "You get the hours log, parts list and photos of every repaired detail before it ships." },
      ],
      where_when: null,
    },
  },
  rae: {
    handle: "@segundavuelta.bikes",
    posts: [
      [1, "instagram", "19:00", "carousel", "A €110 frame, before we touch it", "Bike one as we bought it: rust, seized bearings, good bones. Watch it come back.", "Follow the build"],
      [3, "tiktok", "19:30", "reel", "Stripping a 1985 frame in 30 seconds", "Every bolt, sped up. Next week: bearings and paint.", "Follow along"],
      [5, "instagram", "19:00", "story", "Which frame should we restore next?", "Three donors, you choose.", "Vote in the poll"],
      [10, "instagram", "19:00", "post", "Bike one: done", "1985 steel, size 56, new bearings and tyres. The hours log is in the comments.", "Follow for launch slots"],
      [12, "linkedin", "09:00", "post", "What a restored bike really costs", "Donor, parts, hours: every euro from bike one.", "Read the numbers"],
      [14, "tiktok", "19:30", "reel", "How we box a bike so it arrives safe", "The packing, step by step.", "Save this"],
      [15, "email", "09:00", "email", "Three launch slots at €395", "We'll restore three bikes in your size at the launch price. Normally €460.", "Reserve a slot"],
      [17, "x", "18:00", "post", "Three mistakes we made on bike one", "And what we'll do differently on bike two.", "Read the thread"],
      [20, "instagram", "19:00", "post", "Bike two on the stand", "1989 lugged steel, size 54. Here's the plan and the parts list.", "Pre-order yours"],
      [24, "tiktok", "19:30", "reel", "The 10-hour rule", "Why every restoration has a time budget, and what happens when we blow it.", "Follow along"],
      [28, "email", "09:00", "email", "Last launch slot", "After this one, restorations are €460.", "Pre-order now"],
    ],
    first: [
      [1, "19:00", "Before", "A €110 frame", "Bike one as we bought it: a 1985 steel frame for €110, rust and seized bearings, but good bones. Follow along as we bring it back, hour by hour."],
      [3, "19:30", "Behind the scenes", "Stripped in 30 seconds", "Every bolt, every bearing, sped up. This is the first hour of a restoration you can follow from start to finish."],
      [10, "19:00", "Bike one", "Bike one is ready", "1985 steel, size 56, new bearings, cables and tyres. The full hours log is in the comments. Launch slots open next week."],
    ],
  },
  memo: (r) => ({
    purpose: "An online shop for restored classic steel road bikes, for riders who want character without the risk.",
    problem: "Used bikes from private listings often hide faults that cost money in the first month. Riders who love classic frames rarely have the time or tools to restore one.",
    insight: "Buyers pay for certainty, not nostalgia. Publishing the hours and parts of every restoration makes a used bike feel as safe as a new one.",
    verdict_line: `Thin but testable: break-even is ${beMonth(r, 25)} bikes a month and the plan reaches 26, only if a restoration stays under 10 hours.`,
    next_7_days: ["Time a full restoration of one donor bike", "Price 20 recently sold vintage bikes", "Interview 10 riders who bought a used bike"],
  }),
};

// ---------------------------------------------------------------- sourdough classes, Valencia (go, validated only)

const bread: Sample = {
  idea: "Weekend sourdough baking classes in Valencia, €45 a seat",
  mia: {
    title: "Weekend sourdough classes in Valencia",
    one_liner: "Bake your first real sourdough in three hours, and take the starter home.",
    brief: {
      concept: "Three-hour hands-on sourdough classes for 8 people, Friday evening and weekends, in a rented shared kitchen in Ruzafa, €45 a seat.",
      for: "Valencians aged 25 to 45 who bake at home, follow bread accounts, and have failed a starter at least once.",
      goal: "Sell 24 paid seats across three test classes before committing to a monthly kitchen slot.",
    },
    market: { city: "Valencia", country_iso: "ES", currency: "€", language: "en" },
    gate: { metric: "paid class seats", target: 24, by_week: 4 },
    checklist: [
      { week: 1, task: "Interview 15 home bakers about their last loaf", how: "Ask in two baking groups what they baked last, what failed, what they paid to learn.", done_when: "15 logged; 6+ paid for a class or kit", helped_by: "leo", est_hours: 4 },
      { week: 1, task: "Price three shared kitchens in Ruzafa", how: "Ask for weekend half-day rates, oven count and equipment included.", done_when: "Three quotes; one under €40 an hour", helped_by: "sam", est_hours: 3 },
      { week: 1, task: "Bake the class recipe four times, timed", how: "Run the full 3-hour class plan at home with a stopwatch.", done_when: "Four loaves; plan fits 3 hours", helped_by: null, est_hours: 8 },
      { week: 2, task: "Run a free pilot class for six friends", how: "Teach the full class and ask each person what they would change.", done_when: "Six loaves baked; feedback written", helped_by: null, est_hours: 5 },
      { week: 2, task: "Choose the name and photograph the pilot", how: "Pick one of Nova's names; shoot hands, dough and the finished loaves.", done_when: "Name chosen; 20 photos ready", helped_by: "nova", est_hours: 2 },
      { week: 3, task: "Open three dated classes for booking", how: "Publish one Friday evening and two Saturday morning dates on the page.", done_when: "Three classes bookable", helped_by: "pip", est_hours: 2 },
      { week: 3, task: "Publish the first three launch posts", how: "Show the pilot class, the starter, and the dates.", done_when: "Three posts live; every DM answered", helped_by: "rae", est_hours: 3 },
      { week: 4, task: "Sell 24 paid seats", how: "Message interviewees and pilot guests; ask each to bring one friend.", done_when: "24 seats paid on-chain", helped_by: "pip", est_hours: 5 },
      { week: 4, task: "Decide: book a monthly kitchen slot", how: "Compare seats sold and repeat interest with break-even.", done_when: "Decision written down with the numbers", helped_by: "sam", est_hours: 2 },
    ],
  },
  leo: {
    score: 7.3,
    verdict: "go",
    headline: "Sell the starter that survives, not the lesson.",
    summary: "Home bakers already spend on kits and flour, and most failed sourdough fails at the starter. A small hands-on class that sends you home with a living starter answers that exact failure.",
    signals: [
      sig("Demand", 7.5, "Home baking stayed a common weekend hobby"),
      sig("Competition gap", 7, "Few small hands-on classes; most are demos"),
      sig("Price acceptance", 7.4, "€40–€60 is typical for a 3-hour food class"),
      sig("Channel", 7.5, "Bread content travels well on social video"),
      sig("Timing", 6.8, "Summer heat slows classes in July and August"),
    ],
    why_go: "The failure point (the starter) is the product: a class that ends with a living starter and a support chat has a clear reason to pay.",
    risks: [
      { risk: "Kitchen rent rises with weekend demand.", mitigation: "Book a fixed monthly slot only after 24 seats sell.", severity: "med" },
      { risk: "Bakers learn once and never return.", mitigation: "Test a €30 follow-up class on shaping and scoring.", severity: "med" },
      { risk: "Summer heat empties July and August.", mitigation: "Plan a two-month summer break into the numbers.", severity: "low" },
    ],
    pivot: null,
    next_step: "Interview 15 home bakers this week: 6 who already paid to learn is the bar.",
    market_facts: [
      fact("Hands-on food classes in Spanish cities commonly cost €40 to €60 for about three hours."),
      fact("Shared commercial kitchens are usually rented by the hour or half-day."),
      fact("Classes of 6 to 10 people are typical when everyone works their own dough."),
      fact("Most beginner sourdough failures trace back to an inactive starter."),
    ],
    competitors: [
      { name: "Online video courses", note: "Cheap, but nobody checks your dough", price: 2, differentiation: 3, url: null },
      { name: "Bakery demonstration events", note: "You watch, you don't bake", price: 4, differentiation: 4, url: null },
      { name: "Culinary school short courses", note: "Thorough, pricey, weekday hours", price: 8.5, differentiation: 7, url: null },
      { name: "Learning alone from books", note: "Free, slow, many failed starters", price: 1, differentiation: 1.5, url: null },
    ],
    you: { price: 5, differentiation: 7.5 },
    interviews: {
      who: "Home bakers in Valencia who have tried sourdough",
      where: "Two local baking groups and a weekend flour market",
      questions: [
        "Tell me about the last bread you baked.",
        "What went wrong the last time a loaf failed?",
        "What have you paid to learn baking so far?",
        "Where did you look for help when it failed?",
        "What happened to your last starter?",
      ],
      good_sign: "They describe a dead starter in detail and have already paid for a course or kit.",
      target: 15,
    },
    kill_criteria: [
      "Stop if fewer than 6 of 15 bakers have paid to learn before.",
      "Stop if under 12 of 24 seats sell in two weeks of promotion.",
    ],
  },
  sam: {
    currency: "€",
    canvas: {
      customer: "Home bakers aged 25 to 45 in Valencia",
      value: "Your first real sourdough, and a starter that lives",
      revenue: "€45 seats; starter kits and flour as add-ons",
      channels: "Bread videos, baking groups, guests bringing friends",
      costs: "Kitchen slot, ingredients, aprons, insurance, ads",
      unit_economics: "Each seat leaves about €35 after ingredients and kit",
    },
    assumptions: [
      est("customers_per_day_m1", "Seats a class day, month 1", 5, "per day", "Friends and interviewees first"),
      est("customers_per_day_m12", "Seats a class day, month 12", 14, "per day", "Two classes of 7 a class day"),
      est("avg_ticket", "Average spend per seat", 48, "€", "€45 seat plus some kit add-ons"),
      est("gross_margin_pct", "Margin after ingredients and kit", 72, "%", "Flour, starter jar, take-home box"),
      est("fixed_costs_month", "Fixed costs a month", 2800, "€", "Sum of the five lines below"),
      est("startup_cost", "Start-up cost", 4800, "€", "Bannetons, scales, aprons, page, pilot"),
      est("open_days_month", "Class days a month", 9, "days", "Fridays and weekends"),
    ],
    fixed_costs_breakdown: [
      { label: "Kitchen slot, weekends", value: 1100 },
      { label: "Founder, teaching and prep", value: 900 },
      { label: "Ads and photography", value: 400 },
      { label: "Equipment wear", value: 220 },
      { label: "Insurance and booking software", value: 180 },
    ],
    price_note: "Three-hour class seat €45; average €48",
    startup_note: "Equipment, aprons, page, pilot class",
    main_risk: "Seats per class decide everything: sell three dated classes before booking a monthly kitchen slot.",
    launch_offer: { item: "Founding class seat", price: 36, normal_price: 45, limit: 24 },
  },
  nova: {
    names: [
      {
        name: "Miga",
        why: "The crumb: what every baker cuts open to check. Short, warm, local.",
        tagline: "Bread you understand.",
        palette: [
          { name: "Primary", hex: "#2E2419" },
          { name: "Accent", hex: "#C9772E" },
          { name: "Background", hex: "#F7EFE3" },
          { name: "Extra", hex: "#8C9A6B" },
        ],
      },
      {
        name: "Masa Viva",
        why: "Living dough: names the starter you take home.",
        tagline: "Take the starter home.",
        palette: [
          { name: "Primary", hex: "#22301F" },
          { name: "Accent", hex: "#D49A3A" },
          { name: "Background", hex: "#F4F1E6" },
          { name: "Extra", hex: "#B86B4B" },
        ],
      },
      {
        name: "Horno Abierto",
        why: "An open oven: a kitchen anyone can walk into.",
        tagline: "Come bake with us.",
        palette: [
          { name: "Primary", hex: "#33261E" },
          { name: "Accent", hex: "#3F7F86" },
          { name: "Background", hex: "#FAF4EA" },
          { name: "Extra", hex: "#D6A15E" },
        ],
      },
    ],
    chosen: 0,
    positioning: "For Valencia home bakers whose starter keeps dying, Miga is the hands-on class that sends you home with a loaf and a starter that lives.",
    typography: { display: "Young Serif", body: "Figtree" },
    voice: {
      traits: ["Patient", "Warm", "Precise", "Floury"],
      rules: "Explain like a friend at the bench: one step, one reason.",
      sample: "Feed it at 9, bake at 5. Your starter will be ready.",
    },
  },
  dex: {
    logos: [
      { concept: "A round loaf from above with one curved baker's cut, beside a lowercase serif name.", icon: "spark", shape: "emblem", monogram: "M", glyph: "loaf", wordmark: { weight: 600, letter_spacing_em: -0.03, case: "lower", mark: "none", placement: "left" } },
      { concept: "An M on a flour-coloured rounded tile, like a bakery stamp, name below.", icon: "home", shape: "monogram", monogram: "M", glyph: "tile", wordmark: { weight: 500, letter_spacing_em: 0.02, case: "title", mark: "monogram", placement: "above" } },
      { concept: "Wordmark only, closing on a terracotta full stop: one loaf, done.", icon: "leaf", shape: "wordmark", monogram: "MI", glyph: "stop", wordmark: { weight: 600, letter_spacing_em: -0.02, case: "title", mark: "none", placement: "left" } },
    ],
    landing: {
      headline: "Your first real sourdough. This weekend.",
      subheadline: "A three-hour hands-on class for 8 people in Ruzafa, Fridays and weekends. You leave with a loaf and a living starter.",
      bullets: ["8 people, everyone bakes", "Take a living starter home", "Two weeks of chat support"],
      cta: "Pre-order for €36",
      offer: "First 24 founding class seats at €36",
      offer_price: 36,
      normal_price: 45,
      price_hint_usd: 39,
      faq: [
        { q: "What do I get?", a: "A three-hour class, your own loaf, a starter in a jar, and two weeks of chat help." },
        { q: "What if the class doesn't run?", a: "Classes run from 6 people. If yours doesn't, we refund you in full or move you to another date." },
        { q: "I've never baked bread. Is that ok?", a: "Yes. The class is built for first loaves; we start from flour and water." },
      ],
      where_when: "Ruzafa, Friday 18:00 and weekends 10:00",
    },
  },
  rae: {
    handle: "@miga.vlc",
    posts: [
      [1, "instagram", "10:00", "post", "Your starter keeps dying. Let's fix that.", "Three-hour sourdough classes in Ruzafa, 8 people, everyone bakes. First 24 seats at €36.", "Pre-order a seat"],
      [3, "tiktok", "19:00", "reel", "Why most starters die in week one", "Temperature, flour, timing. 20 seconds, no jargon.", "Follow for class dates"],
      [6, "instagram", "10:00", "carousel", "What happens in three hours", "Mix, fold, shape, score, bake. And the starter you take home.", "Save this"],
      [9, "instagram", "18:00", "story", "Friday evening or Saturday morning?", "Help us pick the first dates.", "Vote in the poll"],
      [15, "tiktok", "19:00", "reel", "Our pilot class, sped up", "Six friends, six loaves, one oven. Here's what we changed after.", "Follow along"],
      [16, "instagram", "10:00", "post", "First three class dates are open", "One Friday evening, two Saturday mornings. Founding seats at €36.", "Pick a date"],
      [18, "email", "09:00", "email", "Your seat is reserved", "Date, kitchen in Ruzafa, what to wear, and what you take home.", "Add it to your calendar"],
      [22, "tiktok", "19:00", "reel", "Scoring a loaf, slowly", "One blade, one angle, one confident cut.", "Book a seat"],
      [25, "instagram", "18:00", "story", "Ask us anything about sourdough", "Starter, flour, ovens. We answer every question.", "Send a question"],
      [28, "email", "09:00", "email", "Last founding seats at €36", "After this weekend, seats are €45.", "Pre-order now"],
    ],
    first: [
      [1, "10:00", "Teaser", "Your starter keeps dying", "Your starter keeps dying. Ours has lived for years. Three-hour sourdough classes in Ruzafa, 8 people, everyone bakes, and you take a living starter home. First 24 seats at €36."],
      [3, "19:00", "Explainer", "Why starters die", "Most sourdough starters die in week one: too cold, wrong flour, fed at the wrong time. Here's the fix in 20 seconds."],
      [6, "10:00", "The class", "Three hours, one loaf", "Mix, fold, shape, score, bake. In three hours you make your own loaf and leave with a starter that lives. Save this for the weekend."],
    ],
  },
  memo: (r) => ({
    purpose: "Hands-on weekend sourdough classes for home bakers in Valencia, ending with your own loaf and a living starter.",
    problem: "Home bakers try sourdough, the starter dies, and they give up. Videos can't look at your dough, and pro courses run on weekdays at school prices.",
    insight: "The starter is where beginners fail, so it is the product. A small class that sends you home with a living one solves the exact failure.",
    verdict_line: `Go, to test: break-even is ${be(r, 9)} seats a class day, and the plan reaches ${m12(r, 14)} by month 12.`,
    next_7_days: ["Interview 15 home bakers about their last loaf", "Price three shared kitchens in Ruzafa", "Bake the class recipe four times, timed"],
  }),
};


// ---------------------------------------------------------------- board-game café, small town (no-go, validated only)
// The honest "no": the market is too small for the fixed costs. Never offered as a build (no brand, page or posts).

type ValidateSample = Pick<Sample, "idea" | "mia" | "leo" | "sam" | "memo">;

const games: ValidateSample = {
  idea: "A board-game café in a town of about 9,000 people, €4 a table plus drinks",
  mia: {
    title: "Board-game café in a small town",
    one_liner: "A warm place to play, with 300 games and someone to teach them.",
    brief: {
      concept: "A 90 m² café with a 300-game library, €4 table fee plus drinks, open Tuesday to Sunday afternoons and evenings.",
      for: "Friends and couples aged 20 to 40 in town who play at home and have nowhere to go on weeknights.",
      goal: "Sell 40 paid tickets to one games night in a bar before looking at any premises.",
    },
    market: { city: null, country_iso: "ES", currency: "€", language: "en" },
    gate: { metric: "paid games-night tickets", target: 40, by_week: 4 },
    checklist: [
      { week: 1, task: "Count evening footfall on the main square", how: "Tally people passing 18:00–22:00 on a Tuesday, Friday and Sunday.", done_when: "Three evening counts logged", helped_by: "leo", est_hours: 6 },
      { week: 1, task: "Interview 15 people who play board games", how: "Ask where they last played, with whom, and what they spent that evening.", done_when: "15 logged; 6+ spent money on a night out", helped_by: "leo", est_hours: 5 },
      { week: 2, task: "Agree a games night with one bar", how: "Offer a Thursday 19:00–23:00 night; the bar keeps drinks, you keep the €8 entry.", done_when: "Date agreed in writing", helped_by: "sam", est_hours: 3 },
      { week: 2, task: "Price three empty premises near the square", how: "Ask rent, licence for food and drink, and fit-out needed.", done_when: "Three quotes with rent and licence", helped_by: "sam", est_hours: 3 },
      { week: 3, task: "Sell tickets for the first games night", how: "Message everyone interviewed and two local groups; ask each to bring a friend.", done_when: "Ticket page shared with 120+ people", helped_by: "pip", est_hours: 3 },
      { week: 4, task: "Run the games night and count", how: "Teach three games, log who came, what they spent, who asks for the next one.", done_when: "Attendance and spend per person logged", helped_by: null, est_hours: 6 },
      { week: 4, task: "Decide: monthly nights, or stop", how: "Compare tickets sold and spend per head with Sam's break-even.", done_when: "Decision written down with the numbers", helped_by: "sam", est_hours: 2 },
    ],
  },
  leo: {
    score: 4.6,
    verdict: "no-go",
    headline: "The town is too small for a full-time café.",
    summary: "People play at home and would come to a good night, but a town this size fills a games café a few nights a month, not six days a week. It only works as an event, not as premises.",
    signals: [
      sig("Demand", 4.2, "A town of ~9,000 gives few regular players"),
      sig("Competition gap", 5.5, "No games café, but bars already host quiz nights"),
      sig("Price acceptance", 4, "Table fees are unusual; people expect to pay for drinks only"),
      sig("Channel", 5, "Word of mouth works; nothing else reaches players"),
      sig("Timing", 4.5, "Busy on weekends, quiet Tuesday to Thursday"),
    ],
    why_go: "What would have to be true: 40+ people paying for a games night every month for three months, in a town with no other evening venue.",
    risks: [
      { risk: "Weeknights stay empty while rent runs every day.", mitigation: "Test one night a month in a bar; no lease.", severity: "high" },
      { risk: "Players buy the games and stay home.", mitigation: "Count who returns to the second night.", severity: "high" },
      { risk: "A €4 table fee feels like paying to sit down.", mitigation: "Try a drinks-included €8 entry instead.", severity: "med" },
    ],
    pivot: { idea: "A monthly games night in an existing bar, €8 entry, no premises.", why: "Fixes demand and price: one full night a month needs 40 players, not 31 every day." },
    next_step: "Run one games night in a bar this month: 40 paid tickets is the bar.",
    market_facts: [
      fact("Board-game cafés usually rely on a large town or a city centre with a student population."),
      fact("Table fees in games cafés are commonly €3 to €6 a person."),
      fact("A games café of about 90 m² typically seats 40 to 50 people."),
      fact("Bars in small towns often host one themed night a week to fill quiet evenings."),
    ],
    competitors: [
      { name: "Playing at home with friends", note: "Free, and the games are already there", price: 0.5, differentiation: 3, url: null },
      { name: "Bar quiz and themed nights", note: "Cheap, social, one night a week", price: 3, differentiation: 4, url: null },
      { name: "Games cafés in the nearest city", note: "Great library, 40 minutes away", price: 6, differentiation: 8, url: null },
      { name: "Online board games", note: "Always on, but nobody in the room", price: 1, differentiation: 2, url: null },
    ],
    you: { price: 5, differentiation: 6.5 },
    interviews: {
      who: "People in town who own three or more board games",
      where: "The main square in the evening and two local social groups",
      questions: [
        "When did you last play a board game, and where?",
        "Who did you play with?",
        "What did you spend that evening?",
        "When did you last travel to play or to a games event?",
        "What stopped you from playing more often last month?",
      ],
      good_sign: "They travelled or paid to play in the last three months and say it unprompted.",
      target: 15,
    },
    kill_criteria: [
      "Stop if fewer than 6 of 15 players spent money on a games night last month.",
      "Stop if the first games night sells under 25 tickets.",
    ],
  },
  sam: {
    currency: "€",
    canvas: {
      customer: "Friends and couples in town who already play at home",
      value: "Somewhere to play on weeknights, with someone to teach",
      revenue: "€4 table fee plus drinks and snacks",
      channels: "Word of mouth, local groups, the square",
      costs: "Rent, founder, evening staff, library, utilities",
      unit_economics: "Each visitor leaves about €5.85 after drinks and snacks",
    },
    assumptions: [
      est("customers_per_day_m1", "Visitors a day, month 1", 14, "per day", "Opening curiosity, friends of friends"),
      est("customers_per_day_m12", "Visitors a day, month 12", 24, "per day", "Busy weekends, quiet weeknights"),
      est("avg_ticket", "Average spend per visitor", 9, "€", "€4 table fee plus one or two drinks"),
      est("gross_margin_pct", "Margin after drinks and snacks", 65, "%", "Typical for drinks with a table fee"),
      est("fixed_costs_month", "Fixed costs a month", 4700, "€", "Sum of the five lines below"),
      est("startup_cost", "Start-up cost", 26000, "€", "Fit-out, 300 games, licence, furniture"),
      est("open_days_month", "Open days a month", 26, "days", "Tuesday to Sunday"),
    ],
    fixed_costs_breakdown: [
      { label: "Founder, minimum pay", value: 1600 },
      { label: "Rent near the square", value: 1400 },
      { label: "Evening staff, part-time", value: 1100 },
      { label: "Utilities and insurance", value: 450 },
      { label: "Game library upkeep", value: 150 },
    ],
    price_note: "€4 table fee; average spend €9 with drinks",
    startup_note: "Fit-out, 300 games, licence, furniture",
    main_risk: "Weeknight visitors decide everything: run one paid games night in a bar before signing any lease.",
    launch_offer: { item: "First games-night ticket", price: 6, normal_price: 8, limit: 40 },
  },
  memo: (r) => ({
    purpose: "A board-game café for a town of about 9,000 people.",
    problem: "Players in town have nowhere to play on weeknights except home, and the nearest games café is 40 minutes away.",
    insight: "The demand is real but monthly, not daily. An event fills a room; premises need people every evening.",
    verdict_line: `No-go as a café: it needs ${be(r, 31)} visitors a day to break even, and the town gives about ${m12(r, 24)}. Test a monthly games night first.`,
    next_7_days: ["Count evening footfall on the main square", "Interview 15 people who play board games", "Agree a games night with one bar"],
  }),
};


// ---------------------------------------------------------------- Tique: Verifactu tickets for market traders (v7 district sample)
// Prose here is the v4 department view of the v7 sample (server/v7-samples.ts holds the sourced findings). The v4
// fields stay estimates (no source ids) like every v4 mock; the real pages are cited only in results.v7.

const saas: Sample = {
  idea: "A phone app that issues Verifactu-ready tickets and invoices for Spanish market traders, €6 a month",
  mia: {
    title: "Phone tickets for market traders",
    one_liner: "Legal tickets from your phone at the stall, for €6 a month.",
    brief: {
      concept: "A phone app plus a pocket Bluetooth printer that issues Verifactu-ready tickets and invoices at a market stall, €6 a month.",
      for: "Stallholders at weekly street markets in Andalusia who sell to the public and still write tickets by hand.",
      goal: "Sign 50 paid first months from stallholders and one market association before building beyond the prototype.",
    },
    market: { city: null, country_iso: "ES", currency: "€", language: "en" },
    gate: { metric: "paid first months", target: 50, by_week: 4 },
    checklist: [
      { week: 1, task: "Interview 15 stallholders at two weekly markets", how: "Ask how they issued their last ticket, what it cost and what their gestoría told them about Verifactu.", done_when: "15 logged; 6+ worried about the deadline", helped_by: "leo", est_hours: 6 },
      { week: 1, task: "Ask a tax adviser which regimes need tickets", how: "Bring three real trader profiles and get the answer in writing.", done_when: "Written answer for three trader types", helped_by: "leo", est_hours: 2 },
      { week: 1, task: "Call two market associations", how: "Ask how they share news with members and who decides on group deals.", done_when: "Two calls logged; one meeting booked", helped_by: null, est_hours: 2 },
      { week: 2, task: "Demo a clickable prototype at one market", how: "Issue a test ticket on a real stall with a borrowed printer, timed.", done_when: "10 demos; median ticket under 20 seconds", helped_by: "dex", est_hours: 6 },
      { week: 2, task: "Price printers and the compliance statement", how: "Get two printer quotes and one quote from a lawyer for the producer statement.", done_when: "Three written quotes", helped_by: "sam", est_hours: 2 },
      { week: 3, task: "Send the pre-order page to every trader met", how: "Message interviewees and the association with the €4.80 first-year offer.", done_when: "Page sent to 80+ traders", helped_by: "pip", est_hours: 2 },
      { week: 3, task: "Post the launch posts in trader groups", how: "Publish Rae's week-3 posts and answer every question the same day.", done_when: "Posts live; every message answered", helped_by: "rae", est_hours: 3 },
      { week: 4, task: "Reach 50 paid first months", how: "Visit the two markets again and sign traders on the spot with the QR.", done_when: "50 first months paid on-chain", helped_by: "pip", est_hours: 6 },
      { week: 4, task: "Decide: build the app or stop", how: "Compare paid months, demo times and the adviser's answer with Sam's break-even.", done_when: "Decision written down with the numbers", helped_by: "sam", est_hours: 2 },
    ],
  },
  leo: {
    score: 6.1,
    verdict: "pivot",
    headline: "Own tickets at the stall, not invoicing in general.",
    summary: "The law creates demand and the free official app can't issue tickets, but general invoicing apps are cheap and the deadline keeps moving. A narrow ticket tool sold through associations is winnable.",
    signals: [
      sig("Demand", 6.8, "A legal deadline every trader will hear about"),
      sig("Competition gap", 5.8, "Rivals invoice; few are built for a stall"),
      sig("Price acceptance", 6.2, "€6 sits inside what invoicing apps charge"),
      sig("Channel", 6.4, "Market associations reach whole markets at once"),
      sig("Timing", 5.4, "Deadline announced for delay again"),
    ],
    why_go: "Traders will need compliant tickets, the free app doesn't do them, and associations can bring a whole market in one meeting.",
    risks: [
      { risk: "The deadline slips again and nobody buys early.", mitigation: "Sell speed at the stall, not compliance alone.", severity: "high" },
      { risk: "Some traders may not need tickets at all.", mitigation: "Get a written answer from an adviser in week 1.", severity: "high" },
      { risk: "Cheap invoicing apps add a ticket feature.", mitigation: "Win associations first; stay the stall specialist.", severity: "med" },
    ],
    pivot: { idea: "Sell through market associations as a group plan, €5 a stall.", why: "Fixes channel and price: one meeting signs a market instead of one trader." },
    next_step: "Interview 15 stallholders at two markets this week: 6 worried about the deadline is the bar.",
    market_facts: [
      fact("Weekly street markets usually have dozens of stalls each."),
      fact("Many stallholders still write tickets by hand or use a basic till."),
      fact("Invoicing apps for the self-employed commonly cost €5 to €17 a month."),
      fact("Pocket Bluetooth ticket printers usually cost under €100."),
    ],
    competitors: [
      { name: "The free official invoicing app", note: "Free, but no simplified tickets", price: 0.5, differentiation: 3, url: null },
      { name: "General invoicing apps", note: "Built for offices, not stalls", price: 5, differentiation: 5, url: null },
      { name: "Shop tills (TPV)", note: "Pricey hardware, needs a counter", price: 8, differentiation: 6, url: null },
      { name: "Handwritten tickets", note: "Free, not compliant once required", price: 0.5, differentiation: 1, url: null },
    ],
    you: { price: 4, differentiation: 8 },
    interviews: {
      who: "Stallholders who sell to the public at weekly markets",
      where: "At two weekly markets before 9:00, while setting up",
      questions: [
        "How did you give your last customer a ticket?",
        "What do you pay today for invoicing or a till?",
        "What has your gestoría told you about Verifactu?",
        "When did a customer last ask you for an invoice?",
        "What happened the last time your till or printer failed?",
      ],
      good_sign: "They mention the deadline unprompted and already pay for something that half works.",
      target: 15,
    },
    kill_criteria: [
      "Stop if fewer than 6 of 15 stallholders worry about issuing compliant tickets.",
      "Stop if the adviser says most traders here don't need tickets.",
      "Stop if no association agrees to a trial in four weeks.",
    ],
  },
  sam: {
    currency: "€",
    canvas: {
      customer: "Stallholders at weekly markets who sell to the public",
      value: "A legal ticket in 20 seconds from the phone",
      revenue: "€6 a month per stall, card or BCH",
      channels: "Market associations, markets themselves, gestorías",
      costs: "Founder, hosting, printers stock, adviser and support",
      unit_economics: "Each subscription leaves about €5.10 after payment fees and hosting",
    },
    assumptions: [
      est("customers_per_day_m1", "Paid months billed a day, month 1", 2, "per day", "First association trial, 60 stalls"),
      est("customers_per_day_m12", "Paid months billed a day, month 12", 40, "per day", "About 1,200 stalls across a few associations"),
      est("avg_ticket", "Price per stall per month", 6, "€", "Within today's €5–17 invoicing range"),
      est("gross_margin_pct", "Margin after fees and hosting", 85, "%", "Typical for small SaaS"),
      est("fixed_costs_month", "Fixed costs a month", 2750, "€", "Sum of the four lines below"),
      est("startup_cost", "Start-up cost", 9000, "€", "App build, compliance statement, demo printers"),
      est("open_days_month", "Billing days a month", 30, "days", "Subscriptions renew every day of the month"),
    ],
    fixed_costs_breakdown: [
      { label: "Founder, minimum pay", value: 1800 },
      { label: "Hosting and records storage", value: 300 },
      { label: "Market visits and printers stock", value: 400 },
      { label: "Adviser and gestoría", value: 250 },
    ],
    price_note: "€6 a month per stall",
    startup_note: "App build, compliance statement, demo printers",
    main_risk: "How many traders must issue tickets decides everything: get an adviser's written answer for three trader types this week.",
    launch_offer: { item: "First month for one stall", price: 4.8, normal_price: 6, limit: 100 },
  },
  nova: {
    names: [
      {
        name: "Tique",
        why: "How the market says 'ticket': short, local, and exactly what it does.",
        tagline: "Your ticket, from your pocket.",
        palette: [
          { name: "Primary", hex: "#1B2430" },
          { name: "Accent", hex: "#E8603C" },
          { name: "Background", hex: "#F7F4EE" },
          { name: "Extra", hex: "#4F8A6E" },
        ],
      },
      {
        name: "Puesto",
        why: "The stall itself: the name tells traders it was built for them.",
        tagline: "Built for the stall.",
        palette: [
          { name: "Primary", hex: "#22301F" },
          { name: "Accent", hex: "#F2B33D" },
          { name: "Background", hex: "#F5F2E9" },
          { name: "Extra", hex: "#B5523B" },
        ],
      },
      {
        name: "Recibo",
        why: "Plain and trusted: the word every customer asks for.",
        tagline: "Legal tickets in seconds.",
        palette: [
          { name: "Primary", hex: "#1E2A38" },
          { name: "Accent", hex: "#2E9C8F" },
          { name: "Background", hex: "#F4F6F5" },
          { name: "Extra", hex: "#D9653B" },
        ],
      },
    ],
    chosen: 0,
    positioning: "For market stallholders who must issue legal tickets, Tique is the phone ticket app that prints one in 20 seconds at the stall.",
    typography: { display: "Bricolage Grotesque", body: "Inter" },
    voice: {
      traits: ["Plain", "Quick", "Friendly", "Exact"],
      rules: "Talk like a trader to a trader: short lines, real prices, one action.",
      sample: "Ticket printed. Next customer.",
    },
  },
  dex: {
    logos: [
      { concept: "The T monogram on a rounded tile in coral, like a printed ticket stub.", icon: "shop", shape: "monogram", monogram: "T", glyph: "tile", wordmark: { weight: 700, letter_spacing_em: -0.02, case: "title", mark: "monogram", placement: "left" } },
      { concept: "Wordmark ending in a coral full stop: done, ticket issued.", icon: "shop", shape: "wordmark", monogram: "TQ", glyph: "stop", wordmark: { weight: 600, letter_spacing_em: -0.03, case: "lower", mark: "none", placement: "left" } },
      { concept: "A ring crossed by a bar carrying the T: a market sign you spot from the aisle.", icon: "shop", shape: "emblem", monogram: "T", glyph: "roundel", wordmark: { weight: 700, letter_spacing_em: 0.1, case: "upper", mark: "monogram", placement: "above" } },
    ],
    landing: {
      headline: "Legal tickets from your phone.",
      subheadline: "Tique prints Verifactu-ready tickets and invoices at your market stall in seconds, for €6 a month.",
      bullets: ["First month €4.80, then €6", "Works with a pocket printer", "Full refund if we don't launch"],
      cta: "Pre-order for €4.80",
      offer: "First 100 stall months at €4.80",
      offer_price: 4.8,
      normal_price: 6,
      price_hint_usd: 5.2,
      faq: [
        { q: "What do I get, and when?", a: "Your first month of Tique for one stall when we launch; we message you the date." },
        { q: "What if you never launch?", a: "We build only after 50 pre-orders. If we don't, every pre-order is refunded in full." },
        { q: "Do I even need tickets?", a: "It depends on your VAT regime. We confirm it with an adviser before you pay a second month." },
      ],
      where_when: null,
    },
  },
  rae: {
    handle: "@tique.app",
    posts: [
      [1, "instagram", "08:00", "post", "How did you write your last ticket?", "We're visiting two weekly markets to ask stallholders how they issue tickets today. Tell us yours.", "Answer in the poll"],
      [3, "linkedin", "09:00", "post", "Verifactu and the market stall", "The free official app can't issue simplified tickets. Stalls sell to the public. That's the gap we're testing.", "Follow the build"],
      [5, "instagram", "08:00", "story", "Paper or phone?", "Quick poll for stallholders: paper tickets, a till, or nothing yet?", "Vote in the poll"],
      [8, "tiktok", "19:00", "reel", "A legal ticket in 20 seconds?", "We timed a phone ticket at a real stall this morning. Here's the stopwatch, good and bad.", "Follow the build"],
      [10, "instagram", "08:00", "carousel", "What 10 stallholders told us", "Ten demos at the market, the questions they asked and what we're changing.", "Follow for the result"],
      [15, "instagram", "08:00", "post", "Pre-orders open: €4.80 first month", "The first 100 stall months at €4.80, then €6. We build at 50 pre-orders; if not, full refund.", "Pre-order yours"],
      [16, "email", "08:00", "email", "Pre-orders are open", "You told us how you issue tickets today. Here's the €4.80 first-month offer and the refund rule.", "Pre-order now"],
      [18, "linkedin", "09:00", "post", "Why we sell through associations", "One meeting with a market association reaches a whole market. Here's our method.", "Read the method"],
      [22, "instagram", "08:00", "story", "Countdown to 50", "Every pre-order moves the bar. At 50 we build; under 50 everyone is refunded.", "Pre-order yours"],
      [26, "email", "08:00", "email", "Last week at €4.80", "Pre-orders close on Saturday. After that Tique is €6 a month.", "Pre-order now"],
    ],
    first: [
      [1, "08:00", "Question", "Your last ticket?", "We're visiting two weekly markets to ask stallholders how they issue tickets today: paper, a till, or nothing yet. Tell us yours in the poll."],
      [3, "09:00", "The gap", "Tickets the free app can't do", "Hacienda's free Verifactu app issues full invoices, not simplified tickets. Market stalls sell to the public all day. We're testing a phone app for exactly that. Follow the build."],
      [8, "19:00", "Stall test", "A ticket in 20 seconds?", "This morning we issued phone tickets at a real stall and timed every one. Here's the stopwatch, good and bad. Should we build it?"],
    ],
  },
  memo: (r) => ({
    purpose: "A phone app that issues Verifactu-ready tickets and invoices for market stallholders in Spain.",
    problem: "Stallholders sell to the public all day and many still write tickets by hand. Verifactu will require compliant billing software, and the free official app can't issue simplified tickets.",
    insight: "The gap is narrow and real: tickets at the stall. Associations can bring a whole market at once, which fixes the cost of finding each trader.",
    verdict_line: `Pivot to associations: it needs ${be(r, 18)} paid stall months a day to break even, and the plan reaches ${m12(r, 40)} by month 12.`,
    next_7_days: ["Interview 15 stallholders at two weekly markets", "Ask an adviser which regimes need tickets", "Book a meeting with one market association"],
  }),
};

const SAMPLES: Record<SampleKey, Sample> = { coffee, dog, bikes, bread, saas };
/** Validate-only samples: seeded into the prototype's "Your projects", never picked by sampleKey(). */
export type ValidateOnlyKey = "games";
const VALIDATE_ONLY: Record<ValidateOnlyKey, ValidateSample> = { games };

/** R9: the sample closest to the idea text (chip sentences, or anything mentioning the same words). */
export function sampleKey(idea?: string): SampleKey {
  const t = (idea ?? "").toLowerCase();
  if (/\b(verifactu|invoice|invoices|invoicing|ticket|tickets|factura|facturas|mercadillos?|market traders?|saas)\b/.test(t)) return "saas";
  if (/\b(dog|dogs|walk|walker|walking|perro|perros|paseo|pet)\b/.test(t)) return "dog";
  if (/\b(bike|bikes|bicycle|cycling|bici|bicis|vintage)\b/.test(t)) return "bikes";
  if (/\b(bread|sourdough|baking|bake|bakery|pan|masa madre)\b/.test(t)) return "bread";
  return "coffee";
}

function raeOf(s: Sample, now = Date.now()): RaeLaunch {
  // Posts start on the next Monday, so no sample business posts on a day it is closed (Mon–Sat kiosk, weekday walks).
  const start = new Date(now + 86_400_000);
  start.setUTCHours(0, 0, 0, 0);
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
  rae: (s) => raeOf(s),
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

/** The sample's idea sentence (for seeding projects from a key). */
export const sampleIdea = (k: SampleKey) => SAMPLES[k].idea;

/**
 * Builds a finished sample project exactly as a run would store it. `upTo` = how far it got: "validate" (stopped
 * after the verdict) or "build" (launched). `sanitizeFn` is ai.ts sanitize(), passed in to avoid an import cycle.
 */
export function sampleProject(
  key: SampleKey | ValidateOnlyKey,
  opts: { id: string; slug?: string; now?: number; upTo?: "validate" | "build"; createdAgoMs?: number },
  sanitizeFn: <K extends AiDept>(dept: K, v: ModelOut[K], c?: { prior?: DeptResults }) => NonNullable<DeptResults[K]>,
): Project {
  const s: ValidateSample & Partial<Sample> = key === "games" ? VALIDATE_ONLY[key] : SAMPLES[key];
  const now = opts.now ?? Date.now();
  const t0 = now - (opts.createdAgoMs ?? 5 * 60_000);
  const results: DeptResults = {};
  results.mia = sanitizeFn("mia", structuredClone(s.mia));
  results.leo = sanitizeFn("leo", structuredClone(s.leo));
  results.sam = sanitizeFn("sam", structuredClone(s.sam));
  results.memo = s.memo(results);
  const built = opts.upTo !== "validate" && !!s.nova && !!s.dex && !!s.rae;
  if (built && s.nova && s.dex && s.rae) {
    results.nova = sanitizeFn("nova", structuredClone(s.nova));
    results.dex = sanitizeFn("dex", structuredClone(s.dex), { prior: results });
    results.rae = sanitizeFn("rae", raeOf(s as Sample, t0));
    const slug = opts.slug ?? "launch";
    results.pip = { slug, url: `/s/${slug}`, live_at: new Date(t0 + 80_000).toISOString() };
  }
  return {
    id: opts.id,
    idea: s.idea,
    created_at: t0,
    payments: {
      validate: { txid: `dev-${opts.id}-validate`, sats: 0, cents: 10, at: t0 + 5_000 },
      ...(built ? { build: { txid: `dev-${opts.id}-build`, sats: 0, cents: 20, at: t0 + 60_000 } } : {}),
    },
    status: built
      ? { mia: "done", leo: "done", sam: "done", nova: "done", dex: "done", rae: "done", pip: "done" }
      : { mia: "done", leo: "done", sam: "done" },
    results,
    timings: built
      ? { validate: { started: t0 + 5_000, finished: t0 + 41_000 }, build: { started: t0 + 60_000, finished: t0 + 102_000 } }
      : { validate: { started: t0 + 5_000, finished: t0 + 41_000 } },
    models: built
      ? { mia: "mock", leo: "mock", sam: "mock", nova: "mock", dex: "mock", rae: "mock", pip: "none" }
      : { mia: "mock", leo: "mock", sam: "mock" },
    share_id: null,
  };
}

/**
 * F2: the free example pack (id `example`, slug `pausa`, read-only). Built from the coffee sample with the same
 * derivation as a real run (deriveSam + the v6 extras via the sanitizers). Payments are marked "dev-" (= not
 * charged), so the receipt says "Not charged".
 */
export function exampleProject(now = Date.now(), sanitizeFn?: Parameters<typeof sampleProject>[2]): Project {
  if (sanitizeFn) return { ...sampleProject("coffee", { id: "example", slug: "pausa", now }, sanitizeFn), example: true };
  // Without the sanitizers (module init, see EXAMPLE_PROJECT): v4 derivation only; seed/example.ts upgrades it.
  const s = coffee;
  const results: DeptResults = {
    mia: structuredClone(s.mia),
    leo: { ...structuredClone(s.leo), sources: [] },
    sam: deriveSam(structuredClone(s.sam)),
    nova: structuredClone(s.nova),
    dex: structuredClone(s.dex),
    rae: raeOf(s, now - 5 * 60_000),
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
    timings: { validate: { started: t0 + 5_000, finished: t0 + 41_000 }, build: { started: t0 + 60_000, finished: t0 + 102_000 } },
    models: { mia: "mock", leo: "mock", sam: "mock", nova: "mock", dex: "mock", rae: "mock", pip: "none" },
    share_id: null,
    example: true,
  };
}

/** F2 seed (contracts-v4 §2). Rae's dates are relative to server start. */
export const EXAMPLE_PROJECT: Project = exampleProject();
