import type { DeptId, Stage, WorkDept } from "../types";

export type Member = {
  id: DeptId;
  name: string;
  role: string;
  color: string;
  stage?: Stage;
  /** Live output tile label */
  tile?: string;
  /** Agenda line, e.g. "Brief & plan" */
  task: string;
  /** Status pill text while working */
  working: string;
  /** Label note while working (under the room name) */
  busy: string;
  /** Live output tile text while working: one short word, never clipped */
  short: string;
  /** What did not get done, for the error card: "Sam couldn't finish …" */
  snag: string;
  /** Guide card text while working */
  guide: string;
  /** Short description under the department panel title */
  panelSub: string;
  /** What this department delivers, for the gate rows */
  delivers: string;
};

export const TEAM: Record<DeptId, Member> = {
  lobby: {
    id: "lobby", name: "Lobby", role: "Intake · cash register", color: "#0AC18E", task: "Payments",
    working: "Payment received", busy: "", short: "", snag: "", guide: "", panelSub: "", delivers: "",
  },
  mia: {
    id: "mia", name: "Mia", role: "Chief of Staff", color: "#8B7CF6", stage: "validate", tile: "Plan", task: "Brief & plan",
    working: "Mia is turning your idea into a brief and a plan", busy: "Writing the plan…", short: "Planning…", snag: "the project plan",
    guide: "Mia, the chief of staff, turns your idea into a brief and schedules the work of every department.",
    panelSub: "Brief → project plan → schedule", delivers: "Brief · 4-week plan",
  },
  leo: {
    id: "leo", name: "Leo", role: "Market Research", color: "#3B82F6", stage: "validate", tile: "Opportunity", task: "Market & score",
    working: "Leo is scanning the market and competitors", busy: "Scanning the market…", short: "Scanning…", snag: "the market scan",
    guide: "Leo researches the market and your competitors, then gives the opportunity a score out of 10.",
    panelSub: "Market scan · competitors · opportunity score", delivers: "Opportunity score",
  },
  sam: {
    id: "sam", name: "Sam", role: "Strategy & Finance", color: "#F59E0B", stage: "validate", tile: "Model", task: "Business model",
    working: "Sam is running the numbers", busy: "Running the numbers…", short: "Crunching…", snag: "your numbers",
    guide: "Sam works out your price, what it costs to start, and the month you would break even.",
    panelSub: "Price · start-up cost · break-even", delivers: "Business model",
  },
  nova: {
    id: "nova", name: "Nova", role: "Brand", color: "#EC4899", stage: "build", tile: "Name", task: "Name & identity",
    working: "Nova is naming your brand", busy: "Naming the brand…", short: "Naming…", snag: "your brand names",
    guide: "Nova proposes three names, each with a palette, a tagline and a brand voice.",
    panelSub: "Names · palettes · voice", delivers: "3 names with palettes · you pick",
  },
  dex: {
    id: "dex", name: "Dex", role: "Design & Product", color: "#F97362", stage: "build", tile: "Logo", task: "Logo & landing",
    working: "Dex is designing logos and the landing page", busy: "Sketching logos…", short: "Sketching…", snag: "the logos and landing copy",
    guide: "Dex designs three logo concepts and writes the copy for your landing page.",
    panelSub: "Logo concepts · landing page copy", delivers: "3 logo concepts + landing page",
  },
  rae: {
    id: "rae", name: "Rae", role: "Marketing & Content", color: "#14B8A6", stage: "build", tile: "Launch", task: "30-day launch",
    working: "Rae is planning a 30-day launch", busy: "Planning 30 days…", short: "Scheduling…", snag: "the launch calendar",
    guide: "Rae plans a 30-day launch calendar and drafts your first three posts, ready to publish.",
    panelSub: "30-day launch calendar · first posts", delivers: "Calendar + 3 ready posts",
  },
  pip: {
    id: "pip", name: "Pip", role: "Launch Pad", color: "#94A3B8", stage: "build", tile: "Landing", task: "Go live",
    working: "Pip is publishing your landing page", busy: "Publishing…", short: "Publishing…", snag: "publishing your page",
    guide: "Pip publishes your landing page with Bitcoin Cash pre-orders that go straight to your wallet.",
    panelSub: "Landing page · BCH pre-orders", delivers: "BCH pre-orders + live page",
  },
};

export const WORK_ORDER: WorkDept[] = ["mia", "leo", "sam", "nova", "dex", "rae", "pip"];

export const STAGE_INFO: Record<Stage, { n: 1 | 2; label: string; title: string; gets: string }> = {
  validate: {
    n: 1, label: "Stage 1 · Validate", title: "Validate",
    gets: "You get: Mia's plan, Leo's opportunity score and Sam's business model. Not convinced? Stop after this stage and keep the report.",
  },
  build: {
    n: 2, label: "Stage 2 · Build & Launch", title: "Build & Launch",
    gets: "You get: name & identity, logo, a landing page with BCH pre-orders, a 30-day launch calendar and the first posts.",
  },
};

export const EXAMPLES = [
  "A specialty coffee kiosk for commuters in Barcelona",
  "Neighbour-to-neighbour camping gear rental",
  "A taco truck for office parks in Austin",
  "An online Excel course for small business owners",
];
