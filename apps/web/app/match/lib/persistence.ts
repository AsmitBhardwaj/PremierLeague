import type { Tactic } from '@pl/engine';
import { validateLineup, type Formation, type MarketPlayer } from '../../play/lib/squad';
import type { PlaybackMode } from './timeline';
import type { Venue } from './seed';

/** Bumped from phase-4 v1: older saves are ignored. */
export const MATCH_STORAGE_KEY = '21st-club-phase-4-v2';

export interface SavedMatchFlow {
  version: 2;
  starterIds: string[];
  formation: Formation;
  tactic: Tactic;
  mode: PlaybackMode | null;
  opponentId: string;
  venue: Venue;
  /** Incremented for every kick-off so a refresh never replays a seed by accident. */
  playCounter: number;
}

const tactics: Tactic[] = ['balanced', 'high_press', 'counter', 'defensive'];
const modes: PlaybackMode[] = ['highlights', 'commentary', 'instant'];

export function parseSavedMatchFlow(
  raw: string | null,
  squad: readonly MarketPlayer[],
  opponentIds: readonly string[],
): SavedMatchFlow | null {
  if (!raw) return null;
  try {
    const value: unknown = JSON.parse(raw);
    if (typeof value !== 'object' || value === null || Array.isArray(value)) return null;
    const saved = value as Record<string, unknown>;
    if (saved.version !== 2 || !Array.isArray(saved.starterIds)) return null;
    const starterIds = saved.starterIds.filter((id): id is string => typeof id === 'string');
    const formation = saved.formation as Formation;
    if (validateLineup(squad, starterIds, formation).length) return null;
    if (!tactics.includes(saved.tactic as Tactic)) return null;
    if (typeof saved.opponentId !== 'string' || !opponentIds.includes(saved.opponentId)) {
      return null;
    }
    if (saved.venue !== 'home' && saved.venue !== 'away') return null;
    const playCounter = saved.playCounter;
    if (typeof playCounter !== 'number' || !Number.isInteger(playCounter) || playCounter < 0) {
      return null;
    }
    return {
      version: 2,
      starterIds,
      formation,
      tactic: saved.tactic as Tactic,
      mode: modes.includes(saved.mode as PlaybackMode) ? (saved.mode as PlaybackMode) : null,
      opponentId: saved.opponentId,
      venue: saved.venue,
      playCounter,
    };
  } catch {
    return null;
  }
}
