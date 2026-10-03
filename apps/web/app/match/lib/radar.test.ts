import { describe, expect, it } from 'vitest';
import { RATING_LABELS, radarAxes } from './radar';
import { market } from './fixtures';

describe('radarAxes', () => {
  it('gives outfield players six axes that are direct engine ratings', () => {
    const forward = market.find((player) => player.position === 'FWD')!;
    const axes = radarAxes(forward);
    expect(axes.map((axis) => axis.label)).toEqual([
      'Pace',
      'Shooting',
      'Passing',
      'Dribbling',
      'Tackling',
      'Positioning',
    ]);
    for (const axis of axes) expect(axis.value).toBe(forward.ratings[axis.key]);
  });

  it('swaps Shooting for Goalkeeping on goalkeepers', () => {
    const keeper = market.find((player) => player.position === 'GK')!;
    const axes = radarAxes(keeper);
    expect(axes).toHaveLength(6);
    expect(axes.map((axis) => axis.label)).toContain('Goalkeeping');
    expect(axes.map((axis) => axis.label)).not.toContain('Shooting');
  });

  it('lists all seven ratings for the stat bars', () => {
    expect(RATING_LABELS).toHaveLength(7);
  });
});
