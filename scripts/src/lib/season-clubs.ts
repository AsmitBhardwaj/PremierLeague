import {
  rateAll,
  toRatingInputs,
  type FplBootstrapRaw,
  type FplElementSummaryRaw,
  type SeasonClubInput,
} from '@pl/engine';

/** Every club's whole squad (players whose FPL status is not `u`), in `buildClubs` order. */
export function buildSeasonClubs(
  bootstrap: FplBootstrapRaw,
  summaries: ReadonlyMap<number, FplElementSummaryRaw>,
): SeasonClubInput[] {
  const rated = rateAll(toRatingInputs(bootstrap, summaries));
  return bootstrap.teams.map((t) => ({
    id: t.short_name,
    name: t.name,
    players: rated
      .filter((r) => r.input.clubId === t.id && r.input.status !== 'u')
      .map((r) => r.player),
  }));
}
