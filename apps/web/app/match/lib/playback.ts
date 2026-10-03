import { PITCH_LENGTH, PITCH_WIDTH, type MatchEvent, type Point } from '@pl/engine';

export type PlaybackMode = 'highlights' | 'commentary' | 'instant';

export const HALF_PLAYBACK_MS = 8_000;
export const COMMENTARY_PLAYBACK_MS = 6_000;

export const IMPORTANT_ACTIONS = new Set([
  'shot',
  'card',
  'substitution',
  'injury',
  'tactic_change',
  'half_time',
  'full_time',
]);

export function toPitchPercent(point: Point): Point {
  return {
    x: Math.min(100, Math.max(0, (point.x / PITCH_LENGTH) * 100)),
    y: Math.min(100, Math.max(0, (point.y / PITCH_WIDTH) * 100)),
  };
}

export function orderTimeline(events: readonly MatchEvent[]): MatchEvent[] {
  return events
    .map((event, index) => ({ event, index }))
    .sort((a, b) => a.event.elapsed - b.event.elapsed || a.index - b.index)
    .map(({ event }) => event);
}

export function playbackDuration(mode: PlaybackMode, reducedMotion: boolean): number {
  if (mode === 'instant' || reducedMotion) return 0;
  return mode === 'commentary' ? COMMENTARY_PLAYBACK_MS : HALF_PLAYBACK_MS;
}

export function timelineIndexAt(
  events: readonly MatchEvent[],
  elapsedMs: number,
  durationMs: number,
): number {
  if (!events.length) return -1;
  if (durationMs <= 0 || elapsedMs >= durationMs) return events.length - 1;
  const ordered = orderTimeline(events);
  const start = ordered[0]!.elapsed;
  const end = ordered.at(-1)!.elapsed;
  if (end === start) return ordered.length - 1;
  const matchElapsed = start + (Math.max(0, elapsedMs) / durationMs) * (end - start);
  let index = 0;
  while (index + 1 < ordered.length && ordered[index + 1]!.elapsed <= matchElapsed) index++;
  return index;
}

export function formatMatchClock(event: MatchEvent | undefined): string {
  if (!event) return "0'";
  return event.addedTime > 0 ? `${event.minute}+${event.addedTime}'` : `${event.minute}'`;
}

export function visiblePlayerLocations(
  events: readonly MatchEvent[],
  index: number,
): Map<string, { teamId: string; point: Point }> {
  const locations = new Map<string, { teamId: string; point: Point }>();
  for (const event of events.slice(0, index + 1)) {
    if (event.playerId && event.teamId) {
      locations.set(event.playerId, { teamId: event.teamId, point: event.end });
    }
  }
  return locations;
}

export function isImportantEvent(event: MatchEvent): boolean {
  return IMPORTANT_ACTIONS.has(event.action) || event.outcome === 'goal';
}
