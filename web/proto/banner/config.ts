// Hackathon banner (BCH BLAZE 2026 rule: slides, repo and the EMBER2026 CashTokens address on the home page).
// TODO(César): paste the final Widget Factory slides link and the public GitHub repo before submitting.
// Either edit the fallbacks below or set VITE_SLIDES_URL / VITE_REPO_URL at build time (Render env vars work:
// the build runs on Render). A link still at its bare placeholder is hidden, never a dead click for a judge.
const env = import.meta.env as Record<string, string | undefined>;
const SLIDES_PLACEHOLDER = "https://docs.google.com/presentation/";
const REPO_PLACEHOLDER = "https://github.com/";
export const SLIDES_URL = env.VITE_SLIDES_URL?.trim() || SLIDES_PLACEHOLDER; // TODO: final slides URL
export const REPO_URL = env.VITE_REPO_URL?.trim() || REPO_PLACEHOLDER; // TODO: public repo URL
export const linkReady = (u: string) => /^https:\/\//.test(u) && u !== SLIDES_PLACEHOLDER && u !== REPO_PLACEHOLDER;
/** CashTokens-aware (z) address for EMBER2026 donations. */
export const EMBER_ADDRESS = "bitcoincash:zp9d679zvayvudj65nd9zlgezvjplr8g3v7hftqmju";
export const EVENT_LABEL = "BCH BLAZE 2026";
