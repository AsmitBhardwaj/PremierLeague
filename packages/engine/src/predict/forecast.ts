import { hashSeed } from '../season/hash';
import { Season, type SeasonSetup, type UserLineup } from '../season/season';
import type { Position } from '../types';
import type { ForecastSummary, PlayerForecast, TeamForecast } from './types';

export interface SeasonBatchForecast {
  seasons: number;
  /** Team averages per season from the full event engine (the preview itself uses the surrogate). */
  team: TeamForecast & { yellowCards: number; redCards: number };
  players: PlayerForecast[];
  topScorer: PlayerForecast | null;
  topAssister: PlayerForecast | null;
  /** Highest average rating among players who play most weeks. */
  starPlayer: PlayerForecast | null;
}

export interface ForecastOptions {
  seasons: number;
  seed: number;
  lineup: UserLineup;
  /** Appearances a season a player needs to be the star player. Default 15. */
  starMinAppearances?: number;
}

/** The part of a batch the season preview shows and the save keeps. */
export function summariseForecast(batch: SeasonBatchForecast): ForecastSummary {
  return {
    seasons: batch.seasons,
    yellowCards: batch.team.yellowCards,
    redCards: batch.team.redCards,
    topScorer: batch.topScorer,
    topAssister: batch.topAssister,
    starPlayer: batch.starPlayer,
  };
}

const better =
  (key: (p: PlayerForecast) => number) =>
  (a: PlayerForecast, b: PlayerForecast): number =>
    key(b) - key(a) || a.name.localeCompare(b.name) || a.playerId.localeCompare(b.playerId);

/**
 * Play the user's 38 matches with the full event engine, season dynamics on (fitness, form,
 * injuries and suspensions for the user's club), a handful of times, and average each player's
 * season. Opponents are always fresh. Deterministic for a given setup, seed and lineup.
 */
export function forecastUserSeasons(
  setup: SeasonSetup,
  options: ForecastOptions,
): SeasonBatchForecast {
  const userClubId = setup.userClubId;
  if (userClubId === undefined) throw new Error('a forecast needs a user club');
  const { seasons } = options;
  const team = {
    wins: 0,
    draws: 0,
    losses: 0,
    goalsFor: 0,
    goalsAgainst: 0,
    cleanSheets: 0,
    yellowCards: 0,
    redCards: 0,
  };
  const lines = new Map<
    string,
    {
      name: string;
      position: Position;
      goals: number;
      assists: number;
      rating: number;
      apps: number;
    }
  >();
  for (let i = 0; i < seasons; i++) {
    const season = new Season({
      ...setup,
      seed: hashSeed(options.seed, 'forecast', i),
      userMatchesOnly: true,
    });
    season.setUserLineup(options.lineup);
    while (!season.finished) {
      season.playMatchday({
        onMatch: (fixture, result) => {
          const side = fixture.home === userClubId ? 'home' : 'away';
          const other = side === 'home' ? 'away' : 'home';
          const scored = result.score[side];
          const conceded = result.score[other];
          team.goalsFor += scored;
          team.goalsAgainst += conceded;
          if (conceded === 0) team.cleanSheets++;
          if (scored > conceded) team.wins++;
          else if (scored === conceded) team.draws++;
          else team.losses++;
          team.yellowCards += result.stats[side].yellowCards;
          team.redCards += result.stats[side].redCards;
        },
      });
    }
    for (const s of season.playerStats()) {
      if (s.clubId !== userClubId) continue;
      const line = lines.get(s.playerId) ?? {
        name: s.name,
        position: s.position,
        goals: 0,
        assists: 0,
        rating: 0,
        apps: 0,
      };
      line.goals += s.goals;
      line.assists += s.assists;
      line.rating += s.ratingSum;
      line.apps += s.appearances;
      lines.set(s.playerId, line);
    }
  }
  const players: PlayerForecast[] = [...lines].map(([playerId, l]) => ({
    playerId,
    name: l.name,
    position: l.position,
    goals: l.goals / seasons,
    assists: l.assists / seasons,
    averageRating: l.apps ? l.rating / l.apps : 0,
    appearances: l.apps / seasons,
  }));
  const minApps = options.starMinAppearances ?? 15;
  const regulars = players.filter((p) => p.appearances >= minApps);
  const mean = (n: number): number => n / seasons;
  return {
    seasons,
    team: {
      wins: mean(team.wins),
      draws: mean(team.draws),
      losses: mean(team.losses),
      goalsFor: mean(team.goalsFor),
      goalsAgainst: mean(team.goalsAgainst),
      cleanSheets: mean(team.cleanSheets),
      yellowCards: mean(team.yellowCards),
      redCards: mean(team.redCards),
    },
    players,
    topScorer: [...players].sort(better((p) => p.goals))[0] ?? null,
    topAssister: [...players].sort(better((p) => p.assists))[0] ?? null,
    starPlayer: [...regulars].sort(better((p) => p.averageRating))[0] ?? null,
  };
}
