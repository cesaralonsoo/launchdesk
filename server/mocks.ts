// Sample answers used when the AI runs in MOCK mode (local development, no API cost).
import type { Stage } from "./config.js";

export const MOCKS: Record<Stage, unknown> = {
  validate: {
    score: 72,
    verdict: "go",
    one_liner: "A van that repairs bikes at your door, booked online in two taps.",
    summary:
      "There is real pain: urban cyclists lose days waiting for shop repairs. Margins are thin per job, so the business only works with dense routes and subscriptions. Worth testing with a single van in one district before scaling.",
    target_customer: "Commuters and delivery riders in dense city districts who cannot be without their bike.",
    problem_strength: { score: 78, note: "Shops are booked for days; downtime costs commuters and riders money." },
    market: { score: 70, note: "Estimate: tens of thousands of daily cyclists per large city; growing with e-bikes." },
    competition: { score: 60, note: "Local bike shops and a few mobile mechanics; few offer online booking." },
    feasibility: { score: 80, note: "Low capex: one van, standard tools, booking software off the shelf." },
    competitors: [
      { name: "Local bike shops", note: "Trusted, but slow turnaround and no pickup." },
      { name: "Independent mobile mechanics", note: "Flexible, but hard to find and book." },
      { name: "Delivery-fleet maintenance contracts", note: "B2B only; not for individuals." },
    ],
    strengths: ["Clear, urgent pain", "Recurring revenue via maintenance plans", "Easy to start small"],
    risks: ["Low ticket size", "Weather seasonality", "Parking and permits for the van"],
    cheapest_test:
      "Put up a one-page booking site and flyers in one district; offer 20 pre-booked repairs at a launch price and measure how fast they fill.",
    pivot_ideas: ["Focus on delivery-rider fleets (B2B)", "E-bike battery and motor specialist"],
  },
  plan: {
    positioning: "The fastest way to get your bike fixed in the city: we come to you.",
    value_proposition: "Same-day repair at your home or office, transparent prices, no trip to the shop.",
    customer_segments: [
      { segment: "Daily commuters", why: "Need the bike every day; value time over price." },
      { segment: "Delivery riders", why: "Every hour off the bike is lost income." },
      { segment: "Offices with bike parking", why: "Perk for employees; one visit, many bikes." },
    ],
    pricing: [
      { tier: "Single fix", price: "€25 + parts", includes: "Visit and one repair" },
      { tier: "Rider plan", price: "€15/month", includes: "Monthly check-up, 20% off parts" },
      { tier: "Office day", price: "€180", includes: "Up to 12 bikes serviced on site" },
    ],
    revenue_model: "Per-visit fees plus monthly maintenance plans; parts margin on top.",
    channels: [
      { channel: "Google Maps", tactic: "Business profile with 'mobile bike repair' and reviews." },
      { channel: "Instagram", tactic: "Before/after reels of repairs on the street." },
      { channel: "Rider communities", tactic: "Discount codes in delivery-rider groups." },
    ],
    roadmap: [
      { phase: "Test", weeks: "1-3", goals: ["Landing page and booking", "20 paid repairs", "Collect reviews"] },
      { phase: "Routine", weeks: "4-8", goals: ["Launch Rider plan", "Fixed weekly routes", "First office day"] },
      { phase: "Grow", weeks: "9-13", goals: ["50 plan subscribers", "Hire part-time mechanic"] },
    ],
    startup_costs: [
      { item: "Used van and fit-out", cost: "€9,000" },
      { item: "Tools and stand", cost: "€1,200" },
      { item: "Initial parts stock", cost: "€800" },
    ],
    kpis: [
      { metric: "Repairs per day", target: "6+" },
      { metric: "Plan subscribers", target: "50 by week 13" },
      { metric: "Google rating", target: "4.8+" },
    ],
    first_week: ["Register the business", "Buy tools", "Publish booking page", "Flyer one district"],
  },
  kit: {
    name_ideas: [
      { name: "SpokeDrop", why: "Short and says 'we drop by'." },
      { name: "PedalMedic", why: "Clear and friendly." },
      { name: "FixMyRide", why: "Says exactly what it does." },
      { name: "Curbside Cycles", why: "Highlights the at-your-door service." },
      { name: "Rolling Wrench", why: "Memorable image of a mobile workshop." },
    ],
    tagline: "Your bike, fixed at your door.",
    landing: {
      headline: "Bike broken? We come to you.",
      subheadline: "Same-day repairs at your home or office. Book in 30 seconds.",
      bullets: ["Same-day visits", "Fixed, transparent prices", "Monthly plans for daily riders"],
      cta: "Book a repair",
    },
    elevator_pitch:
      "We are a mobile bike repair service. Instead of losing your bike for days at a shop, you book online and our van fixes it at your door the same day.",
    posts: [
      { channel: "Instagram", text: "Flat tyre at 8am? We were there by 9. 🚲🔧 Book in 30 seconds — link in bio." },
      { channel: "Google Maps", text: "Now booking same-day mobile bike repairs in your district." },
    ],
    launch_email: {
      subject: "Your bike, fixed at your door — launch week offer",
      body: "Hi! This week we launch our mobile bike repair service. Book any repair before Sunday and the visit is free.",
    },
    launch_checklist: ["Booking page live", "Google profile verified", "First 10 reviews", "Flyers printed"],
  },
};
