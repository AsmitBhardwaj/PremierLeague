import type { MatchEvent, PlayerMatchRating } from '@pl/engine';
import { isPenaltyGoal } from './moments';
import { formatClock } from './timeline';

/** Highest engine rating first; ties go to the player with more goal involvements, then by name. */
export function rankPlayers(ratings: readonly PlayerMatchRating[]): PlayerMatchRating[] {
  return [...ratings].sort(
    (a, b) =>
      b.rating - a.rating ||
      b.goals + b.assists - (a.goals + a.assists) ||
      a.name.localeCompare(b.name) ||
      a.playerId.localeCompare(b.playerId),
  );
}

export function playerOfTheMatch(
  ratings: readonly PlayerMatchRating[],
): PlayerMatchRating | undefined {
  return rankPlayers(ratings)[0];
}

export interface ScorerLine {
  name: string;
  /** "12'" or "45+2'". */
  minute: string;
  pen: boolean;
  /** The engine records no own goals today; kept so the screen can show "og" if it ever does. */
  og: boolean;
}

/** Goals for one team, in match order, with penalties marked. */
export function goalScorers(
  events: readonly MatchEvent[],
  teamId: string,
  nameOf: (playerId: string) => string,
): ScorerLine[] {
  const lines: ScorerLine[] = [];
  events.forEach((event, index) => {
    if (event.action !== 'shot' || event.outcome !== 'goal' || event.teamId !== teamId) return;
    lines.push({
      name: event.playerId ? nameOf(event.playerId) : 'Unknown',
      minute: formatClock(event),
      pen: isPenaltyGoal(events, index),
      og: false,
    });
  });
  return lines;
}

/** Red cards for one team, in match order. */
export function redCardLines(
  events: readonly MatchEvent[],
  teamId: string,
  nameOf: (playerId: string) => string,
): { name: string; minute: string }[] {
  return events
    .filter((e) => e.action === 'card' && e.outcome === 'red_card' && e.teamId === teamId)
    .map((e) => ({ name: e.playerId ? nameOf(e.playerId) : 'Unknown', minute: formatClock(e) }));
}

export type TagKind = 'goal' | 'assist' | 'yc' | 'rc' | 'inj' | 'on' | 'off';

export interface PlayerTag {
  kind: TagKind;
  /** The chip text: "GOAL", "ASSIST ×2", "YC", "RC", "INJ", "ON 67'", "OFF 67'". */
  label: string;
}

const times = (label: string, count: number): string => (count > 1 ? `${label} ×${count}` : label);

/** One chip per fact about a player's match, never run together. */
export function playerTags(rating: PlayerMatchRating, events: readonly MatchEvent[]): PlayerTag[] {
  const tags: PlayerTag[] = [];
  if (rating.goals > 0) tags.push({ kind: 'goal', label: times('GOAL', rating.goals) });
  if (rating.assists > 0) tags.push({ kind: 'assist', label: times('ASSIST', rating.assists) });
  if (rating.yellowCards > 0) tags.push({ kind: 'yc', label: times('YC', rating.yellowCards) });
  if (rating.redCard) tags.push({ kind: 'rc', label: 'RC' });
  if (events.some((e) => e.action === 'injury' && e.playerId === rating.playerId)) {
    tags.push({ kind: 'inj', label: 'INJ' });
  }
  const on = events.find((e) => e.action === 'substitution' && e.playerId === rating.playerId);
  if (on) tags.push({ kind: 'on', label: `ON ${formatClock(on)}` });
  const off = events.find((e) => e.action === 'substitution' && e.offPlayerId === rating.playerId);
  if (off) tags.push({ kind: 'off', label: `OFF ${formatClock(off)}` });
  return tags;
}

const plural = (n: number, word: string): string => `${n} ${word}${n === 1 ? '' : 's'}`;

/** One line on what the player of the match did, from his own rating line only. */
export function contributionLine(
  rating: PlayerMatchRating,
  position: string,
  cleanSheet: boolean,
): string {
  if (rating.goals > 0) {
    return rating.assists > 0
      ? `${plural(rating.goals, 'goal')} and ${plural(rating.assists, 'assist')}`
      : plural(rating.goals, 'goal');
  }
  if (rating.assists > 0) return plural(rating.assists, 'assist');
  if (position === 'GK' && rating.saves > 0) {
    return cleanSheet
      ? `${plural(rating.saves, 'save')} in a clean sheet`
      : plural(rating.saves, 'save');
  }
  if (cleanSheet && (position === 'GK' || position === 'DEF')) return 'Anchored a clean sheet';
  if (rating.shots >= 3) return `${plural(rating.shots, 'shot')} on the day`;
  return 'Highest-rated player on the pitch';
}

/** Which side leads a stat (the larger number); null when level. */
export const statLeader = (home: number, away: number): 'home' | 'away' | null =>
  home > away ? 'home' : away > home ? 'away' : null;
