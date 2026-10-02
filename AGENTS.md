# AGENTS.md

Instructions for coding agents working in this repo. Read this file and `docs/PRODUCT_PLAN.md` before starting any task.

## What this project is

A web game where the user founds a club that replaces a promoted club in the Premier League, signs real players on a budget, gets an instant season prediction, then plays the season match by match with short 2D match playback. Full spec: `docs/PRODUCT_PLAN.md`. **That document is the source of truth.** If a task conflicts with it, or requires a product decision it lists as open, stop and ask.

## Repo layout

- `apps/web` — Next.js (App Router, TypeScript) website
- `packages/engine` — match engine, ratings, prediction. Pure TypeScript.
- `scripts` — Node scripts run with tsx (`@pl/scripts`): FPL sync, `calibrate`, `calibrate-season`, benchmarks
- Package manager: **pnpm** workspaces. TypeScript is pinned to ~5.9 (7.x breaks typescript-eslint).

## Non-negotiable rules

1. **Engine stays pure.** No DOM, Node or network APIs in `packages/engine`. It must run in both the browser and Node.
2. **Deterministic randomness only.** Use the seeded mulberry32 PRNG for all randomness. Never `Math.random`. Same inputs + seed must give an identical result.
3. **Results come from team-vs-team simulation.** Never compute match or season outcomes by summing player stats.
4. **No per-club adjustments** in ratings or engine. Every squad, including the user's, is rated by the same global rules.
5. **The match viewer only plays back the engine's event timeline.** It never decides outcomes.
6. **Don't retune the engine unless the task explicitly asks.** If you touch `packages/engine` behaviour or `tuning.ts`, re-run `pnpm --filter @pl/scripts calibrate` and `calibrate-season` and report the results against the guardrail table in `docs/PRODUCT_PLAN.md` §7.
7. **Benchmarks are check-only.** Don't tune against a single season's table.
8. **Follow the design system** in `docs/PRODUCT_PLAN.md` §8 (dark, near-monochrome, pitch is the only colour, Barlow / Barlow Condensed, white primary buttons).
9. **Legal:** no Premier League or club logos, crests, kits or branding; no player photos; never mention FIFA or EA.
10. **Secrets:** never commit `.env` files or keys. The FPL cache stays gitignored; only `scripts/data/benchmarks/` is committed.

## Workflow

- Work on **one roadmap phase at a time** (`docs/PRODUCT_PLAN.md` §9). Don't start the next phase unasked.
- Before committing, run and pass: `pnpm typecheck`, `pnpm lint`, `pnpm test`, and the Prettier check. **Stop the command chain on any failure**; never commit with a failing check.
- Commit with a clear message. **Do not push** unless asked.
- Don't add dependencies without a reason stated in your summary.
- When you finish, report: what changed, decisions you made, anything you skipped or couldn't do, and the test/calibration output.
