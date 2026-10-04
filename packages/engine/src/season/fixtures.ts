import { createRng } from '../rng';

export interface Fixture {
  home: string;
  away: string;
}

/** One list of matches per round; every club plays exactly once in each round. */
export type Round = Fixture[];

/**
 * A 38-round double round-robin for an even number of clubs, deterministic from `seed`.
 * Every pair meets once at each ground. Home and away alternate as evenly as the circle method
 * allows (no run of more than two at the same ground for the long stretch of the season), and the
 * second half of the season repeats the first with the grounds reversed.
 */
export function generateFixtures(clubIds: readonly string[], seed: number): Round[] {
  const n = clubIds.length;
  if (n < 2 || n % 2 !== 0) throw new Error('A round-robin needs an even number of clubs');
  if (new Set(clubIds).size !== n) throw new Error('club ids must be unique');
  const rng = createRng(seed ^ 0x51ed270b);

  // Seeded shuffle so different seasons have different calendars.
  const order = [...clubIds];
  for (let i = n - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [order[i], order[j]] = [order[j]!, order[i]!];
  }

  // Circle method: club 0 stays, the rest rotate. Alternating who is "home" in the fixed club's
  // match, and by position parity elsewhere, keeps the ground pattern balanced.
  const first: Round[] = [];
  const ring = order.slice(1);
  for (let r = 0; r < n - 1; r++) {
    const round: Round = [];
    const left = [order[0]!, ...ring.slice(0, n / 2 - 1)];
    const right = ring.slice(n / 2 - 1).reverse();
    for (let i = 0; i < n / 2; i++) {
      const a = left[i]!;
      const b = right[i]!;
      const flip = i === 0 ? r % 2 === 1 : i % 2 === 0;
      round.push(flip ? { home: b, away: a } : { home: a, away: b });
    }
    first.push(round);
    ring.unshift(ring.pop()!);
  }

  const reversed = first.map((round) => round.map((f) => ({ home: f.away, away: f.home })));
  // The reverse leg may start at any round and run in either direction; pick the variant with the
  // fewest long home/away runs (the join between the legs is the only awkward place).
  let best: Round[] | undefined;
  let bestScore = Infinity;
  for (const backwards of [false, true]) {
    for (let start = 0; start < reversed.length; start++) {
      const leg = reversed.map((_, i) => {
        const at = backwards ? start - i : start + i;
        return reversed[((at % reversed.length) + reversed.length) % reversed.length]!;
      });
      const rounds = [...first, ...leg];
      const score = clubIds.reduce((sum, c) => sum + Math.max(0, longestRun(rounds, c) - 2), 0);
      if (score < bestScore) {
        bestScore = score;
        best = rounds;
      }
    }
  }
  return best!;
}

/** Longest run of consecutive home or away matches for a club. */
export function longestRun(rounds: readonly Round[], clubId: string): number {
  let longest = 0;
  let run = 0;
  let last: 'home' | 'away' | null = null;
  for (const round of rounds) {
    const f = round.find((x) => x.home === clubId || x.away === clubId);
    if (!f) continue;
    const ground = f.home === clubId ? 'home' : 'away';
    run = ground === last ? run + 1 : 1;
    last = ground;
    longest = Math.max(longest, run);
  }
  return longest;
}
