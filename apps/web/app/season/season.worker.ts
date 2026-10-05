/// <reference lib="webworker" />

import {
  Career,
  MAX_TRANSFERS,
  type Tactic,
  cacheOf,
  hashSeed,
  parseCareerSave,
  predictSeason,
  replayCareer,
  type CareerSave,
  type Decision,
  type SeasonPrediction,
} from '@pl/engine';
import playerData from '../play/data/players.json';
import { buildOpponentTeams, computeReplacedClub } from '../play/lib/clubs';
import { budgetOf, parseBudgetPreset } from '../play/lib/budget';
import type { ClubIdentity } from '../play/lib/persistence';
import { createPredictionTeam, squadCost, type MarketPlayer } from '../play/lib/squad';
import { runForecast } from '../play/lib/forecast';
import { fixtureOdds } from '../match/lib/odds';
import type {
  MatchFinish,
  MatchStart,
  NextFixture,
  SeasonMessage,
  SeasonResponse,
  SeasonView,
  TableEntry,
} from './lib/protocol';
import { USER_CLUB_ID, buildSetup, marketDataVersion } from './lib/setup';

declare const self: DedicatedWorkerGlobalScope;

const market = playerData as MarketPlayer[];
const PREDICTION_SEED = 2103;

interface Meta {
  identity: ClubIdentity;
  replacedClubId: string;
  squadIds: string[];
  prediction: SeasonPrediction;
  seed: number;
  dataVersion: string;
  /** Round of the last watched match whose result has been shown. */
  revealed: number;
}

let career: Career | null = null;
let meta: Meta | null = null;

const marketById = new Map(market.map((p) => [p.id, p]));
const squadOf = (ids: readonly string[]): MarketPlayer[] | null => {
  const squad = ids.map((id) => marketById.get(id));
  return squad.every(Boolean) ? (squad as MarketPlayer[]) : null;
};

const matchStartOf = (c: Career): MatchStart => {
  const { user } = c.inProgress!;
  return {
    home: user.home,
    away: user.away,
    userSide: user.userSide,
    events: user.snapshot.events.slice(),
    snapshot: { ...user.snapshot, events: [] },
    seed: hashSeed(c.season.seed, c.round, user.fixture.home, user.fixture.away) >>> 0,
    round: c.round,
  };
};

const finishOf = (c: Career): MatchFinish => {
  const w = c.lastWatched!;
  return {
    result: w.result,
    userSide: w.userSide,
    home: w.home,
    away: w.away,
    seed: hashSeed(c.season.seed, w.round, w.fixture.home, w.fixture.away) >>> 0,
    round: w.round,
  };
};

/** Where playback picks up after a refresh: never at a decision that is already logged. */
function buildResume(): SeasonView['resume'] {
  if (!career || !meta) return null;
  if (career.inProgress) return { kind: 'first_half', start: matchStartOf(career) };
  const watched = career.lastWatched;
  if (watched && watched.round === career.round - 1 && watched.round > meta.revealed) {
    return {
      kind: 'second_half',
      finish: finishOf(career),
      firstHalfEvents: watched.firstHalfEvents,
    };
  }
  return null;
}

/** How many matches each real player is out for, while the window is open. */
function outForMarket(): Record<string, number> {
  const out: Record<string, number> = {};
  if (!career || career.phase !== 'window') return out;
  for (const p of market) {
    const n = career.season.outFor(p.clubShortName, p.id);
    if (n > 0) out[p.id] = n;
  }
  return out;
}

function buildView(): SeasonView {
  if (!career || !meta) throw new Error('no season loaded');
  // Before the first matchday every club is level, so there is nothing to move from.
  const previous = career.round > 1 ? career.positionsAfter(career.round - 1) : null;
  const table: TableEntry[] = career.season.table().map((row, index) => ({
    ...row,
    previousPosition: previous?.get(row.clubId) ?? index + 1,
  }));
  const fixture = career.phase === 'matchday' ? career.nextFixture() : undefined;
  let next: NextFixture | null = null;
  if (fixture) {
    let odds: NextFixture['odds'];
    try {
      const o = fixtureOdds(
        career.season.userSelection(),
        career.season.opponentPreview(fixture.opponentId),
        fixture.venue,
      );
      odds = { win: o.win, draw: o.draw, loss: o.loss };
    } catch {
      odds = null;
    }
    next = { ...fixture, odds };
  }
  const results = career.season
    .matchRecords()
    .filter((r) => r.home === USER_CLUB_ID || r.away === USER_CLUB_ID);
  const save: CareerSave<ClubIdentity, SeasonPrediction> = {
    version: 2,
    seed: meta.seed,
    dataVersion: meta.dataVersion,
    identity: meta.identity,
    replacedClubId: meta.replacedClubId,
    squadIds: meta.squadIds,
    prediction: meta.prediction,
    decisions: career.decisions as Decision[],
    revealed: meta.revealed,
    cache: cacheOf(career),
  };
  return {
    round: career.round,
    phase: career.phase,
    table,
    next,
    squad: career.squadStates(),
    lineup: career.userLineup(),
    projection: career.projection(),
    awards: career.phase === 'finished' ? career.awards() : null,
    results,
    prediction: meta.prediction,
    identity: meta.identity,
    replacedClubId: meta.replacedClubId,
    squadIds: career.squad().map((p) => p.id),
    window: {
      transfersMade: career.transfersMade,
      maxTransfers: MAX_TRANSFERS,
      outFor: outForMarket(),
    },
    resume: buildResume(),
    save,
  };
}

function create(request: Extract<SeasonMessage, { kind: 'create' }>): void {
  const squad = squadOf(request.squadIds);
  if (!squad) throw new Error('The saved squad contains players that no longer exist.');
  const replaced = computeReplacedClub(market);
  const budget = budgetOf(request.identity.budget);
  if (squadCost(squad) > budget) throw new Error('That squad is over the chosen budget.');
  const setup = buildSetup(market, replaced.id, request.identity.name, squad, request.seed, budget);
  const next = new Career(setup);
  next.apply({
    type: 'lineup',
    formation: request.formation,
    starters: request.starterIds,
    tactic: 'balanced',
  });
  const team = predictSeason(
    createPredictionTeam(
      'user-club',
      request.identity.name,
      squad,
      request.starterIds,
      request.formation,
    ),
    {
      seasons: 10_000,
      seed: PREDICTION_SEED,
      replacedClubId: replaced.id,
      opponents: buildOpponentTeams(market, replaced.id, squad),
    },
  );
  // The same player and card forecast the season preview showed (deterministic), kept in the save.
  const prediction: SeasonPrediction = {
    ...team,
    forecast: runForecast(
      market,
      replaced.id,
      request.identity.name,
      squad,
      request.starterIds,
      request.formation,
    ),
  };
  career = next;
  meta = {
    identity: request.identity,
    replacedClubId: replaced.id,
    squadIds: request.squadIds,
    prediction,
    seed: request.seed,
    dataVersion: marketDataVersion(market),
    revealed: -1,
  };
}

function resume(raw: unknown): void {
  const save = parseCareerSave(raw);
  if (!save)
    throw Object.assign(new Error('The saved season is unreadable.'), { reason: 'corrupt' });
  const squad = squadOf(save.squadIds);
  if (!squad)
    throw Object.assign(new Error('The saved squad is unreadable.'), { reason: 'corrupt' });
  // A save from before budget presets has no `budget` and was played at Standard.
  const identity: ClubIdentity = {
    ...(save.identity as ClubIdentity),
    budget: parseBudgetPreset((save.identity as Partial<ClubIdentity>).budget),
  };
  const setup = buildSetup(
    market,
    save.replacedClubId,
    identity.name,
    squad,
    save.seed,
    budgetOf(identity.budget),
  );
  const result = replayCareer(save, setup, marketDataVersion(market));
  if (!result.ok) {
    throw Object.assign(
      new Error(
        result.reason === 'data_version'
          ? 'This season was saved with different player data and cannot be replayed.'
          : 'This saved season does not replay to the same table and was refused.',
      ),
      { reason: result.reason },
    );
  }
  career = result.career;
  meta = {
    identity,
    replacedClubId: save.replacedClubId,
    squadIds: save.squadIds,
    prediction: save.prediction as SeasonPrediction,
    seed: save.seed,
    dataVersion: save.dataVersion,
    revealed: save.revealed,
  };
}

function handle(message: SeasonMessage): Omit<Extract<SeasonResponse, { ok: true }>, 'id' | 'ms'> {
  let start: MatchStart | undefined;
  let finish: MatchFinish | undefined;
  switch (message.kind) {
    case 'create':
      create(message);
      break;
    case 'resume':
      resume(message.save);
      break;
    default: {
      if (!career || !meta) throw new Error('No season is loaded.');
      const lineup = (m: { formation: string; starters: string[]; tactic: Tactic }) => ({
        formation: m.formation,
        starters: m.starters,
        tactic: m.tactic,
      });
      if (message.kind === 'lineup') {
        career.apply({ type: 'lineup', ...lineup(message) });
      } else if (message.kind === 'kickoff') {
        career.kickOff(lineup(message));
        start = matchStartOf(career);
      } else if (message.kind === 'halftime') {
        career.halfTime(message.changes);
        finish = finishOf(career);
      } else if (message.kind === 'instant') {
        career.playInstant(lineup(message));
        finish = finishOf(career);
      } else if (message.kind === 'ack') {
        if (career.lastWatched) meta.revealed = Math.max(meta.revealed, career.lastWatched.round);
      } else if (message.kind === 'sim') {
        career.apply({ type: 'sim', to: message.to });
      } else if (message.kind === 'transfer') {
        career.apply({ type: 'transfer', out: message.out, in: message.in });
      } else if (message.kind === 'closeWindow') {
        career.apply({ type: 'closeWindow' });
      }
    }
  }
  const view = buildView();
  return { ok: true, view, ...(start ? { start } : {}), ...(finish ? { finish } : {}) };
}

self.onmessage = ({ data }: MessageEvent<SeasonMessage>) => {
  const started = performance.now();
  try {
    const response = handle(data);
    const ms = performance.now() - started;
    self.postMessage({ id: data.id, ...response, ms } satisfies SeasonResponse);
  } catch (error) {
    self.postMessage({
      id: data.id,
      ok: false,
      error: error instanceof Error ? error.message : 'The season could not continue.',
      reason: (error as { reason?: string }).reason,
    } satisfies SeasonResponse);
  }
};

export {};
