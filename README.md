# Premier League Club Builder

## What it is

Found a 21st Premier League club, build a squad on a budget, and play the season match by match with 2D highlights.

## Tech stack

- TypeScript (strict) in a pnpm workspaces monorepo
- Next.js (App Router) for the web app
- A UI-free match engine library, tested with Vitest
- Node scripts run with tsx (calibration, FPL data sync)
- Supabase (planned) for accounts and leaderboards
- ESLint + Prettier, GitHub Actions CI

## Repo structure

```
apps/web         Next.js app
packages/engine  UI-free match engine (no DOM / Node APIs)
scripts          Node scripts (calibration, FPL data sync), run via tsx
```

## Getting started

```sh
pnpm install
cp .env.example .env.local   # fill in Supabase values
pnpm dev                     # start the web app
pnpm typecheck && pnpm lint && pnpm test
```

Real-data scripts (run from the repo root):

```sh
pnpm --filter @pl/scripts fpl-sync [--refresh]     # cache FPL JSON in scripts/data/cache (gitignored)
pnpm --filter @pl/scripts calibrate                # match-level calibration (synthetic teams)
pnpm --filter @pl/scripts calibrate-season [n]     # n seasons between the 20 real clubs (default 200), incl. points vs the real 2025/26 table (scripts/data/benchmarks)
pnpm --filter @pl/scripts team-benchmark           # per-club xG for/against per 90 from the cache
```

## Roadmap

1. Match engine + calibration
2. 2D highlight renderer
3. Half-time decisions
4. Season loop
5. Accounts + leaderboards
