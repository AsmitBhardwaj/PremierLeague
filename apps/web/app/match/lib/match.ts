import {
  Match,
  pickSquad,
  simulateMatch,
  TUNING,
  type MatchEvent,
  type MatchInput,
  type MatchResult,
  type MatchSnapshot,
  type Player,
  type Side,
  type Tactic,
  type Team,
  type TeamStats,
} from '@pl/engine';
import type { ClubIdentity } from '../../play/lib/persistence';
import {
  createPredictionTeam,
  validateLineup,
  type Formation,
  type MarketPlayer,
} from '../../play/lib/squad';

export const MATCH_SEED_SALT = 0x21c104;
export const DEFAULT_OPPONENT = 'Arsenal';

export interface MatchPreparation {
  identity: ClubIdentity;
  squad: MarketPlayer[];
  starterIds: string[];
  formation: Formation;
  tactic: Tactic;
}

export interface MatchOdds {
  win: number;
  draw: number;
  loss: number;
  samples: number;
}

export interface PendingSubstitution {
  off: string;
  on: string;
}

export interface EventStats {
  home: TeamStats;
  away: TeamStats;
}

const emptyStats = (): TeamStats => ({
  possession: 0,
  shots: 0,
  shotsOnTarget: 0,
  xg: 0,
  fouls: 0,
  yellowCards: 0,
  redCards: 0,
  corners: 0,
  injuries: 0,
});

/** Stable FNV-1a hash. It is only used to choose a reproducible match seed. */
export function matchSeed(preparation: MatchPreparation, opponentId: string): number {
  const value = [
    preparation.identity.name,
    preparation.identity.shortName,
    preparation.formation,
    preparation.tactic,
    ...preparation.starterIds,
    opponentId,
  ].join('|');
  let hash = (0x811c9dc5 ^ MATCH_SEED_SALT) >>> 0;
  for (let index = 0; index < value.length; index++) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash | 0;
}

export function createUserMatchTeam(preparation: MatchPreparation): Team {
  const errors = validateLineup(preparation.squad, preparation.starterIds, preparation.formation);
  if (errors.length) throw new Error(errors.join(' '));
  return {
    ...createPredictionTeam(
      'user-club',
      preparation.identity.name,
      preparation.squad,
      preparation.starterIds,
      preparation.formation,
    ),
    tactic: preparation.tactic,
  };
}

/**
 * Build an opponent with the engine's global squad picker. IDs are side-scoped because a fantasy
 * signing can still appear for his real club and Match requires unique IDs across both teams.
 */
export function createOpponentTeam(
  market: readonly MarketPlayer[],
  clubName = DEFAULT_OPPONENT,
): Team {
  const eligible = market.filter((player) => player.clubName === clubName && player.status !== 'u');
  if (!eligible.length) throw new Error(`No eligible players found for ${clubName}.`);
  const clubId = eligible[0]!.clubShortName;
  const players: Player[] = eligible.map((player) => ({
    id: `opponent:${player.id}`,
    name: player.name,
    position: player.position,
    ratings: player.ratings,
  }));
  return pickSquad(`opponent:${clubId}`, clubName, players);
}

export function createMatchInput(
  preparation: MatchPreparation,
  market: readonly MarketPlayer[],
  opponentName = DEFAULT_OPPONENT,
): MatchInput {
  const away = createOpponentTeam(market, opponentName);
  return {
    home: createUserMatchTeam(preparation),
    away,
    seed: matchSeed(preparation, away.id),
  };
}

/** W/D/L guide from the full team-v-team engine, never from summed player stats. */
export function estimateMatchOdds(input: MatchInput, samples = 80): MatchOdds {
  let win = 0;
  let draw = 0;
  for (let index = 0; index < samples; index++) {
    const result = simulateMatch({ ...input, seed: input.seed + index + 1 });
    if (result.score.home > result.score.away) win++;
    else if (result.score.home === result.score.away) draw++;
  }
  return {
    win: win / samples,
    draw: draw / samples,
    loss: (samples - win - draw) / samples,
    samples,
  };
}

export function validateSubstitution(
  team: Team,
  snapshot: MatchSnapshot,
  substitution: PendingSubstitution,
  pending: readonly PendingSubstitution[] = [],
): string | null {
  if (snapshot.period !== 'half_time') return 'Substitutions can only be confirmed at half-time.';
  if (snapshot.substitutionsUsed.home + pending.length >= TUNING.maxSubstitutions) {
    return `Only ${TUNING.maxSubstitutions} substitutions are allowed.`;
  }
  if (substitution.off === substitution.on) return 'Choose two different players.';
  if (pending.some((item) => item.off === substitution.off || item.on === substitution.on)) {
    return 'A player can only be included in one pending substitution.';
  }
  const all = [...team.players, ...(team.bench ?? [])];
  const off = all.find((player) => player.id === substitution.off);
  const on = all.find((player) => player.id === substitution.on);
  if (!off || !on) return 'Both players must belong to your matchday squad.';
  const playerState = new Map(snapshot.players.map((player) => [player.playerId, player]));
  if (!playerState.get(off.id)?.onPitch) return `${off.name} is not available to come off.`;
  if (playerState.get(on.id)?.onPitch || playerState.get(on.id)?.sentOff) {
    return `${on.name} is not available from the bench.`;
  }
  if (off.position !== on.position) {
    return 'Choose a same-position replacement to preserve the selected formation.';
  }
  return null;
}

/** Owns the single engine Match instance; playback never receives a mutation method. */
export class MatchSession {
  private readonly match: Match;
  private readonly input: MatchInput;

  constructor(input: MatchInput) {
    this.input = input;
    this.match = new Match(input);
  }

  playFirstHalf(): MatchSnapshot {
    this.match.playFirstHalf();
    return this.match.snapshot();
  }

  snapshot(): MatchSnapshot {
    return this.match.snapshot();
  }

  continueSecondHalf(tactic: Tactic, substitutions: readonly PendingSubstitution[]): MatchResult {
    const snapshot = this.match.snapshot();
    for (const substitution of substitutions) {
      const error = validateSubstitution(
        this.input.home,
        snapshot,
        substitution,
        substitutions.slice(0, substitutions.indexOf(substitution)),
      );
      if (error) throw new Error(error);
    }
    this.match.setTactic('home', tactic);
    for (const substitution of substitutions) {
      if (!this.match.substitute('home', substitution.off, substitution.on)) {
        throw new Error('The engine rejected a pending substitution.');
      }
    }
    return this.match.playSecondHalf();
  }
}

export function statsFromEvents(
  events: readonly MatchEvent[],
  homeId: string,
  awayId: string,
): EventStats {
  const stats = { home: emptyStats(), away: emptyStats() };
  for (const event of events) {
    const side: Side | null =
      event.teamId === homeId ? 'home' : event.teamId === awayId ? 'away' : null;
    if (!side) continue;
    const current = stats[side];
    if (event.action === 'shot') {
      current.shots++;
      current.xg += event.xg ?? 0;
      if (event.outcome === 'goal' || event.outcome === 'saved') current.shotsOnTarget++;
    }
    if (event.action === 'foul') current.fouls++;
    if (event.action === 'corner') current.corners++;
    if (event.action === 'injury') current.injuries++;
    if (event.action === 'card' && event.outcome === 'yellow_card') current.yellowCards++;
    if (event.action === 'card' && event.outcome === 'red_card') current.redCards++;
  }
  stats.home.xg = Math.round(stats.home.xg * 100) / 100;
  stats.away.xg = Math.round(stats.away.xg * 100) / 100;
  return stats;
}
