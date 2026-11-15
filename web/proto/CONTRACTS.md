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
