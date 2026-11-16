// Launch kit: plain written-by-code website copy and 30-day plan, built only from the founder's own input
// (brand, city, offer, customer). Used in demo mode (no AI) and as the fallback when a writer fails.
// Honesty: no invented numbers, no reviews, no market facts. The only figures are the founder's own offer and
// goals the founder sets for themselves (clearly labelled as goals).
import type { KitInput } from "./kit-contract.js";
import type { PlanV2 } from "./marketing/schema.js";
import type { ModelSite } from "./site/spec.js";

export type BizKind = "food" | "pets" | "online" | "local";

export function kindOf(input: Pick<KitInput, "idea" | "brand">): BizKind {
  const t = input.idea.toLowerCase();
  if (/\b(dog|dogs|pet|pets|puppy|cat|cats|perro|paseo|walker|walks?)\b/.test(t)) return "pets";
  if (/\b(class|classes|course|courses|workshop|workshops|lesson|lessons)\b/.test(t)) return brand(input) ? "local" : "online";
  if (/\b(bakery|bread|sourdough|loaf|loaves|coffee|caf[eé]|kiosk|cake|food|restaurant|panader[ií]a|forn|pastry)\b/.test(t)) return "food";
  if (/\b(app|saas|software|online|shop online|e-?shop|platform|tool)\b/.test(t) && !input.brand.city) return "online";
  return input.brand.city ? "local" : "online";
}

const brand = (input: Pick<KitInput, "brand">) => !!input.brand.city;
const cap = (s: string) => (s ? s[0]!.toUpperCase() + s.slice(1) : s);
const trimDot = (s: string) => s.replace(/[.\s]+$/, "");
/** Lower-cases a leading capital so a phrase can sit mid-sentence ("Office workers" → "office workers"; "NYC" stays). */
const decap = (s: string) => (/^[A-Z][a-z]/.test(s) ? s[0]!.toLowerCase() + s.slice(1) : s);

/** "About" in one plain sentence plus the promise; never pastes the analysis' customer description mid-sentence. */
function aboutLine(name: string, kind: BizKind, city: string): string {
  const near = city ? ` in ${city}` : "";
  const what = { food: `${name} bakes fresh every morning for the neighbourhood${near}.`, pets: `${name} walks dogs for people who work long days${near}.`, online: `${name} is a small new service, run by its founder.`, local: `${name} is a new local business${near}, run by its founder.` }[kind];
  return `${what} We start with one simple offer and grow from what you tell us.`;
}

/** Website copy (the shape the website writer returns). */
export function templateSite(input: KitInput): ModelSite {
  const { brand, report } = input;
  const kind = kindOf(input);
  const city = brand.city ?? "";
  const what = trimDot(report.offer.what || input.idea);
  const near = city ? ` in ${city}` : "";
  const K = {
    food: {
      headline: city ? `Fresh every morning, close to home in ${city}` : "Fresh every morning, close to home",
      steps: [
        { icon: "wallet", title: "Reserve from your phone", body: "Pick your offer and pay in a minute with Bitcoin Cash." },
        { icon: "clock", title: "Come by on your way", body: "Show your reservation at the counter and it is ready for you." },
        { icon: "bread", title: "Enjoy it fresh", body: "Made the same day, in small batches, by the people who serve you." },
      ],
      services: [
        { icon: "bread", title: "Made today", body: "Everything on the counter is made the same morning." },
        { icon: "coffee", title: "Quick to pick up", body: "No queue for people who reserved ahead." },
        { icon: "heart", title: "Small and local", body: "A neighbourhood place, run by the founder." },
      ],
      faq: [
        { q: "When can I pick it up?", a: "From opening time on the days we are open. Your reservation stays valid until you collect it." },
        { q: "Can I reserve for someone else?", a: "Yes. Show the reservation on any phone at the counter." },
      ],
    },
    pets: {
      headline: city ? `A happy dog when you get home in ${city}` : "A happy dog when you get home",
      steps: [
        { icon: "calendar", title: "Book a first walk", body: "Choose a day and pay from your phone in a minute." },
        { icon: "walk", title: "We walk your dog", body: "The same friendly walker, on quiet routes near your home." },
        { icon: "camera", title: "You get an update", body: "A photo and a short note land on your phone after every walk." },
      ],
      services: [
        { icon: "dog", title: "Midday walks", body: "A break in the middle of a long work day." },
        { icon: "users", title: "Small groups", body: "A few dogs at a time, so every dog gets attention." },
        { icon: "shield", title: "The same walker", body: "Your dog gets to know one person, not a new face every time." },
      ],
      faq: [
        { q: "Do you meet my dog first?", a: "Yes. We meet you and your dog before the first walk to learn the routine." },
        { q: "What if I need to cancel?", a: "Message us the day before and we move the walk to another day." },
      ],
    },
    online: {
      headline: `${cap(what)}, without the hassle`,
      steps: [
        { icon: "search", title: "See what you get", body: "Everything is explained on this page, in plain words." },
        { icon: "wallet", title: "Reserve and pay", body: "Pay in a minute from your phone with Bitcoin Cash." },
        { icon: "mail", title: "We get in touch", body: "We confirm your order and tell you the next step by email." },
      ],
      services: [
        { icon: "check", title: "Clear offer", body: "One simple offer, so you know exactly what you pay for." },
        { icon: "chat", title: "A real person", body: "Write to us and the founder answers." },
        { icon: "lock", title: "Safe payment", body: "Paid straight from your wallet. We never see your keys." },
      ],
      faq: [
        { q: "How do I pay?", a: "With Bitcoin Cash from your phone: scan the code or open your wallet with one tap." },
        { q: "What happens after I reserve?", a: "We email you to confirm and to agree the details with you." },
      ],
    },
    local: {
      headline: city ? `${cap(what)}${near}` : cap(what),
      steps: [
        { icon: "wallet", title: "Reserve from your phone", body: "Pick the offer and pay in a minute with Bitcoin Cash." },
        { icon: "map-pin", title: "Come and see us", body: "Show your reservation and we take it from there." },
        { icon: "smile", title: "Enjoy it", body: "A local service run by the founder, made with care." },
      ],
      services: [
        { icon: "heart", title: "Run by the founder", body: "You deal with the person who started it." },
        { icon: "clock", title: "No waiting", body: "People who reserved ahead go first." },
        { icon: "home", title: "Close to you", body: "Made for the people who live and work nearby." },
      ],
      faq: [
        { q: "How do I pay?", a: "With Bitcoin Cash from your phone: scan the code or open your wallet with one tap." },
        { q: "Can I change my reservation?", a: "Yes. Write to us and we will sort it out with you." },
      ],
    },
  }[kind];
  const sub = `${cap(what)}${near}. Reserve now from your phone, it takes a minute.`;
  return {
    seo: { title: `${brand.name}${brand.tagline ? ` · ${trimDot(brand.tagline)}` : ""}`, description: sub },
    hero: { eyebrow: city ? `${brand.name} · ${city}` : brand.name, headline: K.headline, sub, cta: "Reserve now", secondary: "How it works" },
    offer: {
      title: "The launch offer",
      item: what,
      bullets: ["Reserve today, pay from your phone", "For the first customers only", "You get a confirmation straight away"],
      note: "Your reservation is saved with your payment. Show it when you come.",
    },
    how: { title: "How it works", steps: K.steps },
    services: { title: "What you get", intro: brand.tagline ? trimDot(brand.tagline) + "." : "", items: K.services },
    about: {
      title: `About ${brand.name}`,
      body: aboutLine(brand.name, kind, city),
    },
    local: kind === "online" || !city ? { title: "", body: "", area: "", hours: "" } : { title: "Where", body: `We are starting in ${city}. Reserve and we will confirm the details with you.`, area: city, hours: "" },
    faq: { title: "Questions", items: [...K.faq, { q: "Is this a real business?", a: `Yes. ${brand.name} is just opening, and the first customers help shape it. Payment goes straight to the founder.` }] },
    proof: { title: "", picks: [] },
    order: ["how-it-works-for-customer", "menu-or-services", "offer", "about", "local", "faq"],
    finalCta: { headline: "Be one of the first", sub: "Reserve today and we will be in touch.", cta: "Reserve now" },
    footer: { tagline: brand.tagline || brand.name },
  };
}

/** A 30-day plan (PlanV2) with no outside sources: only actions the founder controls and goals they set. */
export function templatePlan(input: KitInput): PlanV2 {
  const { brand, report } = input;
  const kind = kindOf(input);
  const city = brand.city ?? "";
  const what = trimDot(report.offer.what || input.idea);
  const who = decap(trimDot(report.customer || "your first customers"));
  const goalN = report.offer.limit && report.offer.limit <= 50 ? report.offer.limit : 10;
  const near = city ? ` in ${city}` : "";
  const ch = {
    food: [
      { name: "Counter and window sign", role: "first sales", why: "People who already walk past are the easiest first customers.", first_action: "Put a sign with your QR code in the window." },
      { name: "Instagram", role: "awareness", why: "Food is bought with the eyes; show what you make each morning.", first_action: "Post a photo of today's batch with the reserve link." },
      { name: "Neighbourhood WhatsApp groups", role: "first sales", why: "Neighbours trust a message from someone they know.", first_action: "Ask three friends to share your launch message." },
      { name: "Google Maps listing", role: "repeat", why: "People search for food nearby on their phone.", first_action: "Create your free business listing with photos and hours." },
    ],
    pets: [
      { name: "Flyers at vets and pet shops", role: "awareness", why: "Owners go there often and look at the noticeboard.", first_action: "Ask two pet shops if you can leave a flyer with your QR code." },
      { name: "Parks at walk times", role: "first sales", why: "You meet owners and their dogs face to face.", first_action: "Spend two mornings at the nearest dog park and hand out cards." },
      { name: "Neighbourhood WhatsApp and Facebook groups", role: "first sales", why: "Owners ask for walker tips in local groups.", first_action: "Post a short intro with a photo and the reserve link." },
      { name: "Photos after every walk", role: "repeat", why: "Owners share happy photos, and that brings friends.", first_action: "Send a photo and a short note after each walk." },
    ],
    online: [
      { name: "Your own network", role: "first sales", why: "The first buyers usually come from people who know you.", first_action: "Message ten people who might want this, with your link." },
      { name: "One online community", role: "awareness", why: "One place where your customers already talk is enough to start.", first_action: "Join one group and answer questions before you post your offer." },
      { name: "Short posts on one social network", role: "awareness", why: "Showing the work builds trust before people pay.", first_action: "Post what you are building and why, with your link." },
      { name: "Email to people who joined the list", role: "repeat", why: "People who left their email are your warmest leads.", first_action: "Send a short thank-you email to everyone on the list." },
    ],
    local: [
      { name: "Word of mouth", role: "first sales", why: "Local services grow from people who recommend you.", first_action: "Tell ten people you know, and ask each to pass it on." },
      { name: "Flyers in shops nearby", role: "awareness", why: "People see them where they already go every day.", first_action: "Print a simple flyer with your QR code and leave it in three shops." },
      { name: "Neighbourhood groups online", role: "first sales", why: "Neighbours ask each other for recommendations there.", first_action: "Post a short intro with the reserve link." },
      { name: "Google Maps listing", role: "repeat", why: "People search for local services on their phone.", first_action: "Create your free business listing." },
    ],
  }[kind].map((c) => ({ ...c, role: c.role as PlanV2["channels"][number]["role"], source: null, weekly_hours: 2, cost: 0 }));
  const day = (d: number, channel: string, action: string, copy: PlanV2["weeks"][number]["days"][number]["copy"] = null) => ({ day: d, time: "", channel, action, copy, hours: 1 });
  const [c1, c2, c3, c4] = ch.map((c) => c.name) as [string, string, string, string];
  const weeks: PlanV2["weeks"] = [
    { n: 1, theme: "Get ready", aim: "Everything in place so people can find you and reserve.", days: [day(1, "Website", "Share your website link with five friends and ask what is unclear."), day(2, c4, ch[3]!.first_action, "profile"), day(4, c1, ch[0]!.first_action, "flyer"), day(6, c3, ch[2]!.first_action, "message")] },
    { n: 2, theme: "First customers", aim: "Your first reservations from people close to you.", days: [day(8, c2, ch[1]!.first_action, "post-1"), day(10, c3, "Reply to every comment and message the same day."), day(12, "Email", "Write to everyone who joined the list.", "email"), day(14, "By hand", "Count your reservations and write down what people asked.")] },
    { n: 3, theme: "Show the work", aim: "People see real customers using it.", days: [day(15, c2, "Post about your first customers (with their permission).", "post-2"), day(17, c1, "Refresh your sign or flyer with what people liked most."), day(19, c4, "Ask your first customers for an honest review."), day(21, "By hand", "Count again. Keep the channel that brought the most reservations.")] },
    { n: 4, theme: "Decide", aim: "Know if this is worth growing.", days: [day(22, c2, "Post a reminder that the launch offer ends soon.", "post-3"), day(25, "Local press or newsletter", "Send a short note about your opening.", "press"), day(28, "By hand", "Add up reservations and payments for the month."), day(30, "Decision", "Compare with your goal and choose: grow, adjust or stop.")] },
  ];
  const name = brand.name;
  return {
    lang: "en",
    currency: brand.currency || "€",
    headline: `Win your first ${goalN} customers${near} by talking to the people closest to you first, then showing real customers.`,
    goal: { metric: "paid reservations", target: goalN, unit: "customers", by_day: 30, why: "A goal you set for yourself: enough paying customers to know people really want this.", how_counted: "Count the payments on your website; each one is a reservation." },
    customer: { who: cap(who), places: [] },
    channels: ch,
    rejected: [
      { name: "Paid ads", why_not: "Not before you know which message works. Start with free channels." },
      { name: "Every social network at once", why_not: "One done well beats five done badly." },
    ],
    budget: {
      tiers: [
        { amount: 0, label: "Free", lines: [] },
        { amount: 100, label: "Small budget", lines: [{ channel: "Printing", amount: 40, for: "Flyers and a window sign" }, { channel: c2, amount: 60, for: "Boost your best post near you" }] },
        { amount: 500, label: "Bigger push", lines: [{ channel: "Printing", amount: 100, for: "Flyers, sign and cards" }, { channel: c2, amount: 250, for: "Local ads on your best post" }, { channel: "Launch day", amount: 150, for: "A small opening offer or event" }] },
      ],
      reserve_pct: 10,
      reallocate_rule: "Every week, move money to the channel that brought the most reservations.",
    },
    weeks,
    kpis: [
      { name: "Paid reservations", target: `${goalN} by day 30`, how_to_count: "Payments received on your website.", count_from: "bch payments" },
      { name: "People who joined the list", target: "Count every week", how_to_count: "Emails left on your website.", count_from: "website" },
      { name: "Conversations", target: "Count every week", how_to_count: "Messages and talks with possible customers.", count_from: "by hand" },
    ],
    copy: {
      posts: [
        { channel: c2, hook: `${name} is open${near}.`, body: `${cap(what)}. Made for ${who}. We are starting small so we can get it right for our first customers.`, cta: "Reserve from the link." },
        { channel: c2, hook: "Our first customers are here.", body: `Thank you to everyone who reserved in the first days. Here is what they told us, and what we changed.`, cta: "Reserve yours from the link." },
        { channel: c2, hook: "The launch offer ends soon.", body: `If you wanted to try ${name}, now is a good moment. The launch offer is only for the first customers.`, cta: "Reserve from the link." },
      ],
      message: `Hi! I just started ${name}: ${what}. I would love you to try it, or pass it on to someone who might. Here is the link:`,
      email: { subject: `Thanks for joining ${name}`, body: `Hi,\n\nThank you for leaving your email. ${name} is opening with a launch offer for the first customers: ${what}.\n\nYou can reserve from the website in a minute. Reply to this email with any question, I read every one.\n\nThank you,\nThe founder` },
      flyer: { headline: `${name}${near}`, lines: [cap(what), "Reserve from your phone in a minute", "Scan the code"] },
      profile: `${name}: ${what}${near}. ${brand.tagline ? trimDot(brand.tagline) + ". " : ""}Reserve online and pay from your phone.`,
      press: `${name} opens${near}, offering ${what}. The founder started it for ${who}. Reservations are open on the website.`,
    },
    local: [],
    events: [],
    assumptions: ["This plan was written without research on your area. Check which local groups and shops are worth it before you start."],
    decision: { scale_if: `You reach ${goalN} paid reservations and people come back.`, adjust_if: "People are interested but few pay: change the offer or the message.", stop_if: "Almost nobody shows interest after trying every channel." },
  };
}
