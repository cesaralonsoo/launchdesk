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
  stats: Array<{ value: string; label: string; sourceUrl: string }>;
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

export type SiteTemplate = "editorial" | "bold" | "warm";

export interface SiteResult {
  spec: unknown; /* WP1 SiteSpec */
  template: SiteTemplate;
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
