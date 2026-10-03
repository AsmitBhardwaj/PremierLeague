import type { Tactic } from '@pl/engine';
import { validateLineup, type Formation, type MarketPlayer } from '../../play/lib/squad';
import type { PlaybackMode } from './playback';

export const MATCH_STORAGE_KEY = '21st-club-phase-4';

export interface SavedMatchFlow {
  version: 1;
  starterIds: string[];
  formation: Formation;
  tactic: Tactic;
  mode: PlaybackMode;
}

const tactics: Tactic[] = ['balanced', 'high_press', 'counter', 'defensive'];
const modes: PlaybackMode[] = ['highlights', 'commentary', 'instant'];

export function parseSavedMatchFlow(
  raw: string | null,
  squad: readonly MarketPlayer[],
): SavedMatchFlow | null {
  if (!raw) return null;
  try {
    const value: unknown = JSON.parse(raw);
    if (typeof value !== 'object' || value === null || Array.isArray(value)) return null;
    const saved = value as Record<string, unknown>;
    if (saved.version !== 1 || !Array.isArray(saved.starterIds)) return null;
    const starterIds = saved.starterIds.filter((id): id is string => typeof id === 'string');
    const formation = saved.formation as Formation;
    if (validateLineup(squad, starterIds, formation).length) return null;
    if (!tactics.includes(saved.tactic as Tactic) || !modes.includes(saved.mode as PlaybackMode)) {
      return null;
    }
    return {
      version: 1,
      starterIds,
      formation,
      tactic: saved.tactic as Tactic,
      mode: saved.mode as PlaybackMode,
    };
  } catch {
    return null;
  }
}
