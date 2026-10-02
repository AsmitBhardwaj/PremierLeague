export type Position = 'GK' | 'DEF' | 'MID' | 'FWD';

export interface Player {
  id: string;
  name: string;
  position: Position;
  /** Overall rating, 0-100. */
  rating: number;
}

export interface Tactic {
  formation: string;
  /** 0 (deep) - 100 (high press). */
  pressing: number;
  /** 0 (patient) - 100 (direct). */
  directness: number;
}

export interface Team {
  id: string;
  name: string;
  players: Player[];
  tactic: Tactic;
}

export type MatchEventType = 'kickoff' | 'goal' | 'fulltime';

export interface MatchEvent {
  minute: number;
  type: MatchEventType;
  teamId?: string;
  playerId?: string;
}

export interface MatchResult {
  events: MatchEvent[];
  score: { home: number; away: number };
}

export interface MatchInput {
  home: Team;
  away: Team;
  seed: number;
}

/** Deterministic PRNG (mulberry32) so the same seed always yields the same match. */
function createRng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Stub: placeholder logic until the real match engine lands. */
export function simulateMatch({ home, away, seed }: MatchInput): MatchResult {
  const rng = createRng(seed);
  const events: MatchEvent[] = [{ minute: 0, type: 'kickoff' }];
  const score = { home: 0, away: 0 };

  for (const [side, team] of [
    ['home', home],
    ['away', away],
  ] as const) {
    const goals = Math.floor(rng() * 4);
    for (let i = 0; i < goals; i++) {
      score[side]++;
      events.push({
        minute: 1 + Math.floor(rng() * 90),
        type: 'goal',
        teamId: team.id,
        ...(team.players.length > 0 && {
          playerId: team.players[Math.floor(rng() * team.players.length)]?.id,
        }),
      });
    }
  }

  events.sort((x, y) => x.minute - y.minute);
  events.push({ minute: 90, type: 'fulltime' });
  return { events, score };
}
