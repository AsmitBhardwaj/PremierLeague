import { TUNING } from '../tuning';
import type { Player } from '../types';
import { SEASON } from './constants';
import { Career, type Decision, type Phase } from './career';
import { hashSeed } from './hash';
import type { SeasonSetup } from './season';
import type { TableRow } from './table';

/** Bump when season rules change in a way that alters outcomes for the same decisions. */
export const SEASON_RULES_VERSION = 1;

/**
 * Hash of everything that decides outcomes: the player data, the engine tuning and the season
 * rules. A save made under a different version cannot be replayed to the same season, so it is
 * refused rather than silently diverging.
 */
export function computeDataVersion(players: readonly Player[]): string {
  const parts: (string | number)[] = [
    SEASON_RULES_VERSION,
    JSON.stringify(TUNING),
    JSON.stringify(SEASON),
  ];
  for (const p of players) {
    const r = p.ratings;
    parts.push(
      `${p.id}:${p.position}:${r.passing},${r.dribbling},${r.shooting},${r.tackling},${r.positioning},${r.pace},${r.goalkeeping}`,
    );
  }
  return (hashSeed(...parts) >>> 0).toString(16).padStart(8, '0');
}

/** What is cheap to show without replaying; always rebuildable from the decisions. */
export interface CareerCache {
  round: number;
  phase: Phase;
  table: Pick<TableRow, 'clubId' | 'played' | 'points' | 'goalDifference'>[];
}

/**
 * One career slot, JSON only so it can move to a server unchanged. `identity` and `prediction` are
 * the caller's own JSON (club name and colours, the pre-season prediction).
 */
export interface CareerSave<Identity = unknown, Prediction = unknown> {
  version: 1;
  seed: number;
  dataVersion: string;
  identity: Identity;
  replacedClubId: string;
  /** The user's initial squad, as player ids. */
  squadIds: string[];
  prediction: Prediction;
  decisions: Decision[];
  cache: CareerCache;
}

export const cacheOf = (career: Career): CareerCache => ({
  round: career.round,
  phase: career.phase,
  table: career.season.table().map(({ clubId, played, points, goalDifference }) => ({
    clubId,
    played,
    points,
    goalDifference,
  })),
});

const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);
const isStrings = (v: unknown): v is string[] =>
  Array.isArray(v) && v.every((x) => typeof x === 'string');
const TACTICS = ['balanced', 'high_press', 'counter', 'defensive'];

export function isDecision(v: unknown): v is Decision {
  if (!isRecord(v)) return false;
  switch (v.type) {
    case 'lineup':
      return (
        typeof v.formation === 'string' &&
        isStrings(v.starters) &&
        v.starters.length === 11 &&
        TACTICS.includes(v.tactic as string)
      );
    case 'play': {
      if (v.halfTime === undefined) return true;
      const h = v.halfTime;
      if (!isRecord(h)) return false;
      if (h.tactic !== undefined && !TACTICS.includes(h.tactic as string)) return false;
      return (
        h.substitutions === undefined ||
        (Array.isArray(h.substitutions) &&
          h.substitutions.every(
            (s) => isRecord(s) && typeof s.off === 'string' && typeof s.on === 'string',
          ))
      );
    }
    case 'sim':
      return v.to === 'next' || v.to === 'january' || v.to === 'end';
    case 'transfer':
      return typeof v.out === 'string' && typeof v.in === 'string';
    case 'closeWindow':
      return true;
    default:
      return false;
  }
}

/** Structural check of untrusted JSON. Returns null for anything that is not a version-1 save. */
export function parseCareerSave(raw: unknown): CareerSave | null {
  if (!isRecord(raw) || raw.version !== 1) return null;
  if (typeof raw.seed !== 'number' || !Number.isInteger(raw.seed)) return null;
  if (typeof raw.dataVersion !== 'string' || typeof raw.replacedClubId !== 'string') return null;
  if (!isStrings(raw.squadIds) || !Array.isArray(raw.decisions)) return null;
  if (!raw.decisions.every(isDecision)) return null;
  if (!isRecord(raw.cache) || typeof raw.cache.round !== 'number') return null;
  return raw as unknown as CareerSave;
}

export type ReplayResult =
  | { ok: true; career: Career }
  | { ok: false; reason: 'data_version' | 'replay_failed' | 'cache_mismatch' };

/**
 * Rebuild a career from its save. Refuses a save made under different data, and a save whose
 * replay does not reproduce its own cached table (corruption or edited decisions).
 */
export function replayCareer(
  save: CareerSave,
  setup: SeasonSetup,
  currentDataVersion: string,
): ReplayResult {
  if (save.dataVersion !== currentDataVersion) return { ok: false, reason: 'data_version' };
  let career: Career;
  try {
    career = new Career(setup, save.decisions);
  } catch {
    return { ok: false, reason: 'replay_failed' };
  }
  const now = cacheOf(career);
  if (JSON.stringify(now) !== JSON.stringify(save.cache)) {
    return { ok: false, reason: 'cache_mismatch' };
  }
  return { ok: true, career };
}
