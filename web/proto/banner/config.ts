// Hackathon banner (BCH BLAZE 2026 rule: slides, repo and the EMBER2026 CashTokens address on the home page).
// Slides and repo links: set VITE_SLIDES_URL / VITE_REPO_URL at build time, or edit the fallbacks below.
// Either edit the fallbacks below or set VITE_SLIDES_URL / VITE_REPO_URL at build time (Render env vars work:
// the build runs on Render). A link still at its bare placeholder is hidden, never a dead click for a judge.
const env = import.meta.env as Record<string, string | undefined>;
const SLIDES_PLACEHOLDER = "https://docs.google.com/presentation/";
const REPO_PLACEHOLDER = "https://github.com/";
const REPO_DEFAULT = "https://github.com/cesaralonsoo/launchdesk";
export const SLIDES_URL = env.VITE_SLIDES_URL?.trim() || SLIDES_PLACEHOLDER;
export const REPO_URL = env.VITE_REPO_URL?.trim() || REPO_DEFAULT;
export const linkReady = (u: string) => /^https:\/\//.test(u) && u !== SLIDES_PLACEHOLDER && u !== REPO_PLACEHOLDER;
/** CashTokens-aware (z) address for EMBER2026 donations. */
export const EMBER_ADDRESS = "bitcoincash:zp9d679zvayvudj65nd9zlgezvjplr8g3v7hftqmju";
export const EVENT_LABEL = "BCH BLAZE 2026";
/** The 2-minute film (unlisted on YouTube). */
export const VIDEO_URL = env.VITE_VIDEO_URL?.trim() || "https://youtu.be/I7OzmWD8n7Y";
/** No pre-existing code: the repo's first commit, made after the Kick-Off on 14 Nov 2026. */
export const FIRST_COMMIT_URL = "https://github.com/cesaralonsoo/launchdesk/commit/877ea57";
