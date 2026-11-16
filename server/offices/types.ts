// "Your offices" (management slice, 18 Nov). Shared by the server (server/offices/**) and the web view
// (web/proto/ui/offices.ts). Plain data only: no imports, so the browser bundle can use it too.

export type OfficeId = "marketing" | "research" | "money" | "customers";
export type TaskId = "posts" | "competitors" | "prices" | "breakeven" | "replies" | "faq";

/** What every office knows about the business. Kept small and stable so it can be cached as one block. */
export interface Brain {
  name: string;
  /** One sentence: what the business does. */
  what: string;
  /** Where it runs (city, online, ...). */
  where: string;
  link?: string;
  customer?: string;
  price?: string;
  stage?: string;
  goal?: string;
  voice?: string;
  competitors: Array<{ name: string; note: string }>;
  /** Short facts from the report or from the owner's answers. */
  facts: string[];
  lang: string;
  currency: string;
}

export interface FollowUp {
  id: "customer" | "price" | "goal" | "stage";
  question: string;
  hint: string;
}

export interface TaskDef {
  id: TaskId;
  office: OfficeId;
  title: string;
  /** What you get, one line. */
  line: string;
  /** Price in US cents, shown before running (worst-case real cost × 3). */
  cents: number;
  /** Optional text the owner can add (e.g. customer messages to answer). */
  input?: { label: string; placeholder: string };
}

export interface OfficeDef {
  id: OfficeId;
  name: string;
  line: string;
  tasks: TaskDef[];
}

export interface TaskResult {
  title: string;
  intro?: string;
  items: Array<{ heading?: string; text: string; note?: string }>;
  sources?: Array<{ title: string; url: string }>;
}

export type TaskStatus = "quoted" | "working" | "done" | "error";

export interface InboxItem {
  id: string;
  task: TaskId;
  office: OfficeId;
  title: string;
  status: TaskStatus;
  quotedCents: number;
  /** What was charged against the quote (real cost × 3, never above the quote). Set when done. */
  usedCents?: number;
  paid?: { txid: string; sats: number; test: boolean };
  result?: TaskResult;
  error?: string;
  createdAt: number;
  finishedAt?: number;
}

export interface OfficesView {
  id: string;
  source: "report" | "brought";
  projectId?: string;
  brain: Brain;
  /** Follow-up questions still open (only for a brought project, until answered or skipped). */
  questions: FollowUp[];
  offices: OfficeDef[];
  inbox: InboxItem[];
  /** True when results are sample data (no AI key on the server). */
  sample: boolean;
}

export interface TaskQuote {
  taskId: string;
  cents: number;
  sats: number;
  address: string;
  tag: string;
  expiresAt: number;
  bchUsd: number;
  /** The server lets this browser run it without paying (sample data, or local test). */
  testOk: boolean;
}
