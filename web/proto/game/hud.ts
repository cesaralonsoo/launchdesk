// v8 HUD (PLAN.md 5.4): the one place the game shows. Hidden on the untouched home; appears from pay1 and on every
// /p/<id>. Desktop: a 320 px card top-left (company switcher, `Stage · N/12 rooms lit`, 4-segment track, ONE Next
// action with its price); click → drawer (stage rules, the rooms of this stage, 8 badges, CEO notes left).
// Phone: one 40 px pill under the header → bottom sheet with the same content. Tour / practice runs: `Sample` tag.
// Also owns the game's moments: level-up cards (game/levelup.ts), badge toasts, the offices floor over the 3D
// (ui/offices.ts as a side card / sheet) and the campus view.
import type { WorldV7 } from "../contracts";
import type { ProtoFlowV7 } from "../flow";
import type { WorldV8 } from "../world/api-v8";
import { projects as saved } from "../../src/app/projects";
import { esc } from "../ui/dom";
import { I } from "../ui/icons";
import { createLevelUps, STAGE_COLOR, STAGE_N } from "./levelup";
import { createPins, pillHtml, type Pin } from "./pins";
import { centsLabel, OFFICE_IDS, OFFICE_NAME, STAGE_NAME, VERDICT_LABEL, type GameState, type RoomInfo } from "./rules";
import { createGameStore } from "./store";
import { OFFICES_EVENT, type OfficeId, type OfficesOpenDetail, type Stage } from "./types";
import "./hud.css";

export interface HudDeps {
  world: WorldV7 & WorldV8;
  flow: ProtoFlowV7;
}

const ROOM_NAME: Record<string, string> = {
  lobby: "Lobby · your idea on the door",
  nova: "Logo",
  dex: "Website",
  launch: "30-day plan",
  "office:marketing": "Marketing",
  "office:research": "Research",
  "office:money": "Money",
  "office:customers": "Customers",
};
const ROOM_TINT: Record<OfficeId, string> = { marketing: "#E8590C", research: "#1971C2", money: "#05875F", customers: "#7048E8" };

/** Mounts the HUD into `host` (the #hud slot of the UI root). Returns an unmount function. */
export function mountHud(host: HTMLElement, deps: HudDeps): () => void {
  const { world, flow } = deps;
  const reduced = flow.reduced || matchMedia("(prefers-reduced-motion: reduce)").matches;
  const phoneMq = matchMedia("(max-width: 767px)");
  const store = createGameStore(world, flow);
  const root = document.createElement("div");
  root.className = "hud";
  root.hidden = true;
  root.innerHTML = `<div class="hud-main"></div><div class="hud-toasts" aria-live="polite"></div>`;
  host.appendChild(root);
  const main = root.querySelector<HTMLElement>(".hud-main")!;
  const toasts = root.querySelector<HTMLElement>(".hud-toasts")!;
  let open = false; // drawer (desktop) / sheet (phone)
  let menu = false; // company switcher
  let campus: { back: number } | null = null; // the campus view is on (world level to return to)
  let officesLayer: { close(): void; focus?(o: OfficeId): void } | null = null;
  let officesFor: string | null = null;
  const levelups = createLevelUps({ world, reduced, target: () => root.querySelector<HTMLElement>(".hud-card, .hud-pill") });
  const pins = createPins(host, world, (id) => pick(id));

  // ── rendering
  const tagText = (g: GameState) => (g.example ? "Example" : g.sample ? "Sample" : store.mockServer ? "Sample data" : "");
  const tag = (g: GameState) => (tagText(g) ? `<span class="hud-tag">${tagText(g)}</span>` : "");
  const track = (g: GameState) =>
    `<span class="hud-track" aria-hidden="true">${g.stages
      .map((s) => `<span class="hud-seg${s.unlocked ? " on" : ""}"><em>${esc(s.name)}</em><i><b style="width:${s.total ? Math.round((s.lit / s.total) * 100) : 0}%"></b></i></span>`)
      .join("")}</span>`;
  const nextHtml = (g: GameState) => {
    const live = g.next.act === "offices" || g.next.act === "new" || g.next.act === "campus";
    const body = `<span class="hud-next-t"><em>Next:</em> ${esc(g.next.text)} · <span class="hud-price">${esc(g.next.price)}</span></span>${live ? I.arrow(14) : ""}`;
    return live ? `<button type="button" class="hud-next" data-hud="next">${body}</button>` : `<p class="hud-next">${body}</p>`;
  };
  const roomsOfStage = (g: GameState): RoomInfo[] => {
    const st = g.stage ?? "research";
    const want = st === "research" ? ["lobby", "r0", "r1", "r2", "r3"] : st === "studio" ? ["nova", "dex", "launch"] : st === "offices" ? OFFICE_IDS.map((o) => `office:${o}`) : ["nova", "dex", "launch", ...OFFICE_IDS.map((o) => `office:${o}`)];
    return g.rooms.filter((r) => want.includes(r.id) && r.counts);
  };
  const roomName = (id: string, i: number) => ROOM_NAME[id] ?? `Research room ${i}`;
  const drawerHtml = (g: GameState) => {
    const rooms = roomsOfStage(g);
    const label = g.stage ? STAGE_NAME[g.stage] : "Research";
    return `
      <section class="hud-sec">
        <h3>Stages</h3>
        <ol class="hud-stages">${g.stages
          .map(
            (s) => `<li class="${s.unlocked ? "on" : ""}" style="--stage:${STAGE_COLOR[s.id]}"><i>${STAGE_N[s.id]}</i><div><b>${esc(s.name)}</b><span>${
              s.unlocked ? (s.id === "campus" ? "Open" : `Open · ${s.lit}/${s.total} rooms lit`) : esc(s.rule)
            }</span></div></li>`,
          )
          .join("")}</ol>
      </section>
      <section class="hud-sec">
        <h3>Rooms · ${esc(label)}</h3>
        <ul class="hud-rooms">${rooms
          .map((r, i) => `<li data-s="${r.state}">${r.state === "done" ? I.check(14) : `<i></i>`}<span>${esc(roomName(r.id, i))}</span><em>${r.state === "done" ? "lit" : r.state === "working" ? "working" : r.id.startsWith("office:") ? "no task yet" : r.state === "locked" ? "locked" : "waiting"}</em></li>`)
          .join("")}</ul>
        <p class="hud-note">A room lights only when its work was really delivered.</p>
      </section>
      <section class="hud-sec">
        <h3>Badges · ${g.badges.filter((b) => b.earned).length}/${g.badges.length}</h3>
        <ul class="hud-badges">${g.badges
          .map(
            (b) => `<li class="${b.earned ? "on" : ""}"><span class="hud-bi">${b.earned ? I.check(13) : ""}</span><div><b>${esc(b.name)}</b><span>${esc(b.line)}</span>${
              b.proof ? (b.proof.href ? `<a href="${esc(b.proof.href)}" target="_blank" rel="noopener noreferrer">${esc(b.proof.label)} ↗</a>` : `<small>${esc(b.proof.label)}</small>`) : ""
            }</div></li>`,
          )
          .join("")}</ul>
      </section>
      ${g.steersLeft != null ? `<p class="hud-steers"><span aria-hidden="true">${"●".repeat(g.steersLeft)}${"○".repeat(Math.max(0, 3 - g.steersLeft))}</span>${g.steersLeft} CEO note${g.steersLeft === 1 ? "" : "s"} left · free</p>` : ""}
      ${g.sample ? `<p class="hud-note">Sample run: nothing here is saved or counted.</p>` : g.example ? `<p class="hud-note">A finished example, read-only. Its rooms are lit by its real run.</p>` : ""}`;
  };
  const menuHtml = (g: GameState) => {
    const mine = flow.mine.filter((p) => !/^ex-/.test(p.id));
    const row = (id: string, title: string, sub: string, cur: boolean, ex = false) =>
      `<li><button type="button" data-hud-switch="${esc(id)}"${ex ? ` data-at="report"` : ""} aria-current="${cur}"><b>${esc(title)}${ex ? `<span class="hud-tag">Example</span>` : ""}</b><span>${esc(sub)}</span></button></li>`;
    const subOf = (id: string) => {
      const r = saved.get(id);
      return r?.score != null ? `${r.score.toFixed(1)} · ${VERDICT_LABEL[r.verdict ?? "go"]}` : "No report yet";
    };
    const campusOpen = g.stages[3]!.unlocked;
    return `<div class="hud-menu" role="menu">
      <p class="hud-menu-h">My ideas</p>
      ${mine.length ? `<ul>${mine.map((p) => row(p.id, p.id === g.projectId ? g.name : p.title, subOf(p.id), p.id === g.projectId)).join("")}</ul>` : `<p class="hud-note">Your ideas will live here.</p>`}
      ${store.examples.length ? `<p class="hud-menu-h">Finished examples · real runs</p><ul>${store.examples.map((x) => row(x.id, x.title, x.verdict ? `${x.verdict.score.toFixed(1)} · ${VERDICT_LABEL[x.verdict.verdict]}` : "", x.id === g.projectId, true)).join("")}</ul>` : ""}
      <div class="hud-menu-f">
        <button type="button" class="hud-btn" data-hud="new">${I.arrow(14)}<span>New idea · 10¢</span></button>
        <button type="button" class="hud-btn" data-hud="campus"${campusOpen ? "" : " disabled"} title="${campusOpen ? "" : esc("Opens when a second idea gets its report")}">${I.district(14)}<span>Campus${campusOpen ? "" : " · after a 2nd idea"}</span></button>
      </div>
    </div>`;
  };

  let lastHtml = "";
  function render() {
    const g = store.state;
    const show = !!g && store.visible;
    root.hidden = !show;
    document.documentElement.classList.toggle("has-hud", show);
    if (!show || !g) return;
    const phone = phoneMq.matches;
    root.classList.toggle("phone", phone);
    root.dataset.open = open ? "1" : "0";
    const head = `<div class="hud-top"><button type="button" class="hud-name" data-hud="menu" aria-expanded="${menu}" aria-haspopup="menu"><b>${esc(g.name)}</b>${chev()}</button>${tag(g)}</div>`;
    const sum = `<button type="button" class="hud-sum" data-hud="drawer" aria-expanded="${open}"><span class="hud-stage"><b>${esc(g.stageName)}</b> · ${g.lit}/${g.total} rooms lit</span>${track(g)}</button>`;
    const back = campus ? `<button type="button" class="hud-back" data-hud="campus-back">${I.back(14)}<span>Back to ${esc(g.name)}</span></button>` : "";
    let html: string;
    if (phone) {
      html = `
        <button type="button" class="hud-pill" data-hud="drawer" aria-expanded="${open}"><b>${esc(g.stageName)}</b><span>${g.lit}/${g.total}</span>${tagText(g) ? `<em>${tagText(g) === "Sample data" ? "Sample" : tagText(g)}</em>` : ""}<i aria-hidden="true">▸</i></button>
        ${back}
        ${open ? `<div class="hud-scrim" data-hud="close"></div><div class="hud-sheet" role="dialog" aria-label="Your company">${head}${menu ? menuHtml(g) : ""}<div class="hud-sum hud-sum-static"><span class="hud-stage"><b>${esc(g.stageName)}</b> · ${g.lit}/${g.total} rooms lit</span>${track(g)}</div>${nextHtml(g)}${drawerHtml(g)}</div>` : ""}`;
    } else {
      html = `<div class="hud-card">${head}${menu ? menuHtml(g) : ""}${sum}${nextHtml(g)}${open ? `<div class="hud-drawer">${drawerHtml(g)}</div>` : ""}</div>${back}`;
    }
    // the flow changes many times a second while it animates: touch the DOM only when the HUD really changed
    // (a replaced button would swallow a click that lands between mousedown and mouseup)
    if (html !== lastHtml) {
      lastHtml = html;
      const scroll = main.querySelector(".hud-card, .hud-sheet")?.scrollTop ?? 0;
      main.innerHTML = html;
      const sc = main.querySelector(".hud-card, .hud-sheet");
      if (sc) sc.scrollTop = scroll;
    }
    pins.set(pinsFor(g));
  }
  const chev = () => `<svg class="ic" width="12" height="12" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 8l5 5 5-5"/></svg>`;

  function pinsFor(g: GameState): Pin[] {
    const lvl = world.worldLevel;
    // the offices floor always names its rooms (with the price of the cheapest task) whenever it is on screen
    if (lvl === 2) {
      const phone = phoneMq.matches;
      return OFFICE_IDS.map((o, i) => {
        const r = g.rooms.find((x) => x.id === `office:${o}`)!;
        const n = store.snapshot?.offices?.inbox.filter((x) => x.office === o && x.status === "done").length ?? 0;
        const from = store.snapshot?.officeFrom[o] ?? 2;
        const sub = r.state === "done" ? `${n} result${n === 1 ? "" : "s"}` : r.state === "working" ? "working" : `from ${centsLabel(from)}`;
        return phone ? { id: `office:${o}`, kind: "dot" as const, tone: ROOM_TINT[o], html: `${i + 1}` } : { id: `office:${o}`, html: pillHtml(OFFICE_NAME[o], sub, ROOM_TINT[o]) };
      });
    }
    // the finished example's floor names its stages, like the home (Research and Launch kit done, Offices with a price)
    if (lvl === 1 && g.example) {
      const st = (i: number) => g.stages[i]!;
      const sub = (i: number, price: string) => (st(i).unlocked ? `done · ${st(i).lit}/${st(i).total}` : price);
      const defs: [string, string, string, string][] = [
        ["wing:back", "Research", sub(0, "10¢"), "#4F7CF0"],
        ["wing:front", "Launch kit", sub(1, "50¢"), "#E3893B"],
        ["plate", "Offices", "from 2¢", "#8C6BE8"],
      ];
      return defs.map(([id, name, s2, c], i) => (phoneMq.matches ? { id, kind: "dot" as const, tone: c, html: `${i + 1}` } : { id, html: pillHtml(name, s2, c) }));
    }
    if (lvl === 3) {
      // phones: short names only (max 18 characters), so a pill never runs off the screen
      const short = (t: string) => (t.length > 18 ? `${t.slice(0, 17).trimEnd()}…` : t);
      const pill = (title: string, sub?: string) => (phoneMq.matches ? pillHtml(short(title)) : pillHtml(title, sub));
      const out: Pin[] = [];
      if (g.sample) out.push({ id: `campus:${g.projectId || "sample"}`, html: pill(`Sample · ${g.name}`, "tour data") });
      else for (const r of saved.list().filter((x) => !/^ex-/.test(x.id)).slice(0, 4))
        out.push({ id: `campus:${r.id}`, html: pill(r.id === g.projectId ? g.name : r.title, r.verdict === "no-go" ? "No-go · lesson learned" : r.score != null ? `${VERDICT_LABEL[r.verdict ?? "go"]} ${r.score.toFixed(1)}` : "No report yet") });
      for (const x of store.examples) out.push({ id: `campus:${x.id}`, html: pill(`Example · ${x.title}`, x.verdict ? `${VERDICT_LABEL[x.verdict.verdict]} ${x.verdict.score.toFixed(1)}` : "real run") });
      out.push({ id: "campus:next:0", html: pill("Your next idea", "10¢") });
      return out;
    }
    return [];
  }

  // ── actions
  function currentOwner(): OfficesOpenDetail | null {
    const g = store.state;
    if (!g || g.sample || g.example) return null;
    return { projectId: g.projectId, ownerKey: saved.ownerKey(g.projectId), name: g.name };
  }
  async function openOfficesFloor(d: OfficesOpenDetail, focus?: OfficeId) {
    if (officesLayer && officesFor === d.projectId) {
      if (focus) officesLayer.focus?.(focus);
      world.shotFor(focus ? { room: `office:${focus}` } : "stack");
      return;
    }
    const back = 1; // the offices sit above floor 1: closing them always lands back on the floor
    officesFor = d.projectId;
    void world.setWorldLevel(2, { animate: !reduced });
    const first = store.markSeen("offices");
    if (first && store.state) {
      const choice = await levelups.play("offices", store.state);
      if (choice === "later") {
        officesFor = null;
        void world.setWorldLevel(back, { animate: !reduced });
        render();
        return;
      }
    } else world.shotFor("stack");
    const m = await import("../ui/offices");
    document.documentElement.classList.add("ld-offices");
    // frame the floor in the space the card leaves (ui/index.ts re-measures on the resize event at close)
    const phone = phoneMq.matches;
    world.setInsets(phone ? { left: 0, right: 0, top: 130, bottom: Math.round(innerHeight * 0.62) } : { left: 320, right: 470, top: 80, bottom: 0 });
    officesLayer = m.openOffices({
      projectId: d.projectId,
      ownerKey: d.ownerKey,
      name: d.name,
      focus,
      overWorld: true,
      onView: (v) => store.pushOffices(v),
      onFocus: (o) => world.shotFor(o ? { room: `office:${o}` } : "stack"),
      onClose: () => {
        document.documentElement.classList.remove("ld-offices");
        dispatchEvent(new Event("resize"));
        officesLayer = null;
        officesFor = null;
        void world.setWorldLevel(back, { animate: !reduced });
        render();
      },
    });
    render();
  }
  function enterCampus() {
    if (campus) return;
    campus = { back: Math.max(1, world.worldLevel) };
    officesLayer?.close();
    open = false;
    menu = false;
    document.documentElement.classList.add("ld-campus");
    world.setInsets(phoneMq.matches ? { left: 0, right: 0, top: 130, bottom: 16 } : { left: 320, right: 24, top: 80, bottom: 24 });
    void world.setWorldLevel(3, { animate: !reduced });
    world.shotFor("campus");
    render();
  }
  function leaveCampus() {
    if (!campus) return;
    const b = campus.back;
    campus = null;
    document.documentElement.classList.remove("ld-campus");
    dispatchEvent(new Event("resize")); // ui/index.ts re-measures the step panel's insets
    void world.setWorldLevel(b as 1 | 2, { animate: !reduced });
    render();
  }
  function pick(raw: string) {
    // world ids (WP-B): office:<id> · campus:<projectId> · campus:next[:<n>] (a free plot)
    const id = /^campus:next(:\d+)?$/.test(raw) ? "plot:new" : raw.replace(/^campus:/, "");
    const office = /^office:(marketing|research|money|customers)$/.exec(id)?.[1] as OfficeId | undefined;
    if (office) {
      const d = currentOwner();
      if (d && world.worldLevel === 2) void openOfficesFloor(d, office);
      return;
    }
    if (!campus) return;
    if (id === "plot:new" || id.startsWith("plot:")) {
      leaveCampus();
      return flow.next({ type: "new-project" });
    }
    if (saved.get(id) || store.examples.some((x) => x.id === id)) {
      leaveCampus();
      flow.next({ type: "switch-project", id, ...(/^ex-/.test(id) ? { at: "report" as const } : {}) });
    }
  }

  root.addEventListener("click", (e) => {
    const t = e.target as HTMLElement;
    if (t.closest("a")) return;
    const sw = t.closest<HTMLElement>("[data-hud-switch]");
    if (sw) {
      menu = false;
      open = false;
      const id = sw.dataset.hudSwitch!;
      if (id !== store.state?.projectId) flow.next({ type: "switch-project", id, ...(sw.dataset.at === "report" ? { at: "report" as const } : {}) });
      return render();
    }
    const act = t.closest<HTMLElement>("[data-hud]")?.dataset.hud;
    const g = store.state;
    if (!act || !g) return;
    if (act === "drawer") {
      open = !open;
      if (!open) menu = false;
    } else if (act === "close") {
      open = false;
      menu = false;
    } else if (act === "menu") {
      menu = !menu;
      if (phoneMq.matches) open = true;
    } else if (act === "new") {
      menu = false;
      open = false;
      flow.next({ type: "new-project" });
    } else if (act === "campus") enterCampus();
    else if (act === "campus-back") leaveCampus();
    else if (act === "next") {
      open = false;
      if (g.next.act === "new") flow.next({ type: "new-project" });
      else if (g.next.act === "campus") enterCampus();
      else if (g.next.act === "offices") {
        const d = currentOwner();
        if (d) void openOfficesFloor(d, g.next.office);
      }
    }
    render();
  });
  const onKey = (e: KeyboardEvent) => {
    if (e.key !== "Escape" || levelups.playing) return;
    if (open || menu) {
      open = false;
      menu = false;
      render();
    } else if (campus) leaveCampus();
  };
  addEventListener("keydown", onKey);
  // clicks outside close the switcher / drawer (desktop)
  const onDoc = (e: MouseEvent) => {
    // composedPath: the clicked node may already be gone (the HUD re-renders on its own click)
    if ((!menu && !open) || e.composedPath().includes(root) || phoneMq.matches) return;
    menu = false;
    open = false;
    render();
  };
  document.addEventListener("click", onDoc);

  // ── the game's moments
  let toastTimer = 0;
  const offEvents = store.on({
    levelUp: (stage: Stage, g) => {
      if (stage === "offices") return; // the offices card plays when the floor is first opened (openOfficesFloor)
      void levelups.play(stage, g);
    },
    badge: (b) => {
      const t = document.createElement("div");
      t.className = "hud-toast";
      t.setAttribute("role", "status");
      t.innerHTML = `${I.check(14)}<span>+ ${esc(b.name)}</span>`;
      toasts.replaceChildren(t);
      clearTimeout(toastTimer);
      toastTimer = window.setTimeout(() => t.remove(), reduced ? 2400 : 1200 + 400);
    },
    officeDone: (o) => {
      if (world.worldLevel !== 2) return;
      world.shotFor({ room: `office:${o}` });
      world.celebrate("paid");
    },
  });
  const offState = store.subscribe(() => render());
  Object.assign(window, { __game: { store, levelups, render } }); // console / screenshot scripts
  const offPick = world.onPick((id) => pick(id));
  // "Open your offices" from the kit screen: the floor over the 3D instead of a full-screen layer
  const onOffices = (e: CustomEvent<OfficesOpenDetail>) => {
    e.preventDefault();
    void openOfficesFloor(e.detail);
  };
  addEventListener(OFFICES_EVENT, onOffices);
  const onMq = () => render();
  phoneMq.addEventListener("change", onMq);
  render();

  return () => {
    offEvents();
    offState();
    offPick();
    removeEventListener(OFFICES_EVENT, onOffices);
    removeEventListener("keydown", onKey);
    document.removeEventListener("click", onDoc);
    phoneMq.removeEventListener("change", onMq);
    officesLayer?.close();
    pins.dispose();
    store.dispose();
    root.remove();
    document.documentElement.classList.remove("has-hud", "ld-campus", "ld-offices");
  };
}
