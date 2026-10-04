'use client';

import type { MatchEvent } from '@pl/engine';
import type { CSSProperties } from 'react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { FullTime } from '../match/FullTime';
import { WhatItMeans } from './WhatItMeans';
import { HalfTime } from '../match/HalfTime';
import { MatchViewer, type ViewerSides } from '../match/MatchViewer';
import { PickTeam } from '../match/PickTeam';
import type { MatchPreparation, PendingSubstitution } from '../match/lib/match';
import type { PlaybackMode } from '../match/lib/timeline';
import playerData from '../play/data/players.json';
import { listClubs } from '../play/lib/clubs';
import {
  STORAGE_KEY,
  parseSavedFlow,
  stadiumName,
  type ClubIdentity,
} from '../play/lib/persistence';
import { validateLineup, type Formation, type MarketPlayer } from '../play/lib/squad';
import { Hub } from './Hub';
import { SeasonFinale } from './Finale';
import { TransferWindow } from './Window';
import { LeagueTable } from './LeagueTable';
import { SeasonClient } from './lib/client';
import { ordinal, userPosition } from './lib/format';
import type { MatchFinish, MatchStart, SeasonView } from './lib/protocol';
import { SEASON_STORAGE_KEY, USER_CLUB_ID } from './lib/setup';
import '../match/match.css';
import '../match/theme.css';
import './season.css';

const market = playerData as MarketPlayer[];
const UI_KEY = '21st-club-season-ui';

type Stage =
  | 'loading'
  | 'recovery'
  | 'noclub'
  | 'hub'
  | 'pick'
  | 'first_half'
  | 'half_time'
  | 'second_half'
  | 'full_time'
  | 'window'
  | 'finished';

const HEADINGS: Record<Stage, string> = {
  loading: 'Loading',
  recovery: 'Season',
  noclub: 'Season',
  hub: 'Season hub',
  pick: 'Pick your team',
  first_half: 'First half',
  half_time: 'Half-time',
  second_half: 'Second half',
  full_time: 'Full time',
  window: 'January window',
  finished: 'Season complete',
};

function useReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    const query = window.matchMedia('(prefers-reduced-motion: reduce)');
    setReduced(query.matches);
    const listener = (event: MediaQueryListEvent) => setReduced(event.matches);
    query.addEventListener('change', listener);
    return () => query.removeEventListener('change', listener);
  }, []);
  return reduced;
}

const readSavedMode = (): PlaybackMode | null => {
  try {
    const value = localStorage.getItem(UI_KEY);
    return value === 'highlights' || value === 'commentary' || value === 'instant' ? value : null;
  } catch {
    return null;
  }
};

const rawId = (seasonId: string): string => seasonId.slice(USER_CLUB_ID.length + 1);

interface ActiveMatch {
  /** The match as kicked off; `snapshot` is only known while half-time is still undecided. */
  start: Omit<MatchStart, 'snapshot'> & { snapshot: MatchStart['snapshot'] | null };
  finish: MatchFinish | null;
}

const startOf = (finish: MatchFinish, firstHalfEvents: number): ActiveMatch['start'] => ({
  home: finish.home,
  away: finish.away,
  userSide: finish.userSide,
  events: finish.result.events.slice(0, firstHalfEvents) as MatchEvent[],
  snapshot: null,
  seed: finish.seed,
  round: finish.round,
});

function Notice({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <main className="mt-shell">
      <section className="mt-recovery page-shell">
        <p className="mt-kicker">Season</p>
        <h1>{title}</h1>
        {children}
      </section>
    </main>
  );
}

export function SeasonFlow() {
  const reducedMotion = useReducedMotion();
  const clientRef = useRef<SeasonClient | null>(null);
  const [stage, setStage] = useState<Stage>('loading');
  const [view, setView] = useState<SeasonView | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [savedMode, setSavedMode] = useState<PlaybackMode | null>(null);
  const [active, setActive] = useState<ActiveMatch | null>(null);
  const [preparation, setPreparation] = useState<MatchPreparation | null>(null);
  const activeRef = useRef<ActiveMatch | null>(null);
  /** The projected finish before the match kicked off, for "What it means". */
  const [before, setBefore] = useState<{
    projection: SeasonView['projection'];
    position: number;
  } | null>(null);
  const [showTable, setShowTable] = useState(false);

  const mode: PlaybackMode = savedMode ?? (reducedMotion ? 'commentary' : 'highlights');

  const names = useMemo(() => {
    const map = new Map(listClubs(market).map((club) => [club.id, club.name]));
    map.set(USER_CLUB_ID, view?.identity.name ?? 'Your club');
    return map;
  }, [view?.identity.name]);

  const squad = useMemo(() => {
    if (!view) return [];
    const byId = new Map(market.map((p) => [p.id, p]));
    return view.squadIds.map((id) => byId.get(id)!).filter(Boolean);
  }, [view]);

  const setMatch = useCallback((next: ActiveMatch | null) => {
    activeRef.current = next;
    setActive(next);
  }, []);

  const settle = useCallback(
    (next: SeasonView) => {
      setView(next);
      try {
        localStorage.setItem(SEASON_STORAGE_KEY, JSON.stringify(next.save));
      } catch {
        // The season keeps running; it just cannot be resumed after a reload.
      }
      // A match already decided in the log resumes at playback, never at its decisions.
      if (next.resume?.kind === 'first_half') {
        setMatch({ start: next.resume.start, finish: null });
        setStage('first_half');
        return;
      }
      if (next.resume?.kind === 'second_half') {
        const { finish, firstHalfEvents } = next.resume;
        setMatch({ start: startOf(finish, firstHalfEvents), finish });
        setStage('second_half');
        return;
      }
      setStage(next.phase === 'window' ? 'window' : next.phase === 'finished' ? 'finished' : 'hub');
    },
    [setMatch],
  );

  // Start-up: resume a saved season, or begin one from the club built in /play.
  useEffect(() => {
    let cancelled = false;
    const client = new SeasonClient();
    clientRef.current = client;
    setSavedMode(readSavedMode());
    (async () => {
      try {
        let raw: string | null = null;
        try {
          raw = localStorage.getItem(SEASON_STORAGE_KEY);
        } catch {
          raw = null;
        }
        if (raw) {
          let parsed: unknown = null;
          try {
            parsed = JSON.parse(raw);
          } catch {
            parsed = null;
          }
          const response = await client.send({ kind: 'resume', save: parsed });
          if (!cancelled) settle(response.view);
          return;
        }
        const flow = parseSavedFlow(localStorage.getItem(STORAGE_KEY), market);
        if (
          !flow ||
          flow.identity.name.trim() === '' ||
          validateLineup(flow.selected, flow.starterIds, flow.formation).length
        ) {
          if (!cancelled) setStage('noclub');
          return;
        }
        const response = await client.send({
          kind: 'create',
          identity: flow.identity,
          squadIds: flow.selected.map((p) => p.id),
          formation: flow.formation,
          starterIds: flow.starterIds,
          seed: Date.now() % 2_147_483_647,
        });
        if (!cancelled) settle(response.view);
      } catch (caught) {
        if (cancelled) return;
        setError(caught instanceof Error ? caught.message : 'The season could not be loaded.');
        setStage('recovery');
      }
    })();
    return () => {
      cancelled = true;
      client.terminate();
      clientRef.current = null;
    };
  }, [settle]);

  const changeMode = (next: PlaybackMode) => {
    setSavedMode(next);
    try {
      localStorage.setItem(UI_KEY, next);
    } catch {
      // Playback mode is a convenience only.
    }
  };

  const run = useCallback(
    async <T,>(task: (client: SeasonClient) => Promise<T>): Promise<T | undefined> => {
      const client = clientRef.current;
      if (!client) return undefined;
      setBusy(true);
      setError('');
      try {
        return await task(client);
      } catch (caught) {
        setError(caught instanceof Error ? caught.message : 'The season could not continue.');
        return undefined;
      } finally {
        setBusy(false);
      }
    },
    [],
  );

  /** Log half-time (or no changes) and play the second half: the match is then decided. */
  const sendFinish = useCallback(
    async (changes?: {
      tactic?: MatchPreparation['tactic'];
      substitutions?: PendingSubstitution[];
    }) => {
      const response = await run((client) =>
        client.send({
          kind: 'halftime',
          changes: changes
            ? {
                tactic: changes.tactic,
                substitutions: changes.substitutions?.map((s) => ({
                  off: rawId(s.off),
                  on: rawId(s.on),
                })),
              }
            : undefined,
        }),
      );
      if (!response?.finish || !activeRef.current) return null;
      setView(response.view);
      try {
        localStorage.setItem(SEASON_STORAGE_KEY, JSON.stringify(response.view.save));
      } catch {
        // See settle().
      }
      setMatch({ ...activeRef.current, finish: response.finish });
      return response.finish;
    },
    [run, setMatch],
  );

  /** Kick off with this lineup. The XI, formation and tactic are logged now and cannot change. */
  const playNext = useCallback(
    async (lineup?: {
      formation: Formation;
      starters: string[];
      tactic: MatchPreparation['tactic'];
    }) => {
      if (!view) return;
      setBefore({ projection: view.projection, position: userPosition(view.table) });
      setShowTable(false);
      const chosen = lineup ?? {
        formation: view.lineup.formation as Formation,
        starters: [...view.lineup.starters],
        tactic: view.lineup.tactic,
      };
      if (mode === 'instant') {
        const response = await run((client) => client.send({ kind: 'instant', ...chosen }));
        if (!response?.finish) return;
        setView(response.view);
        try {
          localStorage.setItem(SEASON_STORAGE_KEY, JSON.stringify(response.view.save));
        } catch {
          // See settle().
        }
        setMatch({ start: startOf(response.finish, 0), finish: response.finish });
        setStage('full_time');
        return;
      }
      const response = await run((client) => client.send({ kind: 'kickoff', ...chosen }));
      if (!response?.start) return;
      setView(response.view);
      try {
        localStorage.setItem(SEASON_STORAGE_KEY, JSON.stringify(response.view.save));
      } catch {
        // See settle().
      }
      setMatch({ start: response.start, finish: null });
      setStage('first_half');
    },
    [mode, run, setMatch, view],
  );

  const openPick = () => {
    if (!view) return;
    const identity: ClubIdentity = view.identity;
    setPreparation({
      identity,
      squad,
      starterIds: view.lineup.starters.slice(),
      formation: view.lineup.formation as Formation,
      tactic: view.lineup.tactic,
      opponentId: view.next?.opponentId ?? '',
      venue: view.next?.venue ?? 'home',
    });
    setStage('pick');
  };

  const sides: ViewerSides | null = useMemo(() => {
    if (!active || !view) return null;
    const { start } = active;
    const userLabel = view.identity.shortName || view.identity.name;
    const labelOf = (id: string) => (id === USER_CLUB_ID ? userLabel : id);
    return {
      home: start.home,
      away: start.away,
      homeLabel: labelOf(start.home.id),
      awayLabel: labelOf(start.away.id),
      userSide: start.userSide,
      userColour: view.identity.primaryColor,
    };
  }, [active, view]);

  const abandonSeason = () => {
    try {
      localStorage.removeItem(SEASON_STORAGE_KEY);
    } catch {
      // Nothing to remove when storage is blocked.
    }
    window.location.href = '/play';
  };

  /** Clear the finished season, keep the club, and go back to building a squad. */
  const startNewSeason = () => {
    try {
      localStorage.removeItem(SEASON_STORAGE_KEY);
      localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({
          step: 'squad',
          identity: view?.identity,
          selectedIds: [],
          formation: '4-4-2',
          starterIds: [],
        }),
      );
    } catch {
      // Without storage the club builder simply starts fresh.
    }
    window.location.href = '/play';
  };

  const afterMatch = () => {
    void run(async (client) => {
      const response = await client.send({ kind: 'ack' });
      setMatch(null);
      settle(response.view);
    });
  };

  const saveLineup = () => {
    if (!preparation) return;
    void run(async (client) => {
      const response = await client.send({
        kind: 'lineup',
        formation: preparation.formation,
        starters: preparation.starterIds,
        tactic: preparation.tactic,
      });
      settle(response.view);
    });
  };

  if (stage === 'loading') {
    return (
      <main className="mt-shell">
        <p className="se-loading page-shell" aria-live="polite">
          Setting up the league…
        </p>
      </main>
    );
  }
  if (stage === 'noclub') {
    return (
      <Notice title="Build your club first.">
        <p>A season needs a founded club with a full squad and starting XI.</p>
        <a className="button button-primary button-default" href="/play">
          Go to the club builder <span aria-hidden="true">→</span>
        </a>
      </Notice>
    );
  }
  if (stage === 'recovery' || !view) {
    return (
      <Notice title="This season can't be opened.">
        <p>{error || 'The saved season could not be restored.'}</p>
        <p>
          Your club and squad are untouched. Abandoning the season clears only the saved results, so
          you can start again.
        </p>
        <button
          type="button"
          className="button button-primary button-default"
          onClick={abandonSeason}
        >
          Abandon season
        </button>
      </Notice>
    );
  }

  const viewerMode = mode === 'instant' ? 'highlights' : mode;
  const position = userPosition(view.table);
  const theme =
    stage === 'first_half' || stage === 'second_half'
      ? 'theme-stadium'
      : stage === 'pick' || stage === 'half_time' || stage === 'full_time'
        ? 'theme-grass'
        : 'theme-cream';
  const band =
    stage === 'hub'
      ? { eyebrow: `Matchday ${Math.min(view.round + 1, 38)} of 38`, title: 'Season hub' }
      : stage === 'window'
        ? { eyebrow: 'Halfway point · matchday 20 played', title: 'January window' }
        : stage === 'finished'
          ? { eyebrow: 'Full time on the season', title: 'Season complete' }
          : null;

  return (
    <main
      className={`mt-shell ${theme}`}
      style={{ '--club-primary': view.identity.primaryColor } as CSSProperties}
    >
      <header className="mt-header">
        <div className="page-shell">
          <a className="wordmark" href="/">
            21ST CLUB
          </a>
          <p>
            <span>
              {view.phase === 'finished'
                ? 'Final'
                : `Matchday ${Math.min((active && stage !== 'hub' ? active.start.round : view.round) + 1, 38)}`}
            </span>
            <strong>{HEADINGS[stage]}</strong>
          </p>
          <span className="mt-header-club">
            {view.identity.shortName} · {ordinal(position)}
          </span>
        </div>
      </header>

      {band ? (
        <div className="mt-band grass-stripes">
          <div>
            <p>{band.eyebrow}</p>
            <h1>{band.title}</h1>
          </div>
          <div className="mt-band-club">
            <strong>{view.identity.name}</strong>
            <p>{ordinal(position)} in the league</p>
          </div>
        </div>
      ) : null}

      {error ? (
        <p className="se-error page-shell" role="alert">
          {error}
        </p>
      ) : null}

      {stage === 'hub' ? (
        <Hub
          view={view}
          names={names}
          squad={squad}
          mode={mode}
          onModeChange={changeMode}
          busy={busy}
          onPickTeam={openPick}
          onPlay={() => void playNext()}
          onSim={(to) => {
            void run(async (client) => {
              const response = await client.send({ kind: 'sim', to });
              console.debug(`[season] sim ${to}: ${response.ms.toFixed(0)} ms`);
              settle(response.view);
            });
          }}
          onAbandon={abandonSeason}
        />
      ) : null}

      {stage === 'pick' && preparation && view.next ? (
        <PickTeam
          preparation={preparation}
          setPreparation={setPreparation}
          market={market}
          opponents={[]}
          seed={0}
          mode={mode}
          onModeChange={changeMode}
          onKickOff={() =>
            void playNext({
              formation: preparation.formation,
              starters: preparation.starterIds,
              tactic: preparation.tactic,
            })
          }
          season={{
            opponentName: names.get(view.next.opponentId) ?? view.next.opponentId,
            odds: view.next.odds,
            kickoffLabel: 'Kick off',
            status: (id) => {
              const p = view.squad.find((item) => item.id === id);
              return p
                ? {
                    fitness: p.fitness,
                    form: p.form,
                    outFor: Math.max(p.injuredFor, p.suspendedFor),
                  }
                : undefined;
            },
          }}
        />
      ) : null}
      {stage === 'pick' ? (
        <div className="page-shell se-back">
          <button type="button" className="se-link" onClick={saveLineup}>
            Save this lineup and go back to the hub
          </button>
          <button type="button" className="se-link" onClick={() => setStage('hub')}>
            ← Back without saving
          </button>
        </div>
      ) : null}

      {stage === 'first_half' && active && sides ? (
        <MatchViewer
          key="first"
          allEvents={active.start.events}
          startIndex={0}
          sides={sides}
          period={1}
          mode={viewerMode}
          onModeChange={(next) => {
            changeMode(next);
            if (next === 'instant') {
              void sendFinish().then((finished) => finished && setStage('full_time'));
            }
          }}
          onComplete={() => setStage('half_time')}
          onSkip={() => void sendFinish().then((finished) => finished && setStage('full_time'))}
          seed={active.start.seed}
        />
      ) : null}
      {stage === 'half_time' && active?.start.snapshot && sides ? (
        <HalfTime
          team={sides[sides.userSide]}
          snapshot={active.start.snapshot}
          firstHalf={active.start.events}
          sides={sides}
          tactic={view.lineup.tactic}
          matchdayLabel={`Matchday ${active.start.round + 1}`}
          onContinue={(tactic, substitutions, skip) =>
            void sendFinish({ tactic, substitutions }).then((finished) => {
              if (finished) setStage(skip ? 'full_time' : 'second_half');
            })
          }
        />
      ) : null}
      {stage === 'second_half' && active?.finish && sides ? (
        <MatchViewer
          key="second"
          allEvents={active.finish.result.events as MatchEvent[]}
          startIndex={active.start.events.length}
          sides={sides}
          period={2}
          mode={viewerMode}
          onModeChange={changeMode}
          onComplete={() => setStage('full_time')}
          onSkip={() => setStage('full_time')}
          seed={active.start.seed}
        />
      ) : null}
      {stage === 'half_time' || stage === 'first_half' ? (
        <p className="page-shell se-back mt-muted">
          Your lineup is locked for this match. Refreshing brings you back here.
        </p>
      ) : null}

      {stage === 'full_time' && active?.finish && sides ? (
        <>
          <FullTime
            result={active.finish.result}
            sides={sides}
            seed={active.finish.seed}
            matchdayLabel={`Matchday ${active.finish.round + 1}`}
            venueLabel={active.finish.userSide === 'home' ? stadiumName(view.identity) : 'Away'}
            actions={
              <>
                <button
                  type="button"
                  className="button button-primary button-default fs-continue"
                  onClick={afterMatch}
                >
                  {view.phase === 'matchday'
                    ? 'Continue'
                    : view.phase === 'window'
                      ? 'To the January window'
                      : 'Season summary'}{' '}
                  <span aria-hidden="true">→</span>
                </button>
                <button
                  type="button"
                  className="fs-outline"
                  aria-expanded={showTable}
                  onClick={() => setShowTable((open) => !open)}
                >
                  {showTable ? 'Hide full table' : 'View full table'}
                </button>
              </>
            }
          >
            <WhatItMeans view={view} finish={active.finish} before={before} names={names} />
          </FullTime>
          {showTable ? (
            <section className="se-after page-shell" aria-label="League after this matchday">
              <LeagueTable
                table={view.table}
                names={names}
                caption={`League table after matchday ${active.finish.round + 1}`}
              />
            </section>
          ) : null}
        </>
      ) : null}

      {stage === 'window' ? (
        <TransferWindow
          view={view}
          names={names}
          squad={squad}
          busy={busy}
          onTransfer={(out, signing) =>
            void run(async (client) => {
              const response = await client.send({
                kind: 'transfer',
                out: out.id,
                in: signing.id,
              });
              settle(response.view);
            })
          }
          onClose={() =>
            void run(async (client) => {
              const response = await client.send({ kind: 'closeWindow' });
              settle(response.view);
            })
          }
        />
      ) : null}

      {stage === 'finished' ? (
        <SeasonFinale view={view} names={names} onNewSeason={startNewSeason} />
      ) : null}
    </main>
  );
}
