import type { MatchEvent } from '@pl/engine';
import { describe, expect, it } from 'vitest';
import {
  formatMatchClock,
  orderTimeline,
  playbackDuration,
  timelineIndexAt,
  toPitchPercent,
} from './playback';

const event = (elapsed: number, minute: number, addedTime = 0): MatchEvent => ({
  elapsed,
  minute,
  addedTime,
  period: minute <= 45 ? 1 : 2,
  teamId: 'home',
  playerId: 'p1',
  action: 'pass',
  outcome: 'success',
  start: { x: 0, y: 0 },
  end: { x: 105, y: 68 },
  commentary: 'Pass complete.',
});

describe('match playback utilities', () => {
  it('converts engine metres to clamped pitch percentages', () => {
    expect(toPitchPercent({ x: 52.5, y: 34 })).toEqual({ x: 50, y: 50 });
    expect(toPitchPercent({ x: -4, y: 80 })).toEqual({ x: 0, y: 100 });
  });

  it('orders the timeline chronologically while keeping ties stable', () => {
    const late = event(30, 1);
    const firstTie = { ...event(10, 1), commentary: 'First tie' };
    const secondTie = { ...event(10, 1), commentary: 'Second tie' };
    expect(orderTimeline([late, firstTie, secondTie]).map((item) => item.commentary)).toEqual([
      'First tie',
      'Second tie',
      'Pass complete.',
    ]);
  });

  it('progresses the match clock with playback time and formats stoppage time', () => {
    const events = [event(0, 1), event(900, 15), event(1800, 30), event(2700, 45, 2)];
    expect(timelineIndexAt(events, 0, 8_000)).toBe(0);
    expect(timelineIndexAt(events, 4_000, 8_000)).toBe(1);
    expect(timelineIndexAt(events, 8_000, 8_000)).toBe(3);
    expect(formatMatchClock(events[3])).toBe("45+2'");
  });

  it('finishes immediately for instant mode and reduced motion', () => {
    expect(playbackDuration('instant', false)).toBe(0);
    expect(playbackDuration('highlights', true)).toBe(0);
    expect(playbackDuration('highlights', false)).toBeLessThanOrEqual(10_000);
  });
});
