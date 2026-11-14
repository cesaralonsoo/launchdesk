import type { Project, WorkDept } from "../types";
import { h, patch } from "./dom";
import { logoSvg } from "./logo";
import { app, deptStatus, fmtUsd, readyCount, stageOf } from "./state";
import { TEAM, WORK_ORDER } from "./team";
import { verdictPill } from "./ui";

export const PACK_TAB: Record<WorkDept, string> = {
  mia: "plan", leo: "opportunity", sam: "model", nova: "brand", dex: "brand", rae: "launch", pip: "landing",
};

type Val = { big: Node | string; sub: Node | string };

function value(p: Project, d: WorkDept): Val | null {
  const r = p.results;
  switch (d) {
    case "mia": {
      if (!r.mia) return null;
      const depts = new Set(r.mia.weeks.map((w) => w.dept)).size;
      const weeks = new Set(r.mia.weeks.map((w) => w.week)).size || 4;
      return { big: `${weeks} weeks`, sub: `${depts} depts scheduled` };
    }
    case "leo":
      return r.leo ? { big: h("span", { class: "tv-row" }, `${r.leo.score.toFixed(1)}/10`, verdictPill(r.leo.verdict)), sub: r.leo.headline } : null;
    case "sam":
      return r.sam ? { big: r.sam.price.value, sub: `${r.sam.startup_cost.value} to start` } : null;
    case "nova": {
      const n = r.nova?.names[r.nova.chosen];
      return n ? { big: n.name, sub: h("span", { class: "tv-sw" }, n.palette.map((c) => h("span", { style: `background:${c.hex}`, title: c.name }))) } : null;
    }
    case "dex": {
      if (!r.dex) return null;
      const l = r.dex.logos[0];
      const n = r.nova?.names[r.nova.chosen];
      return {
        big: h("span", { class: "tv-row" }, h("span", { class: "tv-logo", html: logoSvg(l, n?.palette, 24, n?.name) }), n?.name ?? "Logo"),
        sub: `Logo · ${l.shape}`,
      };
    }
    case "rae":
      return r.rae ? { big: `${r.rae.posts.length} posts`, sub: `30 days · ${r.rae.first_posts.length} ready to publish` } : null;
    case "pip":
      return r.pip ? { big: "Live ✓", sub: `/s/${r.pip.slug}` } : null;
  }
}

export function liveOutput(onOpen: (d: WorkDept) => void) {
  const count = h("span", { class: "count-chip" }, "0 of 7 ready");
  const tiles = new Map<WorkDept, HTMLButtonElement>();
  const row = h("ul", { class: "tiles" });
  for (const d of WORK_ORDER) {
    const b = h("button", {
      type: "button",
      class: "tile",
      style: `--c:${TEAM[d].color}`,
      onclick: () => b.getAttribute("aria-disabled") !== "true" && onOpen(d),
    });
    tiles.set(d, b);
    row.append(h("li", null, b));
  }
  const el = h(
    "section",
    { class: "output", "aria-label": "Live output" },
    h("div", { class: "out-h" }, h("h2", null, "Live output"), h("span", { class: "muted small out-sub" }, "What you get · each result lands here as soon as a department delivers it"), count),
    row,
  );

  const render = (p: Project | null) => {
    const n = readyCount(p);
    count.textContent = `${n} of 7 ready`;
    count.classList.toggle("all", n === 7);
    for (const d of WORK_ORDER) {
      const b = tiles.get(d)!;
      const st = p ? deptStatus(p, d) : "scheduled";
      const v = p && st === "done" ? value(p, d) : null;
      const stage = stageOf(d);
      const price = fmtUsd(app.config?.prices[stage] ?? (stage === "validate" ? 10 : 20));
      const key = `${st}|${v ? JSON.stringify(p?.results[d]).length : 0}|${price}`;
      b.classList.toggle("ready", !!v);
      b.classList.toggle("working", st === "working");
      b.classList.toggle("error", st === "error");
      b.setAttribute("aria-disabled", String(!v));
      b.setAttribute("aria-label", `${TEAM[d].tile}: ${v ? "ready, open in the startup pack" : st === "working" ? TEAM[d].busy : `Stage ${stage === "validate" ? 1 : 2} · ${price}`}`);
      patch(b, key, () => [
        h("span", { class: "tile-h" }, h("span", { class: "dot", style: `--c:${TEAM[d].color}` }), TEAM[d].tile!),
        v
          ? [h("span", { class: "tile-big" }, v.big), h("span", { class: `tile-sub${d === "leo" ? " two" : ""}`, title: typeof v.sub === "string" ? v.sub : null }, v.sub)]
          : st === "working"
            ? h("span", { class: "tile-busy" }, h("span", { class: "spinner sm", "aria-hidden": "true" }), h("span", { class: "tb-t" }, TEAM[d].short))
            : st === "error"
              ? h("span", { class: "tile-sub err" }, `Retry ${TEAM[d].name}`)
              : h("span", { class: "tile-sub" }, `Stage ${stage === "validate" ? 1 : 2} · ${price}`),
      ]);
    }
  };
  render(null);
  return { el, render };
}
