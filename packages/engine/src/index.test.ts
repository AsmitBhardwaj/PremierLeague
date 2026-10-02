import { describe, expect, it } from 'vitest';
import { simulateMatch, type Team } from './index';

const team = (id: string): Team => ({
  id,
  name: id,
  players: [{ id: `${id}-1`, name: 'Player', position: 'FWD', rating: 70 }],
  tactic: { formation: '4-4-2', pressing: 50, directness: 50 },
});

describe('simulateMatch', () => {
  it('is deterministic for a given seed and score matches goal events', () => {
    const a = simulateMatch({ home: team('h'), away: team('a'), seed: 42 });
    const b = simulateMatch({ home: team('h'), away: team('a'), seed: 42 });
    expect(a).toEqual(b);
    const goals = a.events.filter((e) => e.type === 'goal').length;
    expect(goals).toBe(a.score.home + a.score.away);
  });
});
