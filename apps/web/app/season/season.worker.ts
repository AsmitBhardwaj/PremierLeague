/// <reference lib="webworker" />

import {
  Career,
  cacheOf,
  hashSeed,
  parseCareerSave,
  predictSeason,
  replayCareer,
  type CareerSave,
  type Decision,
  type PendingPlay,
  type SeasonPrediction,
} from '@pl/engine';
import playerData from '../play/data/players.json';
import { buildOpponentTeams, computeReplacedClub } from '../play/lib/clubs';
import type { ClubIdentity } from '../play/lib/persistence';
import { createPredictionTeam, type MarketPlayer } from '../play/lib/squad';
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
}

let career: Career | null = null;
let meta: Meta | null = null;
let play: PendingPlay | null = null;

const marketById = new Map(market.map((p) => [p.id, p]));
const squadOf = (ids: readonly string[]): MarketPlayer[] | null => {
  const squad = ids.map((id) => marketById.get(id));
  return squad.every(Boolean) ? (squad as MarketPlayer[]) : null;
};

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
    version: 1,
    seed: meta.seed,
    dataVersion: meta.dataVersion,
    identity: meta.identity,
    replacedClubId: meta.replacedClubId,
    squadIds: meta.squadIds,
    prediction: meta.prediction,
    decisions: career.decisions as Decision[],
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
    results,
    prediction: meta.prediction,
    identity: meta.identity,
    replacedClubId: meta.replacedClubId,
    squadIds: meta.squadIds,
    save,
  };
}

function create(request: Extract<SeasonMessage, { kind: 'create' }>): void {
  const squad = squadOf(request.squadIds);
  if (!squad) throw new Error('The saved squad contains players that no longer exist.');
  const replaced = computeReplacedClub(market);
  const setup = buildSetup(market, replaced.id, request.identity.name, squad, request.seed);
  const next = new Career(setup);
  next.apply({
    type: 'lineup',
    formation: request.formation,
    starters: request.starterIds,
    tactic: 'balanced',
  });
  const prediction = predictSeason(
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
  career = next;
  play = null;
  meta = {
    identity: request.identity,
    replacedClubId: replaced.id,
    squadIds: request.squadIds,
    prediction,
    seed: request.seed,
    dataVersion: marketDataVersion(market),
  };
}

function resume(raw: unknown): void {
  const save = parseCareerSave(raw);
  if (!save)
    throw Object.assign(new Error('The saved season is unreadable.'), { reason: 'corrupt' });
  const squad = squadOf(save.squadIds);
  if (!squad)
    throw Object.assign(new Error('The saved squad is unreadable.'), { reason: 'corrupt' });
  const identity = save.identity as ClubIdentity;
  const setup = buildSetup(market, save.replacedClubId, identity.name, squad, save.seed);
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
  play = null;
  meta = {
    identity,
    replacedClubId: save.replacedClubId,
    squadIds: save.squadIds,
    prediction: save.prediction as SeasonPrediction,
    seed: save.seed,
    dataVersion: save.dataVersion,
  };
}

const matchSeedOf = (c: Career, home: string, away: string): number =>
  hashSeed(c.season.seed, c.round, home, away) >>> 0;

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
      if (!career) throw new Error('No season is loaded.');
      if (message.kind === 'lineup') {
        career.apply({
          type: 'lineup',
          formation: message.formation,
          starters: message.starters,
          tactic: message.tactic,
        });
      } else if (message.kind === 'begin') {
        if (play) career.abandonPlay();
        play = career.beginPlay();
        const { user } = play;
        start = {
          home: user.home,
          away: user.away,
          userSide: user.userSide,
          events: user.snapshot.events.slice(),
          snapshot: { ...user.snapshot, events: [] },
          seed: matchSeedOf(career, user.fixture.home, user.fixture.away),
          round: career.round,
        };
      } else if (message.kind === 'finish') {
        if (!play) throw new Error('No match is in progress.');
        const { user } = play;
        const round = career.round;
        career.completePlay(message.halfTime, play);
        play = null;
        const outcome = career.lastMatchday!.userMatch!;
        finish = {
          result: outcome.result,
          userSide: user.userSide,
          home: user.home,
          away: user.away,
          seed: hashSeed(career.season.seed, round, user.fixture.home, user.fixture.away) >>> 0,
          round,
        };
      } else if (message.kind === 'abandon') {
        if (play) career.abandonPlay();
        play = null;
      } else if (message.kind === 'sim') {
        if (play) career.abandonPlay();
        play = null;
        career.apply({ type: 'sim', to: message.to });
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
