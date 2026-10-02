import type { MatchResult } from '@pl/engine';

const POISSON_MAX = 7;

/** Poisson pmf bucketed 0..6 and 7+ for a given mean. */
export function poissonBuckets(mean: number): number[] {
  const out: number[] = [];
  let p = Math.exp(-mean);
  let cum = 0;
  for (let k = 0; k < POISSON_MAX; k++) {
    out.push(p);
    cum += p;
    p = (p * mean) / (k + 1);
  }
  out.push(1 - cum);
  return out;
}

export class DistributionStats {
  matches = 0;
  goals = 0;
  private readonly totals = new Array<number>(POISSON_MAX + 1).fill(0);
  // Scoreline state: 0 = level, 1 = one goal in it, 2 = two or more.
  private readonly seconds = [0, 0, 0];
  private readonly goalsIn = [0, 0, 0];
  private readonly leaderGoalsIn = [0, 0, 0];

  add(r: MatchResult, homeTeamId: string): void {
    const total = r.score.home + r.score.away;
    this.matches++;
    this.goals += total;
    const bucket = Math.min(total, POISSON_MAX);
    this.totals[bucket] = (this.totals[bucket] ?? 0) + 1;

    let diff = 0; // home minus away
    let last = 0;
    const bump = (arr: number[], i: number, by: number): void => {
      arr[i] = (arr[i] ?? 0) + by;
    };
    for (const e of r.events) {
      const isGoal = e.action === 'shot' && e.outcome === 'goal';
      if (!isGoal && e.action !== 'full_time') continue;
      const state = Math.min(Math.abs(diff), 2);
      bump(this.seconds, state, e.elapsed - last);
      last = e.elapsed;
      if (!isGoal) continue;
      const homeScored = e.teamId === homeTeamId;
      bump(this.goalsIn, state, 1);
      if (diff !== 0 && diff > 0 === homeScored) bump(this.leaderGoalsIn, state, 1);
      diff += homeScored ? 1 : -1;
    }
  }

  print(label: string, mean = 2.8): void {
    const poisson = poissonBuckets(mean);
    console.log(`\nTotal-goals distribution ${label}:  (Poisson mean ${mean} for comparison)`);
    for (let g = 0; g <= POISSON_MAX; g++) {
      const obs = ((100 * (this.totals[g] ?? 0)) / this.matches).toFixed(1).padStart(5);
      const exp = (100 * (poisson[g] ?? 0)).toFixed(1).padStart(5);
      console.log(
        `  ${g === POISSON_MAX ? '7+' : String(g).padStart(2)}  ${obs}%   poisson ${exp}%`,
      );
    }
    console.log('Goals per 90 minutes by scoreline state (snowball check):');
    const names = ['level', 'leading by 1', 'leading by 2+'];
    for (let s = 0; s < 3; s++) {
      const secs = this.seconds[s] ?? 0;
      const share = (100 * secs) / this.seconds.reduce((a, b) => a + b, 0);
      const per90 = (n: number): string => (secs > 0 ? ((n / secs) * 5400).toFixed(2) : '-');
      const all = this.goalsIn[s] ?? 0;
      const leader = this.leaderGoalsIn[s] ?? 0;
      const detail = s === 0 ? '' : `  (leader ${per90(leader)}, trailer ${per90(all - leader)})`;
      console.log(
        `  ${names[s]?.padEnd(14)} ${share.toFixed(1).padStart(5)}% of time   ${per90(all)} goals/90${detail}`,
      );
    }
  }
}
