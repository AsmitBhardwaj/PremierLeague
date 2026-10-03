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

1. **Build squad** — player market with prices; budget bar; formation slots (GK/DEF/MID/FWD); max **3 players per real club**; "Continue" only when the squad is valid.
2. **Pick your team** — **pitch with the XI on the left**, substitutes row under the pitch, **selected player's info panel on the right** (overall rating, position, six-stat radar chart, fitness, form, positions, preferred foot, stat bars). Click a starter, then a same-position substitute, to swap. Tabs: **Team / Tactics**. Fixture card with win/draw/loss odds and **Kick off** always visible.
3. **Watch the match** — 2D top-down pitch, players as dots, ball moves, scoreboard + clock, event banners (goal, chance, card), live commentary feed. **A full match plays back in ~20 seconds max.** Viewing options: highlights / text commentary / instant result. "Skip to full time" always available.
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
- Budget: 950 FPL price units (£95.0m), using the existing FPL prices.
- Maximum three players from any real club.
- Exclude only players whose FPL status is `u`; players with status `a`, `d`, `i` or `s` remain selectable.
- The starting XI must use one of the six engine-supported formations: 4-4-2, 4-3-3, 3-5-2, 5-3-2, 4-5-1 or 3-4-3.

### Approved Phase 4 decisions

- Match context: a single match. After the prediction screen the user picks any of the 19 real clubs as opponent and chooses home or away. There is no fixture list, league table or season progression (Phase 5). The replaced club is computed by the plan's rule (the promoted club with the weakest squad), not hardcoded; the opponents are the other 19 clubs.
- Fitness and form: every player shows 100% fitness and a neutral form indicator ("—"). No values are invented.
- Preferred foot: no data exists, so the field is omitted.
- Six-stat radar: derived directly from engine ratings. Outfield players show Pace, Shooting, Passing, Dribbling, Tackling and Positioning; goalkeepers show Goalkeeping in place of Shooting. The headline number is the existing `overall()`.
- Off-ball players: the timeline only positions players involved in each event. Other dots are cosmetic, anchored to the formation and shifting with the ball and possession. They never imply an event that is not in the timeline.
- Highlights mode: goals, shots, big chances, cards, injuries and substitutions animate; everything else compresses into clock advance plus commentary. A full match plays in 20 seconds at most (about 10 seconds per half; the half-time pause is excluded). Instant mode skips straight to the result.
- Match seed: `hash(club name, opponent, venue, play counter)`, using the seeded PRNG pipeline and never `Math.random`. The play counter is persisted so a refresh does not replay a seed by accident; "Play again" increments it. Lineup and tactic changes keep the seed, so outcomes can be compared. The seed is stored with match state and shown as a small muted "Match seed" detail.
- Opponent AI: the engine's `pickSquad` XI, balanced tactic, no half-time changes. The user may play at home or away; the viewer keeps the engine's orientation (home attacks left to right) and the score bug always reads home on the left, with the user's club marked by its colour.
- Fixture card odds: the exact Poisson scoreline grid over the same `expectedGoals` surrogate that `predictSeason` samples from (independent Poisson goals; the surrogate has no Dixon-Coles correction; home advantage is the surrogate's `isHome` term). They are not computed by summing player stats.
- Engine change: substitution events gain an additive `offPlayerId` (data only; RNG order, decisions and outcomes unchanged, proven by a golden fingerprint test; `calibrate` and `calibrate-season` output unchanged).
- Storage: the Phase 4 save version is bumped and older saves are ignored.

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
4. **Speed.** Predictions use a **fast surrogate model** fitted to the event engine (team ratings → `expectedGoals` → independent Poisson goal counts for each side, with home advantage via the `isHome` term; there is no Dixon-Coles correction). The 342 matches between the 19 real clubs are **precomputed** once; per prediction only the user's 38 matches are simulated. Watched matches use the **full event engine**. Because the surrogate is fitted to the engine, they agree. The surrogate parameters and the precomputed background must be refit and regenerated whenever ratings change (`fit-surrogate`, `generate-season-background`, then `sanity-predict-season`: RMSE vs the event engine is 3.1 points).

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

**Calibration guardrails (regression targets).** The table below is the `calibrate-season` output (200 seasons of real-club squads). Any engine change must re-run both calibration scripts and stay near these:

| Metric                                       | Target                           | Current                   |
| -------------------------------------------- | -------------------------------- | ------------------------- |
| Goals per game                               | ~2.8                             | 2.77                      |
| Draws                                        | 23–25%                           | 23.1%                     |
| Goals distribution                           | Poisson-shaped, 7+ goals ~2–2.5% | 2.3%                      |
| Red cards per game                           | ~0.1                             | ~0.11                     |
| Favourite's title %                          | 45–65%                           | 59.0%                     |
| Champion / 4th / 18th / 20th pts             | 85–90 / ~70 / ~35 / 20–27        | 85.4 / 68.5 / 32.9 / 23.0 |
| Highest relegation rate                      | under ~90%                       | 85.0%                     |
| Spearman vs Opta 2026/27 pre-season forecast | check only                       | 0.926                     |
| Spearman vs real 2025/26 table               | check only                       | 0.463                     |

_Known soft gap:_ the 18th-placed side averages 32.9 points against a ~35 target (about 2 points under). Steepening or flattening the bottom of the rating curve moved it by less than a point while breaking the 20th-place and relegation-rate guardrails, so it is accepted rather than tuned further. Both calibration scripts were run at their standard sizes (`calibrate` 1,000 matches, `calibrate-season` 200 seasons).

_Reference only, not a guardrail:_ `calibrate` (1,000 matches between synthetic teams) currently reports 2.70 goals per game and 25.6% draws. It measures a different population from `calibrate-season`, so it is not comparable to the table above and is not a regression.

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

**Phase 4 — Match viewer.** 2D renderer that **plays back the engine's event timeline** (it never decides outcomes itself); ~20s per match; highlights / commentary / instant; half-time subs and tactic change; pick-your-team screen as described in §3.

**Phase 5 — Season loop.** Fixtures, league table after every matchday, injuries, form, fitness, January window, save/resume.

**Phase 6 — Accounts and competition.** Supabase auth, saved clubs, leaderboards (seed-verified on the server), friends leagues, weekly challenges.

**Later (not now):** live season mode (real weekend performances feed player form; results still from team-vs-team simulation), club cohesion rating, transfer market depth.

## 10. Reference

- Design mockups (canvas): https://claude.ai/artifact/KmA9PCsNeiJum8hV1jCuTt — pages: _Logged-in flow_ (interactive), _Website_, _Mobile screens_.
