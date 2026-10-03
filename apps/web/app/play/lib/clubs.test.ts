import { describe, expect, it } from 'vitest';
import background from '../../../../../packages/engine/src/predict/data/season-background.json';
import players from '../data/players.json';
import { computeReplacedClub, listOpponents } from './clubs';
import type { MarketPlayer } from './squad';

const market = players as MarketPlayer[];

describe('replaced club', () => {
  it('is the weakest promoted club and agrees with the precomputed season background', () => {
    const replaced = computeReplacedClub(market);
    expect(replaced.id).toBe(background.defaultReplacedClubId);
  });

  it('leaves 19 distinct real opponents that all exist in the background', () => {
    const replaced = computeReplacedClub(market);
    const opponents = listOpponents(market, replaced.id);
    expect(opponents).toHaveLength(19);
    expect(opponents.some((club) => club.id === replaced.id)).toBe(false);
    const backgroundIds = new Set(
      background.replacements[replaced.id as keyof typeof background.replacements].clubs.map(
        (club) => club.id,
      ),
    );
    expect(new Set(opponents.map((club) => club.id))).toEqual(backgroundIds);
  });
});
