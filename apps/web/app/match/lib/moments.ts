import type { MatchEvent } from '@pl/engine';
import { formatClock } from './timeline';

export type MomentTag = 'GOAL' | 'YELLOW' | 'RED' | 'INJURY' | 'SUB';

export interface Moment {
  /** "23'" or "45+2'". */
  minute: string;
  tag: MomentTag;
  /** Short text with the club code, e.g. "Merino (NOR)". */
  text: string;
  teamId: string | null;
}

/** A goal scored from the spot: the shot follows a foul the engine marked as a penalty. */
export function isPenaltyGoal(events: readonly MatchEvent[], index: number): boolean {
  const event = events[index];
  if (!event || event.action !== 'shot' || event.outcome !== 'goal') return false;
  for (let i = index - 1; i >= 0 && index - i <= 3; i--) {
    const previous = events[i]!;
    if (previous.action === 'foul' && previous.outcome === 'penalty') return true;
    if (previous.action === 'shot') return false;
  }
  return false;
}

/**
 * The first-half moments a manager cares about, in order: goals, cards, injuries and
 * substitutions. Everything comes from the event timeline.
 */
export function keyMoments(
  events: readonly MatchEvent[],
  nameOf: (playerId: string) => string,
  codeOf: (teamId: string | null) => string,
): Moment[] {
  const moments: Moment[] = [];
  events.forEach((event, index) => {
    const who = event.playerId ? nameOf(event.playerId) : 'Unknown';
    const code = codeOf(event.teamId);
    const minute = formatClock(event);
    if (event.action === 'shot' && event.outcome === 'goal') {
      const pen = isPenaltyGoal(events, index) ? ' pen' : '';
      moments.push({ minute, tag: 'GOAL', text: `${who} (${code})${pen}`, teamId: event.teamId });
    } else if (event.action === 'card') {
      moments.push({
        minute,
        tag: event.outcome === 'red_card' ? 'RED' : 'YELLOW',
        text: `${who} (${code})`,
        teamId: event.teamId,
      });
    } else if (event.action === 'injury') {
      moments.push({ minute, tag: 'INJURY', text: `${who} (${code})`, teamId: event.teamId });
    } else if (event.action === 'substitution') {
      const off = event.offPlayerId ? nameOf(event.offPlayerId) : 'a team-mate';
      moments.push({
        minute,
        tag: 'SUB',
        text: `${who} on for ${off} (${code})`,
        teamId: event.teamId,
      });
    }
  });
  return moments;
}
