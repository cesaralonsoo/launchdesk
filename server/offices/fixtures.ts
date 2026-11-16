// Sample results for every task, for the two demo businesses (a sourdough bakery with classes in Valencia, a dog
// walking service in Madrid) plus a plain fallback for anything else. Used when the server has no AI key. Sample
// data is always labelled as such on screen; competitor names are kinds of business, never invented companies.
import type { Brain, TaskId, TaskResult } from "./types.js";

export type FixtureKey = "bakery" | "dog" | "other";

export function fixtureKey(b: Brain): FixtureKey {
  const t = `${b.name} ${b.what}`.toLowerCase();
  if (/\b(dog|dogs|walk|walker|walking|walks|perro|perros|paseo|pet)\b/.test(t)) return "dog";
  if (/\b(bread|sourdough|baking|bake|baker|bakery|pan|masa madre|pastry|croissant)\b/.test(t)) return "bakery";
  return "other";
}

type F = (b: Brain) => TaskResult;

const BAKERY: Record<TaskId, F> = {
  posts: (b) => ({
    title: "5 posts for this week",
    intro: `Written for ${b.name}. Post them in the morning, when people plan their day.`,
    items: [
      { heading: "Monday · behind the scenes", text: "5:40 am. The oven is hot, the starter is bubbly, and the first loaves are going in. This is what a 48-hour dough looks like when it's ready. See you at 8.", note: "Photo: your hands shaping a loaf, flour on the bench." },
      { heading: "Tuesday · offer", text: "Tuesday is seeded rye day. Bring a friend who has never tried it: the second slice of the tasting board is on us.", note: "Photo: the rye cut open, close up on the crumb." },
      { heading: "Wednesday · customer story", text: "Marta came to a Saturday class in spring. Last week she brought us a loaf from her own starter. It was better than ours. (Don't tell anyone.)", note: "Photo: a customer's loaf next to yours (ask first)." },
      { heading: "Thursday · useful tip", text: "Your sourdough goes stale fast? Never keep it in the fridge. Cut side down on a wooden board, a cloth on top. Day 3: toast it.", note: "Photo: a loaf cut side down on a board." },
      { heading: "Friday · question", text: "Next Saturday class: focaccia or croissants? Vote in the comments. The winner goes on the board next week. #Valencia #sourdough", note: "Photo: both side by side." },
    ],
  }),
  competitors: () => ({
    title: "Your competitors this week",
    intro: "Sample data: on a live server this office searches the web and links every source.",
    items: [
      { heading: "Supermarket bakery counters", text: "Bake-off sourdough at about €2.20 a loaf, with a weekend 2-for-1 running.", note: "What to do: don't fight on price. Say \"48-hour dough, baked here\" on your board." },
      { heading: "Chain bakery cafés nearby", text: "New breakfast menu at €4.90 with coffee and toast. Busy from 8 to 10.", note: "What to do: a €4 \"toast and coffee\" before 9 to catch the same people." },
      { heading: "Culinary school short courses", text: "Bread course at €95 for 2 evenings, mostly weekdays, waiting list in December.", note: "What to do: your €45 Saturday class is half the price. Say it." },
      { heading: "Online video courses", text: "A new sourdough course on sale at €19 this month.", note: "What to do: offer a free starter jar to people who took an online course and still struggle." },
    ],
  }),
  prices: (b) => ({
    title: "Your prices, checked",
    intro: "Sample data. Similar bakeries in Valencia charge €3.80 to €5.50 for a sourdough loaf; supermarkets about €2.20.",
    items: [
      { heading: "Entry · Half loaf €2.60", text: "For people living alone and first-timers. It brings in people who think €4.50 is a lot for bread." },
      { heading: "Main · Sourdough loaf €4.80", text: "Up from €4.50. You are at the lower end for 48-hour dough baked on site; 30 cents more is hardly noticed." },
      { heading: "Premium · Saturday class €49 with starter jar", text: "The starter jar costs you under €1 and makes the class feel complete. Similar classes charge €60 to €95." },
    ],
    sources: [],
  }),
  breakeven: () => ({
    title: "How many sales you need",
    intro: "Sample sums. The costs are assumptions: change them to yours.",
    items: [
      { heading: "Fixed costs a month · €3,050", text: "Rent €1,400 + energy €550 + insurance and fees €300 + one helper part time €800." },
      { heading: "Margin per loaf · €3.10", text: "Price €4.50 minus flour, salt, packaging and card fees (about €1.40)." },
      { heading: "Break-even · 984 loaves a month", text: "€3,050 ÷ €3.10 = 984 loaves, about 38 a day over 26 opening days." },
      { heading: "With classes", text: "Each full class (8 seats × €45, about €300 margin) replaces 97 loaves. Two classes a month bring you down to 790 loaves, about 30 a day." },
      { heading: "The number to watch", text: "Loaves sold per day. Under 30, push the classes; over 40, you can hire more hours." },
    ],
  }),
  replies: (b) => ({
    title: "Reply drafts to customers",
    intro: "Copy, check the parts in [brackets], and send.",
    items: [
      { heading: "\"Do you have gluten-free bread?\"", text: `Hi! Not right now: our kitchen uses wheat flour all day, so we can't promise gluten-free. Our 100% rye is lower in gluten, but not free of it. Sorry, and thanks for asking! ${b.name}` },
      { heading: "\"Can I reserve a loaf for Saturday?\"", text: "Of course! Tell us which loaf and what time you'll come, and we'll keep it with your name until [1 pm]." },
      { heading: "\"Is the class OK for a total beginner?\"", text: "Yes, that's who it's for. You bake your own loaf from scratch, and you take home a jar of our starter. No equipment needed." },
      { heading: "\"Do you do orders for events?\"", text: "We do, with 3 days' notice. Tell us the date and how many people, and we'll send you a price today. [check: minimum order]" },
      { heading: "\"Why is your bread more expensive than the supermarket?\"", text: "Fair question! Our dough rests for 48 hours and we bake it here every morning, with flour from [mill]. It keeps for days and tastes like bread used to." },
    ],
  }),
  faq: () => ({
    title: "Questions page for your website",
    items: [
      { heading: "What time is bread ready?", text: "The first loaves are out at 8 am. Sourdough sells out most days by early afternoon." },
      { heading: "Can I reserve?", text: "Yes, send us a message the day before and we'll keep it with your name." },
      { heading: "Do you sell gluten-free bread?", text: "No. Our kitchen uses wheat all day, so we can't make it safe for coeliacs." },
      { heading: "What do I need for a class?", text: "Nothing. We give you an apron, flour and a jar of starter to take home." },
      { heading: "How long does sourdough keep?", text: "Three to four days on a wooden board, cut side down. Don't put it in the fridge." },
      { heading: "Do you deliver?", text: "[check] Not yet. You can collect any order from the shop." },
    ],
  }),
};

const DOG: Record<TaskId, F> = {
  posts: (b) => ({
    title: "5 posts for this week",
    intro: `Written for ${b.name}. Post at lunchtime, when owners check their phone at work.`,
    items: [
      { heading: "Monday · behind the scenes", text: "8 leads, 4 dogs, 1 route: this is the bag we take on every walk. Water, towels, treats, poo bags and a first-aid kit, every time.", note: "Photo: the open bag on a park bench." },
      { heading: "Tuesday · offer", text: "New in Chamberí: midday group walks, same walker every day, €49 a week. Three places left for December.", note: "Photo: three dogs on leads, from behind, park path." },
      { heading: "Wednesday · customer story", text: "Lola used to pull and bark at every bike. Six weeks of walks with the same group later, she trots. Her owner says she sleeps all afternoon now.", note: "Photo: Lola mid-walk (ask the owner first)." },
      { heading: "Thursday · useful tip", text: "Hot pavement test: put the back of your hand on it for 7 seconds. Too hot for you, too hot for paws. Walk in the shade or before 11.", note: "Photo: a hand on the pavement next to a paw." },
      { heading: "Friday · question", text: "What's your dog's secret talent? Ours can find a tennis ball in any bush in Madrid. Tell us below!", note: "Photo: a dog with a tennis ball." },
    ],
  }),
  competitors: () => ({
    title: "Your competitors this week",
    intro: "Sample data: on a live server this office searches the web and links every source.",
    items: [
      { heading: "Pet-sitting marketplaces", text: "Single walks from about €10 to €15, a different walker each time. A new \"first walk free\" offer this month.", note: "What to do: say \"same walker, every day\" in your first line." },
      { heading: "Independent local walkers", text: "Around €10 a walk, mostly full, booking by WhatsApp only.", note: "What to do: offer a waiting list and a trial walk; their overflow is your market." },
      { heading: "Dog daycare centres", text: "€25 to €30 a day, pick-up extra. One opened a new branch near Cuatro Caminos.", note: "What to do: compare: €49 a week for daily walks vs €125+ a week of daycare." },
    ],
  }),
  prices: () => ({
    title: "Your prices, checked",
    intro: "Sample data. Single walks in Madrid go for €10 to €15; weekly plans are rare.",
    items: [
      { heading: "Entry · Trial walk €8", text: "One walk to meet the group. Most people who try one stay; it lowers the first step." },
      { heading: "Main · Weekly group plan €49", text: "Five midday walks. Under €10 a walk, with the same walker: cheaper and calmer than one-off bookings." },
      { heading: "Premium · Solo walk €18", text: "For dogs that don't do groups. Keep it limited so it doesn't fill your midday slot." },
    ],
  }),
  breakeven: () => ({
    title: "How many sales you need",
    intro: "Sample sums. The costs are assumptions: change them to yours.",
    items: [
      { heading: "Fixed costs a month · €1,190", text: "Insurance €60 + phone and app €40 + transport €90 + your own minimum pay €1,000." },
      { heading: "Margin per weekly plan · €45", text: "€49 minus card fees, treats and bags (about €4)." },
      { heading: "Break-even · 6 dogs on a weekly plan", text: "€1,190 ÷ (€45 × 4.3 weeks) = 6.1 dogs. One group of 6 at midday covers the month." },
      { heading: "The number to watch", text: "Dogs on a weekly plan. At 12 (two groups) you earn about twice your minimum." },
    ],
  }),
  replies: (b) => ({
    title: "Reply drafts to customers",
    intro: "Copy, check the parts in [brackets], and send.",
    items: [
      { heading: "\"Is my dog OK in a group?\"", text: "Most dogs love it! We start with a trial walk alone with the walker, then with one calm dog. If it's not for your dog, we'll tell you honestly." },
      { heading: "\"What if it rains?\"", text: "We still walk, a little shorter, and dry every dog with a towel before taking them home." },
      { heading: "\"Are you insured?\"", text: "Yes, every walk is covered by our liability insurance. [check: insurer name] We can send you the certificate." },
      { heading: "\"Can you pick up my keys?\"", text: "Yes. We meet once to get the keys and see your home, and we keep them in a numbered tag, never with your address." },
      { heading: "\"Can I pause the weekly plan?\"", text: `Of course, just tell us by Friday for the next week. No fee. ${b.name}` },
    ],
  }),
  faq: () => ({
    title: "Questions page for your website",
    items: [
      { heading: "When do the walks happen?", text: "Every weekday between 12 and 2 pm, for about an hour." },
      { heading: "How many dogs in a group?", text: "Six at most, always the same dogs and the same walker." },
      { heading: "Which areas do you cover?", text: "[check] Chamberí and the streets around it." },
      { heading: "Are you insured?", text: "Yes, every walk is covered. We can send the certificate." },
      { heading: "What if my dog doesn't like groups?", text: "We offer solo walks too, and we always start with a trial." },
      { heading: "How do I pay?", text: "Weekly, by card or Bizum. You can pause any week." },
    ],
  }),
};

/** Anything else: honest, generic, built only from what the owner told us. */
const OTHER: Record<TaskId, F> = {
  posts: (b) => ({
    title: "5 posts for this week",
    intro: `Sample data for ${b.name}. With the AI on, these use your own facts and voice.`,
    items: [
      { heading: "Monday · behind the scenes", text: `A normal Monday at ${b.name}: here's what happens before you see us. ${b.where !== "online" ? `Come by in ${b.where}.` : ""}`.trim() },
      { heading: "Tuesday · offer", text: `This week only: tell us you saw this post and get a small thank-you on your first order.` },
      { heading: "Wednesday · customer story", text: "What one of our regulars told us last week, and why it made our day." },
      { heading: "Thursday · useful tip", text: "One thing most people get wrong about what we do, and how to get it right." },
      { heading: "Friday · question", text: "What should we try next? Tell us in the comments." },
    ],
  }),
  competitors: (b) => ({
    title: "Your competitors this week",
    intro: "Sample data: on a live server this office searches the web and links every source.",
    items: (b.competitors.length ? b.competitors : [{ name: "Similar businesses nearby", note: "" }, { name: "Online alternatives", note: "" }]).slice(0, 4).map((c) => ({
      heading: c.name,
      text: c.note || "Prices and news are checked on every live run.",
      note: "What to do: the live run suggests one move per competitor.",
    })),
  }),
  prices: (b) => ({
    title: "Your prices, checked",
    intro: "Sample data. The live run compares your prices with similar businesses near you, with links.",
    items: [
      { heading: "Entry", text: "A smaller, cheaper version to get people to try you." },
      { heading: "Main", text: b.price ? `Your main offer: ${b.price}.` : "Your main offer at its current price." },
      { heading: "Premium", text: "A bigger version with something extra that costs you little." },
    ],
  }),
  breakeven: () => ({
    title: "How many sales you need",
    intro: "Sample data. The live run works out your own sums from your price and typical costs.",
    items: [
      { heading: "Fixed costs a month", text: "Rent, insurance, tools and your own minimum pay." },
      { heading: "Margin per sale", text: "Your price minus what each sale costs you." },
      { heading: "Break-even", text: "Fixed costs ÷ margin per sale = sales you need each month." },
    ],
  }),
  replies: (b) => ({
    title: "Reply drafts to customers",
    intro: "Sample data. Paste real messages and the live run answers them in your voice.",
    items: [
      { heading: "\"Are you open on Sunday?\"", text: "[check] Thanks for asking! Our hours are on our page; message us if you need a different time." },
      { heading: "\"How much is it?\"", text: b.price ? `It's ${b.price}. Happy to tell you more!` : "[check] Here are our prices. Happy to tell you more!" },
      { heading: "\"Can I book?\"", text: "Of course. Tell us the day and time that suit you and we'll confirm today." },
    ],
  }),
  faq: () => ({
    title: "Questions page for your website",
    intro: "Sample data. The live run writes it from your own facts.",
    items: [
      { heading: "Where are you?", text: "[check] Our address and how to find us." },
      { heading: "When are you open?", text: "[check] Our opening hours." },
      { heading: "How do I pay?", text: "[check] Card, cash or Bizum." },
    ],
  }),
};

const SETS: Record<FixtureKey, Record<TaskId, F>> = { bakery: BAKERY, dog: DOG, other: OTHER };

export function fixtureResult(task: TaskId, b: Brain): TaskResult {
  return SETS[fixtureKey(b)][task](b);
}

/** The two demo businesses for "Bring a project you already run" (one tap fills the form). */
export const DEMO_FORMS = [
  { label: "A bakery", what: "A small sourdough bakery called \"Miga\" that also runs Saturday baking classes", where: "Ruzafa, Valencia", link: "" },
  { label: "Dog walks", what: "Midday group dog walks called \"Paseo\", same walker every day", where: "Chamberí, Madrid", link: "" },
] as const;
