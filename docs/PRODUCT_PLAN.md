# 21st Club — Product Plan

> Working name: **21st Club** (placeholder, may change).
> This document is the source of truth for _what_ we are building. If a task seems to conflict with it, stop and ask instead of improvising.

---

## 1. The product in one paragraph

You found a brand-new football club that enters the Premier League in place of one of the promoted clubs. You get a fixed budget to sign **real Premier League players**. The site instantly predicts how your club would do over a season (points, finishing position, title / top-4 / relegation odds). Then you play the season **match by match**: pick your XI and tactics, watch each match as a short 2D highlight animation, make half-time decisions, and watch your club move up or down the league table.

**One-line pitch:** _FPL is your weekly fantasy team. This is where you find out if you could actually run a club._

## 2. How it differs from FPL (don't drift into building FPL)

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

## 5. How the prediction works

1. **Players → ratings.** FPL stats (xG, xA, creativity, threat, defensive actions, saves, minutes) are mapped to 0–100 engine ratings by **global rules** in `ratings.ts`, with shrinkage for low-minute players and a lower prior for players without top-flight history.
2. **Match engine.** Event-based simulation; better players win more duels; upsets still happen.
3. **Monte Carlo.** Simulate the season **10,000 times** with different seeds and count outcomes:
   - predicted points = average points across simulations
   - title % = share of simulations finishing 1st
   - most likely finish = most frequent position
   - the points histogram on the prediction screen is those totals plotted
4. **Speed.** Predictions use a **fast surrogate model** fitted to the event engine (team ratings → expected goals → Poisson/Dixon-Coles scorelines). The 342 matches between the 19 real clubs are **precomputed** once; per prediction only the user's 38 matches are simulated. Watched matches use the **full event engine**. Because the surrogate is fitted to the engine, they agree.

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

**Calibration guardrails (regression targets).** Any engine change must re-run both calibration scripts and stay near these:

| Metric                                       | Target                           | Current                   |
| -------------------------------------------- | -------------------------------- | ------------------------- |
| Goals per game                               | ~2.8                             | 2.75                      |
| Draws                                        | 23–25%                           | 23.6%                     |
| Goals distribution                           | Poisson-shaped, 7+ goals ~2–2.5% | 2.4%                      |
| Red cards per game                           | ~0.1                             | ~0.12                     |
| Favourite's title %                          | 45–65%                           | 63.5%                     |
| Champion / 4th / 18th / 20th pts             | 85–90 / ~70 / ~35 / 20–27        | 84.7 / 68.3 / 35.2 / 25.7 |
| Highest relegation rate                      | under ~90%                       | 87.5%                     |
| Spearman vs Opta 2026/27 pre-season forecast | check only                       | 0.839                     |
| Spearman vs real 2025/26 table               | check only                       | 0.489                     |

**Hard rules:**

- **No per-club adjustments.** User squads are built from individual players and must be rated by exactly the same global rules as real clubs.
- Benchmarks are **check-only**; don't tune against one season's table (overfitting on 17–20 clubs).
- Known, accepted gap: FPL player data caps correlation with last season's table at ~0.45–0.5 (team context, managers, injuries aren't in the data). A possible future fix is a separate, visible **club cohesion** rating for real clubs, with the user's club starting neutral. Not now.

## 8. Design system (from the agreed mockups)

Style: dark, near-monochrome, inspired by Linear/Vercel. **The pitch is the only colour.** No coloured section bands, no gradients, no emoji.

| Token             | Value                                            | Use                                    |
| ----------------- | ------------------------------------------------ | -------------------------------------- |
| Background        | `#08090A`                                        | page                                   |
| Surface           | `#0F1011`                                        | cards                                  |
| Surface 2         | `#161718`                                        | rows, chips                            |
| Raised / selected | `#1C1D1F`                                        | selected states, highlighted table row |
| Border            | `#232428` (cards), `#1F2023` (section hairlines) |                                        |
| Text              | `#F7F8F8`                                        | headings, primary text                 |
| Text secondary    | `#C8CCD2`                                        | body                                   |
| Text muted        | `#8A8F98`                                        | labels                                 |
| Pitch / lines     | `#123326` / `#24573F`                            | the only chromatic moment              |
| Your team         | `#F7F8F8` (white)                                | dots, highlights                       |
| Opponents         | `#6B6F76` (grey)                                 | dots                                   |
| Warning           | `#E3A869` on `#2A2117`                           | injuries, rule violations              |

- Fonts: **Barlow Condensed** (uppercase display headings, big numbers) + **Barlow** (body).
- Primary button: white background, black text. Secondary: transparent with border.
- Mobile-first, works on desktop; two-column layouts stack only at phone width.
- **Legal:** no Premier League logos, club crests, kits or branding; club names in plain text only. Never mention FIFA/EA. No real player photos.

## 9. Roadmap (build in this order, one phase at a time)

**Phase 0 — Engine ✅ done.** Scaffold, event engine, FPL sync, ratings, match + season calibration, benchmarks.

**Phase 1 — Season prediction (next).**

- Surrogate model fitted to the event engine; parameters saved as JSON in the engine package.
- Precomputed background for the 19 real clubs.
- `predictSeason(userSquad, options)` → mean points, points histogram, position distribution, P(title), P(top 4), P(relegation), per-opponent expected points.
- 10,000 seasons in well under a second in Node.
- Acceptance: surrogate matches engine on held-out matchups; using each real club as the "user" reproduces its `calibrate-season` average closely.

**Phase 2 — Web foundation.** Next.js app with the design tokens above; landing page (hero with prediction card, "how it works", "watch every match", leaderboard teaser, CTA).

**Phase 3 — Found club + squad builder + prediction screen.** Steps from §3 with all rules enforced; shareable prediction card.

**Phase 4 — Match viewer.** 2D renderer that **plays back the engine's event timeline** (it never decides outcomes itself); ~20s per match; highlights / commentary / instant; half-time subs and tactic change; pick-your-team screen as described in §3.

**Phase 5 — Season loop.** Fixtures, league table after every matchday, injuries, form, fitness, January window, save/resume.

**Phase 6 — Accounts and competition.** Supabase auth, saved clubs, leaderboards (seed-verified on the server), friends leagues, weekly challenges.

**Later (not now):** live season mode (real weekend performances feed player form; results still from team-vs-team simulation), club cohesion rating, transfer market depth.

## 10. Reference

- Design mockups (canvas): https://claude.ai/artifact/KmA9PCsNeiJum8hV1jCuTt — pages: _Logged-in flow_ (interactive), _Website_, _Mobile screens_.
