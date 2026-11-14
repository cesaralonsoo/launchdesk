export type Stage = "validate" | "plan" | "kit";

export const TEAM: Record<Stage, { who: string; role: string; color: string; does: string; working: string; title: string }> = {
  validate: {
    who: "Nova",
    role: "Analyst",
    color: "#0AC18E",
    title: "Validation report",
    does: "Scores your idea, checks the market and competitors, and gives an honest go / pivot / no-go.",
    working: "Nova is researching your market",
  },
  plan: {
    who: "Max",
    role: "Strategist",
    color: "#8B7CF6",
    title: "Business plan",
    does: "Turns a 'go' into a plan: customers, pricing, channels, costs and a 90-day roadmap.",
    working: "Max is writing your business plan",
  },
  kit: {
    who: "Pip",
    role: "Launch lead",
    color: "#F5C542",
    title: "Launch kit",
    does: "Names, tagline, landing page copy, social posts and a launch email, ready to use.",
    working: "Pip is preparing your launch kit",
  },
};

/** Cute round mascot, one accessory per role. */
export function avatar(stage: Stage, cls = "avatar") {
  const c = TEAM[stage].color;
  const extra =
    stage === "validate"
      ? `<circle cx="40" cy="38" r="9" fill="none" stroke="#0b0f15" stroke-width="3"/><circle cx="24" cy="38" r="9" fill="none" stroke="#0b0f15" stroke-width="3"/><path d="M31 37h2" stroke="#0b0f15" stroke-width="3"/>`
      : stage === "plan"
        ? `<rect x="44" y="6" width="14" height="18" rx="2" fill="#fff" stroke="#0b0f15" stroke-width="2"/><path d="M47 12h8M47 16h8M47 20h5" stroke="#0b0f15" stroke-width="1.6"/>`
        : `<path d="M32 2l5 9-5-2-5 2z" fill="#ff7a6b"/><path d="M28 9h8" stroke="#0b0f15" stroke-width="2"/>`;
  return `<svg class="${cls}" viewBox="0 0 64 64" aria-hidden="true">
    <ellipse cx="32" cy="60" rx="18" ry="3" fill="#000" opacity=".25"/>
    <path d="M10 36a22 22 0 0 1 44 0v6a16 16 0 0 1-16 16H26a16 16 0 0 1-16-16z" fill="${c}"/>
    <path d="M14 34a18 18 0 0 1 10-14" stroke="#fff" stroke-opacity=".35" stroke-width="3" fill="none" stroke-linecap="round"/>
    <circle cx="24" cy="38" r="4" fill="#0b0f15"/><circle cx="40" cy="38" r="4" fill="#0b0f15"/>
    <circle cx="25.3" cy="36.6" r="1.3" fill="#fff"/><circle cx="41.3" cy="36.6" r="1.3" fill="#fff"/>
    <path d="M28 46q4 4 8 0" stroke="#0b0f15" stroke-width="2.5" fill="none" stroke-linecap="round"/>
    <circle cx="18" cy="45" r="3" fill="#ff7a6b" opacity=".35"/><circle cx="46" cy="45" r="3" fill="#ff7a6b" opacity=".35"/>
    ${extra}
  </svg>`;
}
