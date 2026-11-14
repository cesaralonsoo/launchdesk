import type { Stage } from "./team";

export type Project = {
  id: string;
  idea: string;
  payments: Partial<Record<Stage, { txid: string; sats: number }>>;
  results: Partial<Record<Stage, any>>;
};
export type Quote = { stage: Stage; sats: number; cents: number; address: string; tag: string; expiresAt: number };
export type AppConfig = { prices: Record<Stage, number>; merchantAddress: string; mockAi: boolean; devSkipPayment: boolean };

async function req<T>(method: string, url: string, body?: unknown): Promise<T> {
  const r = await fetch(url, {
    method,
    headers: body ? { "content-type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error((data as any).error || `Request failed (${r.status})`);
  return data as T;
}

export const api = {
  config: () => req<AppConfig>("GET", "/api/config"),
  create: (idea: string) => req<{ id: string }>("POST", "/api/projects", { idea }),
  get: (id: string) => req<Project>("GET", `/api/projects/${id}`),
  quote: (id: string, stage: Stage) => req<Quote>("POST", `/api/projects/${id}/quote`, { stage }),
  pay: (id: string, stage: Stage, txHex?: string, dev?: boolean) => req<Project>("POST", `/api/projects/${id}/pay`, { stage, txHex, dev }),
  run: (id: string, stage: Stage) => req<Project>("POST", `/api/projects/${id}/run`, { stage }),
};
