/** Difficulty presets: how much the user has to spend, in tenths of £m (our own valuations). */
export type BudgetPreset = 'underdog' | 'standard' | 'big_spender';

export const BUDGET_PRESETS: Record<
  BudgetPreset,
  { label: string; budget: number; blurb: string }
> = {
  underdog: { label: 'Underdog', budget: 1500, blurb: 'Hard. Stars are out of reach.' },
  standard: { label: 'Standard', budget: 2750, blurb: 'The intended balance.' },
  big_spender: { label: 'Big spender', budget: 4000, blurb: 'Easy. Room for several stars.' },
};

export const BUDGET_PRESET_ORDER: BudgetPreset[] = ['underdog', 'standard', 'big_spender'];
export const DEFAULT_BUDGET_PRESET: BudgetPreset = 'standard';

export const isBudgetPreset = (value: unknown): value is BudgetPreset =>
  typeof value === 'string' && value in BUDGET_PRESETS;

/** A saved value, or Standard for anything missing or unknown (saves from before presets). */
export const parseBudgetPreset = (value: unknown): BudgetPreset =>
  isBudgetPreset(value) ? value : DEFAULT_BUDGET_PRESET;

export const budgetOf = (preset: BudgetPreset): number => BUDGET_PRESETS[preset].budget;
export const presetLabel = (preset: BudgetPreset): string => BUDGET_PRESETS[preset].label;
