import { normalize, type AppConfig, type CreatedProject, type Project, type Quote, type ShareLink, type SiteData, type Stage, type Stats, type WorkDept } from "./types";

import { ownerKey } from "./app/projects";

export class ApiError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
  }
}

/** F3: the owner key saved for a project (My projects, localStorage) goes with every call on that project. */
function ownerHeader(url: string): Record<string, string> {
  const m = url.match(/^\/api\/projects\/([^/?]+)/);
  if (!m) return {};
  const key = ownerKey(decodeURIComponent(m[1]!));
  return key ? { "x-owner-key": key } : {};
}

async function req<T>(method: string, url: string, body?: unknown): Promise<T> {
  let r: Response;
  try {
    const headers: Record<string, string> = { ...ownerHeader(url), ...(body ? { "content-type": "application/json" } : {}) };
    r = await fetch(url, {
      method,
      headers: Object.keys(headers).length ? headers : undefined,
      body: body ? JSON.stringify(body) : undefined,
    });
  } catch {
    throw new ApiError("Cannot reach the LaunchDesk server. Check your connection.", 0);
  }
  const data = (await r.json().catch(() => ({}))) as { error?: string };
  if (!r.ok) throw new ApiError(data.error || `Request failed (${r.status})`, r.status);
  return data as T;
}

export type PayBody = { stage: Stage; txHex?: string; dev?: boolean; founderAddress?: string };

export const api = {
  config: () => req<AppConfig>("GET", "/api/config"),
  stats: () => req<Stats>("GET", "/api/stats"),
  /** ownerKey arrives with F3 (WS3); until then it is missing. */
  create: (idea: string) => req<Partial<CreatedProject> & { id: string }>("POST", "/api/projects", { idea }),
  get: (id: string) => req<Project>("GET", `/api/projects/${encodeURIComponent(id)}`).then(normalize),
  quote: (id: string, stage: Stage) => req<Quote>("POST", `/api/projects/${encodeURIComponent(id)}/quote`, { stage }),
  pay: (id: string, body: PayBody) => req<Project>("POST", `/api/projects/${encodeURIComponent(id)}/pay`, body).then(normalize),
  run: (id: string, stage: Stage) => req<{ ok: true }>("POST", `/api/projects/${encodeURIComponent(id)}/run`, { stage }),
  site: (slug: string) => req<SiteData>("GET", `/api/sites/${encodeURIComponent(slug)}`),
  // ---- v4 routes (contracts-v4.md; server answers 501 until WS3 lands them). X-Owner-Key header: F3, WS2. ----
  retry: (id: string, dept: WorkDept) => req<{ ok: true }>("POST", `/api/projects/${encodeURIComponent(id)}/retry`, { dept }),
  skip: (id: string, dept: WorkDept) => req<{ ok: true }>("POST", `/api/projects/${encodeURIComponent(id)}/skip`, { dept }),
  share: (id: string) => req<ShareLink>("POST", `/api/projects/${encodeURIComponent(id)}/share`),
  unshare: (id: string) => req<{ ok: true }>("DELETE", `/api/projects/${encodeURIComponent(id)}/share`),
  shared: (shareId: string) => req<Project>("GET", `/api/r/${encodeURIComponent(shareId)}`).then(normalize),
};
