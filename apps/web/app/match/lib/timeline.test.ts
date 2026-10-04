import { Match, simulateMatch, type MatchEvent } from '@pl/engine';
import { describe, expect, it } from 'vitest';
import { market, testPreparation } from './fixtures';
import { MatchSession, createMatchInput, createUserMatchTeam } from './match';
import {
  HALF_BUDGET_MS,
  MATCH_BUDGET_MS,
  activePlayers,
  bannerFor,
  buildSchedule,
  classify,
  formationAnchors,
  frameAt,
  isAnimatedKind,
  isFeedKind,
  offBallTarget,
  scoreAt,
  type PlaybackMode,
} from './timeline';
import { watchMs } from './speed';

const CLUBS = ['ARS', 'LIV', 'MCI', 'BHA', 'EVE', 'NEW', 'CHE', 'TOT'];

function playMatch(sample: number) {
  const prep = testPreparation({
    opponentId: CLUBS[sample % CLUBS.length],
    venue: sample % 2 ? 'away' : 'home',
  });
  const input = createMatchInput(prep, market, sample);
  const session = new MatchSession(input, prep.venue);
  const first = session.playFirstHalf().events.slice();
  const result = session.continueSecondHalf(prep.tactic, []);
  return { input, first, result, prep };
}

/** What the viewer would show once playback completes in a given mode. */
function finalDisplayedScore(
  mode: PlaybackMode,
  homeId: string,
  first: readonly MatchEvent[],
  all: readonly MatchEvent[],
) {
  if (mode === 'instant') return scoreAt(all, homeId);
  const halves = [
    { schedule: buildSchedule(first), offset: 0 },
    { schedule: buildSchedule(all.slice(first.length)), offset: first.length },
  ];
  let score = { home: 0, away: 0 };
  for (const { schedule, offset } of halves) {
    // Step through the playback clock exactly as the viewer's animation loop does.
    let last = -1;
    for (let t = 0; t <= schedule.totalMs + 50; t += 33) {
      const frame = frameAt(schedule, t);
      expect(frame.revealed).toBeGreaterThanOrEqual(last);
      last = frame.revealed;
      score = scoreAt(all.slice(0, offset + frame.revealed), homeId);
    }
  }
  return score;
}

describe('highlights schedule', () => {
  it('plays a full match in at most 30 seconds at ×1 and 15 at ×2, 15 per half at ×1', () => {
    for (let sample = 0; sample < 24; sample++) {
      const { first, result } = playMatch(sample);
      const one = buildSchedule(first);
      const two = buildSchedule(result.events.slice(first.length));
      expect(one.totalMs).toBeLessThanOrEqual(HALF_BUDGET_MS + 1e-6);
      expect(two.totalMs).toBeLessThanOrEqual(HALF_BUDGET_MS + 1e-6);
      expect(one.totalMs + two.totalMs).toBeLessThanOrEqual(MATCH_BUDGET_MS + 1e-6);
      expect(MATCH_BUDGET_MS).toBe(30_000);
      expect(watchMs(one.totalMs + two.totalMs, 1)).toBeLessThanOrEqual(30_000 + 1e-6);
      expect(watchMs(one.totalMs + two.totalMs, 2)).toBeLessThanOrEqual(15_000 + 1e-6);
    }
  });

  it('keeps events in order, holds the clock on animated moments and animates every goal', () => {
    const { result } = playMatch(3);
    const schedule = buildSchedule(result.events);
    let previous = 0;
    for (const entry of schedule.entries) {
      expect(entry.startMs).toBeGreaterThanOrEqual(previous);
      previous = entry.startMs + entry.holdMs;
      expect(entry.holdMs > 0).toBe(isAnimatedKind(entry.kind));
    }
    const goals = schedule.entries.filter((entry) => entry.kind === 'goal');
    expect(goals).toHaveLength(result.score.home + result.score.away);
    for (const goal of goals) expect(goal.holdMs).toBeGreaterThan(0);
    expect(schedule.entries.filter((entry) => entry.kind === 'play').length).toBeGreaterThan(100);
  });

  it('compresses passes into clock advance only and gives everything else a feed line', () => {
    expect(isFeedKind('play')).toBe(false);
    for (const kind of [
      'goal',
      'shot',
      'card',
      'injury',
      'substitution',
      'foul',
      'corner',
    ] as const) {
      expect(isFeedKind(kind)).toBe(true);
    }
  });

  it('handles an empty or zero-length timeline', () => {
    expect(buildSchedule([]).entries).toEqual([]);
    const { first } = playMatch(0);
    expect(buildSchedule(first.slice(0, 1)).totalMs).toBe(0);
  });
});

describe('displayed score always equals the engine score', () => {
  it('holds for a sample of seeds in every viewing mode', () => {
    for (let sample = 0; sample < 16; sample++) {
      const { input, first, result } = playMatch(sample);
      for (const mode of ['highlights', 'commentary', 'instant'] as PlaybackMode[]) {
        expect(finalDisplayedScore(mode, input.home.id, first, result.events)).toEqual(
          result.score,
        );
      }
    }
  });

  it('never shows more goals than the engine had scored by that point', () => {
    const { input, first, result } = playMatch(5);
    const schedule = buildSchedule(result.events.slice(first.length));
    let previousTotal = 0;
    for (let t = 0; t <= schedule.totalMs; t += 40) {
      const { revealed } = frameAt(schedule, t);
      const score = scoreAt(result.events.slice(0, first.length + revealed), input.home.id);
      const total = score.home + score.away;
      expect(total).toBeGreaterThanOrEqual(previousTotal);
      expect(total).toBeLessThanOrEqual(result.score.home + result.score.away);
      previousTotal = total;
    }
  });
});

describe('seeded determinism and half-time decisions', () => {
  it('gives an identical timeline and score for the same seed and half-time decisions', () => {
    const run = () => {
      const prep = testPreparation();
      const input = createMatchInput(prep, market, 2);
      const session = new MatchSession(input, 'home');
      session.playFirstHalf();
      const team = createUserMatchTeam(prep);
      const off = team.players.find((player) => player.position === 'MID')!;
      const on = team.bench!.find((player) => player.position === 'MID')!;
      return session.continueSecondHalf('high_press', [{ off: off.id, on: on.id }]);
    };
    expect(run()).toEqual(run());
  });

  it('diverges only from the second half when half-time decisions differ', () => {
    const prep = testPreparation();
    const input = createMatchInput(prep, market, 7);
    const team = createUserMatchTeam(prep);
    const decide = (tactic: 'balanced' | 'counter' | 'defensive') => {
      const session = new MatchSession(input, 'home');
      const first = session.playFirstHalf().events.slice();
      return { first, result: session.continueSecondHalf(tactic, []) };
    };
    const a = decide('balanced');
    const b = decide('defensive');
    const c = decide('counter');
    expect(team.players).toHaveLength(11);
    // Everything up to and including the half-time whistle is identical.
    expect(a.first).toEqual(b.first);
    expect(a.result.events.slice(0, a.first.length)).toEqual(
      b.result.events.slice(0, a.first.length),
    );
    expect(a.result.events.slice(0, a.first.length)).toEqual(
      c.result.events.slice(0, a.first.length),
    );
    // The second halves differ.
    const secondHalf = (events: MatchEvent[]) => JSON.stringify(events.slice(a.first.length));
    expect(secondHalf(a.result.events)).not.toEqual(secondHalf(b.result.events));
    expect(secondHalf(a.result.events)).not.toEqual(secondHalf(c.result.events));
    // First-half goals cannot change.
    expect(scoreAt(a.first, input.home.id)).toEqual(scoreAt(b.first, input.home.id));
  });

  it('matches an uninterrupted simulateMatch when nothing changes at half-time', () => {
    const { input, result } = playMatch(4);
    expect(result).toEqual(simulateMatch(input));
    const direct = new Match(input);
    direct.playFirstHalf();
    expect(direct.playSecondHalf()).toEqual(result);
  });
});

describe('who is on the pitch', () => {
  it('replaces the injured or substituted player, inheriting the slot', () => {
    let checked = 0;
    for (let sample = 0; sample < 40 && checked < 3; sample++) {
      const { input, result } = playMatch(sample);
      for (const team of [input.home, input.away]) {
        const subs = result.events.filter(
          (event) => event.action === 'substitution' && event.teamId === team.id,
        );
        if (!subs.length) continue;
        const sub = subs[0]!;
        const before = activePlayers(team, result.events.slice(0, result.events.indexOf(sub)));
        const after = activePlayers(team, result.events.slice(0, result.events.indexOf(sub) + 1));
        const leaving = before.find((player) => player.playerId === sub.offPlayerId);
        const arriving = after.find((player) => player.playerId === sub.playerId);
        if (leaving) expect(arriving?.slot).toBe(leaving.slot);
        expect(after.some((player) => player.playerId === sub.offPlayerId)).toBe(false);
        checked++;
      }
    }
    expect(checked).toBeGreaterThan(0);
  });

  it('removes sent-off players and ends with at most eleven per side', () => {
    for (let sample = 0; sample < 20; sample++) {
      const { input, result } = playMatch(sample);
      for (const team of [input.home, input.away]) {
        const active = activePlayers(team, result.events);
        expect(active.length).toBeLessThanOrEqual(11);
        for (const event of result.events) {
          if (event.action === 'card' && event.outcome === 'red_card' && event.teamId === team.id) {
            expect(active.some((player) => player.playerId === event.playerId)).toBe(false);
          }
        }
      }
    }
  });
});

describe('cosmetic off-ball players', () => {
  it('anchor every starter on their own half-width formation and stay on the pitch', () => {
    const { input } = playMatch(1);
    for (const [team, side] of [
      [input.home, 'home'],
      [input.away, 'away'],
    ] as const) {
      const anchors = formationAnchors(team, side);
      expect(anchors).toHaveLength(11);
      for (const anchor of anchors) {
        expect(anchor.x).toBeGreaterThanOrEqual(0);
        expect(anchor.x).toBeLessThanOrEqual(105);
        expect(anchor.y).toBeGreaterThan(0);
        expect(anchor.y).toBeLessThan(68);
      }
    }
  });

  it('push towards the ball and forward in possession, but are bounded', () => {
    const anchor = { x: 40, y: 30 };
    const idle = offBallTarget(anchor, 'home', false, { x: 52.5, y: 34 }, null);
    const attacking = offBallTarget(anchor, 'home', false, { x: 90, y: 34 }, 'home');
    const defending = offBallTarget(anchor, 'home', false, { x: 90, y: 34 }, 'away');
    expect(attacking.x).toBeGreaterThan(idle.x);
    expect(attacking.x).toBeGreaterThan(defending.x);
    const extreme = offBallTarget({ x: 104, y: 66 }, 'home', false, { x: 105, y: 68 }, 'home');
    expect(extreme.x).toBeLessThanOrEqual(103);
    expect(extreme.y).toBeLessThanOrEqual(66);
  });
});

describe('banners', () => {
  it('only uses the red goal tone for goals', () => {
    const { result } = playMatch(6);
    const schedule = buildSchedule(result.events);
    for (const entry of schedule.entries) {
      const banner = bannerFor(entry);
      if (banner?.tone === 'goal') expect(classify(entry.event)).toBe('goal');
      if (entry.kind === 'play') expect(banner).toBeNull();
    }
  });
});
