// Shared contract for the Launch kit (WP1 site, WP2 logo, WP3 marketing, WP4 orchestrator).
// FROZEN after 16 Nov: request changes in .notes/next/contract-requests.md, WP4 applies them.

export interface KitBrand {
  name: string;
  tagline: string;
  voice: string;
  palette: { primary: string; accent: string; bg: string; ink: string };
  fonts: { display: string; text: string };
  lang: string;
  city?: string;
  currency: string;
}

export interface KitInput {
  projectId: string;
  idea: string;
  brand: KitBrand;
  report: ReportDigest;
  founderAddress: string;
  slug: string;
}

export interface ReportDigest {
  customer: string;
  pain: string;
  offer: { what: string; price: number; normal?: number; limit?: number };
  /** Sourced numbers, most useful first. kind: "demand" = about the customer or their problem; "price" = a market or
   * competitor price (context, never a headline number); "context" = population, rent, fees, rules (not for the page). */
  stats: Array<{ value: string; label: string; sourceUrl: string; kind?: "demand" | "price" | "context" }>;
  competitors: Array<{ name: string; gap: string }>;
  risks: string[];
}

export interface LogoOption {
  id: string;
  family: "literal" | "monogram" | "geometric";
  idea: string;
  svg: string; /* inner, viewBox 0 0 64 64, linted */
}

export interface LogoResult {
  options: LogoOption[];
  chosen: string;
  fallback: boolean;
}

/** The 3 standard designs, plus "custom": the page designed for this business alone (site2, 16 Nov). */
export type SiteTemplate = "editorial" | "bold" | "warm" | "custom";
export type StandardTemplate = Exclude<SiteTemplate, "custom">;

/** A real photo found for the site (metadata only; the bytes live in the site_photos table). */
export interface SitePhotoMeta {
  n: number; /* 1-based, served at /s/:slug/p/:n */
  ref: string; /* "p1".. as the page HTML refers to it */
  id: string;
  role: "hero" | "detail" | "people" | "place";
  alt: string;
  title: string;
  creator?: string;
  creatorUrl?: string;
  credit: string;
  license: "cc0" | "pdm" | "by" | "by-sa";
  licenseVersion?: string;
  licenseUrl: string;
  sourceUrl: string;
  provider: "rawpixel" | "stocksnap" | "wordpress" | "wikimedia";
  width: number;
  height: number;
  mime: "image/jpeg" | "image/webp";
  size: number;
  hash: string;
  /** What the photo really shows (photo check or the source's full title and tags), for the page designer. */
  shows?: string;
}

export interface SiteResult {
  spec: unknown; /* WP1 SiteSpec */
  /** The live design. "custom" only while custom.status === "done". */
  template: SiteTemplate;
  /** The standard design to fall back to when the custom page cannot be shown. */
  base?: StandardTemplate;
  /** The founder chose a design by hand: never switch it automatically. */
  picked?: boolean;
  photos?: SitePhotoMeta[];
  /** The page designed for this business (its HTML lives in the site_custom table, never in the kit JSON). */
  custom?: { status: "working" | "done" | "error"; version: number; usd?: number };
}

export interface MarketingResult {
  plan: unknown; /* WP3 PlanV2 */
  sources: Array<{ n: number; url: string; title: string }>;
}

export interface Kit {
  brand: KitBrand;
  logo?: LogoResult;
  site?: SiteResult;
  marketing?: MarketingResult;
  status: Record<"brand" | "logo" | "site" | "marketing", "queued" | "working" | "done" | "error">;
}
