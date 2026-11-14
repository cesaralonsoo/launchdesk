import "./styles.css";
import { api, type AppConfig, type Project } from "./api";
import { RENDER, esc } from "./reports";
import { TEAM, avatar, type Stage } from "./team";
import { disconnect, onWallet, pair, payWithWallet, resume, walletName, walletState } from "./wallet";

// ---- hackathon banner (required by BCH BLAZE 2026 rules) ----
const BANNER = {
  slides: "", // link to our copy of the Widget Factory deck (to be added)
  repo: "https://github.com/cesaralonsoo/launchdesk",
  zAddress: "bitcoincash:zp9d679zvayvudj65nd9zlgezvjplr8g3v7hftqmju",
};

const STAGES: Stage[] = ["validate", "plan", "kit"];
const $ = <T extends HTMLElement = HTMLElement>(sel: string) => document.querySelector(sel) as T;
const app = $("#app");
const modal = $("#modal");
let cfg: AppConfig = { prices: { validate: 10, plan: 25, kit: 25 }, merchantAddress: "", mockAi: false, devSkipPayment: false };
const cents = (n: number) => (n < 100 ? `${n}¢` : `$${(n / 100).toFixed(2)}`);

function renderBanner() {
  $("#banner").innerHTML = `<div class="in">
    <span><b>BCH BLAZE 2026</b> · Mainnet track</span>
    ${BANNER.slides ? `<a href="${BANNER.slides}" target="_blank" rel="noopener">Slides</a>` : `<span>Slides: coming soon</span>`}
    <a href="${BANNER.repo}" target="_blank" rel="noopener">Source code</a>
    <span>Votes / EMBER2026: <code>${BANNER.zAddress}</code></span>
    <span>All code written during BLAZE (14–22 Nov 2026).</span>
  </div>`;
}

// ---------- router ----------
function go(path: string) {
  history.pushState({}, "", path);
  route();
}
window.addEventListener("popstate", route);
document.addEventListener("click", (e) => {
  const a = (e.target as HTMLElement).closest("a[data-link]") as HTMLAnchorElement | null;
  if (a) {
    e.preventDefault();
    go(a.getAttribute("href")!);
  }
  const c = (e.target as HTMLElement).closest("[data-copy]") as HTMLElement | null;
  if (c) {
    navigator.clipboard.writeText(c.dataset.copy || "");
    c.textContent = "Copied";
    setTimeout(() => (c.textContent = "Copy"), 1200);
  }
});

function route() {
  const m = location.pathname.match(/^\/p\/([\w-]+)/);
  if (m) showProject(m[1]);
  else showHome();
  window.scrollTo(0, 0);
}

// ---------- home ----------
const EXAMPLES = [
  "A mobile bike repair van that fixes bikes at your door",
  "Homemade dog food delivered weekly in my neighbourhood",
  "An app that helps small restaurants cut food waste",
];

function showHome() {
  app.innerHTML = `
  <section class="hero">
    <h1>Launch<em>Desk</em></h1>
    <p class="sub" style="font:700 clamp(22px,3vw,30px) var(--disp);color:var(--text);margin-top:10px">Your startup team, for pennies.</p>
    <p class="sub">Pitch your idea. An AI team validates it, plans it and builds your launch kit. Pay in BCH only for the stages you need.</p>
    <form class="pitch" id="pitch">
      <textarea id="idea" maxlength="2000" placeholder="Describe your business idea in a sentence or two…"></textarea>
      <div class="examples">${EXAMPLES.map((x) => `<button type="button" class="chip">${esc(x)}</button>`).join("")}</div>
      <div class="row">
        <span class="hint">Nova gives you an honest score first. You decide if it's worth going further.</span>
        <button class="btn lg" id="go">Validate my idea <span class="price">${cents(cfg.prices.validate)}</span></button>
      </div>
      <div class="err" id="err"></div>
    </form>
    <div class="tagline">Never pay for a bad idea again.</div>
  </section>
  <section class="team">
    ${STAGES.map(
      (s, i) => `<div class="member" style="--c:${TEAM[s].color}">${avatar(s, "avatar bob")}<div>
        <div class="role">Stage ${i + 1} · ${TEAM[s].role}</div><h3>${TEAM[s].who} — ${TEAM[s].title}</h3>
        <p>${TEAM[s].does}</p><div class="cost">${cents(cfg.prices[s])} in BCH</div></div></div>`,
    ).join("")}
  </section>
  <section class="how">
    <div><b>1. Pitch.</b> Write your idea. No account needed.</div>
    <div><b>2. Pay a few cents.</b> Approve in your BCH wallet (Selene, Cashonize, Paytaca…).</div>
    <div><b>3. Decide.</b> After validation, go further only if the idea deserves it.</div>
  </section>
  <p class="foot">Payments are real Bitcoin Cash on mainnet. Results are saved at a private link.</p>`;

  const idea = $<HTMLTextAreaElement>("#idea");
  app.querySelectorAll(".chip").forEach((b) => b.addEventListener("click", () => (idea.value = b.textContent || "")));
  $("#pitch").addEventListener("submit", async (e) => {
    e.preventDefault();
    const btn = $<HTMLButtonElement>("#go");
    btn.disabled = true;
    $("#err").textContent = "";
    try {
      const { id } = await api.create(idea.value);
      go(`/p/${id}`);
      const p = await api.get(id);
      payStage(p, "validate");
    } catch (err) {
      $("#err").textContent = (err as Error).message;
      btn.disabled = false;
    }
  });
}

// ---------- project ----------
let current: Project | null = null;
const busy = new Set<Stage>();

async function showProject(id: string) {
  if (current?.id !== id) {
    app.innerHTML = `<div class="card cta-card"><p class="lead dots">Loading</p></div>`;
    try {
      current = await api.get(id);
    } catch (e) {
      app.innerHTML = `<div class="card cta-card"><h2>Project not found</h2><p class="lead">Check the link, or <a href="/" data-link>start a new idea</a>.</p></div>`;
      return;
    }
  }
  renderProject();
  // A paid stage with no result yet (e.g. page reloaded mid-run): resume it.
  for (const s of STAGES) if (current!.payments[s] && !current!.results[s]) runStage(s);
}

function nextStage(p: Project): Stage | null {
  return STAGES.find((s) => !p.results[s]) ?? null;
}

function renderProject() {
  const p = current!;
  const next = nextStage(p);
  const steps = STAGES.map((s, i) => {
    const done = !!p.results[s];
    const state = done ? "done" : busy.has(s) ? "active" : "";
    const sub = done ? "Done ✓" : busy.has(s) ? "Working…" : p.payments[s] ? "Paid" : `${cents(cfg.prices[s])} · stage ${i + 1}`;
    return `<div class="step ${state}" style="--c:${TEAM[s].color}">${avatar(s)}<div><div class="t">${TEAM[s].who} · ${TEAM[s].title}</div><div class="s">${sub}</div></div></div>`;
  }).join("");

  const reports = STAGES.filter((s) => p.results[s])
    .map(
      (s) => `<article class="card" style="--c:${TEAM[s].color}" id="r-${s}">
        <div class="kicker">${TEAM[s].title} · by ${TEAM[s].who}</div>${RENDER[s](p.results[s])}
        ${receipt(p, s)}${s === lastDone(p) ? gate(p) : ""}</article>`,
    )
    .join("");

  let tail = "";
  if (next && busy.has(next)) {
    tail = `<div class="card cta-card working" style="--c:${TEAM[next].color}">${avatar(next)}
      <h2 class="dots">${TEAM[next].working}</h2><p class="lead">This usually takes under a minute. Your payment is confirmed; results are saved to this link.</p></div>`;
  } else if (next === "validate") {
    tail = `<div class="card cta-card" style="--c:${TEAM.validate.color}">${avatar("validate")}
      <h2>Nova is ready to validate your idea</h2><p class="lead">${TEAM.validate.does}</p>
      <button class="btn lg" data-pay="validate">Validate my idea <span class="price">${cents(cfg.prices.validate)}</span></button>
      ${devLink("validate")}</div>`;
  }

  app.innerHTML = `<div class="proj">
    <aside class="side"><div class="idea-box"><b>Your idea</b>${esc(p.idea)}</div>${steps}
      <a class="btn ghost sm" href="/" data-link>+ New idea</a></aside>
    <section>${p.results.validate ? `<div class="actions"><button class="btn ghost sm" id="print">Save as PDF</button></div>` : ""}${reports}${tail}</section>
  </div>`;

  app.querySelectorAll<HTMLButtonElement>("[data-pay]").forEach((b) => b.addEventListener("click", () => payStage(p, b.dataset.pay as Stage)));
  app.querySelectorAll<HTMLButtonElement>("[data-dev]").forEach((b) => b.addEventListener("click", () => devPay(p, b.dataset.dev as Stage)));
  app.querySelector("#print")?.addEventListener("click", () => window.print());
  app.querySelector("#stop")?.addEventListener("click", (e) => {
    (e.currentTarget as HTMLElement).closest(".gate")!.innerHTML =
      `<div class="q"><b>Good call.</b>You spent ${cents(cfg.prices.validate)} instead of months on an idea that needs work. Try a pivot or <a href="/" data-link>pitch another idea</a>.</div>`;
  });
}

const lastDone = (p: Project) => [...STAGES].reverse().find((s) => p.results[s]);

function receipt(p: Project, s: Stage) {
  const pay = p.payments[s];
  if (!pay) return "";
  const link = pay.txid.startsWith("dev-") ? "test run (no payment)" : `<a href="https://explorer.salemkode.com/tx/${pay.txid}" target="_blank" rel="noopener">BCH transaction ${pay.txid.slice(0, 10)}…</a>`;
  return `<div class="receipt">Paid on Bitcoin Cash · ${link}</div>`;
}

function gate(p: Project) {
  const next = nextStage(p);
  if (!next) {
    return `<div class="gate"><div class="q"><b>Your launch pack is complete 🎉</b>Save it as a PDF or keep this private link.</div>
      <a class="btn" href="/" data-link>Pitch another idea</a></div>`;
  }
  const v = p.results.validate;
  const t = TEAM[next];
  const question =
    next === "plan"
      ? v.verdict === "no-go"
        ? `<b>Nova says no-go.</b>You can stop here and keep your money, or ask Max for a plan anyway.`
        : `<b>Worth going further?</b>${t.who} turns this into a business plan with pricing, channels and a 90-day roadmap.`
      : `<b>Ready to launch?</b>${t.who} writes your names, landing page, posts and launch email.`;
  return `<div class="gate" style="--c:${t.color}"><div class="q">${question}</div>
    ${next === "plan" ? `<button class="btn ghost" id="stop">Stop here</button>` : ""}
    <button class="btn" data-pay="${next}">${next === "plan" ? "Go: build my plan" : "Build my launch kit"} <span class="price">${cents(cfg.prices[next])}</span></button>
    ${devLink(next)}</div>`;
}

const devLink = (s: Stage) => (cfg.devSkipPayment ? `<div><button class="link" data-dev="${s}">Local test: run without paying</button></div>` : "");

async function runStage(s: Stage) {
  if (busy.has(s) || !current) return;
  busy.add(s);
  renderProject();
  try {
    current = await api.run(current.id, s);
  } catch (e) {
    alertBox("Something went wrong", `${(e as Error).message}<br><br>Your payment is saved. Reload this page to try again.`);
  } finally {
    busy.delete(s);
    renderProject();
    document.getElementById(`r-${s}`)?.scrollIntoView({ behavior: "smooth", block: "start" });
  }
}

async function devPay(p: Project, s: Stage) {
  current = await api.pay(p.id, s, undefined, true);
  runStage(s);
}

// ---------- modal ----------
function openModal(html: string, onClose?: () => void) {
  modal.innerHTML = `<div class="sheet"><button class="x" aria-label="Close">×</button>${html}</div>`;
  modal.hidden = false;
  modal.querySelector(".x")!.addEventListener("click", () => {
    closeModal();
    onClose?.();
  });
}
const closeModal = () => {
  modal.hidden = true;
  modal.innerHTML = "";
};
function alertBox(title: string, body: string) {
  openModal(`<h3>${esc(title)}</h3><p>${body}</p><button class="btn" id="ok">OK</button>`);
  modal.querySelector("#ok")!.addEventListener("click", closeModal);
}

/** Opens the pairing QR and resolves when the wallet is connected. */
function connectWallet(): Promise<void> {
  if (walletState() === "ready") return Promise.resolve();
  return new Promise((resolve, reject) => {
    const { uri, qrSvg } = pair();
    openModal(
      `<h3>Connect your BCH wallet</h3>
      <p>Scan with a WizardConnect wallet, or tap the button on your phone.</p>
      <div class="qr">${qrSvg}</div>
      <a class="btn" href="${esc(uri)}">Open in wallet app</a>
      <div class="wallets">Works with Selene, Cashonize and Paytaca.</div>`,
      () => {
        off();
        reject(new Error("cancelled"));
      },
    );
    const off = onWallet((s) => {
      if (s === "ready") {
        off();
        closeModal();
        resolve();
      }
    });
  });
}

async function payStage(p: Project, s: Stage) {
  try {
    await connectWallet();
  } catch {
    return;
  }
  const ctrl = new AbortController();
  const t = TEAM[s];
  let quote;
  try {
    quote = await api.quote(p.id, s);
  } catch (e) {
    return alertBox("Can't get a price", esc((e as Error).message));
  }
  const steps = ["Approve the payment in your wallet", "Checking the payment on Bitcoin Cash", `${t.who} starts working`];
  const show = (i: number) =>
    openModal(
      `<div style="--c:${t.color}">${avatar(s, "avatar")}</div>
      <h3>${t.title}</h3>
      <div class="amount">${cents(quote.cents)}<small>${quote.sats.toLocaleString()} sats · Bitcoin Cash</small></div>
      <div class="progress">${steps.map((x, j) => `<div class="${j < i ? "ok" : j === i ? "on" : ""}">${x}</div>`).join("")}</div>
      <p style="font-size:13px">Open ${esc(walletName())} and approve. Nothing is charged until you approve.</p>`,
      () => ctrl.abort(),
    );
  show(0);
  try {
    const hex = await payWithWallet(quote.address, quote.sats, quote.tag, `LaunchDesk · ${t.title} (${cents(quote.cents)})`, ctrl.signal);
    show(1);
    current = await api.pay(p.id, s, hex);
    show(2);
    setTimeout(closeModal, 700);
    runStage(s);
  } catch (e) {
    if (ctrl.signal.aborted) return;
    alertBox("Payment not completed", esc((e as Error).message));
  }
}

// ---------- wallet button ----------
const wbtn = $<HTMLButtonElement>("#wallet-btn");
function paintWallet() {
  const s = walletState();
  wbtn.textContent = s === "ready" ? `● ${walletName()}` : s === "connecting" ? "Reconnecting…" : "Connect wallet";
  wbtn.title = s === "ready" ? "Click to disconnect" : "";
}
onWallet(paintWallet);
wbtn.addEventListener("click", async () => {
  if (walletState() === "ready") return disconnect();
  connectWallet().catch(() => {});
});

// ---------- boot ----------
renderBanner();
resume();
paintWallet();
api
  .config()
  .then((c) => (cfg = c))
  .catch(() => {})
  .finally(route);
