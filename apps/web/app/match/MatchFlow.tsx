'use client';

import type { MatchResult } from '@pl/engine';
import type { CSSProperties } from 'react';
import { useEffect, useMemo, useState } from 'react';
import playerData from '../play/data/players.json';
import { computeReplacedClub, listOpponents } from '../play/lib/clubs';
import { STORAGE_KEY, parseSavedFlow, type ClubIdentity } from '../play/lib/persistence';
import { validateLineup, type MarketPlayer } from '../play/lib/squad';
import { PickTeam } from './PickTeam';
import { MatchSession, createMatchInput, type MatchPreparation } from './lib/match';
import { MATCH_STORAGE_KEY, parseSavedMatchFlow, type SavedMatchFlow } from './lib/persistence';
import { matchSeed } from './lib/seed';
import './match.css';

const market = playerData as MarketPlayer[];
const replacedClub = computeReplacedClub(market);
const opponents = listOpponents(market, replacedClub.id);

type Stage = 'pick' | 'result';

function MatchHeader({ identity, stage }: { identity: ClubIdentity; stage: Stage }) {
  return (
    <header className="mt-header">
      <div className="page-shell">
        <a className="wordmark" href="/">
          21ST CLUB
        </a>
        <p>
          <span>Matchday</span>
          <strong>{stage === 'pick' ? 'Pick your team' : 'Result'}</strong>
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
  const [hydrated, setHydrated] = useState(false);
  const [valid, setValid] = useState(false);
  const [preparation, setPreparation] = useState<MatchPreparation | null>(null);
  const [playCounter, setPlayCounter] = useState(0);
  const [stage, setStage] = useState<Stage>('pick');
  const [result, setResult] = useState<MatchResult | null>(null);

  useEffect(() => {
    try {
      const phase3 = parseSavedFlow(localStorage.getItem(STORAGE_KEY), market);
      if (!phase3 || validateLineup(phase3.selected, phase3.starterIds, phase3.formation).length) {
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
      mode: null,
      opponentId: preparation.opponentId,
      venue: preparation.venue,
      playCounter,
    };
    try {
      localStorage.setItem(MATCH_STORAGE_KEY, JSON.stringify(saved));
    } catch {
      // Matchday stays usable without persistent browser storage.
    }
  }, [hydrated, preparation, playCounter]);

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

  if (!hydrated) return <main className="mt-shell" />;
  if (!valid || !preparation) return <InvalidState />;

  const kickOff = () => {
    const session = new MatchSession(
      createMatchInput(preparation, market, playCounter),
      preparation.venue,
    );
    session.playFirstHalf();
    setResult(session.continueSecondHalf(preparation.tactic, []));
    setPlayCounter(playCounter + 1);
    setStage('result');
  };

  return (
    <main
      className="mt-shell"
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
          onKickOff={kickOff}
        />
      ) : (
        <section className="page-shell mt-recovery">
          <p className="mt-kicker">Full time</p>
          <h1>
            {result?.score.home}–{result?.score.away}
          </h1>
          <button
            type="button"
            className="button button-secondary button-default"
            onClick={() => setStage('pick')}
          >
            Back to team
          </button>
        </section>
      )}
    </main>
  );
}
