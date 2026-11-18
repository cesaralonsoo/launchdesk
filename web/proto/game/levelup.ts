// v8 level-up moment (PLAN.md 5.5): 2.2 s, skippable (tap / Esc), once per project per stage (game/seen.ts decides).
//   0–0.3 s  the step panel fades to 25 % and slides 24 px          (html.ld-lu, levelup.css)
//   0.1 s    the world opens the area: world.levelUp + unlockWing   (camera + geometry only; the card is ours)
//   0.5 s    the centred card: STAGE n / title / line / rooms / receipt chip
//   1.5 s    the card shrinks into the HUD pill (FLIP), panel comes back
// prefers-reduced-motion: the card only (the wing still opens, without animation). No sound.
import type { WorldV7 } from "../contracts";
import type { WorldV8 } from "../world/api-v8";
import { esc } from "../ui/dom";
import { I } from "../ui/icons";
import { STAGE_NAME, type Badge, type GameState } from "./rules";
import type { Stage } from "./types";
import "./levelup.css";

type World = WorldV7 & WorldV8;
export const STAGE_N: Record<Stage, number> = { research: 1, studio: 2, offices: 3, campus: 4 };
export const STAGE_COLOR: Record<Stage, string> = { research: "#4F7CF0", studio: "#E3893B", offices: "#8C6BE8", campus: "#3A9D8F" };

export interface LevelUpOpts {
  world: World;
  reduced: boolean;
  /** Where the card flies to at the end (the HUD pill / card). */
  target(): HTMLElement | null;
}
export type LevelUpChoice = "go" | "later" | "auto";

function copy(stage: Stage, g: GameState): { title: string; line: string; receipt?: Badge; buttons?: boolean } {
  const badge = (id: string) => g.badges.find((b) => b.id === id && b.earned);
  switch (stage) {
    case "research":
      return { title: "Research open", line: "Your analysts move in. The report arrives when their research is done.", receipt: badge("money-locked") };
    case "studio":
      return { title: "Launch kit open", line: "Your logo, website and plan are being made here.", receipt: badge("kit-paid") };
    case "offices":
      return { title: "Your offices are open", line: `Four offices that keep working on ${g.name}. You see the price before every task.`, buttons: true };
    case "campus":
      return { title: "Two companies", line: "Each idea gets its own building. Tap one to go inside.", receipt: badge("second-idea") };
  }
}

/** One moment at a time; a second one waits for the first. */
export function createLevelUps(o: LevelUpOpts) {
  let chain: Promise<unknown> = Promise.resolve();
  let active: { skip(c: LevelUpChoice): void } | null = null;

  function play(stage: Stage, g: GameState): Promise<LevelUpChoice> {
    const p = chain.then(() => run(stage, g));
    chain = p.catch(() => undefined);
    return p;
  }

  function run(stage: Stage, g: GameState): Promise<LevelUpChoice> {
    const c = copy(stage, g);
    const info = g.stages.find((s) => s.id === stage)!;
    const html = document.documentElement;
    const reduced = o.reduced;
    const newRooms = stage === "campus" ? "" : `${info.total} new room${info.total === 1 ? "" : "s"} open`;
    const card = document.createElement("div");
    card.className = "lu";
    card.setAttribute("role", "status");
    card.setAttribute("aria-live", "polite");
    card.innerHTML = `
      <div class="lu-card" style="--stage:${STAGE_COLOR[stage]}">
        <span class="lu-eyebrow"><i>${STAGE_N[stage]}</i>Stage ${STAGE_N[stage]} · ${esc(STAGE_NAME[stage])}</span>
        <h2 class="lu-title">${esc(c.title)}</h2>
        <p class="lu-line">${esc(c.line)}</p>
        <p class="lu-count"><b>${g.lit}/${g.total}</b> rooms lit${newRooms ? ` · ${newRooms}` : ""}${g.sample ? ` · <span class="lu-sample">Sample</span>` : ""}</p>
        ${c.receipt?.proof ? `<p class="lu-chip">${I.check(14)}<span>${esc(c.receipt.name)}</span>${c.receipt.proof.href ? `<a href="${esc(c.receipt.proof.href)}" target="_blank" rel="noopener noreferrer">${esc(c.receipt.proof.label)} ↗</a>` : `<em>${esc(c.receipt.proof.label)}</em>`}</p>` : ""}
        ${c.buttons ? `<div class="lu-acts"><button type="button" class="lu-go" data-lu="go">Go in</button><button type="button" class="lu-later" data-lu="later">Later</button></div>` : ""}
      </div>`;
    return new Promise<LevelUpChoice>((resolve) => {
      const timers: number[] = [];
      let done = false;
      const t = (ms: number, f: () => void) => timers.push(window.setTimeout(f, reduced ? 0 : ms));
      const finish = (choice: LevelUpChoice) => {
        if (done) return;
        done = true;
        timers.forEach(clearTimeout);
        removeEventListener("keydown", onKey, true);
        active = null;
        html.classList.add("ld-lu-back");
        html.classList.remove("ld-lu");
        flyAway(card, o.target(), reduced).then(() => {
          card.remove();
          setTimeout(() => html.classList.remove("ld-lu-back"), 320);
        });
        resolve(choice);
      };
      const onKey = (e: KeyboardEvent) => {
        if (e.key === "Escape") {
          e.preventDefault();
          finish(c.buttons ? "later" : "auto");
        }
      };
      card.addEventListener("click", (e) => {
        const a = (e.target as HTMLElement).closest<HTMLElement>("[data-lu]")?.dataset.lu;
        if ((e.target as HTMLElement).closest("a")) return; // the receipt link opens the explorer
        finish(a === "later" ? "later" : a === "go" ? "go" : "auto");
      });
      addEventListener("keydown", onKey, true);
      active = { skip: finish };

      if (!reduced) html.classList.add("ld-lu");
      // the world: camera + geometry (WP-B). The wing opens with or without motion.
      t(100, () => {
        const wing = stage === "research" ? "research" : stage === "studio" ? "studio" : null;
        if (wing) void o.world.unlockWing(wing, { animate: !reduced });
        if (!reduced) void o.world.levelUp(stage).catch(() => undefined);
        try {
          o.world.celebrate("level-up");
        } catch {
          /* optional effect */
        }
      });
      t(500, () => {
        document.body.appendChild(card);
        requestAnimationFrame(() => card.classList.add("in"));
        if (c.buttons) card.querySelector<HTMLElement>(".lu-go")?.focus({ preventScroll: true });
      });
      // the offices card waits for a choice (it has buttons), the others leave by themselves
      t(c.buttons ? 7000 : 2200, () => finish("auto"));
      if (reduced) {
        timers.forEach(clearTimeout);
        timers.length = 0;
        document.body.appendChild(card);
        card.classList.add("in");
        timers.push(window.setTimeout(() => finish("auto"), c.buttons ? 7000 : 2600));
      }
    });
  }

  return {
    play,
    skip: () => active?.skip("auto"),
    get playing() {
      return !!active;
    },
  };
}

/** FLIP: the card shrinks into the HUD (or just fades without a target / with reduced motion). */
function flyAway(card: HTMLElement, target: HTMLElement | null, reduced: boolean): Promise<void> {
  const box = card.querySelector<HTMLElement>(".lu-card");
  if (!box || !card.isConnected) return Promise.resolve();
  if (reduced || !target || !target.getClientRects().length) {
    card.classList.remove("in");
    return new Promise((r) => setTimeout(r, reduced ? 0 : 220));
  }
  const a = box.getBoundingClientRect();
  const b = target.getBoundingClientRect();
  const dx = b.left + b.width / 2 - (a.left + a.width / 2);
  const dy = b.top + b.height / 2 - (a.top + a.height / 2);
  const s = Math.max(0.12, Math.min(b.width / a.width, b.height / a.height));
  card.classList.add("out");
  const anim = box.animate(
    [
      { transform: "translate(0,0) scale(1)", opacity: 1 },
      { transform: `translate(${dx}px, ${dy}px) scale(${s})`, opacity: 0 },
    ],
    { duration: 620, easing: "cubic-bezier(0.22, 1, 0.36, 1)", fill: "forwards" },
  );
  target.classList.add("hud-shine");
  setTimeout(() => target.classList.remove("hud-shine"), 1100);
  // a slow frame rate (software GL, a busy phone) must never leave the card on screen
  return Promise.race([anim.finished.then(() => undefined, () => undefined), new Promise<void>((r) => setTimeout(r, 900))]);
}
