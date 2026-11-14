import type { AppConfig, Project, Quote, SiteData, Stage, Stats } from "./types";

export class ApiError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
  }
}

async function req<T>(method: string, url: string, body?: unknown): Promise<T> {
  let r: Response;
  try {
    r = await fetch(url, {
      method,
      headers: body ? { "content-type": "application/json" } : undefined,
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
  create: (idea: string) => req<{ id: string }>("POST", "/api/projects", { idea }),
  get: (id: string) => req<Project>("GET", `/api/projects/${encodeURIComponent(id)}`),
  quote: (id: string, stage: Stage) => req<Quote>("POST", `/api/projects/${encodeURIComponent(id)}/quote`, { stage }),
  pay: (id: string, body: PayBody) => req<Project>("POST", `/api/projects/${encodeURIComponent(id)}/pay`, body),
  run: (id: string, stage: Stage) => req<{ ok: true }>("POST", `/api/projects/${encodeURIComponent(id)}/run`, { stage }),
  site: (slug: string) => req<SiteData>("GET", `/api/sites/${encodeURIComponent(slug)}`),
};
