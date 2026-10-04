import { createRng, predictSeason, simulateSurrogateMatch, teamProfile } from '@pl/engine';
import { describe, expect, it } from 'vitest';
import { buildRealClubTeam, computeReplacedClub, listOpponents } from '../../play/lib/clubs';
import { fixtureOdds } from './odds';
import { createUserMatchTeam } from './match';
import { market, testPreparation } from './fixtures';

const replaced = computeReplacedClub(market);
const opponents = listOpponents(market, replaced.id);
const user = createUserMatchTeam(testPreparation());

describe('fixtureOdds', () => {
  it('returns probabilities that sum to one and favour the home side', () => {
    const home = fixtureOdds(user, buildRealClubTeam(market, 'ARS'), 'home');
    const away = fixtureOdds(user, buildRealClubTeam(market, 'ARS'), 'away');
    expect(home.win + home.draw + home.loss).toBeCloseTo(1, 10);
    expect(home.win).toBeGreaterThan(away.win);
    expect(home.expectedPoints).toBeCloseTo(3 * home.win + home.draw, 12);
  });

  it('matches the surrogate sampler predictSeason uses (300k draws per fixture, within 0.01)', () => {
    const rng = createRng(2026);
    const own = teamProfile(user);
    for (const club of opponents) {
      const opponent = buildRealClubTeam(market, club.id);
      const other = teamProfile(opponent);
      for (const venue of ['home', 'away'] as const) {
        let points = 0;
        const draws = 300_000;
        for (let index = 0; index < draws; index++) {
          const match =
            venue === 'home'
              ? simulateSurrogateMatch(own, other, rng)
              : simulateSurrogateMatch(other, own, rng);
          const ours = venue === 'home' ? match.homeGoals : match.awayGoals;
          const theirs = venue === 'home' ? match.awayGoals : match.homeGoals;
          points += ours > theirs ? 3 : ours === theirs ? 1 : 0;
        }
        expect(
          Math.abs(fixtureOdds(user, opponent, venue).expectedPoints - points / draws),
        ).toBeLessThan(0.01);
      }
    }
  }, 120_000);

  it("agrees with predictSeason's per-opponent expected points", () => {
    const prediction = predictSeason(user, {
      seasons: 10_000,
      seed: 7,
      replacedClubId: replaced.id,
    });
    let signedTotal = 0;
    for (const entry of prediction.perOpponentExpectedPoints) {
      const opponent = buildRealClubTeam(market, entry.opponentId);
      const home = fixtureOdds(user, opponent, 'home').expectedPoints;
      const away = fixtureOdds(user, opponent, 'away').expectedPoints;
      // predictSeason averages 10,000 sampled seasons, so each figure carries ~0.012 of sampling
      // noise (1 sd); 0.05 is a four-sigma bound. The mean error across all 38 must be tight.
      expect(Math.abs(home - entry.home)).toBeLessThan(0.05);
      expect(Math.abs(away - entry.away)).toBeLessThan(0.05);
      signedTotal += home - entry.home + (away - entry.away);
    }
    expect(Math.abs(signedTotal / (2 * prediction.perOpponentExpectedPoints.length))).toBeLessThan(
      0.01,
    );
  });
});
