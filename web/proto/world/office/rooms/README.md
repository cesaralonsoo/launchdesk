# Office room themes (`web/proto/world/office/rooms/`)

Each room on the level-1 floor is decorated by one **theme** file. A theme builds the room's furniture and props
in room-local coordinates; the office (`../index.ts`) builds the room shell (floor, walls, glass, accent wall),
calls the theme, **bakes** everything static (merged per material, so draw calls stay low) and keeps only the
objects the theme marked as animated.

| file | room | who sits there |
|---|---|---|
| `viability.ts` `competition.ts` `market.ts` `demand.ts` `pricing.ts` `location.ts` `regulation.ts` `tech.ts` `scalability.ts` | r0…r3 (back row, research wing) — picked by the analyst's role, swapped when the roster changes | 3–5 analysts (contracts `ROLE_LIBRARY`) |
| `lobby.ts` | lobby (front, col 0) | founder (CEO desk) |
| `nova.ts` | nova (front, col 1) | Nova — brand |
| `dex.ts` | dex (front, col 2) | Dex — logo + website design |
| `launch.ts` | launch (front, col 3) | Rae (desk 0, `c.color`) — launch posts · Pip (desk 1, `c.color2`) — publishes the live site |
| `index.ts` | registry: `THEMES`, `furnishRoom()`, the `vacant` theme, shared-room composition, the light pools | — |
| `common.ts` | the contract (`ThemeCtx`, `RoomDecor`), zones, wall anchors, glow materials, shared pieces | — |

Owners: each designer edits **only their own theme files**. `common.ts`, `index.ts` and `../props.ts` belong to the
setup lead — if you need a helper, write it locally in your theme file (copy a piece from `common.ts`/`props.ts`
and change it there). Suggested split for four designers:

- A — `competition.ts`, `market.ts`, `pricing.ts`
- B — `viability.ts`, `demand.ts`, `scalability.ts`
- C — `location.ts`, `regulation.ts`, `tech.ts`
- D — `lobby.ts`, `nova.ts`, `dex.ts`, `launch.ts`

## The contract

```ts
export type ThemeFn = (ctx: ThemeCtx) => RoomDecor;

interface RoomDecor {
  group: THREE.Group;                       // = ctx.group
  update?(dt: number, t: number): void;     // every frame while shown (never in reduced motion)
  applyNight?(level: number): void;         // 0 day … 1 night with lamps on; on each atmosphere change (≤10 Hz)
}
```

`ThemeCtx` gives you: `c` (Builder `c.B`, Registry `c.R`, material owner `c.room`, accent `c.color`, `c.color2`),
`def` (the floor room), `theme`, `accent`, `quality`/`hi`, `side` (`"solo" | "a" | "b"`), `compact`, `area`
(rect you may use), `desk` (where the workstation goes), `zones` (keep clear), `walls` (anchors), `group`
(parent) and `animate(obj)` (keep an object out of the bake so `update()` can move it).

Rules of thumb:

- **Build with the Builder** (`B.box/cyl/sphere/blob/plane/decal/torus/sub`) and the props in `../props.ts`
  (`plant`, `desk`, `laptop`, `sofa`, `armchair`, `bookshelf`, `framed`, `rug`, `floorLamp`, `deskLamp`, …) — all
  re-exported from `common.ts`. Everything static is merged for you; don't merge by hand.
- **Materials by role**, never raw `MeshStandardMaterial`: `fx(c, "#hex", rough, metal)` natural/fixed colours ·
  `accent(c)` / `accentSoft(c)` the specialist colour · `screenMat(c, tex)` glowing UIs (brighter at night and
  while the analyst works, off when the room is locked) · `lampMat(c)` lamp shades · `glowMat(c, tex)` /
  `neonMat(c, "#hex")` things that light up at night · `ledMat(c, "#hex")` always-on LEDs · `pool(c, r, pos)` warm
  light pool on the floor at night. Day/golden/night, locked/working/done are then automatic.
- `applyNight(level)` only for what the roles can't do (a PointLight you own — only when `ctx.hi`, max one per room).
- Animated bits: `const fan = ctx.animate(new THREE.Group())` → build into it → move it in `update()`. Keep them few
  (each costs its own draw calls). See `competition.ts` (`globe` + `spin`).
- Textures: canvas textures in `../textures.ts` / `../pixel.ts` (`deptWallTex`, `screenTex`, `moodboardTex`, …).
  New canvas textures go in your theme file (cache them in a `Map` keyed by colour).
- **Compact mode** (`ctx.compact`, research themes only): r3 is shared by two analysts; build only the desk
  (`researchDesk`), the small wall board (`wallBoard`) and at most one small prop inside `ctx.area`.
- Style: chunky low-poly, soft bevels (`B.box(..., r)` radius ≥ 0.01), warm palette, cute and readable from the
  overview (a character is ~25 px tall there): one **hero prop** that says what the specialist does, 3–6 supporting
  props, small storytelling details. Not pixel art. Don't change characters, lighting or the shell.

## Room frame and safe zones

Room-local coordinates: origin = room centre on the floor (y = 0), x ∈ [−3, 3] left → right, z ∈ [−2.5, 2.5]
back → front. The camera looks from **+x / +z** (yaw ≈ 34°, pitch 37–40°): tall things near the front (+z) or the
right (+x) hide the room — keep them in corners or low. `zones` with `maxH > 0` allow things up to that height.

### Research rooms r0…r3 (back row)

- Walls: back wall face `z = −2.37` (feature wall in the role colour up to y 1.22, ribbon window 1.26–1.68 above:
  wall art must stay below 1.22), left wall face `x = −2.92` (h 1.14; r0: exterior wall `x = −2.96`, h 1.22).
  Open to the corridor at +z. No right wall of your own (the neighbour's partition; r3 is cut away).
- Workstation: `researchDesk(ctx, { screen, dual })` at `ctx.desk` = (−1.55, −1.98) (side b: (1.25, −1.98)), chair
  0.75 in front. The analyst sits at (−1.55, −1.28) facing +z and stands at (−0.55, −0.35).
- Keep clear (solo): desk x −2.35…−0.75, z −2.38…−1.6 · chair x −1.95…−1.15, z −1.6…−0.85 · stand spot
  x −0.9…−0.2, z −0.7…0 · face cone x −1.65…−0.55, z −0.85…0.3 (≤ 0.5 m tall) · walk-in lane x −1.2…−0.2,
  z 0…2.5 (rugs fine).
- Free for the set: the right two thirds (x −0.2…2.9), the back wall right of the desk (x −0.7…2.9) and the left
  wall (z −1.5…2.4).
- Shared r3 (5 analysts): side a = x −3…−0.05 (desk −1.55), side b = x 0.05…3 (desk 1.25, stand 1.95, −0.35).

### Front rooms nova / dex / launch

- Walls: corridor glass at `z = −2.46` (h 1.04, frosted band) with the **door x −0.65…0.65**; left wall face
  `x = −2.92` (feature wall in the room colour, h 1.14). Open at +z and +x.
- Desk at (−2.36, 0.2) turned +90° (sitter faces −x towards the wall), chair (−1.56, 0.2), seat (−1.62, 0.2),
  stand spot (−0.7, 0.95).
- Keep clear: door + entry x −0.75…0.75, z −2.5…−1.4 · desk x −2.75…−1.95, z −0.6…1.0 · chair x −1.95…−1.2,
  z −0.2…0.6 · stand x −1.05…−0.35, z 0.6…1.3 · face cone x −1.6…−0.4, z 0.2…1.4 (≤ 0.5 m) · lane
  x −1.2…0.75, z −1.4…0.6.
- Launch also has Pip: desk (1.15, 1.45) facing −z, seat (1.15, 0.8), stand (1.75, 0.25). Keep clear
  x 0.55…1.75, z 0.45…1.8 and the stand x 1.4…2.1, z −0.1…0.6. Rae's side is the left half, Pip's the right.

### Lobby (front, col 0)

- Exterior left wall face `x = −2.96` (feature wall up to 1.22, ribbon window above), corridor glass + door as above.
- CEO desk (−1.55, 0.35) turned −90°, founder's chair (−2.22, 0.35), seat (−2.2, 0.35) facing +x, stand (−1.25, 1.05).
- Fixed by the office, keep clear: the **company sign** on the left wall (centre x −2.93, y 0.84, z −1.28,
  2.1 × 0.66 m: nothing on that wall between z −2.33 and −0.23) and the **in-tray** at (−1.62, 0.722, −0.18) where
  findings land (built by `lobby.ts`; keep it there).
- Keep clear: door · desk x −1.95…−1.15, z −0.4…1.1 · chair x −2.6…−1.85, z 0…0.7 · stand x −1.6…−0.9, z 0.7…1.4 ·
  face cone x −2.3…−1.0, z 0.35…1.5 (≤ 0.5 m) · lane x −1.0…0.75, z −1.4…0.8.

`common.ts` exports the same data (`zonesFor(room, shared)`, `wallsFor(def)`, `blocks(zones, rect, h)`), and the
preview draws it with `&zones=1`.

## Preview page

Dev server: `npx vite --port <PORT> --strictPort` from the repo root (vite root = `web`), then

- one room, close-up, real lighting: `http://localhost:<PORT>/proto/world/office/rooms.html?role=competition&time=day`
- night / golden: `…rooms.html?role=tech&time=night` · `…&time=golden` (also `dawn`, `dusk`, or `time=0..1`)
- every theme in a grid: `…rooms.html?all=1&time=day` (add `&time=night` to judge the glow)
- shared r3: `…rooms.html?pair=market,demand` · vacant room: `…rooms.html?role=vacant`
- the room among its neighbours / whole floor / plan: `&view=wide` · `&view=floor` · `&view=top`
- keep-clear zones (red = nothing, amber = low only or lane) and wall anchors (blue): `&zones=1`
- people in the room: `&state=idle|working|presenting|done|asleep|absent` (working = screens up + coloured pool)
- research room position: `&room=r0|r1|r2|r3` (default r1) · `&quality=low` · `&still=1` · `&ui=0` (clean screenshot)
- run the day: `&cycle=60` (one day per minute)
- mouse: drag = orbit, wheel = zoom, double-click = reset.

It renders the real `createOfficeModel()` under the world's day-cycle lighting (daycycle.ts, CSS sky, neutral tone
mapping), so what you see is what the app shows. The real app floor: `/proto.html?step=floor&time=day`.
Before you hand off: `npx tsc --noEmit -p web/proto`, then check `?all=1` at `time=day` and `time=night`.

## Requests (C)

- Local helpers live in `c-kit.ts` (rounded-rect/disc canvas helpers, `cTex` cached flat-illustration textures, `artMat`
  painted texture, `cutoutMat` alpha-tested decal, `cone`, `smooth`). If the lead wants them shared, they can move to
  `common.ts` as-is.
- Overlap to watch: viability (r0 in the grid) also shows a brass balance; regulation's hero is the scales of justice on
  a marble plinth behind a velvet rope. If both are hired side by side, consider giving viability a different hero.
- Launch/Pip and tech both have server racks (tech: graphite with dept-colour top strip; Pip: white). Fine as is, noted.

## Requests (A)

None: designer A's shared pieces live locally in `a-kit.ts` (`strand`, `sagString`, `priceTag`, `coinStack`,
`coin`, `glyph3D` (5×7 bitmap glyphs built from blocks, e.g. a neon "$"), `artMat`, plus the pixel-native textures
`rivalMapTex`, `positioningTex`, `tradingWallTex`, `tickerTex`, `tamRugTex`, `tierBoardTex`, `tillDisplayTex`).
Other designers may import from it; if they become common, moving them into `common.ts` is the setup lead's call.

## Requests (B)

None: designer B's helpers live locally in `b-kit.ts` (`note`/`flatNote` 3D sticky notes, `NOTE` palette, `rnd`, `stool`,
`rod` (thin cylinder between two points: chains, cables, tripod legs), and the textures `swotTex`, `checklistTex`,
`growthTex`, `cityTex`). Other designers may import from it.
- Overlap resolved: viability's hero is now a **viability meter** (big red/amber/green dial, needle twitching in the
  green), not a balance, so it no longer echoes regulation's scales of justice; demand's queue uses chrome
  retractable-belt posts, not a velvet rope.
- Animated objects (merged with `mergeStatic`, one per room): viability = the meter needle, scalability = the crane jib
  with the dangling shop. Demand is fully static.
