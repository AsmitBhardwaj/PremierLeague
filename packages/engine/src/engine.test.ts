import { describe, expect, it } from 'vitest';
import {
  Match,
  createSyntheticTeam,
  simulateMatch,
  type MatchInput,
  type Tactic,
  type Team,
} from './index';

const mk = (id: string, strength: number, tactic: Tactic = 'balanced'): Team =>
  createSyntheticTeam({ id, strength, tactic, seed: id.charCodeAt(0) });

const input = (seed: number, home = mk('h', 65), away = mk('a', 65)): MatchInput => ({
  home,
  away,
  seed,
});

describe('simulateMatch', () => {
  it('is identical for the same inputs and seed', () => {
    expect(simulateMatch(input(42))).toEqual(simulateMatch(input(42)));
  });

  it('differs for a different seed', () => {
    const a = simulateMatch(input(1));
    const b = simulateMatch(input(2));
    expect(JSON.stringify(a.events)).not.toEqual(JSON.stringify(b.events));
  });

  it('produces a coherent timeline, score and ratings', () => {
    const r = simulateMatch(input(7));
    const goals = r.events.filter((e) => e.outcome === 'goal' && e.action === 'shot');
    expect(goals.length).toBe(r.score.home + r.score.away);
    expect(r.events[0]?.action).toBe('kickoff');
    expect(r.events.at(-1)?.action).toBe('full_time');
    for (const e of r.events) {
      for (const p of [e.start, e.end]) {
        expect(p.x).toBeGreaterThanOrEqual(0);
        expect(p.x).toBeLessThanOrEqual(105);
        expect(p.y).toBeGreaterThanOrEqual(0);
        expect(p.y).toBeLessThanOrEqual(68);
      }
      expect(e.commentary.length).toBeGreaterThan(0);
    }
    expect(r.playerRatings.length).toBeGreaterThanOrEqual(22);
    for (const p of r.playerRatings) {
      expect(p.rating).toBeGreaterThanOrEqual(1);
      expect(p.rating).toBeLessThanOrEqual(10);
    }
    expect(r.stats.home.possession + r.stats.away.possession).toBeCloseTo(100, 0);
  });

  it('lets a much stronger team win most of 500 matches', () => {
    let strongWins = 0;
    for (let i = 0; i < 500; i++) {
      const strongHome = i % 2 === 0;
      const strong = mk('s', 78);
      const weak = mk('w', 55);
      const r = simulateMatch(
        input(1000 + i, strongHome ? strong : weak, strongHome ? weak : strong),
      );
      const diff = strongHome ? r.score.home - r.score.away : r.score.away - r.score.home;
      if (diff > 0) strongWins++;
    }
    expect(strongWins / 500).toBeGreaterThan(0.6);
  });

  it('rejects invalid teams', () => {
    const bad = mk('h', 60);
    bad.players = bad.players.slice(0, 10);
    expect(() => simulateMatch(input(1, bad))).toThrow(/11 players/);
  });
});

describe('half-time', () => {
  it('without changes, pausing matches an uninterrupted match', () => {
    const m = new Match(input(99));
    m.playFirstHalf();
    expect(m.playSecondHalf()).toEqual(simulateMatch(input(99)));
  });

  it('half-time changes leave the first half alone and alter the second', () => {
    const base = simulateMatch(input(5));
    const changed = simulateMatch(input(5), () => ({
      home: { tactic: 'high_press', substitutions: [{ off: 'h-10', on: 'h-17' }] },
      away: { tactic: 'defensive' },
    }));
    const breakEvents = ['substitution', 'tactic_change', 'half_time'];
    const firstHalf = (r: typeof base) =>
      r.events.filter((e) => e.period === 1 && !breakEvents.includes(e.action));
    const secondHalf = (r: typeof base) =>
      JSON.stringify(r.events.filter((e) => e.period === 2 && e.action !== 'substitution'));
    expect(firstHalf(changed)).toEqual(firstHalf(base));
    expect(secondHalf(changed)).not.toEqual(secondHalf(base));

    const after = changed.events.filter((e) => e.period === 2);
    expect(after.some((e) => e.playerId === 'h-17')).toBe(true);
    expect(after.some((e) => e.playerId === 'h-10' && e.action !== 'substitution')).toBe(false);
    expect(changed.events.some((e) => e.action === 'tactic_change')).toBe(true);
  });

  it('refuses illegal substitutions', () => {
    const m = new Match(input(3));
    m.playFirstHalf();
    expect(m.substitute('home', 'h-1', 'a-17')).toBe(false);
    expect(m.substitute('home', 'h-17', 'h-1')).toBe(false);
    expect(m.substitute('home', 'h-2', 'h-12')).toBe(true);
  });

  it('pressing tires players more than a balanced approach', () => {
    const avgStamina = (tactic: Tactic): number => {
      let sum = 0;
      for (let seed = 1; seed <= 10; seed++) {
        const m = new Match(input(seed, mk('h', 65, tactic), mk('a', 65)));
        m.playFirstHalf();
        const ps = m.snapshot().players.filter((p) => p.teamId === 'h' && p.onPitch);
        sum += ps.reduce((a, p) => a + p.stamina, 0) / ps.length;
      }
      return sum / 10;
    };
    expect(avgStamina('high_press')).toBeLessThan(avgStamina('balanced') - 3);
  });
});

describe('substitution events', () => {
  it('records the outgoing player without altering any other output', async () => {
    const { fingerprint, goldenResults, serialiseWithoutOffPlayer } =
      await import('./golden-scenarios');
    const golden = (await import('./fixtures/golden-hashes.json')).default as {
      score: { home: number; away: number };
      events: number;
      hash: string;
    }[];
    const results = goldenResults();
    expect(results).toHaveLength(golden.length);
    results.forEach((result, index) => {
      expect(result.score).toEqual(golden[index]!.score);
      expect(result.events).toHaveLength(golden[index]!.events);
      expect(fingerprint(serialiseWithoutOffPlayer(result))).toBe(golden[index]!.hash);
    });
  });

  it('names the player who left on every substitution event', () => {
    const home = mk('h', 60);
    const away = mk('a', 60);
    let seen = 0;
    for (let seed = 1; seed <= 40; seed++) {
      const match = new Match({ home, away, seed });
      match.playFirstHalf();
      const off = home.players.find((p) => p.position === 'FWD')!;
      const on = home.bench!.find((p) => p.position === 'FWD')!;
      match.substitute('home', off.id, on.id);
      const subs = match.playSecondHalf().events.filter((e) => e.action === 'substitution');
      for (const event of subs) {
        seen++;
        expect(event.offPlayerId).toBeTruthy();
        expect(event.offPlayerId).not.toBe(event.playerId);
      }
      expect(subs.find((e) => e.playerId === on.id)?.offPlayerId).toBe(off.id);
    }
    expect(seen).toBeGreaterThan(0);
  });
});

describe('half-time snapshot ratings and possession', () => {
  it('reports live ratings and possession without changing the match', () => {
    for (const seed of [3, 11, 29]) {
      const plain = simulateMatch(input(seed));
      const match = new Match(input(seed));
      match.playFirstHalf();
      const snap = match.snapshot();
      expect(snap.possession.home + snap.possession.away).toBeGreaterThan(99.8);
      expect(snap.possession.home + snap.possession.away).toBeLessThan(100.2);
      expect(snap.ratings.length).toBeGreaterThanOrEqual(22);
      for (const r of snap.ratings) {
        expect(r.rating).toBeGreaterThanOrEqual(1);
        expect(r.rating).toBeLessThanOrEqual(10);
        expect(r.minutesPlayed).toBeLessThanOrEqual(55);
      }
      const goals = snap.ratings.reduce((sum, r) => sum + r.goals, 0);
      expect(goals).toBe(snap.score.home + snap.score.away);
      // Reading the snapshot is free: the second half and the result are identical.
      expect(match.playSecondHalf()).toEqual(plain);
    }
  });

  it('matches the final ratings and possession once the match is over', () => {
    const match = new Match(input(8));
    match.playFirstHalf();
    const result = match.playSecondHalf();
    const snap = match.snapshot();
    expect(snap.ratings).toEqual(result.playerRatings);
    expect(snap.possession).toEqual({
      home: result.stats.home.possession,
      away: result.stats.away.possession,
    });
  });
});
