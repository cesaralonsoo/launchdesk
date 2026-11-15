# Prototype data (v6) — WS-C

Everything here comes out of `server/mocks.ts` run through the real sanitizers in `server/ai.ts`, so the
prototype shows exactly what a mock (demo) run stores. Regenerate after changing mocks:
`npx tsx <scratchpad>/gen.mts` (calls `exampleProject(NOW, sanitize)` and `sampleProject(...)` with
`NOW = 2026-11-14 09:30 UTC`). Never type a number into the UI: read it from these payloads.

## Files and exports

| Export | From | What |
|---|---|---|
| `PAUSA: Project` (`data/index.ts`) | `pausa.json` | The run the prototype plays: Pausa, coffee kiosk, Barcelona. Same shape as before. |
| `PAST_PROJECTS: PastProject[]` | `past/*.json` | "Your projects" seeds, newest first (below). `project` is a full `Project` like PAUSA. |
| `toPast(p)`, `levelOf(p)` | `data/index.ts` | Turn any stored project (e.g. the visitor's own, from localStorage) into a row. Level 3 = has `pip` (built, live, grown), 1 = validated only (any verdict). Level 2 is only the flow's own "live" moment. (Integrate v6: one rule with the flow.) |
| `v6(p)` / `ResultsV6` | `data/v6.ts` | Typed access to the v6 extra fields below. |
| `MIA LEO SAM NOVA DEX RAE PIP MEMO BRAND …` | `data/sample.ts` | Unchanged display view of PAUSA. |
| `GATE`, `PREORDER_GOAL` (now 100), `LEO6`, `SAM6`, `OFFER`, `POSITIONING` | `data/sample.ts` | New v6 views. `PREORDER_GOAL` is read from Mia's gate (was a literal 30). |

### PAST_PROJECTS

| id | title | verdict | level | story |
|---|---|---|---|---|
| `pB9sd3Vk7t` | "Weekend sourdough classes in Valencia" | Go 7.4 | 1 office | Validated 2 days ago, not built yet. `results` has mia/leo/sam/memo only. |
| `pD4wq8Mn1r` | "Dog-walking service in Madrid" | Pivot 6.1 | 1 office | Stopped after the verdict. Pivot: group walks in one neighbourhood. |
| `pX7bk2Lq9e` | "Segunda Vuelta" (restored road bikes, Spain) | Go 7.1 | 3 district | Fully built and live at `/s/segunda-vuelta`, 12 days ago. |

(`title` = Nova's chosen name when built, else Mia's title.)

## Hero numbers per card (the one number to make big)

| Card | Hero | Secondary (small) | Field |
|---|---|---|---|
| Mia · plan | **100 paid pre-orders by week 4** (the gate) | 10 tasks · 4 weeks · first task | `mia.gate.{target,metric,by_week}`, `mia.checklist[0]` |
| Leo · verdict | **7.7/10 · Go** | headline; `score_math` as the "how we scored" line; confidence chip "Desk estimates" | `leo.score`, `leo.verdict`, `leo.headline`, `leo.score_math`, `leo.confidence` |
| Leo · signals | 5 bars with weight labels (30/20/20/15/15 %) | `why` per bar | `leo.signals[].{score,weight,why}` |
| Leo · kill criteria | "Stop if…" ×3 | — | `leo.kill_criteria` |
| Sam · money | **€55k cash needed** (lowest point, month 6) | break-even month 7; year 1 +€6.8k; payback ~month 16 | `sam.cash_needed`, `sam.break_even.month`, `sam.year1` |
| Sam · break-even | **186 sales a day** | `breakeven.formula` "€11,500 fixed ÷ €2.38 per sale ÷ 26 days = 186 sales a day"; headroom "Month-12 plan is 1.6× break-even" | `sam.breakeven_units_per_day`, `sam.breakeven`, `sam.headroom` |
| Sam · what matters | **Sales a day ±20% → year 1 −€22k … +€36k** | the other two rows | `sam.sensitivity[0..2].line` (sorted, biggest first); `sam.key_assumption` |
| Sam · unit | €3.40 → €2.38 left per sale | `unit.line` | `sam.unit` |
| Launch offer (Sam → Dex, Rae) | **€2.40** (normally €3, −20 %) | first 300 · still leaves €1.50 each · €720 if sold out | `sam.launch_offer.*` (= `dex.landing.offer_price/normal_price`) |
| Memo | verdict line | 3 next actions | `memo.verdict_line`, `memo.next_7_days` |
| Nova · brand | **Pausa** + tagline | positioning sentence; palette | `nova.names[chosen]`, `nova.positioning` |
| Dex · page | headline + CTA "Pre-order for €2.40" | 3 bullets, 3 FAQ | `dex.landing` |
| Rae · launch | 12 posts · 30 days | first 3 posts | `rae.posts`, `rae.first_posts` |
| Pip · live | `/s/pausa` | — | `pip.url` |

## Every field the UI could show

v4 fields (unchanged, see `web/src/types.ts`) plus **v6 additions** (bold). All v6 fields are optional for
old projects; code defensively (`?.`).

- **mia**: `title`, `one_liner`, `brief.{concept,for,goal}`, `market.{city,country_iso,currency,language}`,
  **`gate.{metric,target,by_week}`**, `checklist[].{week,task,how,done_when,helped_by,est_hours}`.
- **leo**: `score` (= Σ weight×signal, one decimal), `verdict` (bands: Go ≥ 7.0 with no signal ≤ 3 · Pivot
  5.0–6.9 · No-go < 5.0), `headline`, `summary`, `signals[].{name,score,why,source_id,`**`weight`**`}`, `why_go`,
  `risks[3].{risk,mitigation,severity}`, `pivot` (null on go), `next_step`, `market_facts[].{fact,source_id,is_estimate}`
  (always estimates in mocks), `competitors[].{name,note,price,differentiation,url}` (categories, url null),
  `you`, `sources[]` (empty in mocks), `interviews.{who,where,questions[5],good_sign,target}`,
  **`kill_criteria[]`**, **`score_math`**, **`verdict_rule`**, **`confidence.{level,note}`**.
- **sam**: `currency`, `canvas.*`, `assumptions[7]`, `fixed_costs_breakdown[]` (sums exactly to fixed costs),
  `months[12].{month,revenue,costs,cash}`, `price`, `startup_cost`, `cash_needed`, `break_even`,
  `breakeven_units_per_day`, `year1.*`, `main_risk` ("risk: test"),
  **`launch_offer.{item,price,normal_price,limit,display,normal_display,discount_pct,contribution,contribution_display,revenue_if_sold_out,revenue_display}`**,
  **`unit.{price,variable_cost,contribution,margin_pct,line}`**, **`breakeven.{per_month,per_day,formula}`**,
  **`headroom.{m12_per_day,breakeven_per_day,multiple,note}`**,
  **`sensitivity[3].{key,label,low,base,high,swing,line}`** (low/high/base = `{value,year1_result,break_even_month,breakeven_per_day,cash_needed}`),
  **`key_assumption`**.
- **memo**: `purpose`, `problem`, `insight`, `verdict_line`, `next_7_days[3]`.
- **nova**: `names[3].{name,why,tagline,palette[4]}`, `chosen`, **`positioning`**, `typography.{display,body}`, `voice.{traits,rules,sample}`.
- **dex**: `logos[3].{concept,icon,shape,glyph,monogram,wordmark}` (three different shapes; v6 polish: `glyph` is one of `none|pause|roundel|loop|loaf|route|tile|stop` and the concept only describes that glyph — `ui/brandmark.ts` draws it), `landing.{headline,subheadline,bullets[3],cta,offer,offer_price,normal_price,price_hint_usd,faq[3],where_when}`.
- **rae**: `start_date` (a Monday), `handle`, `posts[].{day,channel,time,format,hook,caption,cta}`, `first_posts[3]`.
- **pip**: `slug`, `url`, `live_at`.

## Honesty rules the data follows

No URLs, no named businesses, no testimonials, no "survey/study" claims. Every market fact has
`is_estimate: true`; `leo.confidence.level` is `"low"` with the note "Desk estimates only, no web sources: signals
capped at 7.5. Interviews decide." (v6 polish: any signal without a `source_id` is capped at 7.5 by `sanitize`) — show it, it is part of the honesty. Rae never reports a result before the plan's week.

## v6 polish additions

- `past/tablero.json`: a validate-only **No-go** sample (board-game café in a ~9,000-person town, score 4.6,
  month-12 pace below break-even). It is never built; it shows how a stop decision reads in "Your projects".
- Every fixed-cost table includes a founder pay line, so "Profitable from" never means "the founder works for free".
- Memo `verdict_line` always quotes the break-even pace; low-confidence Go reads "Go, to test".
- Rae's offer posts start in the pre-order week (day 15 for Pausa), never before.
- Regenerate with the scratchpad copy of `gen.mts` (MOCK_AI=1); no figure in these files is a real-world statistic.

---

# v7 sample worlds (WS-INTEL)

## Files and exports

- `data/v7/{pausa,tique,ronda,forn}.json` are generated and never edited by hand. Regenerate with `MOCK_AI=1 DATABASE_URL=:memory: npx tsx server/seed/gen-v7.ts`. They come from `server/v7-samples.ts` and go through the server's own `buildReport` and `applySteer`. `test/v7.test.ts` fails if the JSON is stale.
- `data/v7.ts` exports:
  - `SAMPLE_V7`: Pausa, "Metro coffee kiosk". It starts at level 0, and `legacy` is `data/pausa.json`.
  - `PROJECTS_V7`, in the order `[pausa, forn, ronda, tique]`.
  - `DEMO_STEER_NOTE` and `preparedSteers(id)`.
  - `mockSteer(p, note, target?)` and `applySteerToProject(p, s)`.
  - `findingsInOrder(p)` and `brandSignOf(p)`.

| id | idea | roster (reveal order) | score | verdict | scale | cap | level | evidence (sourced/total) |
|---|---|---|---|---|---|---|---|---|
| pausa | coffee kiosk at a Barcelona metro exit | competition, market, location, viability | 5.2 | pivot | 4.3 | 2 | 0 | 13/14 |
| forn | sourdough bakery in Gràcia | competition, market, viability | 4.4 | no-go | 2.6 | 0 | 0 | 7/11 |
| ronda | Madrid dog-walking app | demand, competition, regulation, viability | 5.0 | pivot | 4.7 | 2 | 2 | 5/10 |
| tique | Verifactu tickets for market traders | competition, market, regulation, tech, viability | 5.2 | pivot | 8.5 | 3 | 3 | 9/14 |

Three samples come out as pivot and the bakery as no-go (4.4, cap 0, so it never grows past the room). None is a go, because none has a sourced demand test, which the rule requires. That is the honest result of the rule, not a choice we made.

## Hero element per screen (one thing at a time)

1. **Bedroom / idea:** the idea sentence, typed in the founder's room.
2. **Hire:** one analyst card at a time, in roster order, with the role name and its `why` line.
3. **Evidence:** one finding chip at a time. The headline is the claim; the publisher domain and access date sit below it for a `source`, or the basis for an estimate. Sourced chips show the domain; estimates are labelled "estimate".
4. **Report page 1, score:** `scoreDisplay(score)` large, plus the verdict word. The `math` line is small underneath.
5. **Report page 2, scale:** the scalability score and the level cap. Use `why` as the line, the five weighted parts as the detail, and `toScale` as the call to action.
6. **Report page 3, points:** strengths and weak points. Each one points at a finding id, so tapping it reopens the chip with its source.
7. **Next / steer:** next steps and the CEO note box. Use `preparedSteers` as suggestion chips. The district ghost and padlock appear above the cap.

## Reveal order

- Findings play in `findingsInOrder(p)` order: roster order, then `t`. Within an analyst, `t = 1400 + 2600·i` ms (`paced`).
- Findings merged by a steer are shifted to `last + 2600·(i+1)`, so they play after the findings that were kept.
- A steer's `changes` are the diff to animate as before→after.

## Scoring (computed, never typed)

- **Factor:** clamp(5 + Σ impact × step, 0, 10). The step is 1.0 for a sourced finding and 0.5 for an estimate. A factor with no sourced finding is capped at 7.5.
- **Score:** Σ normalised weight × factor, rounded to one decimal.
- **Verdict:**
  - Go: 6.5 or above, with no factor at 3 or below.
  - Pivot: 4.5 to below 6.5.
  - No-go: below 4.5.
- **Scalability:** Reach .25, Repeatable .2, Margins .2, Founder-free .15, Digital .2. The cap comes from `levelCapFor`.

## Prepared steers (demo)

- **pausa "office"**: `DEMO_STEER_NOTE`, "Focus on office workers, not tourists, and start as a stand." It reruns location and viability and adds the sourced TMB stands finding. Location goes 6 → 7, viability 4 → 5.5, and the score 5.2 → 5.8.
- **pausa "online"**: "Could we also sell our beans online to regulars?" Digital leverage goes up and scalability moves 4.3 → 4.7. This one is an estimate.
- **tique "associations"**: "Sell to market associations, not one trader at a time."
- **Any other note:** an honest no-op with `changes: []` and the ack "Noted. The prototype can't research new evidence for that." The server does the same in MOCK_AI.

## Real sources (all opened by WS-INTEL, accessed 2026-11-15)

- **Coffee:**
  - TMB 2024 station ranking (noticies.tmb.cat).
  - Ara English on 700.5M TMB journeys in 2025 (en.ara.cat).
  - TMB first "paradeta" at Sagrera (noticies.tmb.cat).
  - TMB Vall d'Hebron tender sheet (tmb.cat PDF).
  - TMB stands page (tmb.cat).
  - Time Out Barcelona on coffee prices, 9 May 2024.
  - ARA "El mapa del cortado".
  - World Coffee Portal on Syra Coffee and the Spanish branded coffee market.
- **Tique:**
  - LegalToday on RDL 15/2025.
  - wwwhatsnew on the Verifactu delay, 6 Oct 2026.
  - AEAT free Verifactu app page.
  - oie.es invoicing-software comparator.
  - Invoo pricing.
  - Forbes España on UPTA's self-employed count.
  - Junta de Andalucía Plan de Comercio Ambulante.
- **Bakery:**
  - Euronews on Spanish bread consumption, 8 Nov 2025.
  - lexpress-franchise on Spanish artisan bakeries.
  - Corresponsables on the Puratos/ASEMAC survey.
  - Interempresas on Puratos Taste Tomorrow, 11 Dec 2024.
- **Dog:**
  - El Español on dogs in Madrid, 29 Jan 2026.
  - Consumer EROSKI on dog-walking apps, 17 Sep 2022.
  - Ministry of Social Rights animal-welfare-law FAQ (PDF).
  - Vozpópuli on the pending course and insurance, 4 Jan 2025.

The full url, title and domain for each one live in `server/v7-samples.ts` (`SOURCES`). Every `source` object in the JSON equals a registry entry; the test checks this.

## Honesty rules (v7)

- A fact or number without a source becomes `kind: "estimate"` with a `basis` (`enforceSourceRule`).
- A competitor without a source gets `named: false`.
- Sources come only from research citations. The server copies them from the research list by `source_id` and never takes a URL the model wrote.
- Demo-mode findings for unknown ideas say "Demo mode: no web search, check it".
