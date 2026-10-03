import type { MatchEvent, Player, Point, Side, Team } from '@pl/engine';

/** The parts of a team the renderer needs. A full engine `Team` satisfies it. */
export type LineupTeam = Pick<Team, 'id' | 'name' | 'formation'> & {
  players: Pick<Player, 'id' | 'name' | 'position'>[];
};

export type PlaybackMode = 'highlights' | 'commentary' | 'instant';

/** A full match plays back in at most 20 seconds: 10 per half, half-time pause excluded. */
export const HALF_BUDGET_MS = 10_000;
export const MATCH_BUDGET_MS = HALF_BUDGET_MS * 2;
/** Shots at or above this xG are "big chances" (about the top quarter of shots). */
export const BIG_CHANCE_XG = 0.17;
/** Animated moments never take more than this share of a half's budget. */
const ANIMATED_SHARE = 0.7;
/** A goal is added to the score this far (0-1) through its animation, as the ball arrives. */
const GOAL_REVEAL = 0.55;

export type EntryKind =
  | 'goal'
  | 'big_chance'
  | 'shot'
  | 'card'
  | 'injury'
  | 'substitution'
  | 'tactic_change'
  | 'kickoff'
  | 'half_time'
  | 'full_time'
  | 'foul'
  | 'corner'
  | 'play';

/** Moments that animate in highlights mode, with their ideal duration before budget scaling. */
const HOLD_MS: Partial<Record<EntryKind, number>> = {
  goal: 1800,
  big_chance: 900,
  shot: 450,
  card: 1000,
  injury: 900,
  substitution: 800,
};

export const isGoal = (event: MatchEvent): boolean =>
  event.action === 'shot' && event.outcome === 'goal';

export function classify(event: MatchEvent): EntryKind {
  switch (event.action) {
    case 'shot':
      if (event.outcome === 'goal') return 'goal';
      return (event.xg ?? 0) >= BIG_CHANCE_XG ? 'big_chance' : 'shot';
    case 'card':
    case 'injury':
    case 'substitution':
    case 'tactic_change':
    case 'kickoff':
    case 'half_time':
    case 'full_time':
    case 'foul':
    case 'corner':
      return event.action;
    default:
      return 'play';
  }
}

/** Passes, dribbles and long balls only advance the clock; everything else gets a feed line. */
export const isFeedKind = (kind: EntryKind): boolean => kind !== 'play';
export const isAnimatedKind = (kind: EntryKind): boolean => (HOLD_MS[kind] ?? 0) > 0;

export interface ScheduleEntry {
  event: MatchEvent;
  kind: EntryKind;
  /** When the event is reached (ms from the start of this half's playback). */
  startMs: number;
  /** How long the clock is held while the moment animates; 0 for compressed events. */
  holdMs: number;
  /** When the event becomes visible in the score and feed. */
  revealMs: number;
}

export interface Schedule {
  entries: ScheduleEntry[];
  totalMs: number;
  budgetMs: number;
}

/**
 * Map a half's events onto a playback clock. Animated moments hold the clock; everything else is
 * compressed into clock advance so the half always lasts exactly `budgetMs`.
 */
export function buildSchedule(
  events: readonly MatchEvent[],
  budgetMs: number = HALF_BUDGET_MS,
): Schedule {
  if (!events.length) return { entries: [], totalMs: 0, budgetMs };
  const kinds = events.map(classify);
  const holds = kinds.map((kind) => HOLD_MS[kind] ?? 0);
  const holdTotal = holds.reduce((sum, hold) => sum + hold, 0);
  const scale = holdTotal > 0 ? Math.min(1, (ANIMATED_SHARE * budgetMs) / holdTotal) : 1;
  const firstElapsed = events[0]!.elapsed;
  const span = events.at(-1)!.elapsed - firstElapsed;
  const rate = span > 0 ? (budgetMs - holdTotal * scale) / span : 0;

  const entries: ScheduleEntry[] = [];
  let cursor = 0;
  let previous = firstElapsed;
  events.forEach((event, index) => {
    cursor += Math.max(0, event.elapsed - previous) * rate;
    previous = event.elapsed;
    const holdMs = holds[index]! * scale;
    const revealMs = cursor + (kinds[index] === 'goal' ? holdMs * GOAL_REVEAL : 0);
    entries.push({ event, kind: kinds[index]!, startMs: cursor, holdMs, revealMs });
    cursor += holdMs;
  });
  return { entries, totalMs: cursor, budgetMs };
}

export interface PlaybackFrame {
  /** Number of entries visible in the score and feed. */
  revealed: number;
  /** Index of the latest entry reached (-1 before the first). */
  index: number;
  /** The animating moment, if the clock is currently held on one. */
  hold: { entry: ScheduleEntry; progress: number } | null;
}

export function frameAt(schedule: Schedule, timeMs: number): PlaybackFrame {
  const { entries } = schedule;
  let low = 0;
  let high = entries.length;
  while (low < high) {
    const mid = (low + high) >> 1;
    if (entries[mid]!.startMs <= timeMs) low = mid + 1;
    else high = mid;
  }
  const index = low - 1;
  low = 0;
  high = entries.length;
  while (low < high) {
    const mid = (low + high) >> 1;
    if (entries[mid]!.revealMs <= timeMs) low = mid + 1;
    else high = mid;
  }
  const revealed = low;
  const current = index >= 0 ? entries[index]! : null;
  const hold =
    current && current.holdMs > 0 && timeMs < current.startMs + current.holdMs
      ? { entry: current, progress: (timeMs - current.startMs) / current.holdMs }
      : null;
  return { revealed, index, hold };
}

/** The score, counted purely from goal events in the timeline. */
export function scoreAt(
  events: readonly MatchEvent[],
  homeTeamId: string,
): { home: number; away: number } {
  const score = { home: 0, away: 0 };
  for (const event of events) {
    if (!isGoal(event)) continue;
    if (event.teamId === homeTeamId) score.home++;
    else score.away++;
  }
  return score;
}

export function formatClock(event: MatchEvent | undefined): string {
  if (!event) return "0'";
  return event.addedTime > 0 ? `${event.minute}+${event.addedTime}'` : `${event.minute}'`;
}

export interface Banner {
  tone: 'goal' | 'chance' | 'yellow' | 'red' | 'injury' | 'substitution';
  title: string;
  text: string;
}

/** Event banners. Signal red is reserved for goal moments (and LIVE) per the design system. */
export function bannerFor(entry: ScheduleEntry): Banner | null {
  const { event } = entry;
  switch (entry.kind) {
    case 'goal':
      return { tone: 'goal', title: 'Goal', text: event.commentary };
    case 'big_chance':
      return { tone: 'chance', title: 'Big chance', text: event.commentary };
    case 'card':
      return event.outcome === 'red_card'
        ? { tone: 'red', title: 'Red card', text: event.commentary }
        : { tone: 'yellow', title: 'Yellow card', text: event.commentary };
    case 'injury':
      return { tone: 'injury', title: 'Injury', text: event.commentary };
    case 'substitution':
      return { tone: 'substitution', title: 'Substitution', text: event.commentary };
    default:
      return null;
  }
}

export interface ActivePlayer {
  playerId: string;
  /** Index into the starting XI; substitutes inherit the slot of the player they replace. */
  slot: number;
}

/** Who is on the pitch after `events`: starters, minus red cards and injuries, plus substitutes. */
export function activePlayers(team: LineupTeam, events: readonly MatchEvent[]): ActivePlayer[] {
  const slotOf = new Map<string, number>(team.players.map((player, slot) => [player.id, slot]));
  const active = new Set(team.players.map((player) => player.id));
  for (const event of events) {
    if (event.teamId !== team.id || !event.playerId) continue;
    if (event.action === 'card' && event.outcome === 'red_card') active.delete(event.playerId);
    if (event.action === 'injury') active.delete(event.playerId);
    if (event.action === 'substitution' && event.offPlayerId) {
      const slot = slotOf.get(event.offPlayerId);
      active.delete(event.offPlayerId);
      if (slot !== undefined) slotOf.set(event.playerId, slot);
      active.add(event.playerId);
    }
  }
  return [...active].map((playerId) => ({ playerId, slot: slotOf.get(playerId) ?? 0 }));
}

const LINE_X = { GK: 6, DEF: 25, MID: 45, FWD: 64 } as const;

/** Resting positions (metres) for a side's starting XI. Home attacks towards x = 105. */
export function formationAnchors(team: LineupTeam, side: Side): Point[] {
  const lines = {
    GK: [] as number[],
    DEF: [] as number[],
    MID: [] as number[],
    FWD: [] as number[],
  };
  team.players.forEach((player, slot) => lines[player.position].push(slot));
  const anchors = new Array<Point>(team.players.length);
  for (const position of ['GK', 'DEF', 'MID', 'FWD'] as const) {
    const slots = lines[position];
    slots.forEach((slot, index) => {
      const x = LINE_X[position];
      anchors[slot] = {
        x: side === 'home' ? x : 105 - x,
        y: (68 * (index + 1)) / (slots.length + 1),
      };
    });
  }
  return anchors;
}

const clamp = (value: number, low: number, high: number) => Math.min(high, Math.max(low, value));

/**
 * Cosmetic drift for players who are not part of the current event. They sit on their formation
 * anchor and shift with the ball and possession; they never imply an event of their own.
 */
export function offBallTarget(
  anchor: Point,
  side: Side,
  isKeeper: boolean,
  ball: Point,
  possession: Side | null,
): Point {
  const direction = side === 'home' ? 1 : -1;
  const follow = isKeeper ? 0.06 : 0.3;
  const push = possession === null ? 0 : possession === side ? 7 : -4;
  return {
    x: clamp(anchor.x + (ball.x - 52.5) * follow + (isKeeper ? 0 : push * direction), 2, 103),
    y: clamp(anchor.y + (ball.y - 34) * (isKeeper ? 0.1 : 0.18), 2, 66),
  };
}

/** Entries that raise an on-pitch banner, in order. */
export function bannerEntriesOf(schedule: Schedule): { entry: ScheduleEntry; index: number }[] {
  return schedule.entries
    .map((entry, index) => ({ entry, index }))
    .filter(({ entry }) => bannerFor(entry) !== null);
}

const BANNER_LINGER_MS = 700;

/** The banner to show at `timeMs`: the latest banner moment, until its hold plus a short linger ends. */
export function bannerAt(
  banners: readonly { entry: ScheduleEntry; index: number }[],
  timeMs: number,
): (Banner & { key: number }) | null {
  for (let i = banners.length - 1; i >= 0; i--) {
    const { entry, index } = banners[i]!;
    if (entry.startMs <= timeMs) {
      return timeMs <= entry.startMs + entry.holdMs + BANNER_LINGER_MS
        ? { ...bannerFor(entry)!, key: index }
        : null;
    }
  }
  return null;
}
