import type { Position } from '@pl/engine';
import { FORMATIONS, validateFormation, type Formation, type MarketPlayer } from './squad';

export type PitchSlots = Record<Position, number[][]>;

/** Percentage coordinates (x, y) on a portrait pitch, GK at the bottom and forwards at the top. */
export const pitchPositions = Object.fromEntries(
  (Object.keys(FORMATIONS) as Formation[]).map((formation) => {
    const shape = FORMATIONS[formation];
    const line = (count: number, y: number) =>
      Array.from({ length: count }, (_, index) => [((index + 1) * 100) / (count + 1), y]);
    return [
      formation,
      {
        GK: [[50, 91]],
        DEF: line(shape.DEF, 68),
        MID: line(shape.MID, 42),
        FWD: line(shape.FWD, 16),
      },
    ];
  }),
) as Record<Formation, PitchSlots>;

export const startersOf = (
  squad: readonly MarketPlayer[],
  starterIds: readonly string[],
): MarketPlayer[] =>
  starterIds
    .map((id) => squad.find((player) => player.id === id))
    .filter(Boolean) as MarketPlayer[];

export const benchOf = (
  squad: readonly MarketPlayer[],
  starterIds: readonly string[],
): MarketPlayer[] => {
  const starterSet = new Set(starterIds);
  return squad.filter((player) => !starterSet.has(player.id));
};

export type SwapResult =
  { ok: true; starterIds: string[]; message: string } | { ok: false; message: string };

/**
 * Swap a starter for a bench player. Only same-position swaps are allowed, which keeps exactly one
 * goalkeeper and the selected formation intact.
 */
export function swapStarter(
  squad: readonly MarketPlayer[],
  starterIds: readonly string[],
  formation: Formation,
  starterId: string | null,
  substituteId: string,
): SwapResult {
  if (!starterId) return { ok: false, message: 'Select a starter on the pitch first.' };
  const starter = squad.find((player) => player.id === starterId);
  const substitute = squad.find((player) => player.id === substituteId);
  if (!starter || !substitute || !starterIds.includes(starter.id)) {
    return { ok: false, message: 'Choose a starter on the pitch to replace.' };
  }
  if (starterIds.includes(substitute.id)) {
    return { ok: false, message: `${substitute.name} is already in the starting XI.` };
  }
  if (starter.position !== substitute.position) {
    return {
      ok: false,
      message: `${substitute.name} cannot replace ${starter.name}: swaps must preserve the ${formation} shape.`,
    };
  }
  const next = starterIds.map((id) => (id === starter.id ? substitute.id : id));
  if (validateFormation(squad, next, formation).length > 0) {
    return { ok: false, message: 'That swap would make the starting XI invalid.' };
  }
  return { ok: true, starterIds: next, message: `${substitute.name} replaces ${starter.name}.` };
}
