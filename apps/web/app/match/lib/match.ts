import {
  Match,
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
import { buildRealClubTeam } from '../../play/lib/clubs';
import type { ClubIdentity } from '../../play/lib/persistence';
import {
  createPredictionTeam,
  validateLineup,
  type Formation,
  type MarketPlayer,
} from '../../play/lib/squad';
import { matchSeed, type Venue } from './seed';

export const USER_TEAM_ID = 'user-club';

export interface MatchPreparation {
  identity: ClubIdentity;
  squad: MarketPlayer[];
  starterIds: string[];
  formation: Formation;
  tactic: Tactic;
  opponentId: string;
  venue: Venue;
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

export function createUserMatchTeam(preparation: MatchPreparation): Team {
  const errors = validateLineup(preparation.squad, preparation.starterIds, preparation.formation);
  if (errors.length) throw new Error(errors.join(' '));
  return {
    ...createPredictionTeam(
      USER_TEAM_ID,
      preparation.identity.name,
      preparation.squad,
      preparation.starterIds,
      preparation.formation,
    ),
    tactic: preparation.tactic,
  };
}

/**
 * A real club for the engine's global squad picker: balanced tactic, no per-club adjustments.
 * IDs are prefixed because a signing can also appear for his real club, and Match requires unique
 * player IDs across both teams.
 */
export function createOpponentTeam(market: readonly MarketPlayer[], opponentId: string): Team {
  const team = buildRealClubTeam(market, opponentId);
  const prefix = (player: Player): Player => ({ ...player, id: `opponent:${player.id}` });
  return {
    ...team,
    id: `opponent:${opponentId}`,
    players: team.players.map(prefix),
    bench: team.bench?.map(prefix),
  };
}

export function createMatchInput(
  preparation: MatchPreparation,
  market: readonly MarketPlayer[],
  playCounter: number,
): MatchInput {
  const user = createUserMatchTeam(preparation);
  const opponent = createOpponentTeam(market, preparation.opponentId);
  return {
    home: preparation.venue === 'home' ? user : opponent,
    away: preparation.venue === 'home' ? opponent : user,
    seed: matchSeed(
      preparation.identity.name,
      preparation.opponentId,
      preparation.venue,
      playCounter,
    ),
  };
}

export function validateSubstitution(
  team: Team,
  side: Side,
  snapshot: MatchSnapshot,
  substitution: PendingSubstitution,
  pending: readonly PendingSubstitution[] = [],
): string | null {
  if (snapshot.period !== 'half_time') return 'Substitutions can only be confirmed at half-time.';
  if (snapshot.substitutionsUsed[side] + pending.length >= TUNING.maxSubstitutions) {
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

  constructor(
    readonly input: MatchInput,
    readonly userSide: Side,
  ) {
    this.match = new Match(input);
  }

  get userTeam(): Team {
    return this.input[this.userSide];
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
    substitutions.forEach((substitution, index) => {
      const error = validateSubstitution(
        this.userTeam,
        this.userSide,
        snapshot,
        substitution,
        substitutions.slice(0, index),
      );
      if (error) throw new Error(error);
    });
    this.match.setTactic(this.userSide, tactic);
    for (const substitution of substitutions) {
      if (!this.match.substitute(this.userSide, substitution.off, substitution.on)) {
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
