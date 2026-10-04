import type { MatchEvent } from '@pl/engine';
import { describe, expect, it } from 'vitest';
import { isPenaltyGoal, keyMoments } from './moments';

const ev = (over: Partial<MatchEvent>): MatchEvent => ({
  minute: 10,
  addedTime: 0,
  elapsed: 600,
  period: 1,
  teamId: 'h',
  playerId: 'p1',
  action: 'pass',
  outcome: 'success',
  start: { x: 0, y: 0 },
  end: { x: 0, y: 0 },
  commentary: '',
  ...over,
});

const names: Record<string, string> = { p1: 'Merino', p2: 'Haaland', p3: 'Walton' };
const nameOf = (id: string) => names[id] ?? id;
const codeOf = (id: string | null) => (id === 'h' ? 'NOR' : 'MCI');

describe('keyMoments', () => {
  it('lists goals, cards, injuries and substitutions with club codes', () => {
    const events = [
      ev({ minute: 12, action: 'shot', outcome: 'goal' }),
      ev({ minute: 30, action: 'card', outcome: 'yellow_card', teamId: 'a', playerId: 'p2' }),
      ev({ minute: 41, action: 'card', outcome: 'red_card', teamId: 'a', playerId: 'p2' }),
      ev({ minute: 44, action: 'injury', playerId: 'p3' }),
      ev({ minute: 45, addedTime: 2, action: 'substitution', playerId: 'p1', offPlayerId: 'p3' }),
      ev({ action: 'pass' }),
    ];
    expect(keyMoments(events, nameOf, codeOf)).toEqual([
      { minute: "12'", tag: 'GOAL', text: 'Merino (NOR)', teamId: 'h' },
      { minute: "30'", tag: 'YELLOW', text: 'Haaland (MCI)', teamId: 'a' },
      { minute: "41'", tag: 'RED', text: 'Haaland (MCI)', teamId: 'a' },
      { minute: "44'", tag: 'INJURY', text: 'Walton (NOR)', teamId: 'h' },
      { minute: "45+2'", tag: 'SUB', text: 'Merino on for Walton (NOR)', teamId: 'h' },
    ]);
  });

  it('marks a goal that follows a penalty foul', () => {
    const events = [
      ev({ action: 'foul', outcome: 'penalty', teamId: 'a' }),
      ev({ action: 'shot', outcome: 'goal' }),
      ev({ action: 'shot', outcome: 'goal', minute: 50 }),
    ];
    expect(isPenaltyGoal(events, 1)).toBe(true);
    expect(isPenaltyGoal(events, 2)).toBe(false);
    expect(keyMoments(events, nameOf, codeOf)[0]!.text).toBe('Merino (NOR) pen');
  });
});
