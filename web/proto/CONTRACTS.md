# LaunchDesk prototype v7 — contracts (current; v5/v6 below are history)

**The brief in one line:** an idea starts in the founder's **room**, a team of analysts chosen *for that idea* gathers **evidence with real sources** one finding at a time, a **report** (score + scalability) comes out of it, and only then the room **booms** into an office floor → building → district, **as far as the idea truly scales**. You are the CEO: you can steer the team. It must read in **2 minutes**.

Source of truth for types: `contracts.ts` (v7 block at the end). Stubs that typecheck today: `world/v7.ts` (`asWorldV7(world)` adapter), `world/bedroom/index.ts` (`createBedroomModel`), `data/v7.ts` (`SAMPLE_V7`, `PROJECTS_V7`, `mockSteer`, re-exported from `data/index.ts`). Owners replace them freely, keeping the exported signatures.

## Ownership (disjoint)

| WS | Files | Delivers |
|---|---|---|
| **WS-OFFICE** | `world/office/**`, `world/bedroom/**` | `OfficeModelV7`, `BedroomModel`. Revert characters to v5 (`git show f9cb376:web/proto/world/office/agents.ts`: soft rounded figures, two-dot eyes). Pixel-art direction for office + bedroom. New company sign. |
| **WS-WORLD** | `world/index.ts, camera.ts, daycycle.ts, sky.ts, v7.ts, levels/**`, other new `world/*` | `WorldV7` (createWorld returns it; drop the adapter), boom, level cap ghosts, roster mapping, projects. |
| **WS-EXP** | `proto.html, main.ts, ui/**, themes/**, flow/**` | `FlowV7`, one-thing-at-a-time UI, fixed theme, new LaunchDesk logo, demo mode, deep links. |
| **WS-INTEL** | `server/**, test/**, data/**` | Real sourced samples (`ProjectV7`), `ResultsV7` on the server, roster picker, steer endpoint + mock. |

Shared changes to `contracts.ts`: additive only, announced under "v7 notes (<id>)" below. Never `web/src/**` or `public/**`. No new deps.

## a) Levels — `WorldLevel = 0|1|2|3`, `LEVEL_META`
0 **Your room** (founder + laptop, all of phase 1) · 1 **Your office** (floor, phase 2 build) · 2 **Your building** (live) · 3 **Your district** (only ideas that scale). `levelTransition(from,to)`: 0→1 = **boom** (`BOOM_MS` 2600: 150 ms anticipation, laptop flash, room walls fold outward, props burst into pixel cubes, the floor slab spreads out from the room's footprint and the rooms rise column by column, analysts hop to their research desks, camera pulls to the floor overview; reduced motion = 400 ms crossfade); 1→2→3 = the v6 continuous pull-backs; switching projects = `"switch"`. The old `Level` (1|2|3) and `setLevel` stay for compatibility.

## b) Dynamic roster
`ROLE_LIBRARY`: viability (Mia), competition (Leo), market/money (Sam), demand (Ava), pricing (Theo), location (Lola), regulation (Omar), tech (Kai), scalability (Iris), each with `dept`, colour, default mission, score weight, hiring rule. The validate stage hires **3–5** (`Analyst {id=role, role, name, color, mission (for this idea, ≤12 w), why (≤12 w), weight normalised}`); viability + competition always. Build specialists `BUILD_TEAM = nova, dex, rae, pip` are phase-2 hires (asleep until $0.20). `ActorId = AnalystRole | BuildDept | "founder"`.
Seats (`seatOf(id, roster, level)`): **bedroom** = founder at `desk`, analysts at `s0…s4` in hire order (bed edge, beanbag, window cushion, pinboard, door chair). **Floor** (same 4×2 footprint as v6) = back row research wing `r0 r1 r2 r3` (roster order, 5th analyst = 2nd desk in r3); front row `lobby` (founder's CEO desk + reception) · `nova` · `dex` · `launch` (rae desk 0, pip desk 1). The bedroom sits exactly on the lobby footprint (`BEDROOM_FOOTPRINT` cx −9, cz 3.3, 6×5) so the founder's desk becomes the CEO desk after the boom.
`ActorState`: absent · arriving (hire "poof", self-resolves to idle ~900 ms) · idle · working · presenting · done · asleep.
**World API (`WorldV7 extends World`):** `worldLevel`, `setWorldLevel(l)`, `setLevelCap(cap)`, `setRoster(r)`, `setActorState(id, s, {instant})`, `pulse(id, kind)` (pixel "paper" flies to the founder/pinboard when a finding lands), `focusActor(id|"overview")`, `actorScreenPoint(id)`, `onActorClick`, `setSign(CompanySign)`, `setProject(WorldProject)`. Above the cap the next level shows as a ghost (dashed clay outline, no lights). **Office (`OfficeModelV7`)**: same + `floorRoomBounds(room)`, `pickActor`, `setReveal(k)` (boom: 0 = only lobby footprint, 1 = full floor). **Bedroom (`BedroomModel`)**: root origin = room floor centre, ≤ 2.6 high; `focusBounds`, `setBoom(k)` (0 intact → 1 gone), `applyAtmosphere`, `update`.
`CompanySign {kind: draft|brand, name, tagline?, color, glyph?}`: bedroom = handwritten note on the pinboard; floor = lobby wall sign; draft = working title until Nova, brand = Nova name + Dex glyph drawn on the pixel grid. Never the LaunchDesk logo.

## c) Evidence + report
`Finding {id, analyst, kind: fact|estimate|competitor|risk|strength|number, text ≤18 w, value?, unit?, display?, source?: {url,title,domain,accessed YYYY-MM-DD} | null, basis? (estimates), competitor? {name, named, price?, note}, impact −2…+2, t (ms after the analyst started), replaces?}`. **fact / number / named competitor require a source**; without one it is an estimate with a basis; an unsourced competitor is a category (`named:false`). `AnalystWork {analyst, status, findings, score 0–10 (≤ 7.5 if none sourced), headline}`.
`IdeaReport {score, verdict, verdictLine, factors[{analyst,label,weight,score,findings[],sourced,total}], math, evidence {total, sourced, sourcedShare, sources[]}, confidence (= confidenceFor(share): ≥.6 high, ≥.3 medium), scalability {score 0–10, cap, reach, why, wouldScale[1–3], parts[Reach, Repeatable, Margins at scale, Founder-free, Digital leverage]}, strengths[3]{text,finding}, weaknesses[3], nextSteps[3], pivot?}`. `levelCapFor(s, verdict)`: no-go → 0, ≤3 → 1 Floor, 4–6 → 2 Building, ≥7 → 3 District. `scoreDisplay(r)`: **hero only with ≥ 6 findings and ≥ 3 sourced**, otherwise "provisional" (small, says what is missing). The score always shows "Evidence n · m sourced" next to it. The report is what $0.10 buys.

## d) CEO steer
`SteerRequest {note ≤280, target?}` → `SteerResult {id, note, ack ≤14 w, status, rerun[], hired[], dropped[], findings[] (with replaces), changes[{what: score|factor|scalability|verdict|finding|roster, key?, before, after, why}], report, at}`. Real app: `POST /api/projects/:id/steer` (owner key, same auth as /run) → 202 `{id, ack, rerun}`; 409 while a stage runs; 429 after `STEER_LIMIT` = 3 per stage; progress via the existing GET poll at `results.v7.steers[]`; free. Proto: `mockSteer(project, note, target?)` (WS-INTEL makes it keyword-deterministic with prepared, honest variants for the sample, e.g. "office workers, not tourists"). UI shows ack → rerunning analysts work in the world → diff chips ("Demand 6.4 → 7.0").

## e) Projects = worlds
Server stores `results.v7: ResultsV7 {version 7, roster, work[], report, steers[]}` additively (keep v4 `mia/leo/sam/…` so `web/src` keeps working). UI uses `ProjectV7 {id, idea, title, createdAt, v7, level reached, sign, legacy (v6 Project for phase-2 cards)}`; `worldProjectOf(p)` → `WorldProject {id, level, cap, capWhy, roster, builders, sign}` → `world.setProject()`. UI: "Your offices" switcher, one world per project; storage key `launchdesk.proto.projects.v7` (try/catch).

## f) UI theme fixed
`UI_THEME = "graphite"` light. The day cycle changes **only the scene** (sky, sun, lamps, windows). `ui/**` must not subscribe to `onClock` for colours; remove `applyDayTokens`/`commitScheme` from boot; panels stay opaque enough (fill ≥ 0.88) that a night sky never darkens them; the logo and text never change.

## g) Flow, demo, deep links
`FlowStepV7`: bedroom → idea → pay1 → hire → evidence → report (pages score → scale → points → next) → steer (optional loop) → boom → floor → pay2 → build (nova, dex, rae, pip × working/result) → live → building → district → end. `STEP_LEVEL` maps steps to levels (building/district clamp to the cap and show the ghost + why). `FlowStateV7 {step, projectId, analyst?, finding?, page?, builder?, phase?, level}`; actions add `steer`, `decide grow|pivot|stop`, `switch-project`, `new-project`.
**UI rules:** one surface at a time; ≤ 12 words outside cards; each step has one headline and one action; findings arrive one at a time as a single chip (kind badge, text, source domain or "Estimate · basis"), then collapse into a counter; the score appears only in the report.
**`?demo=1`** (`DEMO_SCRIPT`, ~110 s, `DEMO_LENGTH_S` 112): 0 room + idea types itself · 6 pay1 · 10 hire · 18 evidence (~10 findings, 2.6 s each) · 46 report score · 53 scale · 59 points · 64 steer · 72 boom · 78 pay2 · 81/85/89/93 nova/dex/rae/pip · 96 live · 100 building · 104 district ghost + what would make it scale · 109 end "Your turn". Space pause, → skip, Esc exit; thin chapter bar on top; `&t=<s>` seeks.
**Deep links (`readParamsV7`)**: `?step=bedroom|idea|pay1|hire|evidence|report|steer|boom|floor|pay2|build|live|building|district|end`, also `?step=nova|dex|rae|pip` (= build + who); `&analyst=<role>&n=<i>` (evidence), `&page=score|scale|points|next`, `&who=`, `&phase=working|result`, `&project=<id>`, `&demo=1&t=`. v6 params (`time`, `cycle`, `still`, `quality`, `ui`, `switcher`) unchanged. `html[data-ready="1"]` / `data-busy` unchanged.

## Logo
WS-EXP replaces the LaunchDesk mark completely (`ui/logo.ts`, favicon): drawn on a pixel grid to match the pixel-art world, one ink colour + at most one BCH-green pixel, legible at 16 px, no gradients. The in-world company sign is WS-OFFICE's and shows the user's company, not LaunchDesk.

## Gates
`npx tsc --noEmit -p web/proto`, `npm run typecheck`, `npm run build`, `npm test`. No fabricated statistics, names, quotes or URLs: every `source` is a page actually fetched (url + title + access date); everything else is an estimate. Screenshots at 1440×900 and 390×844.

---

# LaunchDesk prototype v5 — contracts

The brief, in one line: **a minimalist, beautiful office that grows into a tower and then a district while the user watches seven specialists assemble and value their idea.** The user does three things (type the idea, approve $0.10, approve $0.20) and sets the pace on results ("Next"). We lead everything else.

Bar: Apple / Stripe / Revolut craft. No purple-blue AI gradients, no neon glow borders, no emoji, no sparkle icons. Product copy in English. Minimal text: **at most ~12 words visible at once outside result cards.**

Open: `npx vite --port <PORT> --strictPort` from the repo root → `http://localhost:<PORT>/proto.html`.

---

## 1. File ownership (disjoint, no exceptions)

| Owner | Files | Delivers |
|---|---|---|
| Tech lead | `web/proto/contracts.ts`, `web/proto/CONTRACTS.md`, `web/proto/tsconfig.json`, `web/proto.html` | Frozen types. Changes are additive only and announced. |
| **WS-A** (port 5251) | `web/proto/world/office/**` | `createOfficeModel()`: the beautiful level-1 office. Fork `web/src/office/{rooms,furniture,agents,layout,textures}.ts` into this folder and improve the copies. |
| **WS-B** (port 5252) | `web/proto/world/index.ts`, `web/proto/world/camera.ts`, `web/proto/world/levels/**` | `createWorld()`: renderer, lights, sky, fog, ground, camera rig, insets framing, levels 2 and 3, pull-back transitions, atmosphere, celebrations. |
| **WS-C** (port 5253) | `web/proto/main.ts`, `web/proto/ui/**`, `web/proto/themes/**`, `web/proto/flow/**`, `web/proto/data/**` | Themes, the flow state machine, every DOM surface, the variant switcher, deep links. |
| Integrate (5254), polish (5255) | any proto file, after the three merge | |

Never touch `web/src/**`, `server/**`, `test/**`, `vite.config.ts`, `package.json`. Read-only imports from `web/src` are allowed (`data/index.ts` imports the `Project` type). No new deps; three 0.181 and `three/examples/jsm/*` are available. No network calls except Google Fonts. No real payment.

Current files are **working stubs** written by the tech lead so the page runs today. Each owner replaces their stubs freely as long as the exported signatures stay.

## 2. Module APIs (source of truth: `contracts.ts`)

```
main.ts ─ readParams() → THEMES[id] → applyTheme()  (CSS vars + fonts)
        ├ createWorld(#world, {quality, atmosphere, level, reducedMotion})      WS-B
        │    └ createOfficeModel({quality}) → OfficeModel (THREE.Group)          WS-A
        ├ createFlow(world, initialState) → Flow                                 WS-C (only thing that drives World)
        └ createUi(#ui, {world, flow, layout, switcher, onTheme})                WS-C (reads Flow, calls flow.next())
```

### OfficeModel (WS-A → WS-B)
Pure THREE graph: **no renderer, camera, DOM, RAF or labels** in WS-A code. WS-B owns the loop and calls `update(dt, t)` each frame.
- Coordinates as `layout.ts`: origin = corridor centre at floor level; X −12.45…12.45, Z −6.25…6.25 incl. slab; floor top y = 0; slab underside ≈ −0.55; nothing above y = 2.2. WS-B relies on this footprint to fit the office inside a tower floor plate.
- `setDeptState(d, 'idle'|'working'|'done'|'locked')`: idle = calm, agent at desk; working = agent active, screen/lamp on, subtle room light; done = soft completed cue (e.g. the room's accent trim lit, a finished object on the desk); locked = Build rooms before $0.20, desaturated and dark, agent absent or asleep.
- `applyAtmosphere(a)`: read `a.surfaces`, `a.accentStrength`, `a.lightsOn`, `a.timeOfDay` (lamps glow at night/golden).
- `roomBounds(room)` / `bounds()` drive camera framing. `anchor(room)` = agent head (for DOM tags). `pick(ray)` for clicks. `cheer(room?)` = local celebration.
- Must stay at 60 fps on a laptop and acceptable in software GL with `quality: 'low'` (no shadows, fewer segments).

### World (WS-B → WS-C)
- `setLevel(1|2|3, {animate})`: one continuous camera pull-back. The office **never moves**: level 2 builds a tower around it (the office is the one lit floor; the other floors light up one by one), level 3 adds a district of buildings around the tower. Levels 2/3 are lazy-built. Going back to level 1 is a push-in (used when Build starts: we dive back into the office).
- `focus(room|'overview', {animate, ms})`: frames that room inside the free area. Default ~1100 ms, ease in-out, no overshoot.
- `setInsets({left,right,top,bottom})`: CSS px covered by UI; re-frames the current focus (600 ms). WS-C must call it whenever a panel/card appears or disappears, so the room in focus is never hidden.
- `setAtmosphere(preset, {animate})`: sky, fog, key light, hemisphere, ground, exposure, then `office.applyAtmosphere`. Fog values in the preset are tuned for level 1; WS-B scales near/far with camera distance at levels 2/3.
- `celebrate('paid'|'level-up'|'live')`: paid = coin/light pulse at the lobby; level-up = the tower's floors light up in sequence; live = Pip's room + a beacon on the roof. Tasteful: light, not confetti fireworks.
- `roomScreenPoint(room)` + `onCameraChange(cb)`: WS-C places floating status tags next to rooms. `onRoomClick` for hover/explore later.
- Camera: perspective, narrow FOV (~24°), fixed yaw ~34°, pitch ~40° (stub in `camera.ts`). No user orbit in v5; optional drag-pan only.
- Sets `html[data-ready="1"]` after the first frame and `html[data-busy="1|0"]` while the camera animates (screenshot scripts wait for `data-busy="0"`).

### Theme (WS-C)
`ThemeTokens` = fonts (Google Fonts hrefs + display/text/numbers stacks), colours, radii, glass, scheme, `atmosphere`. `applyTheme()` writes CSS custom properties on `<html>`:
`--font-display --font-text --font-num --c-bg --c-glass --c-glass-strong --c-ink --c-muted --c-line --c-accent --c-accent-ink --c-money --c-positive --c-warning --c-negative --r-sm --r-md --r-lg --r-pill --glass-blur --glass-sat --glass-border --glass-shadow`. UI CSS uses only these tokens, never literal colours (so all 5 themes work automatically). Numbers always use `--font-num` with `font-variant-numeric: tabular-nums`.

### Flow (WS-C)
`FlowState = {step, dept?, phase?, idea, level}`. `flow.next(action)` is the only user input; `flow.goto(state)` is for deep links and replay (snaps world without animation). Speed x3 via `setSpeed(3)` / `?fast=1`. Replay control lives in the switcher.

### Data (WS-C)
`data/pausa.json` is `exampleProject()` from `server/mocks.ts` dumped verbatim (coffee kiosk, Barcelona). `data/index.ts` exports `PAUSA: Project`. **Every number shown must come from it**: Leo 7.8/10 go, price €3.40, cash needed €54k, break-even month 6 at 186 sales/day, 10 tasks over 4 weeks, 3 names (Pausa / Andén / Siete), 3 logos, 12 posts, site `/s/pausa`, year-1 result +€18k. Whatever the user types, the sample run shows Pausa; the idea field is prefilled/placeholder with `PAUSA.idea` and a tiny "Sample run" tag says so. No invented testimonials, user counts or stats.

## 3. Deep-link params (`readParams()` in contracts.ts)

| Param | Values | Effect |
|---|---|---|
| `theme` | graphite · midnight · ivory · forest · mono | default graphite |
| `layout` | center · dock · side | default center |
| `quality` | low · high | low = no shadows, DPR 1, no AA |
| `scene` | office · building · district | world showcase: level 1/2/3 overview, UI hidden |
| `step` | idle · idea · pay-validate · validate · verdict · level-up · pay-build · build · live · scale | jump to a state |
| `dept`, `phase` | mia…pip, working · result | with step=validate/build |
| `focus` | room or overview | camera override |
| `fast=1` | | speed x3 |
| `ui=0` | | hide all UI |
| `switcher=0` | | hide the variant switcher |
| `still=1` | | reduced motion: instant camera, no idle animation (deterministic screenshots) |

Example: `/proto.html?theme=ivory&layout=side&step=validate&dept=leo&phase=result&quality=low&still=1`.
Screenshot scripts: wait `html[data-ready="1"]`, then `html[data-busy="0"]`, then ~1.5 s for fonts. `window.__proto = {world, flow}` for scripting.

## 4. Themes and layouts

| Theme | Type (display / text / numbers) | Colour | World mood |
|---|---|---|---|
| **Graphite** | Inter Tight / Inter / Inter Tight | white glass, ink black, BCH green `#0AC18E` | bright studio day, soft shadows |
| **Midnight** | Geist / Geist / Geist | dark smoked glass, off-white ink, mint money | night city, warm lit windows, lamps on |
| **Ivory** | Instrument Serif / Inter / Instrument Serif | warm paper glass, espresso ink | golden hour, long warm shadows |
| **Forest & Lime** | Familjen Grotesk / Inter / Space Grotesk | deep green ink, lime on green buttons | clear daylight, green slab |
| **Mono** | Geist / Geist / IBM Plex Mono | pure black and white, accents at 15 % | overcast studio, almost achromatic office |

Tokens live in `themes/index.ts` (WS-C may tune values, not the shape).

Layouts (the same content, different placement; `ui[data-layout]`):
- **center**: one centred glass card over the office. Idea popup centred; result cards centred, world insets = card rect so the room is framed above/beside it.
- **dock**: Spotlight-style command bar at the bottom. Results rise from the dock as a wide low sheet; the room is framed in the upper 60 %.
- **side**: right-hand glass sheet (≈400 px). The room is framed in the left free area. Best for reading results.

Variant switcher: bottom-left, collapsed to a 32 px "Aa" chip; expands to Theme · Layout · Speed · Replay. Writes `?theme=&layout=` with `replaceState`; theme change animates the atmosphere (WS-B) and swaps CSS vars (no reload).

## 5. Storyboard (timings at speed 1; `fast` divides by 3)

Rule for every step: one headline, one action. Status tags are ≤ 5 words. Result cards show **one hero number or artefact**, up to 3 supporting facts, and "Next". Card copy uses the spec-v4 §6 strings, shortened.

| # | Step | Camera (WS-B) | UI shows (WS-C) | Time | The user must understand |
|---|---|---|---|---|---|
| 0 | **idle** | Level 1 overview, very slow drift (±1°) . Build rooms `locked`. | Nothing but the wordmark "LaunchDesk" top-left. | 1.2 s, then auto → idea | This is a team in an office. |
| 1 | **idea** | Holds overview; insets for the card. | Popup: **"What's your idea?"**, one input (placeholder = sample idea), button **"Validate · $0.10"**. Under it, tiny: "Seven specialists. Two steps." | user | Type an idea, that is all. |
| 2 | **pay-validate** | Gentle push toward the lobby. | Compact approval sheet: "Validate your idea", "Mia, Leo and Sam", **$0.10**, button "Approve". Tiny: "Prototype · no payment". On approve: check, `celebrate('paid')`. | user, then 0.8 s | It costs 10 cents, paid in BCH. |
| 3 | **validate · dept working** (Mia → Leo → Sam) | `focus(dept)` 1.1 s. Room lights up, agent works. | Floating tag next to the room via `roomScreenPoint`: "Mia · Plan" + one live line cycling through the spec work-log lines (e.g. "Splitting it into 4 weeks"). Thin progress ring. Top: 3 dots (Mia · Leo · Sam). | 4–6 s | Someone specific is working on my idea right now. |
| 3b | **validate · dept result** | Holds; insets for the card. Room → `done`. | Result card. Mia: "Your plan" + **10 tasks · 4 weeks** + the first 3 tasks. Leo: hero **7.8 / 10 · Go** + headline + 3 signal bars. Sam: hero **€54k to start** + Price €3.40 · Break-even month 6 · 186 a day. Button **Next** (auto-advance after 12 s with a visible countdown bar that pauses on hover). | user | What this specialist found, at a glance. |
| 4 | **verdict** | Pull to overview, the three validate rooms `done`. | "Your report" card: 7.8 Go · €54k · Month 6, verdict line, **"Build it · $0.20"** (primary), "Stop here" (text). Pivot appears only if Leo says pivot. | user | Worth it or not, and what Build gives me. |
| 5 | **level-up** (score ≥ 7, go) | `setLevel(2)`: 2.2 s pull-back; the office becomes one lit floor of a tower; floors light up in sequence. `celebrate('level-up')`. | Centered chip: **"Level 2 · Building unlocked"**, a 3-step growth path (Office → Building → District) with the 2nd filled. "Continue". | 3 s + user | My idea graduated: it deserves a building. |
| 6 | **pay-build** | `setLevel(1)` push back into our floor, lobby framed. Build rooms unlock (`idle`). | Approval sheet: "Build and launch", "Nova, Dex, Rae and Pip", **$0.20**, "Approve". "Prototype · no payment". | user | 20 cents gets the brand, site and launch. |
| 7 | **build · working/result** (Nova → Dex → Rae → Pip) | Same as validate. | Nova: hero **Pausa** in its palette + tagline, the 2 alternatives small. Dex: 3 logos, the chosen one large. Rae: **12 posts · 30 days** mini calendar strip. Pip: tag "Putting Pausa live", then result = live site card. | 4–6 s each + user | My startup is being assembled piece by piece. |
| 8 | **live** | Overview of the office, then `celebrate('live')` (beacon on the tower roof). | Site preview card (browser frame, Dex landing headline + CTA "Pre-order for €2.50") with URL `/s/pausa`, counter "0 pre-orders" (honest), "Open your pack" + "Visit site". | user | It is live and can take BCH pre-orders. |
| 9 | **scale** | `setLevel(3)`: long pull-back to the district at dusk-ish light, other buildings unlit. | Growth path: Office ✓ · Building ✓ · **District** "30 pre-orders to unlock" (from Mia's goal). "Replay" + "Start a new idea". | end | Where this goes next: real traction grows the city. |

Pacing: never two camera moves at once; a card appears only after the camera settles (`await world.focus`). Card enter 280 ms (opacity + 8 px rise), exit 180 ms. Respect `prefers-reduced-motion` (`still`).

Mobile (≤ 640 px): all layouts collapse to a bottom sheet; insets.bottom = sheet height; tags shrink to the name only.

## 6. Quality gates

- `npx tsc --noEmit -p web/proto/tsconfig.json` and `npx tsc -p tsconfig.json --noEmit` clean; `npm run build` and `npm test` pass.
- No console errors. Screenshots at 1440×900 and 390×844 for every step in at least Graphite, Midnight and Ivory, with `quality=low&still=1`.
- Each workstream kills only its own vite PID.

---

## Changes by ws-c-experience (additive, WS-C files only)

- `flow/index.ts` exports **`ProtoFlow extends Flow`** (`settled`, `speed`, `workStart`, `workMs`, `paidCents`). The UI only shows a surface once `settled` is true (camera at rest). `createFlow(world, init, { hold })`: `hold` (= `still=1`) freezes a deep-linked `phase=working` so it can be screenshotted.
- Step → world level: idle…verdict = 1, level-up = 2, pay-build/build = 1 (dive back into our floor), **live = 2** (tower + `celebrate('live')`), scale = 3. The chrome level badge never claims level 3: the district is shown as the *horizon* ("30 pre-orders" to unlock, from Mia's goal / Dex's FAQ).
- Short deep-link aliases in `main.ts` (on top of `readParams`): `?step=pay1|pay2|levelup|district|mia|leo|sam|nova|dex|rae|pip` (dept steps default to `phase=result`; add `&phase=working` for the live tag).
- `data/sample.ts`: display view of `PAUSA` (no new numbers). BCH amounts are not shown (the sample has no rate): the pay sheet says "$0.10 in Bitcoin Cash".
- Insets: `center` popups (idea, pay) float over the office with no inset; result/verdict/level-up/live/scale use bottom insets (center, dock) or right insets (side); mobile ≤ 640 px = bottom sheet. `setInsets` is called only when a value changes by > 6 px.
- Result cards auto-advance after 14 s (÷3 in fast), visible as a fill line inside "Next", paused on hover/focus; disabled with `still=1`.
- Keyboard: Enter submits the idea (Shift+Enter = newline), → / Space / Enter = Next on a card or Continue on level-up, Esc closes the pack/site overlay or backs out of the first pay sheet.
- Switcher also has Speed (1×/3×), "Jump to" any step, Replay. Theme and layout change live (no reload) and are written to the URL.

## Changes by ws-a-office (additive, WS-A files only)

`createOfficeModel` keeps the frozen `OfficeModel` signature. Additions, all optional:

- **Options:** `createOfficeModel({ quality, still? })`. When `still: true` there is no idle motion and state changes snap. WS-B can pass `opts.reducedMotion` here.
- **Return type `OfficeModelExt`** (a superset of `OfficeModel`):
  - `setDeptState(d, s, { instant? })`: `instant` snaps lights, colours and the agent pose. Use it for `flow.goto` and deep links.
  - `deptState(d)`: returns the current state.
  - `hints`: the renderer settings the office was tuned for (`officeRenderHints`, also exported): ACES Filmic tone mapping, sRGB, PCFSoft shadows, shadow bias −0.0004 and normalBias 0.02. The office also looks right with Neutral tone mapping, as in WS-B's current world. Nothing breaks if you ignore these.
- **Environment light is self-contained.** On its first render the office builds a RoomEnvironment PMREM from the host renderer, through a tiny probe mesh's `onBeforeRender`, and applies it only to its own materials. WS-B does not need to set `scene.environment`. The intensity follows `timeOfDay`.
- **Interior lamps:** with `quality: 'high'` the office adds 8 warm `PointLight`s (no shadows), named `lamp:<room>`, one per room. They are at intensity 0 unless `lightsOn` is set; they are strongest at night and turn off in locked rooms. With `quality: 'low'` there are no point lights, only emissive shades and light-pool decals.
- **`office-ground-shadow`:** a soft shadow decal under the plinth at y ≈ −0.548. Inside the tower (level 2/3) WS-B can hide it with `office.root.getObjectByName("office-ground-shadow")!.visible = false`.
- **`anchor(room)`** returns a point about 0.3 above the agent's head. It follows the agent while they walk, sit or sleep.
- **`update()`** returns true every frame unless `still`, because idle breathing never stops. It returns true while something is in transition (walking, rings fading, a cheer).
- **Camera note for WS-B and WS-C (recommendation only):** in several theme presets the key light comes from almost the camera azimuth (34°): graphite 35°, forest 40°. Shadows then fall behind objects and the office looks flat. The office reads much better with the key light at azimuth −30…−45° (from the left) or 70…80° (Ivory already uses 70°).
- **Preview harness (dev only, not linked from the app):** `/proto/world/office/preview.html`. Params: `atmo=studio|day|golden|night|mono`, `quality=low|high` (high adds GTAO and SMAA), `states=idle|locked|validate|verdict|build|done|mixed|mia:done,leo:working`, `focus=<room>|overview`, `tm=aces|neutral`, `keyaz=`, `keyel=`, `cheer=<room>|all`, `still=1`, `bar=0`, `ao=0`, `aoview=1`.

---

## Changes by ws-b-levels

Additive only. Nothing in `contracts.ts` changed.

- **Extra world API.** `createWorld` still returns a `World`. The same object also implements `WorldExtras`, exported from `world/index.ts` (`createWorldX` gives it typed):
  - `setDistrictBuilt(k, {animate})` sets the district buildings between 0 and 1. At 0 they are planned: a white clay model with windows unlit (the default at level 3, per storyboard step 9). At 1 they are built, with real materials and lit windows (2.2 s crossfade). Use it when traction "unlocks" the district.
  - `debugPose(from, to, k)` poses a level transition at progress k with no animation. It exists for screenshots of mid-frames.
  - `camera` and `debug.{renderer, scene, key, state()}` are for scripts only.
- **URL param `?built=1`.** World only: starts the district built.
- **Level geometry.** The tower and district are built lazily: on the first `setLevel(2|3)`, or on the first `requestIdleCallback` after frame 1, so the first pull-back never hitches. The office never moves. It is floor 0 of a 12-floor tower; the floors above stack and light up as the camera pulls back. Growth follows the camera's eased progress, not wall time.
- **`setLevel` timings.** 1→2 takes 3.0 s, 2→3 3.2 s, 1→3 3.6 s, 2→1 2.7 s and 3→1 3.2 s. All use one continuous ease-in-out move with log-space distance. `focus(room)` while at level 2 or 3 dives back to level 1 in the same move.
- **`celebrate`.**
  - `'level-up'` queues a light sweep up the tower floors; it plays once the tower is complete.
  - `'paid'` pulses a ring at the lobby.
  - `'live'` pulses a ring at Pip's room and turns the roof beacon on for good (it breathes at levels 2 and 3).
- **`roomScreenPoint` returns null** whenever level ≠ 1 or the tower is visible, so tags hide during level moves.
- **Lighting rule.** This follows WS-A's camera note. A preset key azimuth within ±40° of the camera yaw (34°) is swung to about −35° (from the left), so shadows fall where the fixed camera sees them. Night (−30°) and golden (70°) keep their own azimuth. WS-B hides `office-ground-shadow` as soon as the tower starts growing. Fog near and far scale with camera distance / 62, which suits phones and levels 2 and 3. Presets stay authored for the desktop level-1 shot.
- **Backdrop.** The canvas is transparent. The host `#world` gets the sky as CSS: the `sky` gradient plus a soft white radial glow on non-night themes. The diorama base (street colour) sits on an invisible floor that only catches its shadow.
- **Idle camera.** A slow breathing drift (±0.5°) plus damped pointer parallax (±1.4° yaw, ±0.9° pitch), both off with `still=1` or reduced motion. `onCameraChange` fires every frame the camera actually moves.

## Changes by integrate (5254)

- `proto.html`: inline SVG favicon (removes the only console error, a `/favicon.ico` 404).
- `ui/ui.css` (≤640px): the live sheet drops the site preview's sub-headline and payment footnote so "Next level" stays on screen at 390×844.
- Verified end to end at 1440×900 and 390×844 in all five themes and three layouts, deep links (`step=…`, `scene=…`), live theme / layout / jump switching. Screenshots: `.notes/proto-v5/integrate/`.

## Changes by polish (port 5255, after critic round)

- **Flow order** (every world move goes outward): `… verdict → pay-build → build (Nova…Pip) → level-up → live → scale`. Verdict "Build it" goes straight to the $0.20 sheet (no dive back). After Pip, the office grows into the tower (level 2), the scene holds 1.2 s with no UI, then a compact toast: "Level 2 · Building unlocked · Pausa is live. Your office is now floor 1." `live` keeps the tower and lights the beacon; `scale` pulls back to the district (level 3, clay maquette = planned).
- **Reading time**: `READ_MS` = 20 s and never divided by speed; Leo, Sam and Rae never auto-advance; auto-advance pauses on hover, focus and pointer movement.
- **World extras**: `renderedLevel()` (HUD label follows growth > 0.5, never ahead of the picture) and `officeScreenPoint()` ("Your office · Floor 1" tag at levels 2 and 3). Level growth is driven by wall time; pull-backs use `easeOutward` (moves at once). Floor 0 of the tower is outlined and its ceiling band glows in the BCH accent, with one pulse when the tower completes. The diorama base fades in only with the streets: at level 1 the office floats on the sky. District: 6 cars, no people, planned buildings fade from ghost to solid clay.
- **Idea popup**: headline, one muted line ("Seven AI specialists turn it into a live business."), field, "Validate · $0.10", and a 3-item outcome strip (Report · Brand · Live site). Only the real sample exists (no other example chips). If the typed idea differs from the sample, the pay sheet says "Demo shows a sample: Pausa, coffee kiosk."
- **Verdict**: Pivot only when Leo says pivot; above "Build it" the four Build avatars + "Brand · Site · Launch plan".
- **Themes**: the UI theme never tints the world. Ivory = paper UI + golden-hour light (Newsreader for titles/numbers, Geist text). Forest = green-black glass UI, lime only on the primary action, overcast morning. Mono = zero-chroma office. Graphite = neutral studio.

## v6 notes (WS-C intelligence & content)

- `data/pausa.json` was regenerated from the v6 mocks. **Pausa's numbers changed** (the §2 Data list above is v5):
  Leo **7.7/10 go**, price €3.40, cash needed **€55k** (month 6), break-even **month 7 at 186 sales/day**,
  year 1 **+€6.8k**, launch offer **€2.40** (normally €3), gate **100 paid pre-orders**, 10 tasks, 12 posts, `/s/pausa`.
  `PREORDER_GOAL` now reads Mia's gate (100). Read numbers from the data, never from this note.
- New optional fields on the stored results (gate, kill criteria, score maths, confidence, launch offer, unit,
  break-even formula, headroom, sensitivity, positioning): see `data/DATA.md` (field list + hero number per card)
  and `data/v6.ts` (`v6(project)` typed accessor).
- `PAST_PROJECTS` is filled (Miga · Go · level 2, Ronda · Pivot · level 1, Segunda Vuelta · Go · level 3, all
  full `Project` payloads). `toPast(project)` builds a row from any stored project for the visitor's own runs.

## v6 notes (ws-a2, office art)

Only `world/office/**` changed. `OfficeModel` API, coordinates, `bounds()`/`roomBounds()`, `anchor()`, `office-ground-shadow` are unchanged.

- **Day cycle input.** `applyAtmosphere(a)` is allocation-free (≈0.07 ms) and safe at 10×/s. It never rebuilds materials or geometry. It derives three continuous factors from whatever preset it gets, so an interpolated preset fades smoothly and `timeOfDay` may be a rounded label:
  - `dark` (0 day … 1 night) from the luminance of the bottom `sky` colour (and a weak key-light intensity),
  - `warm` (golden hour / dawn) from the key-light colour and elevation,
  - `lamps` from `lightsOn`: a number 0..1 is used as a fade; `true` = on (strength scaled by `dark`), `false` = off, missing = derived from `dark`.
  Surfaces strings are only re-parsed when they change.
- **Interior light (quality-aware, fixed count, no shader recompiles):** high = 4 warm `PointLight`s named `lamp:col0..3` (one per room column, over the corridor) + 1 dept-coloured `lamp:work` that moves to the working room. Low = 0 lights; emissive shades, additive lamp pools and a broad warm "room glow" pool per room do the work. The old 8 `lamp:<room>` lights are gone. Note for WS-A1: `world/index.ts` also has its own `workLight`; with both on, the working room is a bit stronger. Drop one if it looks too strong.
- **Defensive `update(dt)`:** dt is clamped to 0..0.1. On the first frame `world/index.ts` can pass a large negative dt: the rAF timestamp is older than `last = performance.now()` taken after a slow build. Before the clamp this froze agents in odd poses. WS-A1 may want to clamp at the source too.
- **`still` fallback:** `createOfficeModel({ quality })` without `still` now reads `?still=1` / `prefers-reduced-motion`, so deep links snap agent poses (sit, walk) instead of animating them over many slow frames.
- **Draw calls:** fixed-colour props are merged per room into vertex-coloured materials (3 finishes: matte / satin / metal; one shared shader program with a desaturation uniform for locked rooms and mono). Contact-shadow decals are merged per room into one material per mask, with strength in vertex alpha. Each figure's limbs are one mesh per bone. Office meshes went from 641 to 350, and calls per frame (incl. the shadow pass) from about 1040 to 510.
- **Characters:** slimmer (~6.5 heads), tailored tops in the dept colour, per-person trousers and shoes, no head icons. Idle: breathing, weight shift, glances, sometimes turning to a colleague. Working: types (the room's screens pulse), and every ~12 s walks to the room's board, points, and walks back. Done: leans back in the chair, hands behind the head. Locked: asleep at the desk. Fixed a v5 bug where seated agents dipped every frame (`sit` decayed when already at its target).
- **Preview harness:** `preview.html?time=dawn|day|golden|dusk|night|0..1` (an interpolated preset, like the world clock) and `&cycle=<s>` (the full day, `applyAtmosphere` every 100 ms). The preview applies WS-B's sun-swing rule so shadows show.

## v6 notes (ws-b)

- **Layout**: center only. The old layout/theme switcher is now dev tools, shown only with `?switcher=1` (time scrub + phase marks, cycle 4 min / 1 min / 20 s / Hold, logo candidates, speed, jump, replay). Extra params read by `main.ts` only: `?mark=quadrant|horizon|stack` (logo candidate), `?projects=1` (opens "Your projects" at boot).
- **Clock**: boot calls `world.setClock({mode:'cycle', periodSec: params.cycle ?? 240})` or `{mode:'fixed', t: params.time}` (`still=1` with no `time` means `t = DAY_TIMES.day`). If the world lacks `setClock/onClock/getClock`, `main.ts` runs a local 10 Hz clock with the same landmarks (`themes/day.ts#clockInfo`) and steps `world.setAtmosphere` per phase (day → graphite, dawn/golden → ivory, dusk/night → midnight).
- **UI tokens** follow `onClock` (`themes/day.ts#applyDayTokens`): `--c-bg --c-sky --c-glass --c-glass-strong --c-surface --c-ink --c-muted --c-line --c-fill --c-accent --c-accent-ink --c-money --c-positive --c-warning --c-negative --glass-border --glass-shadow --glass-hi --daylight --warmth`, plus `html[data-scheme=light|dark][data-phase=<name>]`. Ink/muted/status colours are solved for WCAG AA against glass over the expected sky across the whole cycle (sweep minimum is 4.6:1).
- **Flow**: the UI no longer auto-advances result cards; each card waits for Next (→ / Enter). The flow still owns the step order.
- **Projects**: runs are stored in `localStorage["launchdesk.proto.projects.v1"]` (wrapped in try/catch) at submit, verdict, level-up, live and scale, and merged with `PAST_PROJECTS` seeds. The UI calls `world.setPortfolio?.(items)` on every change.
- **Level semantics (needs alignment with ws-c)**: `data/index.ts#levelOf` gives level 2 to a "go" project that has not been built. The flow's own runs use 1 at verdict, 2 at live and 3 at scale. The drawer shows each project's stored level as is.
- **World (for the world workstream)**: at night with `quality=low`, the lamp light pools render as overexposed yellow discs. Pip's level-1 framing on mobile is also small.

## v6 notes (ws-a1, world & day cycle)

- **Clock.** `World.setClock/getClock/onClock` are implemented in `world/daycycle.ts` and `world/index.ts`. The world reads `?time` and `?cycle` itself at boot, so it also works when nobody calls `setClock`. It is frozen at the local time under `reducedMotion` unless `setClock` is called.
  - **Keyframes:** night 0 → pre-dawn .17 → first light .235 → dawn .275 → morning .40 → day .50 → afternoon .64 → golden .72 → sunset .775 → dusk .82 → blue hour .88.
  - **Interpolation:** every field is smoothstep-lerped between keyframes, colours in linear space. `sample()` allocates nothing.
  - **Sun:** rises at .23 and sets at .80, with a 60° peak. Its azimuth sweeps 132° → 70° and never passes the camera azimuth, so shadows always read. Below the horizon the key light hands over to a cool moon (−32°, 48°) while both lights are near zero, so the handover is invisible.
  - **Pace:** deep night runs about 2.2× faster than daylight, so night is about 24 % of a cycle. `periodSec` is still the average length of one day.
  - **`onClock`:** fires at most every 100 ms and only while `t` changes, plus once on subscribe and on every `setClock`. `setClock(..., {animate:true})` glides along the shortest arc in 2.4 s.
- **Atmosphere modulation.** The clock owns the lighting, sky, fog, exposure, level palettes and office surfaces: Graphite by day, Ivory at golden hour and Midnight at night, blended. `setAtmosphere(preset)` still works, but only its `accentStrength` and `key.shadows` are used now. The theme no longer tints the world.
- **What the office receives** (WS-A2), through `office.applyAtmosphere(a)` at ≤ 10 Hz and only while the clock moves. The full `AtmospherePreset` is filled in, plus these extra fields on the same object:
  - `lightLevel`: 0..1 fade for lamps and lit windows. The boolean `lightsOn` is still set, as `lightLevel > 0.3`.
  - `daylight` and `warmth`: 0..1.
  - `clockT`: the current time of day.
  - `timeOfDay`: kept discrete (night if daylight < .32, golden if warmth > .5, else day/studio). **Recommendation:** read `lightLevel`/`daylight` instead of the discrete `timeOfDay`/`lightsOn`. Today the lamps switch on and `ENV_BY_TIME` steps at those thresholds.
- **Sky.** The CSS sky on the host is now a gradient plus a horizon glow on the sun's or moon's side of the camera, plus a soft daylight bloom. A star layer (`.world-stars` div, prepended to the host) fades in at night. The canvas gets `position: relative` so it stays above the stars.
- **Shadows.** The shadow camera is texel-snapped in light space, so shadows don't shimmer while the camera drifts. The invisible studio floor stops catching shadows once the sun is below 20°, which stops long shadows from running onto the sky.
- **District (level 3).** It now shares one architectural language with the hero tower, in `world/levels/arch.ts`: stone floor bands, slim fins on a 3.6 m rhythm, curtain or ribbon glass, parapet and plant box.
  - Ten buildings with varied massing, all well below the hero.
  - The base is smaller (196 × 136).
  - **Default changed:** the district now starts **built** (real materials, lit at night). `?built=0` or `setDistrictBuilt(0)` gives the white planned maquette, which uses the same massing and fins.
  - Cars (12) have head and tail lamps, and at night additive light trails. Street lamps cast soft radial pools.
- **Portfolio.** `setPortfolio(items)` puts up to 6 past projects on reserved plots near the tower, in order (index 0 is nearest).
  - Size by level: 1 = glass pavilion, 2 = podium plus a 5-floor tower, 3 = podium plus a 7-floor tower.
  - They are always built and lit, and carry a thin BCH-green line on the roof parapet ("yours"). Free plots show a dashed outline.
  - Label anchors: `world.portfolioScreenPoints(): {id, x, y}[]` (CSS px, canvas-relative; empty below level 3) is an extra in `WorldExtras`. Call it from `onCameraChange`.
  - It is safe to call at any time, before the levels are built included. It rebuilds only the portfolio group.
- **Tower.** It now reads as a premium glass tower: slimmer fins (0.11 × 0.5), slim corner posts instead of pilasters, 0.3 floor bands, and more reflective glass. Glass doesn't glow by day (emissive is 0 until dusk). During the pull-back from level 1, the office now sits inside its glass plinth for a beat before the upper floors stack.
- **Dev harness.** `/proto/world/harness.html` is world-only and needs no UI or theme. Params: `scene`, `time`, `cycle`, `still`, `quality`, `portfolio=0..6`, `labels=1`, `clock=1`, `built=0`.
- **Performance** (headless Chrome on Apple M3, Metal, 1440×900 @2×, quality=high): 60 fps in office, building and district while the clock cycles, worst frame about 19 ms.

## v6 notes (integrate, port 5264)

- **Level rule (one rule now):** level = how far the business got, same as the flow. 1 office = validated, any verdict, not built · 2 tower = built and live (the flow's `level-up`/`live`) · 3 district = live and grown (`scale`). `data/index.ts#levelOf` is `pip ? 3 : 1`. So Miga (Go, not built) is now level 1, a glass pavilion in the district, and the reader no longer says "Built and live" for it.
- **Portfolio:** the run on screen is excluded from `setPortfolio` (it is the hero tower, not a second building). At `scale` on desktop, the UI puts clickable name + score tags over each past-project building (`world.portfolioScreenPoints()` from `onCameraChange`); nearer tags win and farther ones step up to avoid overlap. A tag opens that project's report. Seed titles drop a trailing "in <City>" in tags.
- **Fixed:** every click inside the overlay (reader tabs, Back, Close) was swallowed: the overlay root carries `data-open="1"`, so `closest("[data-open]")` matched it first. Now `button[data-open]`.
- **Fixed:** the "Projects" pill (desktop) and the top-bar projects button (mobile) had no click handler.
- **Office lamps** read the world's continuous `lightLevel` first (then `lightsOn`), so lamps fade with the clock instead of switching at 0.3.
- **Break-even pace:** under one sale a day, cards say "N sales a month" (from `sam.breakeven.per_month`) instead of "0.4 customers a day"; the verdict fact is "Sales a day/month to break even". Prices ≥ 100 show no cents.
- **Scale panel:** "Level 3 · District / Your district / N projects, one building each", and the progress row is the live project's gate ("Pausa · pre-orders by week 4 · 0 / 100").

## v6 notes (polish, port 5268)

- **Output quality (server/ai.ts + server/mocks.ts):** signals without a `source_id` are capped at 7.5 (`UNSOURCED_SIGNAL_CAP`), so desk-only research can't read as an 8.5; low-confidence Go is labelled "Go · to test" (`verdictText`). Memo lines quote the break-even pace; kill lines are ≥ half of break-even; every cost table has a founder line; no "guarantee" bullets; Rae's offer only from the pre-order week. New No-go sample `games` (validate-only). Invariants live in `test/quality.test.ts`.
- **Logos are drawn, not described:** Dex returns `glyph` (`LOGO_GLYPHS`); `ui/brandmark.ts` renders glyph + name in the brand face (`brandLogoHtml`, `mode:"mark"` = app icon). Dex card shows the chosen logo on paper, on a dark tile, as an app icon and as a favicon tab; the three candidates are clickable (`data-logo`).
- **Verdict:** gauge simplified (ticks at 5 and 7), `paceBar` (month 1 → break-even → month 12), facts are Cash to start / Profitable from / Cash back, build list is one muted line; no Build for No-go.
- **Sam:** "Year 1 operating" (start-up shown apart), "Cash back ~Month N", chart tags say "Profitable from here" and "Cash back ~MN".
- **Site preview:** hero mark, offer card, pre-order gate with refund note, FAQ accordion, footer.
- **Your projects:** bottom shelf of cards (horizontal on desktop, vertical list on phones), "New idea" first. Own prototype runs don't get district buildings (the hero tower already is that run). `store.start` happens on paying for validation, not on typing the idea.
- **Day cycle:** default is a 30-minute day starting at 0.64 (late afternoon). UI tokens come in two families (light DAY↔GOLDEN, dark NIGHT↔EMBER) with hysteresis; the light/dark swap waits up to 45 s and is applied on the next panel change (`commitScheme`) with a 1.3 s crossfade, so the UI never flips under the user's eyes. `?cycle=<sec>`, `?time=<0..1|dawn|day|golden|dusk|night>`, `?switcher=1`.
- **Light:** golden-hour key retuned (low raking sun, warm sky), crisper day, interior darkening delayed, more lit windows at night.
- **Mobile:** sticky verdict actions, top scrim under the wordmark, scrollable card tabs, projects as a list.

## v7 notes (<id>)

Append cross-workstream notes here, one subsection per workstream.

### v7 notes (ws-world, port 5272)

- **`createWorld(host, opts)` returns `WorldV7 & WorldExtras` directly** (`world/index.ts`, type `WorldX`). `world/v7.ts#asWorldV7` is now a typed pass-through (kept so stub-era imports compile). Options are additive: `WorldOptionsV7 = WorldOptions & { worldLevel?: 0|1|2|3; pixel?: 0|1|2 }`. Pass `worldLevel: 0` to boot in the room (default = `level ?? 1`). The v6 `level` getter returns `max(1, worldLevel)`; `setLevel(l)` = `setWorldLevel(l)`.
- **Levels.** 0 = `createBedroomModel()` placed at `BEDROOM_FOOTPRINT` (office-root coords; office root stays at the origin). `setWorldLevel` follows `levelTransition`: `boom` for 0→1 (animated, `BOOM_MS`), v6 pull/push for 1↔2↔3, crossfade (canvas only, sky stays) for every other jump and for `setProject`. Reduced motion: the boom is a 400 ms crossfade. `animate:false` snaps.
- **Boom (world/boom.ts, timings in `BOOM`).** 0–150 ms push-in + laptop flash (a point light at `bedroom.actorAnchor("founder")`); 150 ms burst: 150 pixel cubes (room colours + roster colours) thrown out of the footprint with one bounce, two stepped octagonal shockwaves, a 0.5 s camera kick. `bedroom.setBoom(k)` over 150–1000 ms, `office.setReveal(k)` over 420–2270 ms (linear k; the office eases it), and the camera holds on the room through the burst, then pulls to the floor overview from 320 ms to 2600 ms. The bedroom's own cube burst and the world's 80 cubes add up; WS-OFFICE may drop theirs or the world can (`N` in boom.ts). **If the office has no `setReveal` yet**, the world spreads the office root out of the lobby footprint (scale) as a fallback. Framing always uses the office's rest transform.
- **Cap + ghost (world/levels/ghost.ts).** `setLevelCap(cap)` then `setWorldLevel(l > cap)` builds `cap` and frames the ghost of `cap+1`: a dashed clay blueprint (instanced dash boxes + faint volumes, no lights, slow breathing) with a pixel padlock sprite: cap 0 = the 7 other floor rooms around the room, cap 1 = the 12-floor tower outline over the office, cap 2 = every district building (new `District.ghostBoxes()`) with the padlock over the tower roof. Extras: `ghostScreenPoint()` (CSS px of the padlock, for the "why it stops here" tag) and `ghostLevel()`.
- **Actors.** `setRoster`, `setActorState`, `setSign` go to both the bedroom and the office (so the hand-over at the boom is seamless); `pulse` goes to whichever is shown. `focusActor(id)` frames `bedroom.focusBounds(id)` at level 0 and `office.floorRoomBounds(seatOf(id).room)` on the floor (diving back in from 2/3). `actorScreenPoint` is null at levels 2/3 and during the boom. `onActorClick` uses `pickActor`. Until the office implements the v7 methods, the world maps actors onto the v6 rooms (r0..r3 = mia/leo/sam/nova rooms, nova→dex room, dex→rae room, launch→pip room).
- **`setProject(p)`**: 600 ms crossfade; inside it sets cap, roster, founder idle, analysts idle (done if `p.level ≥ 1`), builders idle/done or asleep, sign, and snaps to `min(p.level, cap)` with no ghost. Portfolio (`setPortfolio`) is unchanged from v6.
- **Owner update (César): default is `?pixel=0` = no renderer pixelation** (native, crisp v6-quality render; the pixel-art flavour comes from WS-OFFICE's flat shading/textures). `?pixel=1|2` remain opt-in looks.
- **Caps are not forever (owner update):** every idea can scale (a bakery can become a franchise). The ghost + padlock means "unlock by choosing a scale path". When the UI/flow commits to a path, call `setLevelCap(higher)`: if the flow had already asked for that level, the world grows into it immediately (ghost → real building/district with the normal pull-back).
- **Pixel art (world/pixel.ts, opt-in).** The canvas renders at one art pixel per 2 CSS px (`?pixel=1`; 1.5 px on phones) into a half-float target; one full-screen pass tone-maps, adds a 1-pixel ink outline on silhouettes and depth breaks (warm umber by day, navy at night), quantises to 40 levels with a 4×4 Bayer dither, and the canvas is upscaled with `image-rendering: pixelated`. `?pixel=2` = 3 CSS px, 24 levels (chunky). `?pixel=0` = v6 native look. The DOM UI is never pixelated. The sky follows: in pixel mode it is painted into a small canvas (2 × art pixel) with dithered bands and square, step-twinkling stars. Extras: `world.pixel`, `world.setPixel(m)`.
- **Day cycle untouched** (sky, sun, lamps, windows); the world still exposes `onClock`, but per §f the UI must not use it for colours.
- **For WS-OFFICE:** with `setReveal(0)` one standing figure is still visible on the hidden floor (front-right room, seen through the cap-0 floor ghost: `harness.html?wl=0&cap=0&ask=1`). Actors should hide while their room is unrevealed.
- **Performance** (headless Chrome, Metal, 1440×900 @2×, quality=high, pixel=1): 60 fps in room, floor, building and district, p95 17.5 ms. During the boom, p95 17.6 ms with at most one 67 ms frame; programs are precompiled on idle (`pixel.compile`) so the first boom does not hitch on shader compiles.
- **Dev harness**: `/proto/world/harness.html?wl=0..3&cap=&ask=&boom=<ms>&play=boom&pixel=&roster=3..5&focus=<actor>&brand=1&devroom=1` (`devroom=1` = a DEV-ONLY placeholder room from `world/dev-room.ts`, never imported by the app, for testing while the real bedroom is a stub). `debugBoom(ms)` poses the boom deterministically.

### v7 notes (WS-INTEL)

- **Server-only `ResultsV7` fields (additive, optional):** `status` (planning | researching | analysing | judging | done | error), `error` and `researched`. The UI can read `status` to show progress, and can ignore it otherwise. v7 lives at `project.results.v7`, stored in its own table, `results_v7`.
- **Endpoint `POST /api/projects/:id/steer` `{note, target?}`:**
  - Success returns 202 `{id, ack, rerun}`. The UI then polls the project until `steers[i].status` is `"done"`.
  - Errors:
    - 400: the note is not 3–280 characters.
    - 402: validate is not paid.
    - 404: unknown project.
    - 409: a steer or stage is running, or there is no report yet.
    - 429: there are already 3 steers.
- **Scoring:**
  - Steps: 1.0 for a sourced finding, 0.5 for an estimate.
  - A factor with no sourced finding is capped at 7.5.
  - Bands: Go at 6.5 or above with no factor at 3 or below; Pivot from 4.5; No-go below 4.5.
  - `report.math` states the rule.
  - All four samples are pivot. That is honest, so the UI should not assume any sample reaches Go.
- **Data exports** (`data/index.ts`):
  - `SAMPLE_V7` (title "Metro coffee kiosk", id pausa, level 0).
  - `PROJECTS_V7`, in the order `[pausa, forn, ronda, tique]`.
  - `DEMO_STEER_NOTE`, which is "Focus on office workers, not tourists, and start as a stand.". The score goes 5.5 → 5.9.
  - `preparedSteers(id)` and `mockSteer`.
  - `applySteerToProject`, which shifts the `t` of new findings past the kept ones.
  - `findingsInOrder` and `brandSignOf`.
- **The prototype's steer mock** returns an honest no-op (`changes: []`) for notes it has no prepared answer for. The server does the same in MOCK_AI.
- **Caps:** forn 1, pausa 2, ronda 2, tique 3. Each sample's level is at or below its cap.
- See `data/DATA.md` (v7) for the hero element per screen and the reveal order.

### v7 notes (ws-office, port 5271)

- **Characters are the v5 figures again** (`world/office/cast.ts`; the v6 `agents.ts` is deleted). `CAST` keeps the v5 looks for the original seven and adds looks for every v7 analyst plus the founder (hood, `FOUNDER_COLOR` #0AC18E). A roster colour overrides the shirt. States follow `ActorState`: `absent`; `arriving` (pop-in + cube poof, then idle after 900 ms); `idle`; `working` (typing, or a lap laptop when standing); `presenting` (paper raised); `done` (hop); `asleep`.
- **Style knob** (`world/office/style.ts`): `clean | pixel | voxel`. Default is **voxel**: pixelated nearest-filtered textures, posterised; native pixel-art textures; flat shading; low-segment cylinders; cube plants; toon figures. Set it with `createOfficeModel({style})` / `createBedroomModel({style})` or `?ostyle=` (for dev comparisons). It reads best with WS-WORLD's `?pixel=1` pass on top, which is assumed to be the default renderer layer. The models never post-process. `applyAtmosphere` stays allocation-free (`lookFromAtmosphere` plus registry `resolve`).
- **Office (`createOfficeModel`) returns `OfficeModelExt`.** This is `OfficeModelV7` plus legacy `setDeptState/deptState/roomBounds/pick/anchor`, `actorState`, `trayPoint`, `style` and `hints`. Exports: `envProbe(renderer)` (shared PMREM per renderer) and `OFFICE_STYLES`.
  - **Roster:** `setRoster` puts research rooms r0..r3 in roster order, with the 5th analyst at r3 desk 1. Room furniture and wall art come from the analyst's role: viability SWOT, competition cork wall + globe, market money board, demand personas, pricing tags, location map, regulation binders, tech code wall + rack, scalability growth board. A room with no analyst shows a "HIRING" board. Wall art is shapes only: no numbers, names or logos.
  - **Defaults:** analysts idle, builders asleep, founder idle at the lobby CEO desk. `FOUNDER_SPOT` is the same as the bedroom desk spot.
  - **Reveal:** `setReveal(0)` hides the whole floor, and `setReveal(1)` is the rest state. The office eases it internally.
  - **Pulse:** `pulse(id, kind)` flies a paper tinted by kind from the actor to the founder's tray.
  - **Legacy mapping:** mia/leo/sam are roster 0/1/2.
- **Lobby sign** = `setSign(sign)`, drawn as a 128×40 pixel canvas on the lobby back wall. A brand sign is a backlit panel in the brand colour, with glyph, name and an optional tagline. A draft sign is a kraft card with "WORKING TITLE" and the name; before naming it reads "YOUR IDEA". It never shows the LaunchDesk logo. The panel glows at night through the "glow" material role. Only the 3D sign is lit; the DOM UI is never touched.
- **Bedroom (`createBedroomModel`, level 0)** carries its own plinth, matching the office slab, so it can stand alone at `BEDROOM_FOOTPRINT`.
  - **Window:** the sky and skyline follow the day cycle, with lit windows, moon and fairy lights at night.
  - **People:** the founder starts `working` at the desk. Analysts start `absent` and appear (`arriving`) at five spots: bed edge, beanbag, window bench, pinboard and door chair.
  - **Pulse:** `pulse` pins a sticky in the kind colour on the cork board.
  - **Boom:** `setBoom(k)` is scrubbable from 0 to 1:
    - 0–0.1: flash.
    - 0.06–0.42: walls fold outward on their outer edges.
    - Up to 0.62: walls vanish.
    - Throughout: furniture squashes and shrinks, and 220 cubes are thrown out (140 on low quality).
    - 0.55–0.85: the floor goes.
  - **API:** `focusBounds(id)` and `actorAnchor(id)` are implemented.
- **Preview** (`/proto/world/office/preview.html`) params:
  - Model, style and post-process: `model=bedroom`, `ostyle=`, `px=2` (preview-only pixel pass).
  - Roster and actors: `roster=viability,competition,…`, and `actors=room0|hire|evidence|report|floor|build|live` or `id:state,…`.
  - Sign: `sign=brand|draft:Name:#hex:glyph:tagline`.
  - Camera and effects: `focus=<FloorRoom>|actor:<id>`, `reveal=0..1`, `boom=0..1`, `boomplay=1`, `pulse=id:kind,…`.
  - `window.__office` is exposed.

### v7 notes (owner update)
César, relayed by the coordinator; overrides parts of §a/§c/§g:
- **Every business can scale** (even a neighbourhood bakery, as a franchise). Scalability is no longer a hard cap that says "your business fits a Floor". The report shows the **scalability score** (how hard, in words: ≥ 7 "Natural fit", ≥ 4 "Doable with work", else "Hard, but possible") plus the **best scale path** for this idea and up to 2 alternatives.
- **The next level is unlocked by committing to a scale path.** `levelCapFor` still gives the level the idea reaches *without* a chosen path. Once the founder picks a path, the flow lifts the cap to 3 (`flow.commitPath(i)` → `world.setLevelCap(3)`), and the building or district grows in with the usual pull-back. A no-go stays in the room and gets the pivot. There are no dead ends.
- **New contract type (additive, optional):** `Scalability.paths?: ScalePath[]` with `{kind: locations|franchise|online|b2b|licensing|team|new-markets|product, label ≤ 6 w, how ≤ 14 w, ease 0–10}`. WS-INTEL may fill it. Until then the UI derives the paths from `wouldScale` by keyword (`ui/steps.ts scalePaths`), using the scalability score as `ease`.
- **Pixel art is a subtle touch only, never a heavy pixel look.** The UI keeps its 8×8 logo, the small level glyphs and the rounded block meters. All labels use the product type (Inter Tight); Silkscreen is dropped.
- **Judging (DoraHacks):** there is no live pitch, and judges open the link themselves. The first screen reads **"Turn your idea into a company."**, followed by a one-line explainer, the idea field, **Validate · $0.10**, and two quiet secondary links: "Watch the tour · 2 min" (`?demo=1`) and "See a finished example" (it opens the sample world that reaches the district).

### v7 notes (WS-EXP, port 5273)
- **Files:** `flow/index.ts` (`createFlow` → `ProtoFlowV7 extends FlowV7`), `flow/demo.ts` (`createDemo`, `DEMO_CHAPTERS`) and `flow/compat.ts` (`ensureWorldV7`: a no-op once `createWorld` returns a `WorldV7`). I also replaced `ui/index.ts`, added `ui/steps.ts` (one surface per step), `ui/pixel.ts` (level glyphs, analyst badges) and `ui/v7.css`, and rewrote `ui/logo.ts`. `themes/day.ts`, `ui/switcher.ts` and `ui/projects.ts` are deleted.
- **Fixed UI:** `applyFixedUi()` (`themes/index.ts`) writes the Graphite tokens once, with glass at 0.95 / 0.985. Nothing in `ui/**` subscribes to `onClock`. The world's clock is set once in `main.ts`.
- **Logo:** an 8×8 grid. `?logo=1..4` selects Skyline (default) / Desk / Lit window / Prompt. The comparison sheet is `web/proto/ui/sheet/logos.html`, rendered to `.notes/proto-v7/ws-exp/logos.png`.
- **The flow only calls `WorldV7`.** Every step is played or snapped by `enter(step, animate)`. In demo mode the flow never moves to the next step by itself; the script does. The demo clock only runs while `html[data-ready="1"]`, and it clamps slow frames.
- **Extra deep links:** `?offices=1` opens "Your offices", `?logo=n` picks a logo, `&project=<id>` opens that world.
- **Evidence UI:** one finding card at a time (kind badge, optional hero `display`, text, then the source domain chip, which opens title, URL and access date, or "Estimate · basis"). Below it is one pixel cell per finding: green means sourced, outlined means estimate, and tapping a cell calls `flow.peek(i)`. A counter reads "n findings · m sourced" and turns into "Score unlocked" once `scoreDisplay` would say hero. The report's score counts up only after its factor bars fill.
- **Steer diffs:** number changes render as `before → after` chips. Changes of type `finding` (or long string values) render as one "New finding / Updated finding" sentence.
- **Keys (outside the demo):** → / Enter go to the next report page, card or level; ← goes back a report page; Esc closes overlays. In the demo, ← goes back one row.

### v7 notes (integrate, port 5274) — figures
- César: "La estética me gusta, lo único que quiero que cambies es los muñequitos." Only `world/office/cast.ts` changed: same skeleton, API, states, seats and animation; new geometry. Figures are soft chibis built from rounded blocks (RoundedBoxGeometry): big rounded head, hair as a wrapping shell + fringe, square eyes with a catchlight, rosy cheeks, small mouth; accessories rebuilt in the same language. Smooth MeshStandardMaterial in every style (the 3-band toon ramp is gone). `headPoint` height updated. Nothing else in the world or UI changed.

### v7 notes (WS-CHARACTERS, port 5279) — chibi characters
- `world/office/cast.ts` rebuilt: cute chibi figures after the original mock-up (big round head ≈44 % of height, glossy two-dot eyes, rosy cheeks, tiny smile, soft bean body in the department colour, stubby limbs, white sneakers). Hair is a cut (`short | bob | spiky`, new optional `FigureLook.cut`) plus the existing accessory; skin/hair tones vary per person.
- API unchanged (`Figure`, `lookOf`, `CAST`, `FOUNDER_COLOR`, `Spot`, `headPoint`, `handPoint`, `setState`, `setSpot`, `cheer`, `presence`); same height (~1.3 m) and seat/anchor heights, still merged per bone (~12 draw calls per figure).
- New life: head tilts, dangling-leg kicks when seated, walking rock, squash-and-stretch hops with waving arms, a happy sway when done, the free hand points while presenting/writing on the pinboard, the paper stays upright facing the viewer.
- Dev-only line-up: `/proto/world/office/lineup.html?row=cast|poses&who=<id>`. Captures in `.notes/proto-v7/chars/`.

## v7 notes (polish, port 5278) — figures only
- Scope kept to the characters (owner: "lo único que quiero que cambies es los muñequitos"). World, UI, flow and data untouched.
- `cast.ts`: heads turn towards the camera at rest; workers glance back every few seconds; `Figure.notice()` (called from office/bedroom `pulse`) makes the analyst look up at the viewer when a finding lands. Standing figures twist their shoulders a little.
- `setFigureAtmosphere(a)` (called from both `applyAtmosphere`): a small night-only emissive lift so faces stay readable in the dark on every skin tone.
- Trousers derive from the department colour; spiky hair is soft rounded tufts; `lookOf` falls back for unknown ids; `Figure.size` (floor uses 1.1, seat height compensated).
- Bedroom: seats open towards the viewer (bed-foot seat for s0, beanbag turned and moved slightly back so it isn't under the card, stool and bench yaw). Furniture style unchanged.
- lineup.html accepts person names (`?who=leo`).
