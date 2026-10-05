# 21st Club — Product Plan

> Working name: **21st Club** (placeholder, may change).
> This document is the source of truth for _what_ we are building. If a task seems to conflict with it, stop and ask instead of improvising.

---

## 1. The product in one paragraph

You found a brand-new football club that enters the Premier League in place of one of the promoted clubs. You get a fixed budget to sign **real Premier League players**. The site instantly predicts how your club would do over a season (points, finishing position, title / top-4 / relegation odds). Then you play the season **match by match**: pick your XI and tactics, watch each match as a short 2D highlight animation, make half-time decisions, and watch your club move up or down the league table.

**One-line pitch:** _A football career mode you play in your browser. Found a club, sign real Premier League players, play the season. Free, no download._

## 2. How it differs from FPL (don't drift into building FPL)

> Internal guidance only. This comparison no longer drives marketing copy; the site is positioned as a game (a career mode), not as analytics or an FPL alternative.

| FPL                                     | 21st Club                                                                        |
| --------------------------------------- | -------------------------------------------------------------------------------- |
| Score = sum of individual player points | Your club plays **real matches** with wins, draws, losses and a **league table** |
| Squad balance doesn't matter            | Balance, formation, depth and defence decide results                             |
| Find out in May                         | Instant prediction, then match-by-match season                                   |
| Weekly admin grind                      | Low commitment; play when you want                                               |

**Rule:** results always come from a **team-vs-team match simulation**, never from summing player stats. Even the future "live season" mode must keep this.

## 3. Core user flow (logged in)

This is the agreed flow from the design mockup:

1. **Build squad** — player market with values; budget bar; formation slots (GK/DEF/MID/FWD); max **3 players per real club**; "Continue" only when the squad is valid.
2. **Pick your team** — **pitch with the XI on the left**, substitutes row under the pitch, **selected player's info panel on the right** (overall rating, position, six-stat radar chart, fitness, form, positions, preferred foot, stat bars). Click a starter, then a same-position substitute, to swap. Tabs: **Team / Tactics**. Fixture card with win/draw/loss odds and **Kick off** always visible.
3. **Watch the match** — 2D top-down pitch, players as dots, ball moves, scoreboard + clock, event banners (goal, chance, card), live commentary feed. **A full match plays back in ~30 seconds at the default ×1 speed (a ×2 toggle makes it ~15).** Viewing options: highlights / text commentary / instant result. "Skip to full time" always available.
4. **League table** — updated table with your club highlighted, movement arrows, result card, player of the match, updated predicted finish, **Next match**.

Before the season (first-time flow): **Found your club** (name, short name, crest, colours, stadium) → build squad → **instant season prediction** (shareable result card) → start the season.

## 4. Game rules and formats

- **League format:** 20 clubs, 38 matches. The user's club **replaces one promoted club** (default: the promoted club with the weakest squad). Do **not** make it a 21-team league.
- **Tactics:** `balanced`, `high_press`, `counter`, `defensive`. Each must have a real trade-off (e.g. high press wins the ball higher but tires players after ~70').
- **Half-time:** the user can make substitutions and change tactic; the second half continues on the same seeded random stream.
- **Season texture (later phases):** injuries, form, fitness, a limited January transfer window.

### Open decisions — ask before choosing

- Final product name.
- Monetisation (none yet).

### Approved Phase 3 squad rules

- Squad size: exactly 18 players — 2 goalkeepers, 6 defenders, 6 midfielders and 4 forwards.
- Budget: **£275m** (raised from £250m in Phase 5, when the honest surrogate made a £250m optimised build top out at 6th–7th with a title chance under 1%), in our own market valuations. Values are our own estimates derived from FPL prices and engine ratings, not official or third-party transfer values, and FPL prices are never shown to the user.
  - **Valuation model** (`packages/engine/src/market-value.ts`, generated into the browser player dataset by `generate-web-player-data`; not used by the match simulation). Within each position a player's quality is a blend of two within-position percentiles, **40% FPL price and 60% engine overall**, ranked into a strict quality percentile (ties break on overall, then price, then id). A per-position convex curve turns that percentile into a value, rounded to 0.1m under £10m, 0.5m from £10m to £50m and £1m above. The best player of each position reaches its ceiling: GK £55m, DEF £90m, MID and FWD £175m. At equal quality a defender never costs more than a midfielder or forward, nor a goalkeeper more than a defender.
  - **Distribution targets** across the eligible pool: £100m+ 6–10 players (midfielders and forwards only, spread across several clubs); £50–100m 30–50; £20–50m 120–180; £3–20m the rest of the regulars; £3m and under at least 15 per position. Current counts are 8 / 32 / 128 / 222 / 172, with 37 goalkeepers, 59 defenders, 57 midfielders and 19 forwards at £3m or under.
  - **Balance targets** at £275m, judged on **average finish** over played-out seasons (`honesty-predict-season`; the unit tests use `predictSeason` with half a place of tolerance, because the prediction runs about half a place pessimistic and the most likely finish is noisy on a flat distribution): any single player, including the most expensive, fits with the cheapest legal completion of the squad (hard rule); the cheapest legal squad leaves most of the budget unspent; a balanced build (spending spread evenly by position) averages 9th–12th; the best build from a simple optimiser (greedy by rating per unit spent, then local swaps, then spending what is left) averages 4th–6th, with a title chance of 2–10%, and spends at least 95% of the budget; two £100m+ players can fit (with an otherwise near-minimum squad) but three cannot. Measured at £275m over 200 played seasons: balanced 12.9 average finish (12.6 over 600 seasons; 11.9 predicted), 0.6 of a place outside its band (see §7), optimised 4.9 with a 5.0% title chance, spending £272.6m; the landing sample squad averages 9.8.
  - The curves were fitted at £250m and the budget then raised to £275m without changing them. Finish is very sensitive to the budget (about £25m moves the balanced build by several places), so changing the budget, the ratings or the curves means re-running the sweep and `fit-surrogate`.
- **Budget presets (difficulty).** Chosen when founding the club: **Underdog £175m**, **Standard £275m (default)**, **Big spender £400m** and **Takeover £1b** ("Unlimited ambition. Sign anyone you want."; shown as "£1b", never "£1,000m"). Takeover is a sandbox tier: no balance targets and no season sweep. The most expensive legal squad (18 players, 2/6/6/4, max three per real club) costs £1,723m, so £1b is not literally unlimited: it affords any single star and most star-heavy builds, but not every star at once. Presets change only the budget, never the engine, the ratings or the prices. The squad builder, budget validation, the cheapest-completion check and the January window all use the chosen budget. "Any single player plus the cheapest legal completion fits" is a hard rule at Standard, Big spender and Takeover. On Underdog the dearest players cannot fit (the cheapest legal squad is £28.8m, so a player over about £146m is out): Haaland and Saka (£175m) and Fernandes (£159m). They are shown as "Out of reach on Underdog" in the market rather than repriced. The preset is stored in the club identity inside the season save (`identity.budget`), which the replay reads to build the January window; a save without it is a Standard season, so no save version bump was needed. It is shown on the season preview, the hub, the season card and the end-of-season screen ("Northstar Athletic · Underdog"). Balance targets above are defined at Standard only. Difficulty sweep (100 played seasons each, `BUDGET=<tenths> PLAYED_ONLY=1 ONLY=balanced,optimised pnpm --filter @pl/scripts honesty-predict-season 100`; check only, nothing tuned): **Underdog £175m** balanced 14.9 average finish (about 15th) and optimised 9.6 (about 10th, relegated 1% for the optimised build and 24% for the balanced one, no title chances). £175m was chosen over £150m, where the optimised build gained nothing over the balanced one (14.4 and 14.4): the cheap end of the value curve is flat (a £2m midfielder is rated 56, the best under £10m 57), so rating is bought only through a few stars, and £175m is the first budget that affords the £30m midfielder rated 70. Expect a steep step in the optimised build's finish between about £165m and £175m; **Standard** balanced 12.9 and optimised 4.9 (see above); **Big spender** balanced 5.0 (top four 47%, title 4%) and optimised 2.8 (title 20%, top four 89%, never relegated).
- Maximum three players from any real club.
- Exclude only players whose FPL status is `u`; players with status `a`, `d`, `i` or `s` remain selectable.
- The starting XI must use one of the six engine-supported formations: 4-4-2, 4-3-3, 3-5-2, 5-3-2, 4-5-1 or 3-4-3.

### Approved Phase 4 decisions

- Match context: a single match. After the prediction screen the user picks any of the 19 real clubs as opponent and chooses home or away. There is no fixture list, league table or season progression (Phase 5). The replaced club is computed by the plan's rule (the promoted club with the weakest squad), not hardcoded; the opponents are the other 19 clubs.
- Fitness and form: every player shows 100% fitness and a neutral form indicator ("—"). No values are invented.
- Preferred foot: no data exists, so the field is omitted.
- Six-stat radar: derived directly from engine ratings. Outfield players show Pace, Shooting, Passing, Dribbling, Tackling and Positioning; goalkeepers show Goalkeeping in place of Shooting. The headline number is the existing `overall()`.
- Off-ball players: the timeline only positions players involved in each event. Other dots are cosmetic, anchored to the formation and shifting with the ball and possession. They never imply an event that is not in the timeline.
- Highlights mode: goals, shots, big chances, cards, injuries and substitutions animate; everything else compresses into clock advance plus commentary. A full match plays in 30 seconds at most at the default ×1 speed (about 15 seconds per half; the half-time pause is excluded), replacing the original 20 seconds so the movement is easier to follow. A ×1 / ×2 speed toggle (×2 = 15 seconds) is remembered across matches and sessions in localStorage and changes playback only, never results; it applies to season matches, friendlies and the landing hero loop (always ×1). Instant mode skips straight to the result.
- Match seed: `hash(club name, opponent, venue, play counter)`, using the seeded PRNG pipeline and never `Math.random`. The play counter is persisted so a refresh does not replay a seed by accident; "Play again" increments it. Lineup and tactic changes keep the seed, so outcomes can be compared. The seed is stored with match state and shown as a small muted "Match seed" detail.
- Opponent AI: the engine's `pickSquad` XI, balanced tactic, no half-time changes. The user may play at home or away; the viewer keeps the engine's orientation (home attacks left to right) and the score bug always reads home on the left, with the user's club marked by its colour.
- Fixture card odds: the exact Poisson scoreline grid over the same `expectedGoals` surrogate that `predictSeason` samples from (independent Poisson goals; the surrogate has no Dixon-Coles correction; home advantage is the surrogate's `isHome` term). They are not computed by summing player stats.
- Engine change: substitution events gain an additive `offPlayerId` (data only; RNG order, decisions and outcomes unchanged, proven by a golden fingerprint test; `calibrate` and `calibrate-season` output unchanged).
- Storage: the Phase 4 save version is bumped and older saves are ignored.

### Approved Phase 5 decisions

- **Fixtures:** a generated 38-round double round-robin for the 20 clubs (the user's club takes the place of the computed weakest promoted club), deterministic from the season seed. Every pair meets home and away once, with home/away alternating as evenly as possible (no club more than two consecutive home or away matches where avoidable). One matchday per round, no midweek rounds. The real fixture list is not used.
- **Other matches:** every matchday simulates all 10 matches with the **full event engine**, so injuries, cards and form come from the same simulation for every club. Measured in Node: 0.79 ms per match, about 8 ms per matchday, about 0.3 s for a season. Measured in headless Chrome inside the Web Worker (a Mac, 2026-10-04): the engine plays a matchday in about 11 ms; a single "Sim to next match" takes 83–128 ms end to end because each command also rebuilds the table, the next fixture's odds and the 2,000-season projection; "Sim to January window" from matchday 2 (18 matchdays) 220 ms, "Sim to end of season" from matchday 0 to the window (20 matchdays) 230–245 ms and from the window to the end (18 matchdays) 135–150 ms; first load of the season page to a ready hub, including the 10,000-season prediction, about 1 s (threshold 300 ms per matchday). No surrogate fallback. The same global rules apply to every club, including the user's.
- **Where it lives:** `/season` is the season ("Start season" on the prediction screen goes there); the Phase 4 `/match` page remains as the Friendly. The season runs in a Web Worker that owns the `Career`; the page only sends commands (`create`, `resume`, `lineup`, `begin`, `finish`, `sim`, `closeWindow`) and draws the returned view. Until the January window is built, the season pauses at matchday 20 with a "Window coming soon — continue" screen that logs `closeWindow`.
- **One attempt per match:** no "Play again" in a season; each result stands, and a match cannot be re-decided by leaving or refreshing it (see Saves). The Phase 4 single match becomes "Friendly" mode and keeps its replay button and its fixed 100% fitness and neutral form.
- **Season pace:** from the hub the user plays the next match (highlights / commentary / instant) or uses "Sim to next match", "Sim to January window" or "Sim to end of season". Simmed user matches use the user's last saved XI and tactic, with automatic same-position replacements for unavailable players (and a formation change only if a position cannot be filled). "Sim to end of season" stops once at the January window; the user closes it, or skips it explicitly, to continue.
- **Fitness:** each player's fitness carries over. A match starts at the player's current fitness (engine `startStamina`); the engine's in-match stamina drain applies (high press costs more); the final stamina is read from the match snapshot. Between matchdays a player recovers 75% of the gap to 100%. Balanced-tactic midfielders settle around 93% at kick-off, high-press ones around 85%; a rested player returns to about 100%. Tired players perform worse only through the engine's existing stamina mechanic. Fitness replaces Phase 4's fixed 100% on pick-your-team.
- **Form:** an exponentially weighted average (decay 0.6, last ~5 appearances), each update weighted by minutes played (`min(minutes / 90, 1)`, so a 5-minute cameo barely moves it) of each player's **individual** match performance relative to the global average for his position (GK 7.33, DEF 6.04, MID 6.61, FWD 6.61, measured over 200 seasons). The input is the engine's additive `individual` field, which excludes team-result terms. A shared 6.0 baseline gave keepers permanent positive form because their rating formula has a higher mean; position-normalisation removes that hidden bonus without adding any club adjustment. Modifier: `clamp(2 × form, ±2)` rating points added to all seven ratings, clamped to 1–99, identical for every club. Replaces Phase 4's "—".
- **Injuries:** in-match injuries come from the engine (measured 0.313 per match, about 1.4% per starter-match, about 6 per club per season). Duration in matches is drawn from a seeded global distribution: 1 match 35%, 2 25%, 3 15%, 4–6 15%, 7–12 7%, 13–20 3% (mean about 3.2). Injured players are unavailable to every club. AI clubs pick their XI each matchday with `pickSquad` from available players using form-adjusted ratings, and rest starters below 70% fitness when a same-position player is available.
- **Suspensions:** a red card is a one-match ban for that player, for every club. Suspended players are unavailable like injured ones. There is no yellow-card accumulation.
- **Short-handed clubs:** a club short of a whole position (real squads can have a single forward, and he can be injured or signed by the user) still fields a side: the missing slots go to the best remaining outfield players by their rating for that position, playing out of position, and the formation with the fewest gaps is used. The same rule applies to every club.
- **Goalkeeper emergency:** if a club has no available goalkeeper, the outfield player with the best goalkeeping rating plays in goal, for every club. This is the only exception to "unavailable players can't be selected".
- **No facing himself:** when the user plays club X, X's copy of any player the user owns is excluded from X's selection for that match (`pickSquad` picks from the rest), whether the match is played or simmed. Real clubs otherwise keep players the user signs, as in Phase 4 and the prediction background. Player state is tracked per club copy with namespaced ids.
- **January window:** opens once after matchday 20. Up to 3 transfers, each a same-position swap (a sale plus a purchase), at current market value, with all squad rules enforced (18 players, 2/6/6/4, max three per real club, the £275m budget). Values are static in Phase 5, so cash is always £275m minus squad cost. A signing arrives with the fitness, form and absence his real club's copy has that day. Players of the replaced club (not in the league) are on the market and never injured. The window's squad and money rules are enforced by the engine on replay too. Injured and suspended players show "Out N matches" in the market. No injury price discount (availability-based pricing stays deferred, see §9). AI clubs don't transfer.
- **Saves:** one career slot, key `21st-club-season-v1`, JSON only so it can move to Supabase unchanged in Phase 6. Contents: season seed, `dataVersion` (hash of player data and engine tuning; a mismatched save is refused), club identity, replaced club, initial squad, the pre-season prediction, an ordered decision log, and a derived cache. Decisions: `lineup`, `kickoff` (the XI, formation and tactic, logged when the first half is simulated), `halftime` (the half-time changes, logged when the second half is simulated), `sim`, `transfer`, `closeWindow`. A decision is logged the moment the simulation uses it, so it cannot be taken back: once logged, the result is fixed and playback only reveals it. Leaving or refreshing mid-match resumes playback of that match (an undecided half-time stays undecided, a decided match resumes in its second half with "Skip to full time") and never returns to the pick-team or half-time decisions already made. The save also records the last watched round whose result was shown (`revealed`). Save version 2 (version 1 saves, from before this rule, are refused). Playback mode is not logged. Replaying the log from the seed must reproduce the season exactly; this is the basis for Phase 6 server verification. "Continue season" and "Abandon season" (with confirmation).
- **Season hub and table:** next fixture with W/D/L odds, table position, squad fitness and injury summary. After each user match: result card, player of the match, the full table with the user's row highlighted and movement arrows, and an updated predicted finish (Monte Carlo over the remaining fixtures from the current table). Table order: points, goal difference, goals for, then a deterministic id order.
- **End of season:** final table, final position vs the pre-season prediction, top scorer and player of the season, and a shareable season card. Cross-position rating awards (player of the season and the user's best player) rank the player's average match rating relative to the global average for his position, so a position's rating formula cannot make its players automatic winners. Then "Start a new season". Multi-season careers (ageing, contracts, value changes) are not in Phase 5.
- **Prediction honesty:** at least 200 full seasons for each of a sample of squads (landing sample, balanced, optimised, cheap), managed automatically (`pickSquad` XI, balanced tactic, including the no-facing-himself rule), compared with `predictSeason`. If the mean differs by more than about 2 points, the prediction is updated so pre-season prediction and played-out seasons agree. Team goals for, goals against and clean sheets should be within about 5% for all four samples. Both calibration scripts are re-run with season dynamics on across all 38 matchdays and must stay within the §7 guardrails, as must the money-buys-strength check at £275m (balanced 9th–12th; optimised 4th–6th with a 2–10% title chance). Same-seed determinism must hold across a whole season.
- **Engine changes:** two additive, optional inputs/outputs: `MatchInput.startStamina` and `PlayerMatchRating.individual`. The golden fingerprint test proves RNG order and outcomes are unchanged when they are absent. The season module lives in `packages/engine/src/season/` and stays pure.
- **Half-time data (UI batch after Phase 5):** `MatchSnapshot` gained two additive, read-only fields, `ratings` (the same formula as the final ratings, with minutes and score so far) and `possession` (percent per side so far), so half-time can show live ratings and possession. They never touch the random stream; the golden fingerprint test, `calibrate` and `calibrate-season` are unchanged.
- **Landing page:** after the loop works, "How your career works" step 04 and the Highlights copy mention playing a full season with a live league table (separate small commit).

### Approved season-preview decisions (UI batch after Phase 5)

- **The prediction screen is the "Season preview".** It speaks in fan terms (no "engine", "simulation" or "distribution" on screen) and shows no charts: a verdict, "Most likely 7th — anywhere from 4th to 12th" (10th to 90th percentile), the predicted record and points, goals scored and conceded, goal difference, clean sheets, yellow and red cards (whole numbers with "~"), the predicted top scorer, top assister and star player (highest average rating among regulars), "Toughest trip", "Toughest at home" and "Banker" by name, and the odds in words.
- **Verdict mapping** (first match wins): Title contenders (title chance 15%+, or most likely finish top two); Champions League chase (most likely top four, or top-four chance 40%+); Europa League contenders (most likely 5th to 7th); Relegation scrap (relegation chance 50%+, or most likely 18th or lower); Survival fight (relegation chance 20%+, or most likely 15th to 17th); otherwise Comfortable mid-table.
- **Odds wording:** under 0.1% "very unlikely"; 0.1% to 2% "a long shot (1 in N)"; 2% to 15% "unlikely (1 in N)"; 15% to 35% "a real chance (1 in N)"; 35% to 65% "about even"; 65% to 90% "likely (N in 10)"; 90%+ "very likely". N is rounded the way people say it (exact below 10, nearest 5 below 50, one figure above).
- **Where the numbers come from:** the record, points, goals and clean sheets are the surrogate prediction's season averages (`SeasonPrediction.teamStats`); clean sheets include the global 0.3-per-season calibration for the independent-Poisson model's small scoreless-opponent bias. Cards and the three player picks come from a batch of 12 full event-engine seasons of the user's 38 matches (`forecastUserSeasons`, season dynamics on, balanced tactic, opponents fresh) that runs in the same Web Worker after the team forecast has been sent, so team stats show first and player stats fill in. The season worker stores the same batch's summary in the save (`prediction.forecast`), so the hub and the end-of-season screen can say "Predicted ~54 goals, scored 61". The star player ranks average rating relative to his position average. Older saves without these fields simply omit the lines.
- **Default stadium:** optional; blank means "[Club name] Stadium".

## 5. How the prediction works

1. **Players → ratings.** FPL stats (xG, xA, creativity, threat, defensive actions, saves, minutes) are mapped to 0–100 engine ratings by **global rules** in `ratings.ts`:
   - **Evidence:** per-90 rates are pooled over this season and the last three, weighted by minutes (this season 1, last season 0.5, the one before 0.25). Last season counts as much per minute as this one, so early in a season it is most of the evidence.
   - **Shrinkage by evidence:** each rating is standardised against well-evidenced players, then pulled toward the positional average by `m / (m + K)`, where `m` is the minutes behind it and `K` is how many minutes of evidence are worth as much as the average. `K` comes from how stable each kind of stat is from one season to the next: xG, threat and ICT are stable; goals, assists and, above all, goals prevented (the goalkeeper signal, season-to-season r about 0.3) are mostly noise, so goalkeeping gets the largest `K` (8,000 minutes). A thin sample can also never move a rating more than its evidence allows, and an extreme small-sample stat cannot rank above a regular with strong two-season evidence.
   - **Price prior (outfield only):** FPL price is a weak crowd-sourced prior, a within-position z-score that can move any outfield rating by at most about 5 points. Goalkeepers get none: their price range is too narrow to carry information.
   - **Backup goalkeepers:** a keeper who has not featured this season (under half the minutes the busiest player has) starts from a backup-level prior.
   - **Club context:** each stat is measured relative to its club's level (volume stats such as tackles, clearances and recoveries almost fully; output stats lightly), so a dominant side's defenders are not marked down for facing fewer attacks.
   - **No "no top-flight history" discount.** Earlier versions rated players without top-flight history below average. This was removed deliberately: promoted clubs' starters all have thin data, and the discount rated them far too low (the bottom club fell to about 12 points). Players with thin data now simply shrink toward the positional average.
   - **Constants retuned with the evidence model** (each to keep a §7 guardrail, found by sweeping against `calibrate-season`):
     - Defender defensive share 0.5 → 0.8 and volume-stat club context 0.15 → 0.7: FPL's priciest defenders play for dominant sides and make few tackles, so volume stats marked them down; correcting for club level raised defenders' agreement with FPL's price ranking (top 10 by overall that are in the position's top 20 by price: 2/10 → 6/10; the remaining gap is accepted).
     - Goalkeeper goalkeeping base 10 → 16: shrinkage compresses keepers toward the average, which raised scoring; the higher base restores about 2.8 goals per game without lifting keepers who have no evidence (the backup prior handles them).
     - Forward shooting base 8 → 2: recentres goals per game (2.88 → 2.77) and moves draws into the 23–25% range.
     - Rating curve: above-knee slope 0.22 → 0.3 (restores champion points to 85+) and below-knee slope 2.0 → 1.9 (keeps the bottom club near 23 points).
2. **Match engine.** Event-based simulation; better players win more duels; upsets still happen.
3. **Monte Carlo.** Simulate the season **10,000 times** with different seeds and count outcomes:
   - predicted points = average points across simulations
   - title % = share of simulations finishing 1st
   - most likely finish = most frequent position
   - the points histogram on the prediction screen is those totals plotted
4. **Speed.** Predictions use a **fast surrogate model** fitted to the event engine (team profile → `expectedGoals` → independent Poisson goal counts for each side, with home advantage via the `isHome` term; there is no Dixon-Coles correction). A team profile is the starting XI's mean passing, dribbling, shooting, tackling, positioning and pace, the goalkeeper's rating, the forwards' mean shooting, defender and midfielder defensive quality, and the formation shape (defender and forward counts) (`teamProfile`). Because defending near the goal is done mostly by defenders, defending is measured separately for defenders and midfielders rather than as one outfield mean (a defensive-midfield squad was over-credited with a hard-to-beat defence), and every own-attack by opponent-defence product (including the opponent's keeper) is a feature, since a keeper stops more shots from a better attack. A global low-attack hinge covers the legal-floor squad without a club-specific adjustment. Earlier composite inputs (attack, midfield, defence, bench) misjudged user-style squads (mid-priced, weak passers) by 3–8 points a season, so the surrogate is fitted on real clubs, synthetic teams **and user-style training squads** (random legal squads, balanced builds at a spread of budgets, noisy greedy builds, role-skewed squads and the legal floor, each against every real club, home and away; the £275m balanced build is held out as a test). The 342 matches between the 19 real clubs are **precomputed** once; per prediction only the user's 38 matches are simulated, and `predictSeason` takes an optional `opponents` list so each real club lines up without the players the user signed (the season's no-facing-himself rule). Watched matches use the **full event engine**. The surrogate parameters and the precomputed background must be refit and regenerated whenever ratings change (`fit-surrogate`, `generate-season-background`, then `sanity-predict-season`) and re-checked with `honesty-predict-season`. `sanity-predict-season` RMSE against the event engine is 1.64 points. Current prediction point biases against 200 played seasons (landing / balanced / optimised / legal floor) are +0.1 / +2.1 / −0.4 / +0.9; goals for, goals against and clean sheets are within about 5% for every sample (the largest gaps are the balanced build's wins at +5.8% and the legal floor's clean sheets at +5.2% of a count of under three), and `honesty-predict-season` also prints the same 38 fixtures against fresh opponents with no season dynamics ("static") to separate the surrogate's fit from what dynamics change. The surrogate's earlier miss on the landing sample (goals conceded −12%, clean sheets +19%) came from midfielders who tackle hard being averaged into the defence; the new defending features and role-skewed training squads fixed it.

## 6. Architecture

```
apps/web          Next.js (App Router, TypeScript) — the website
packages/engine   Match engine + ratings + prediction. Pure TypeScript, no DOM or Node APIs.
scripts/          Node scripts (tsx): FPL sync, calibration, benchmarks
```

- **Engine runs in the browser** (matches and predictions are client-side: instant and free to host) **and in Node** (same code).
- **Deterministic:** all randomness uses the seeded mulberry32 PRNG. **Never `Math.random`.** Same inputs + seed = identical match.
- **Anti-cheat:** leaderboard results are verified by replaying the seed on the server.
- **Data:** FPL API (`bootstrap-static`, `element-summary`) synced by a script and cached locally (gitignored). The browser never calls the FPL API directly.
- **Backend:** Supabase (accounts, saved clubs, career saves, leaderboards). Free tier until real users depend on it.
- **Hosting:** Vercel Hobby until the site is monetised, then Vercel Pro. Supabase Pro at the same time.

## 7. Engine — current state (DONE, do not retune casually)

Event-based engine in `packages/engine/src` (`engine.ts`, `types.ts`, `rng.ts`, `ratings.ts`, `squads.ts`, `synthetic.ts`, all tunable constants in `tuning.ts`).

- Pitch: 6×3 zones on a 105×68 pitch; possessions over 90' + stoppage time.
- Actions: pass, dribble, long ball, shot; success = attacker rating vs nearest defender; shots use zone xG + shooter quality vs keeper.
- Fouls, cards, injuries (auto-sub if bench allows), home advantage.
- Half-time API: `new Match(input)` → `playFirstHalf()` → `substitute()` / `setTactic()` → `playSecondHalf()`; `simulateMatch(input, halfTimeCallback?)` wraps it.
- Output: event timeline (minute, team, player, action, start/end x-y, outcome, commentary), score, player ratings (1–10), team stats.

**Calibration guardrails (regression targets).** The table below is the `calibrate-season` and `diagnose-scorers` output over 200 seasons of real-club squads (the top-scorer row pools 1,200 seasons, because a 99th percentile needs that many), **with the Phase 5 season dynamics on across all 38 matchdays** (fitness, position-normalised form, injuries, suspensions and rotation). Any engine change must re-run both calibration scripts and `diagnose-scorers` and stay near these:

| Metric                                       | Target                           | Current                   |
| -------------------------------------------- | -------------------------------- | ------------------------- |
| Goals per game                               | ~2.8                             | 2.73                      |
| Draws                                        | 23–25%                           | 23.1%                     |
| Goals distribution                           | Poisson-shaped, 7+ goals ~2–2.5% | 2.1%                      |
| Red cards per game                           | ~0.1                             | 0.099                     |
| Team shots per match                         | 12–14                            | 13.4                      |
| Penalties per match                          | 0.25–0.30                        | 0.29                      |
| Penalty goals / all goals                    | ~8–10%                           | 8.1%                      |
| League top scorer mean / 99th percentile     | 24–30 / ≤38                      | 27.8 / 39 (1,200 seasons) |
| Favourite's title %                          | 45–65%                           | 48.5%                     |
| Champion / 4th / 18th / 20th pts             | 85–90 / ~70 / ~35 / 20–27        | 85.5 / 69.2 / 31.9 / 23.0 |
| Highest relegation rate                      | under ~90%                       | 88.5%                     |
| Spearman vs Opta 2026/27 pre-season forecast | check only                       | 0.923                     |
| Spearman vs real 2025/26 table               | check only                       | 0.419                     |

_Known gaps._ (1) The 18th-placed side averages 31.9 points against a ~35 target; moving the strength spread breaks the champion, 20th-place or relegation-rate guardrails, so it is accepted. (2) The top scorer's 99th percentile is 39 against ≤38 (1.1% of 1,200 seasons are 39 or more; the maximum is 45). Single changes of one constant moved it by ±1.5 on noise alone, so it is not tuned further. (3) The balanced build now averages 12.6th in played seasons (600 seasons; predicted 11.9) against its 9th–12th band, see the budget balance in §4. It trades directly against the scorer guardrails: giving midfielders their old, smaller share of attacking chances brings the balanced build back to about 11.4th but returns the top scorer to about 34 goals. Spearman against the real table and the forecast fell from 0.476 and 0.935 (check only, not guardrails); the likeliest reason is that the retune flattened how much one elite finisher lifts his whole side, but that was not isolated.

_Scorer-realism retune (UI batch after Phase 5)._ Over 200 seasons the league top scorer averaged 46.2 goals (99th percentile 62, 91% of seasons 37 or more), each club's top scorer scored 41.6% of its goals, penalties were 0.91 a match (the real league has about 0.27) and a fifth of all goals, converted 64% of the time, and the best shooter took every one. Calibration only checked total goals, not how they were spread over players. The causes, all in the engine: (a) 28% of fouls in the central attacking zone were penalties, and the best shooter always took them; (b) a rating edge counted three times over for one finisher (picked more often through passing and dribbling, shooting more often, and shooting better), so one elite forward took 44% of his club's shots; (c) forwards got most of the attacking-zone chances, and the FPL position quotas put wide attackers in midfield. The fix, in `tuning.ts`: penalty frequency to about 30% of the old (`penaltyShare` 0.086 central, 0.03 wide) with penalty quality raised so about 78% convert (`penaltyXg` 0.94); the rating edge over 50 flattened in each of the three places (`selectionSkillSpread` 0.25, `shotShootingSpread` 0.4, `xgShootingSpread` 0.5); midfielders' share of the final two attacking zones raised (zone weights 1.0 and 0.6, shot factor 1.0); goals restored through chance quality, not shot volume (`xgScale` 1.21, so team shots stay at 13.4 a match instead of 14.9); and `ratingSlope` 0.031 → 0.033, which keeps champion points at 85 or more after the flattening compressed them. Before and after, over 200 seasons: top scorer mean 46.2 → 27.8 (99th percentile 62 → 39), top-scorer share of his club's goals 41.6% → 29.6%, penalties per match 0.91 → 0.29, penalty goals 21.3% → 8.1%, team shots 13.3 → 13.4, goals per game 2.76 → 2.73, champion points 85.0 → 85.5. `diagnose-scorers` reproduces every number (`--set path=value` overrides a constant for a run).

_Rating by position._ Match ratings differ structurally by position (200 seasons, 60+ minute appearances, individual form input in brackets): GK 7.37 (7.33), DEF 6.00 (6.04), MID 6.68 (6.61), FWD 6.62 (6.61). With one shared 6.0 baseline every goalkeeper carried form of about +1.4 (the +2 rating cap) all season, a hidden per-position bonus, and a goalkeeper was the "star player" of all four sample squads. Form now measures each performance against the global average for the player's position (`SEASON.formBaseline`; mean end-of-season form is within ±0.07 for every position), and the star player, player of the season and the user's best player rank rating against the position average (`SEASON.ratingBaseline`, `ratingVsPosition`).

_Reference only, not a guardrail:_ `calibrate` (1,000 matches between synthetic teams) currently reports 2.53 goals per game, 24.9% draws and 25.1 shots by both sides (12.6 per team). It measures a different population from `calibrate-season`, so it is not comparable to the table above and is not a regression.

**Hard rules:**

- **No per-club adjustments.** User squads are built from individual players and must be rated by exactly the same global rules as real clubs.
- Benchmarks are **check-only**; don't tune against one season's table (overfitting on 17–20 clubs).
- Known, accepted gap: FPL player data caps correlation with last season's table at ~0.45–0.5 (team context, managers, injuries aren't in the data). A possible future fix is a separate, visible **club cohesion** rating for real clubs, with the user's club starting neutral. Not now.

## 8. Design system (from the approved matchday mockup)

Style: matchday TV broadcast on the grass. Green is the ground the brand stands on; cream sections give breathing room; colour tags segments and positions the way broadcasters do. Square corners, black broadcast bars and hard offset shadows. The only pattern allowed is the mowed-stripe grass; no other gradients. No emoji.

| Token                | Value                          | Use                                                                         |
| -------------------- | ------------------------------ | --------------------------------------------------------------------------- |
| Cream                | `#F5F1E4`                      | Page ground                                                                 |
| Paper                | `#FFFDF6`                      | Cards                                                                       |
| Chip                 | `#EDE8D8`                      | Neutral chips and quiet controls                                            |
| Hairline             | `#D9D2BE`                      | Rules and table separators                                                  |
| Ink                  | `#111611`                      | Primary text and broadcast bars                                             |
| Text secondary       | `#2E372F`                      | Body copy                                                                   |
| Text muted           | `#4E5A50`                      | Labels and supporting text                                                  |
| On-green secondary   | `#D6E2D3` / `#C9D3C4`          | Supporting copy and muted labels on green                                   |
| Grass stripes        | `#1C6E3D` / `#217A44`          | Vertical bands, 96px each on full-width sections and 60px on pitch graphics |
| Deep green           | `#0B3320`                      | Analysis ground and hard shadows                                            |
| Pitch lines          | `rgba(245, 241, 228, 0.5)`     | Pitch markings                                                              |
| Volt                 | `#D7F24A`                      | Primary CTA background and headline highlights on green                     |
| Signal red           | `#CF2F32`                      | `LIVE` and `BREAKING` only; white text on it is 5.1:1 (replaces `#E5383B`)  |
| Transfer desk orange | `#FF6B2C`                      | Transfer-desk segment tag                                                   |
| Season sky           | `#5BB8F0` / `#1A6FA8` on light | "Your season" segment tag and accessible sky text on light                  |
| Highlights           | `#D7F24A`                      | Highlights segment tag                                                      |
| Goalkeeper           | `#FFB627`                      | `GK` wherever a position appears                                            |
| Defender             | `#5BB8F0`                      | `DEF` wherever a position appears                                           |
| Midfielder           | `#D7F24A`                      | `MID` wherever a position appears                                           |
| Forward              | `#FF6B2C`                      | `FWD` wherever a position appears                                           |
| Warning              | `#8A5A12` on `#F6E7C8`         | Injuries and rule violations                                                |

- **Matchday theme** (the screens where the match is the point):
  - Pick-your-team, the live match viewer, half-time and full-time sit on the grass: the mowed stripes (`#1C6E3D` / `#217A44`, 96px bands) with faint pitch markings behind the content (outer line, halfway line, centre circle, penalty boxes; a fixed backdrop, lines at about 20% cream).
  - The live match viewer's page uses a darker "stadium" green (`#0B3320`, with subtle low-contrast stripes in `#0D3A25`). The playable pitch keeps the normal stripes inside a 3px ink frame with clear lines (80% cream) so it stands out. The score bug, commentary and controls are ink panels.
  - Cards on the grass are paper-white (or ink) with `#0B3320` offset shadows. Any deep-green panel becomes ink. Text sitting directly on the grass is cream (at least 4.5:1 on the lighter stripe).
  - Management screens (season hub, market, league table, January window, season preview) stay on cream with a grass header band that carries the title, the club and the matchday.
  - Half-time and full-time status colours: rating chip volt from 7.0, pink `#F2C9C3` below 6.0, neutral in between; fitness bar green from 75%, amber 50-74%, red below 50%; key-moment tags GOAL and RED in signal red `#CF2F32` with white text (a deliberate exception to "LIVE and BREAKING only", because they are broadcast tags), YELLOW amber `#FFB627`, INJURY in the warning colours, SUB ink.
- Small text on the grass stripes must be cream, never muted green (muted green falls below 4.5:1 on the lighter stripe).
- Position markers on a pitch always have a 2–3px ink outline.
- Match viewer: the user's team uses its club primary colour with an ink outline, falling back to ink; opponents use cream with an ink outline. Position colours are not used in the match viewer.
- Segment tags: Transfer desk is orange, Your season is sky, Highlights is volt, and How it works is a neutral chip.
- Body text is at least 16px at 390px wide and 18px at 1440px wide. Labels and tags are at least 12px.
- The live landing page is the visual reference for the design system; the earlier mockup is superseded.
- Primary button: volt background, ink text, uppercase Oswald, minimum height 48px (64px for hero and sign-off CTAs). Secondary: ink background with cream text, or a 2px ink border on light.
- Featured panels use a hard `14px 14px 0` offset shadow in deep green or ink. No blur shadows.
- Fonts: **Oswald 500/600** for uppercase display headings, big numbers, labels and broadcast bars; **Archivo 400–600** for body copy and tables. Stats and tables use tabular numbers.
- Display sizes: hero `clamp(46px, 6.2vw, 88px)`; section headings `clamp(38px, 4.6vw, 64px)`; line-height `1`.
- Mobile-first, works on desktop; two-column layouts stack at phone width. All text must meet WCAG AA contrast (4.5:1, or 3:1 at 24px and above).
- **Legal:** no Premier League, club or real broadcaster branding or colour schemes; no crests, kits or player photos; never name FIFA, EA, EA Sports FC, Football Manager or any other game in copy, metadata, alt text or SEO keywords (generic lowercase genre terms such as "career mode" and "football manager game" are fine). The footer carries “Not affiliated with the Premier League or any club.”

## 9. Roadmap (build in this order, one phase at a time)

**Phase 0 — Engine ✅ done.** Scaffold, event engine, FPL sync, ratings, match + season calibration, benchmarks.

**Phase 1 — Season prediction (next).**

- Surrogate model fitted to the event engine; parameters saved as JSON in the engine package.
- Precomputed background for the 19 real clubs.
- `predictSeason(userSquad, options)` → mean points, points histogram, position distribution, P(title), P(top 4), P(relegation), per-opponent expected points.
- 10,000 seasons in well under a second in Node.
- Acceptance: surrogate matches engine on held-out matchups; using each real club as the "user" reproduces its `calibrate-season` average closely.

**Phase 2 — Web foundation.** Next.js app with the design tokens above; landing page (hero with season preview card, "how your career works", transfer desk, "your season, predicted", "watch every match", CTA), written in game voice.

**Phase 3 — Found club + squad builder + prediction screen.** Steps from §3 with all rules enforced; shareable prediction card.

**Phase 4 — Match viewer.** 2D renderer that **plays back the engine's event timeline** (it never decides outcomes itself); ~30s per match (×2 toggle); highlights / commentary / instant; half-time subs and tactic change; pick-your-team screen as described in §3.

**Phase 5 — Season loop ✅ done.** Fixtures, league table after every matchday, injuries, form, fitness, January window, save/resume.

- Shipped: a generated 38-round double round-robin with every match simulated by the full event engine in a Web Worker; fitness, form, injuries and one-match red-card bans for every club; a season hub with odds and a live projected finish; a decision log (`kickoff`, `halftime`, `sim`, `transfer`, `closeWindow`) logged the moment the simulation uses each decision, so a refresh resumes playback and never re-opens a decision; save version 2 that replays to the identical season; the January window (three same-position swaps at market value, all squad rules, projection recomputed on close); an end-of-season screen (final table, finish against the prediction, league and club awards, share card, confirmed new season); and a market with value-first sort, accent- and typo-tolerant search and neutral club badges with position stripes. Honest prediction and the £275m budget came first. Multi-season careers, AI transfers and availability-based pricing remain out of scope.

- Availability-based pricing (discounting injured or suspended players) is deferred until injuries actually remove players from matches; adding it before then creates an exploit.

**Track after Phase 5 — Detailed positions.** (Not started; runs before Phase 6.)

1. **Labels.** Each player gets a primary detailed position (GK, LB, CB, RB, LWB, RWB, CDM, CM, CAM, LM, RM, LW, RW, ST) plus up to two alternates, sourced from Wikipedia player pages (openly licensed, with attribution) and reviewed by hand, never scraped from sites whose terms forbid it. They are shown in the market and player panels and as market filters. FPL's GK/DEF/MID/FWD stays the basis for squad quotas.
2. **Gameplay.** Formations get named slots and players lose a small, capped rating amount out of position. This is an engine change, so AGENTS.md rule 6 applies (re-run `calibrate` and `calibrate-season` and report against the §7 guardrails). Scheduled for the post-playtest gameplay pass.

**Phase 6 — Accounts and competition.** Supabase auth, saved clubs, leaderboards (seed-verified on the server), friends leagues, weekly challenges.

- **Leaderboards are separate per difficulty** (Underdog, Standard, Big spender, Takeover). A season is only ranked against seasons with the same budget preset, and server verification replays the log under the preset recorded in the save.
- The season seed currently comes from `Date.now()` on the client when a season is created. For leaderboards the server must issue the seed (a client-chosen seed lets people shop for a favourable season), and verification replays the decision log against that seed.

**Post-playtest gameplay pass (not started).** Team talks and morale: they have no effect in the engine today, so the half-time screen has none. Scheduled with the Detailed positions gameplay work above.

**Later (not now):** live season mode (real weekend performances feed player form; results still from team-vs-team simulation), club cohesion rating, transfer market depth.

## 10. Reference

- Design mockups (canvas): https://claude.ai/artifact/KmA9PCsNeiJum8hV1jCuTt — pages: _Logged-in flow_ (interactive), _Website_, _Mobile screens_.
