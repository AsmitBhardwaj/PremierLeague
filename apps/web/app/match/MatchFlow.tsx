'use client';

import type { MatchEvent, MatchResult, MatchSnapshot, Tactic } from '@pl/engine';
import type { CSSProperties } from 'react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import playerData from '../play/data/players.json';
import { computeReplacedClub, listOpponents } from '../play/lib/clubs';
import {
  STORAGE_KEY,
  parseSavedFlow,
  stadiumName,
  type ClubIdentity,
} from '../play/lib/persistence';
import { budgetOf } from '../play/lib/budget';
import { validateLineup, type MarketPlayer } from '../play/lib/squad';
import { FullTime } from './FullTime';
import { HalfTime } from './HalfTime';
import { MatchViewer, type ViewerSides } from './MatchViewer';
import { PickTeam } from './PickTeam';
import {
  MatchSession,
  createMatchInput,
  type MatchPreparation,
  type PendingSubstitution,
} from './lib/match';
import { MATCH_STORAGE_KEY, parseSavedMatchFlow, type SavedMatchFlow } from './lib/persistence';
import { matchSeed } from './lib/seed';
import type { PlaybackMode } from './lib/timeline';
import './match.css';
import './theme.css';

const market = playerData as MarketPlayer[];
const replacedClub = computeReplacedClub(market);
const opponents = listOpponents(market, replacedClub.id);

type Stage = 'pick' | 'first_half' | 'half_time' | 'second_half' | 'full_time';

const STAGE_TITLES: Record<Stage, string> = {
  pick: 'Pick your team',
  first_half: 'First half',
  half_time: 'Half-time',
  second_half: 'Second half',
  full_time: 'Full time',
};

/** Matchday state for the game in progress. The engine owns every outcome in here. */
interface ActiveMatch {
  session: MatchSession;
  seed: number;
  firstHalf: MatchEvent[];
  snapshot: MatchSnapshot | null;
  result: MatchResult | null;
}

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

function MatchHeader({ identity, stage }: { identity: ClubIdentity; stage: Stage }) {
  return (
    <header className="mt-header">
      <div className="page-shell">
        <a className="wordmark" href="/">
          21ST CLUB
        </a>
        <p>
          <span>Matchday</span>
          <strong>{STAGE_TITLES[stage]}</strong>
        </p>
        <span className="mt-header-club">{identity.shortName}</span>
      </div>
    </header>
  );
}

function InvalidState() {
  return (
    <main className="mt-shell">
      <section className="mt-recovery page-shell">
        <p className="mt-kicker">Matchday unavailable</p>
        <h1>Your club save needs attention.</h1>
        <p>
          No complete, valid club and starting XI could be restored. Return to the club builder to
          repair or finish the save before kick-off.
        </p>
        <a className="button button-primary button-default" href="/play">
          Return to club builder <span aria-hidden="true">→</span>
        </a>
      </section>
    </main>
  );
}

export function MatchFlow() {
  const reducedMotion = useReducedMotion();
  const [hydrated, setHydrated] = useState(false);
  const [valid, setValid] = useState(false);
  const [preparation, setPreparation] = useState<MatchPreparation | null>(null);
  const [savedMode, setSavedMode] = useState<PlaybackMode | null>(null);
  const [playCounter, setPlayCounter] = useState(0);
  const [stage, setStage] = useState<Stage>('pick');
  const [active, setActive] = useState<ActiveMatch | null>(null);
  const sessionRef = useRef<ActiveMatch | null>(null);

  // Reduced motion defaults to text commentary until the player chooses otherwise.
  const mode: PlaybackMode = savedMode ?? (reducedMotion ? 'commentary' : 'highlights');

  useEffect(() => {
    try {
      const phase3 = parseSavedFlow(localStorage.getItem(STORAGE_KEY), market);
      if (
        !phase3 ||
        validateLineup(
          phase3.selected,
          phase3.starterIds,
          phase3.formation,
          budgetOf(phase3.identity.budget),
        ).length
      ) {
        return;
      }
      const saved = parseSavedMatchFlow(
        localStorage.getItem(MATCH_STORAGE_KEY),
        phase3.selected,
        opponents.map((club) => club.id),
      );
      setPreparation({
        identity: phase3.identity,
        squad: phase3.selected,
        starterIds: saved?.starterIds ?? phase3.starterIds,
        formation: saved?.formation ?? phase3.formation,
        tactic: saved?.tactic ?? 'balanced',
        opponentId: saved?.opponentId ?? opponents[0]!.id,
        venue: saved?.venue ?? 'home',
      });
      setSavedMode(saved?.mode ?? null);
      setPlayCounter(saved?.playCounter ?? 0);
      setValid(true);
    } catch {
      // The recovery screen covers unreadable or blocked storage.
    } finally {
      setHydrated(true);
    }
  }, []);

  useEffect(() => {
    if (!hydrated || !preparation) return;
    const saved: SavedMatchFlow = {
      version: 2,
      starterIds: preparation.starterIds,
      formation: preparation.formation,
      tactic: preparation.tactic,
      mode: savedMode,
      opponentId: preparation.opponentId,
      venue: preparation.venue,
      playCounter,
    };
    try {
      localStorage.setItem(MATCH_STORAGE_KEY, JSON.stringify(saved));
    } catch {
      // Matchday stays usable without persistent browser storage.
    }
  }, [hydrated, preparation, playCounter, savedMode]);

  const upcomingSeed = useMemo(
    () =>
      preparation
        ? matchSeed(
            preparation.identity.name,
            preparation.opponentId,
            preparation.venue,
            playCounter,
          )
        : 0,
    [preparation, playCounter],
  );

  const opponent = opponents.find((club) => club.id === preparation?.opponentId);
  const sides: ViewerSides | null = useMemo(() => {
    if (!active || !preparation || !opponent) return null;
    const { input } = active.session;
    const userLabel = preparation.identity.shortName || preparation.identity.name;
    return {
      home: input.home,
      away: input.away,
      homeLabel: preparation.venue === 'home' ? userLabel : opponent.id,
      awayLabel: preparation.venue === 'home' ? opponent.id : userLabel,
      userSide: preparation.venue,
      userColour: preparation.identity.primaryColor,
    };
  }, [active, preparation, opponent]);

  const update = useCallback((next: ActiveMatch | null) => {
    sessionRef.current = next;
    setActive(next);
  }, []);

  const kickOff = useCallback(() => {
    if (!preparation) return;
    const input = createMatchInput(preparation, market, playCounter);
    const session = new MatchSession(input, preparation.venue);
    const snapshot = session.playFirstHalf();
    const next: ActiveMatch = {
      session,
      seed: input.seed,
      firstHalf: snapshot.events.slice(),
      snapshot,
      result: null,
    };
    setPlayCounter(playCounter + 1);
    if (mode === 'instant') {
      next.result = session.continueSecondHalf(preparation.tactic, []);
      update(next);
      setStage('full_time');
      return;
    }
    update(next);
    setStage('first_half');
  }, [mode, playCounter, preparation, update]);

  const finishWithoutChanges = useCallback(() => {
    const current = sessionRef.current;
    if (!current || !preparation) return;
    update({
      ...current,
      result: current.result ?? current.session.continueSecondHalf(preparation.tactic, []),
    });
    setStage('full_time');
  }, [preparation, update]);

  const continueSecondHalf = (
    tactic: Tactic,
    substitutions: PendingSubstitution[],
    skip: boolean,
  ) => {
    const current = sessionRef.current;
    if (!current) return;
    update({ ...current, result: current.session.continueSecondHalf(tactic, substitutions) });
    setStage(skip ? 'full_time' : 'second_half');
  };

  const changeMode = (next: PlaybackMode) => {
    setSavedMode(next);
    if (next === 'instant' && (stage === 'first_half' || stage === 'second_half')) {
      finishWithoutChanges();
    }
  };

  if (!hydrated) return <main className="mt-shell" />;
  if (!valid || !preparation) return <InvalidState />;

  const viewerMode = mode === 'instant' ? 'highlights' : mode;
  const theme = stage === 'first_half' || stage === 'second_half' ? 'theme-stadium' : 'theme-grass';

  return (
    <main
      className={`mt-shell ${theme}`}
      style={{ '--club-primary': preparation.identity.primaryColor } as CSSProperties}
    >
      <MatchHeader identity={preparation.identity} stage={stage} />
      {stage === 'pick' ? (
        <PickTeam
          preparation={preparation}
          setPreparation={setPreparation}
          market={market}
          opponents={opponents}
          seed={upcomingSeed}
          mode={mode}
          onModeChange={setSavedMode}
          onKickOff={kickOff}
        />
      ) : null}
      {stage === 'first_half' && active && sides ? (
        <MatchViewer
          key="first"
          allEvents={active.firstHalf}
          startIndex={0}
          sides={sides}
          period={1}
          mode={viewerMode}
          onModeChange={changeMode}
          onComplete={() => {
            update({ ...active, snapshot: active.session.snapshot() });
            setStage('half_time');
          }}
          onSkip={finishWithoutChanges}
          seed={active.seed}
        />
      ) : null}
      {stage === 'half_time' && active?.snapshot && sides ? (
        <HalfTime
          team={active.session.userTeam}
          snapshot={active.snapshot}
          firstHalf={active.firstHalf}
          sides={sides}
          tactic={preparation.tactic}
          matchdayLabel="Friendly"
          onContinue={continueSecondHalf}
        />
      ) : null}
      {stage === 'second_half' && active?.result && sides ? (
        <MatchViewer
          key="second"
          allEvents={active.result.events}
          startIndex={active.firstHalf.length}
          sides={sides}
          period={2}
          mode={viewerMode}
          onModeChange={changeMode}
          onComplete={() => setStage('full_time')}
          onSkip={() => setStage('full_time')}
          seed={active.seed}
        />
      ) : null}
      {stage === 'full_time' && active?.result && sides ? (
        <FullTime
          result={active.result}
          sides={sides}
          seed={active.seed}
          matchdayLabel="Friendly"
          venueLabel={preparation.venue === 'home' ? stadiumName(preparation.identity) : 'Away'}
          actions={
            <>
              <button
                type="button"
                className="button button-primary button-default fs-continue"
                onClick={kickOff}
              >
                Play again <span aria-hidden="true">→</span>
              </button>
              <button type="button" className="fs-outline" onClick={() => setStage('pick')}>
                Change team
              </button>
              <a className="fs-outline" href="/play">
                Back to preview
              </a>
            </>
          }
        />
      ) : null}
    </main>
  );
}
