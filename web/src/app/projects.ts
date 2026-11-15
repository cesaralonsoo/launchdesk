// F4 "My projects" without accounts: a list in this browser's localStorage. Owner: WS1. API frozen (contracts-v4.md).
// WS2 calls projects.upsert(view) on every poll; WS1 renders the header popover and "Your projects" rows;
// WS2's api() helper reads ownerKey from here to send X-Owner-Key (F3).
import type { LeoOpportunity, Project } from "../types";

export const PROJECTS_KEY = "launchdesk-projects";

/** One row of "My projects". Never holds results: the server stays the source of truth. */
export type SavedProject = {
  id: string;
  /** F3 owner key returned once by POST /api/projects. null for projects made before owner keys. */
  ownerKey: string | null;
  title: string;
  score: number | null;
  verdict: LeoOpportunity["verdict"] | null;
  /** Furthest point reached: "new" (not paid), "validated" (stage 1 done), "building", "live" (Pip done). */
  stage: "new" | "validating" | "validated" | "building" | "live";
  slug: string | null;
  createdAt: number;
  updatedAt: number;
};

const listeners = new Set<(rows: SavedProject[]) => void>();

function read(): SavedProject[] {
  try {
    const v = JSON.parse(localStorage.getItem(PROJECTS_KEY) || "[]");
    return Array.isArray(v) ? (v.filter((x) => x && typeof x.id === "string") as SavedProject[]) : [];
  } catch {
    return [];
  }
}

function write(rows: SavedProject[]): void {
  try {
    localStorage.setItem(PROJECTS_KEY, JSON.stringify(rows.slice(0, 50)));
  } catch {
    /* private mode or full: the list is a convenience only */
  }
  listeners.forEach((f) => f(rows));
}

const stageOf = (p: Project): SavedProject["stage"] => {
  if (p.status.pip === "done") return "live";
  if (p.payments.build) return "building";
  if (p.status.mia === "done" && p.status.leo === "done" && p.status.sam === "done") return "validated";
  if (p.payments.validate) return "validating";
  return "new";
};

/** A readable title from the raw idea: no leading article, cut at a word, sentence case (≤ 48 chars). */
export function shortTitle(idea: string): string {
  const words = idea.replace(/\s+/g, " ").trim().replace(/^(a|an|the)\s+/i, "").split(" ");
  let out = "";
  for (const w of words) {
    const next = out ? `${out} ${w}` : w;
    if (next.length > 48) break;
    out = next;
  }
  out = (out || idea.slice(0, 48)).replace(/[,.;:!?]+$/, "").replace(/\s+(and|or|with|for|in|at|of|to|a|an|the)$/i, "");
  return out.charAt(0).toUpperCase() + out.slice(1);
}

/** All saved projects, newest first. */
export function list(): SavedProject[] {
  return read().sort((a, b) => b.createdAt - a.createdAt);
}

/** One saved project, or null. */
export function get(id: string): SavedProject | null {
  return read().find((x) => x.id === id) ?? null;
}

/**
 * Inserts or updates the row for `p` (title, score, verdict, stage, slug). `ownerKey` is stored when given
 * and kept otherwise. Example and shared (read-only) projects are never saved. Returns the row (or null).
 */
export function upsert(p: Project, extra: { ownerKey?: string | null } = {}): SavedProject | null {
  if (!p?.id || p.example) return null;
  const rows = read();
  const i = rows.findIndex((x) => x.id === p.id);
  const prev = i >= 0 ? rows[i]! : null;
  const row: SavedProject = {
    id: p.id,
    ownerKey: extra.ownerKey !== undefined ? extra.ownerKey : (prev?.ownerKey ?? null),
    title: (p.results.nova ? p.results.nova.names[p.results.nova.chosen]?.name : null) || p.results.mia?.title || prev?.title || shortTitle(p.idea),
    score: p.results.leo?.score ?? prev?.score ?? null,
    verdict: p.results.leo?.verdict ?? prev?.verdict ?? null,
    stage: stageOf(p),
    slug: p.results.pip?.slug ?? prev?.slug ?? null,
    createdAt: prev?.createdAt ?? p.created_at ?? Date.now(),
    updatedAt: Date.now(),
  };
  const same = prev && JSON.stringify({ ...prev, updatedAt: 0 }) === JSON.stringify({ ...row, updatedAt: 0 });
  if (same) return prev;
  if (i >= 0) rows[i] = row;
  else rows.unshift(row);
  write(rows);
  return row;
}

/** Removes a row (the project itself stays on the server). */
export function remove(id: string): void {
  write(read().filter((x) => x.id !== id));
}

/** Owner key for X-Owner-Key, or null. */
export const ownerKey = (id: string): string | null => get(id)?.ownerKey ?? null;

/** Called with the full list after every change in this tab. Returns an unsubscribe function. */
export function onChange(cb: (rows: SavedProject[]) => void): () => void {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

export const projects = { list, get, upsert, remove, ownerKey, onChange };
