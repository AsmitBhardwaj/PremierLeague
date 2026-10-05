import { DEFAULT_BUDGET_PRESET, budgetOf, parseBudgetPreset, type BudgetPreset } from './budget';
import {
  FORMATIONS,
  validateFormation,
  validateSquad,
  type Formation,
  type MarketPlayer,
} from './squad';

export type Step = 'identity' | 'squad' | 'lineup' | 'prediction';
export type CrestShape = 'diamond' | 'shield' | 'roundel';

export interface ClubIdentity {
  name: string;
  shortName: string;
  stadium: string;
  primaryColor: string;
  secondaryColor: string;
  crestShape: CrestShape;
  /**
   * Difficulty chosen when founding the club. It travels with the identity into the season save
   * (which replays the January window under it); a save without it is a Standard season.
   */
  budget: BudgetPreset;
}

export interface SavedFlow {
  step: Step;
  identity: ClubIdentity;
  selectedIds: string[];
  formation: Formation;
  starterIds: string[];
}

export interface RestoredFlow extends SavedFlow {
  selected: MarketPlayer[];
}

export const STORAGE_KEY = '21st-club-phase-3';

export const emptyIdentity: ClubIdentity = {
  name: '',
  shortName: '',
  stadium: '',
  primaryColor: '#f7f8f8',
  secondaryColor: '#1c1d1f',
  crestShape: 'shield',
  budget: DEFAULT_BUDGET_PRESET,
};

const steps: Step[] = ['identity', 'squad', 'lineup', 'prediction'];
const crestShapes: CrestShape[] = ['diamond', 'shield', 'roundel'];
const colourPattern = /^#[0-9a-f]{6}$/i;

export function validateIdentity(identity: ClubIdentity): Record<string, string> {
  const errors: Record<string, string> = {};
  if (!identity.name.trim()) errors.name = 'Enter a club name.';
  if (!/^[A-Za-z0-9]{2,4}$/.test(identity.shortName.trim())) {
    errors.shortName = 'Use 2–4 letters or numbers.';
  }
  return errors;
}

/** An earlier build suggested this default; it is treated as "no name chosen". */
const RETIRED_DEFAULT_STADIUM = 'Final Third Ground';

/** The chosen stadium name, or "[Club name] Stadium" when none was typed. */
export function stadiumName(identity: Pick<ClubIdentity, 'name' | 'stadium'>): string {
  const typed = identity.stadium.trim();
  if (typed && typed !== RETIRED_DEFAULT_STADIUM) return typed;
  const club = identity.name.trim();
  return club ? `${club} Stadium` : 'Your stadium';
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const strings = (value: unknown): string[] | null =>
  Array.isArray(value) && value.every((item) => typeof item === 'string') ? value : null;

/** Parse saved client state defensively and recover to the earliest step that needs attention. */
export function parseSavedFlow(
  raw: string | null,
  market: readonly MarketPlayer[],
): RestoredFlow | null {
  if (!raw) return null;
  try {
    const value: unknown = JSON.parse(raw);
    if (!isRecord(value) || !isRecord(value.identity)) return null;
    const savedIdentity = value.identity;
    const crestShape = crestShapes.includes(savedIdentity.crestShape as CrestShape)
      ? (savedIdentity.crestShape as CrestShape)
      : emptyIdentity.crestShape;
    const identity: ClubIdentity = {
      name: typeof savedIdentity.name === 'string' ? savedIdentity.name : '',
      shortName: typeof savedIdentity.shortName === 'string' ? savedIdentity.shortName : '',
      stadium: typeof savedIdentity.stadium === 'string' ? savedIdentity.stadium : '',
      primaryColor:
        typeof savedIdentity.primaryColor === 'string' &&
        colourPattern.test(savedIdentity.primaryColor)
          ? savedIdentity.primaryColor
          : emptyIdentity.primaryColor,
      secondaryColor:
        typeof savedIdentity.secondaryColor === 'string' &&
        colourPattern.test(savedIdentity.secondaryColor)
          ? savedIdentity.secondaryColor
          : emptyIdentity.secondaryColor,
      crestShape,
      budget: parseBudgetPreset(savedIdentity.budget),
    };
    const selectedIds = strings(value.selectedIds);
    const starterIds = strings(value.starterIds);
    if (!selectedIds || !starterIds) return null;
    const requestedStep = steps.includes(value.step as Step) ? (value.step as Step) : 'identity';
    const formation =
      typeof value.formation === 'string' && value.formation in FORMATIONS
        ? (value.formation as Formation)
        : '4-4-2';
    const marketById = new Map(market.map((player) => [player.id, player]));
    const selected = [...new Set(selectedIds)]
      .map((id) => marketById.get(id))
      .filter((player): player is MarketPlayer => Boolean(player));
    const cleanStarterIds = [...new Set(starterIds)].filter((id) =>
      selected.some((player) => player.id === id),
    );
    const identityValid = Object.keys(validateIdentity(identity)).length === 0;
    const squadValid = validateSquad(selected, budgetOf(identity.budget)).length === 0;
    const lineupValid =
      squadValid && validateFormation(selected, cleanStarterIds, formation).length === 0;
    const step = !identityValid
      ? 'identity'
      : (requestedStep === 'lineup' || requestedStep === 'prediction') && !squadValid
        ? 'squad'
        : requestedStep === 'prediction' && !lineupValid
          ? 'lineup'
          : requestedStep;

    return {
      step,
      identity,
      selectedIds: selected.map((player) => player.id),
      selected,
      formation,
      starterIds: cleanStarterIds,
    };
  } catch {
    return null;
  }
}
