'use client';

import {
  TUNING,
  type MatchEvent,
  type MatchResult,
  type MatchSnapshot,
  type Player,
  type Tactic,
  type Team,
  type TeamStats,
} from '@pl/engine';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Card } from '../components/Card';
import { Stat } from '../components/Stat';
import playerData from '../play/data/players.json';
import {
  STORAGE_KEY,
  parseSavedFlow,
  type ClubIdentity,
  type RestoredFlow,
} from '../play/lib/persistence';
import {
  FORMATIONS,
  POSITION_ORDER,
  pickFormationXI,
  validateLineup,
  type Formation,
  type MarketPlayer,
} from '../play/lib/squad';
import {
  MatchSession,
  createMatchInput,
  createUserMatchTeam,
  estimateMatchOdds,
  statsFromEvents,
  validateSubstitution,
  type MatchPreparation,
  type PendingSubstitution,
} from './lib/match';
import { MATCH_STORAGE_KEY, parseSavedMatchFlow, type SavedMatchFlow } from './lib/persistence';
import {
  formatMatchClock,
  isImportantEvent,
  orderTimeline,
  playbackDuration,
  timelineIndexAt,
  toPitchPercent,
  visiblePlayerLocations,
  type PlaybackMode,
} from './lib/playback';

const market = playerData as MarketPlayer[];
const tactics: { id: Tactic; label: string; note: string }[] = [
  { id: 'balanced', label: 'Balanced', note: 'Measured risk in every phase.' },
  { id: 'high_press', label: 'High press', note: 'Win it high; stamina falls faster.' },
  { id: 'counter', label: 'Counter', note: 'Sit off, then break into space.' },
  { id: 'defensive', label: 'Defensive', note: 'Protect territory; concede initiative.' },
];
const modes: { id: PlaybackMode; label: string }[] = [
  { id: 'highlights', label: 'Highlights' },
  { id: 'commentary', label: 'Text commentary' },
  { id: 'instant', label: 'Instant result' },
];

type MatchStage = 'preparation' | 'first_half' | 'half_time' | 'second_half' | 'full_time';

const pct = (value: number) => `${Math.round(value * 100)}%`;

function MatchHeader({ identity, stage }: { identity: ClubIdentity; stage: MatchStage }) {
  return (
    <header className="match-header page-shell">
      <a className="wordmark" href="/">
        21ST CLUB
      </a>
      <div>
        <span>Final Third</span>
        <strong>{stage.replace('_', ' ')}</strong>
      </div>
      <span>{identity.shortName}</span>
    </header>
  );
}

function InvalidState() {
  return (
    <main className="match-shell">
      <section className="match-recovery page-shell">
        <p className="eyebrow">Matchday unavailable</p>
        <h1>Your club save needs attention.</h1>
        <p>
          No complete, valid Phase 3 club and starting XI could be restored. Return to the club
          builder to repair or finish the save before kick-off.
        </p>
        <a className="button button-primary button-default" href="/play">
          Return to club builder <span aria-hidden="true">→</span>
        </a>
      </section>
    </main>
  );
}

function TacticPicker({ value, onChange }: { value: Tactic; onChange: (value: Tactic) => void }) {
  return (
    <fieldset className="tactic-picker">
      <legend>Match tactic</legend>
      {tactics.map((tactic) => (
        <label key={tactic.id} className={value === tactic.id ? 'selected' : ''}>
          <input
            type="radio"
            name="tactic"
            value={tactic.id}
            checked={value === tactic.id}
            onChange={() => onChange(tactic.id)}
          />
          <strong>{tactic.label}</strong>
          <span>{tactic.note}</span>
        </label>
      ))}
    </fieldset>
  );
}

function PreparationScreen({
  preparation,
  setPreparation,
  opponent,
  onKickOff,
}: {
  preparation: MatchPreparation;
  setPreparation: (value: MatchPreparation) => void;
  opponent: Team;
  onKickOff: () => void;
}) {
  const [selectedStarter, setSelectedStarter] = useState<string | null>(null);
  const [message, setMessage] = useState('Select a starter, then a same-position substitute.');
  const errors = validateLineup(preparation.squad, preparation.starterIds, preparation.formation);
  const starterSet = new Set(preparation.starterIds);
  const starters = preparation.starterIds
    .map((id) => preparation.squad.find((player) => player.id === id))
    .filter((player): player is MarketPlayer => Boolean(player));
  const bench = preparation.squad.filter((player) => !starterSet.has(player.id));
  const input = useMemo(() => createMatchInput(preparation, market), [preparation]);
  const odds = useMemo(() => estimateMatchOdds(input), [input]);

  const changeFormation = (formation: Formation) => {
    setPreparation({
      ...preparation,
      formation,
      starterIds: pickFormationXI(preparation.squad, formation),
    });
    setSelectedStarter(null);
    setMessage(`${formation} selected with the strongest valid XI.`);
  };

  const swap = (substitute: MarketPlayer) => {
    const starter = preparation.squad.find((player) => player.id === selectedStarter);
    if (!starter) {
      setMessage('Choose a starter before selecting a substitute.');
      return;
    }
    if (starter.position !== substitute.position) {
      setMessage(`Choose a ${starter.position} replacement to preserve ${preparation.formation}.`);
      return;
    }
    const starterIds = preparation.starterIds.map((id) => (id === starter.id ? substitute.id : id));
    if (validateLineup(preparation.squad, starterIds, preparation.formation).length) {
      setMessage('That change would make the starting XI invalid.');
      return;
    }
    setPreparation({ ...preparation, starterIds });
    setSelectedStarter(null);
    setMessage(`${substitute.name} replaces ${starter.name}.`);
  };

  return (
    <section className="match-preparation page-shell">
      <div className="match-title-row">
        <div>
          <p className="eyebrow">Matchday 01 · Home</p>
          <h1>Prepare for kick-off.</h1>
          <p>Confirm the XI and choose the approach for the full event engine.</p>
        </div>
        <div className="formation-picker match-formation-picker" aria-label="Formation">
          {(Object.keys(FORMATIONS) as Formation[]).map((formation) => (
            <button
              type="button"
              key={formation}
              className={preparation.formation === formation ? 'selected' : ''}
              aria-pressed={preparation.formation === formation}
              onClick={() => changeFormation(formation)}
            >
              {formation}
            </button>
          ))}
        </div>
      </div>
      <div className="match-prep-grid">
        <div>
          <Card className="matchday-xi">
            <div className="matchday-card-heading">
              <div>
                <p className="card-kicker">Starting XI</p>
                <h2>{preparation.formation}</h2>
              </div>
              <span>{errors.length ? 'Needs attention' : 'XI valid'}</span>
            </div>
            {POSITION_ORDER.map((position) => (
              <div className="matchday-position" key={position}>
                <span>{position}</span>
                <div>
                  {starters
                    .filter((player) => player.position === position)
                    .map((player) => (
                      <button
                        type="button"
                        key={player.id}
                        className={selectedStarter === player.id ? 'selected' : ''}
                        aria-pressed={selectedStarter === player.id}
                        onClick={() => {
                          setSelectedStarter(player.id);
                          setMessage(
                            `Now choose a ${player.position} substitute for ${player.name}.`,
                          );
                        }}
                      >
                        <strong>{player.name}</strong>
                        <span>{player.overall}</span>
                      </button>
                    ))}
                </div>
              </div>
            ))}
          </Card>
          <Card className="matchday-bench">
            <p className="card-kicker">Substitutes</p>
            <div>
              {bench.map((player) => (
                <button
                  type="button"
                  key={player.id}
                  onClick={() => swap(player)}
                  className={
                    selectedStarter &&
                    preparation.squad.find((item) => item.id === selectedStarter)?.position ===
                      player.position
                      ? 'compatible'
                      : ''
                  }
                >
                  <span>{player.position}</span>
                  <strong>{player.name}</strong>
                  <small>OVR {player.overall}</small>
                </button>
              ))}
            </div>
          </Card>
          <p className="match-live-message" aria-live="polite">
            {errors[0] ?? message}
          </p>
          <TacticPicker
            value={preparation.tactic}
            onChange={(tactic) => setPreparation({ ...preparation, tactic })}
          />
        </div>
        <aside className="fixture-rail">
          <Card className="fixture-card">
            <p className="card-kicker">Opening fixture · {preparation.identity.stadium}</p>
            <div className="fixture-teams">
              <strong>{preparation.identity.shortName}</strong>
              <span>vs</span>
              <strong>{opponent.name}</strong>
            </div>
            <div className="fixture-odds" aria-label={`${odds.samples} full-engine match sample`}>
              <Stat label="Win" value={pct(odds.win)} />
              <Stat label="Draw" value={pct(odds.draw)} />
              <Stat label="Loss" value={pct(odds.loss)} />
            </div>
            <p className="model-note">
              Guide from {odds.samples} deterministic full-engine team-v-team simulations.
            </p>
            <button
              className="button button-primary button-default fixture-kickoff"
              type="button"
              disabled={errors.length > 0}
              onClick={onKickOff}
            >
              Kick off <span aria-hidden="true">→</span>
            </button>
          </Card>
        </aside>
      </div>
    </section>
  );
}

function useReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    const query = window.matchMedia('(prefers-reduced-motion: reduce)');
    const update = () => setReduced(query.matches);
    update();
    query.addEventListener('change', update);
    return () => query.removeEventListener('change', update);
  }, []);
  return reduced;
}

function scoreThrough(
  events: readonly MatchEvent[],
  index: number,
  homeId: string,
  initialScore: { home: number; away: number },
) {
  const score = { ...initialScore };
  for (const event of events.slice(0, index + 1)) {
    if (event.action !== 'shot' || event.outcome !== 'goal') continue;
    if (event.teamId === homeId) score.home++;
    else score.away++;
  }
  return score;
}

function TimelinePitch({
  events,
  index,
  homeId,
  reducedMotion,
}: {
  events: readonly MatchEvent[];
  index: number;
  homeId: string;
  reducedMotion: boolean;
}) {
  const event = events[index];
  const [atEnd, setAtEnd] = useState(false);
  useEffect(() => {
    setAtEnd(false);
    const frame = requestAnimationFrame(() => setAtEnd(true));
    return () => cancelAnimationFrame(frame);
  }, [index]);
  const locations = visiblePlayerLocations(events, index);
  if (event?.playerId && event.teamId && !atEnd) {
    locations.set(event.playerId, { teamId: event.teamId, point: event.start });
  }
  const ball = toPitchPercent(event ? (atEnd ? event.end : event.start) : { x: 52.5, y: 34 });
  return (
    <div className="timeline-pitch" aria-label="Top-down event playback pitch">
      <div className="timeline-markings" aria-hidden="true" />
      {[...locations].map(([playerId, location]) => {
        const point = toPitchPercent(location.point);
        return (
          <span
            key={playerId}
            className={`timeline-player ${location.teamId === homeId ? 'home' : 'away'}`}
            style={{ left: `${point.x}%`, top: `${point.y}%` }}
            title={playerId}
          />
        );
      })}
      <span
        className="timeline-ball"
        style={{
          left: `${ball.x}%`,
          top: `${ball.y}%`,
          transitionDuration: reducedMotion ? '0ms' : '160ms',
        }}
        aria-hidden="true"
      />
    </div>
  );
}

function MatchViewer({
  events: rawEvents,
  home,
  away,
  mode,
  setMode,
  onComplete,
  onSkipToFullTime,
  initialScore = { home: 0, away: 0 },
}: {
  events: readonly MatchEvent[];
  home: Team;
  away: Team;
  mode: PlaybackMode;
  setMode: (mode: PlaybackMode) => void;
  onComplete: () => void;
  onSkipToFullTime: () => void;
  initialScore?: { home: number; away: number };
}) {
  const events = useMemo(() => orderTimeline(rawEvents), [rawEvents]);
  const reducedMotion = useReducedMotion();
  const duration = playbackDuration(mode, reducedMotion);
  const [index, setIndex] = useState(0);
  const completeRef = useRef(onComplete);
  completeRef.current = onComplete;

  useEffect(() => {
    setIndex(0);
    const started = Date.now();
    if (duration === 0) {
      setIndex(events.length - 1);
      const timeout = window.setTimeout(() => completeRef.current(), 0);
      return () => window.clearTimeout(timeout);
    }
    const interval = window.setInterval(() => {
      const next = timelineIndexAt(events, Date.now() - started, duration);
      setIndex(next);
      if (next >= events.length - 1) {
        window.clearInterval(interval);
        completeRef.current();
      }
    }, 80);
    return () => window.clearInterval(interval);
  }, [duration, events]);

  const event = events[index];
  const score = scoreThrough(events, index, home.id, initialScore);
  const visibleCommentary = events.slice(0, index + 1).filter((item) => item.commentary);
  const announcement = event && isImportantEvent(event) ? event.commentary : '';

  return (
    <section className="viewer-shell page-shell">
      <div className="viewer-scoreboard" aria-label="Scoreboard">
        <span>{formatMatchClock(event)}</span>
        <strong>{home.name}</strong>
        <b>
          {score.home}–{score.away}
        </b>
        <strong>{away.name}</strong>
      </div>
      <div className="viewer-controls" aria-label="Playback options">
        <div>
          {modes.map((item) => (
            <button
              type="button"
              key={item.id}
              className={mode === item.id ? 'selected' : ''}
              aria-pressed={mode === item.id}
              onClick={() => setMode(item.id)}
            >
              {item.label}
            </button>
          ))}
        </div>
        <button type="button" className="skip-button" onClick={onSkipToFullTime}>
          Skip to full time
        </button>
      </div>
      <div className={`viewer-grid ${mode === 'commentary' ? 'commentary-mode' : ''}`}>
        {mode !== 'commentary' ? (
          <div className="pitch-broadcast">
            <TimelinePitch
              events={events}
              index={index}
              homeId={home.id}
              reducedMotion={reducedMotion}
            />
            {announcement ? <div className="event-banner">{announcement}</div> : null}
          </div>
        ) : null}
        <Card className="commentary-feed" aria-label="Match commentary">
          <div className="commentary-heading">
            <p className="card-kicker">Live commentary</p>
            <span>{visibleCommentary.length} events</span>
          </div>
          <ol>
            {visibleCommentary.map((item, itemIndex) => (
              <li
                key={`${item.elapsed}-${itemIndex}`}
                className={isImportantEvent(item) ? 'major' : ''}
              >
                <time>{formatMatchClock(item)}</time>
                <span>{item.commentary}</span>
              </li>
            ))}
          </ol>
        </Card>
      </div>
      <p className="sr-only" role="status" aria-live="polite" aria-atomic="true">
        {announcement}
      </p>
    </section>
  );
}

function StatComparison({ home, away }: { home: TeamStats; away: TeamStats }) {
  const rows: { label: string; home: string | number; away: string | number }[] = [
    { label: 'Shots', home: home.shots, away: away.shots },
    { label: 'On target', home: home.shotsOnTarget, away: away.shotsOnTarget },
    { label: 'xG', home: home.xg.toFixed(2), away: away.xg.toFixed(2) },
    { label: 'Fouls', home: home.fouls, away: away.fouls },
    {
      label: 'Cards',
      home: home.yellowCards + home.redCards,
      away: away.yellowCards + away.redCards,
    },
    { label: 'Injuries', home: home.injuries, away: away.injuries },
  ];
  if (home.possession || away.possession) {
    rows.unshift({ label: 'Possession', home: `${home.possession}%`, away: `${away.possession}%` });
  }
  return (
    <div className="stat-comparison">
      {rows.map((row) => (
        <div key={row.label}>
          <strong>{row.home}</strong>
          <span>{row.label}</span>
          <strong>{row.away}</strong>
        </div>
      ))}
    </div>
  );
}

function HalfTimeScreen({
  session,
  snapshot,
  team,
  away,
  tactic,
  onContinue,
}: {
  session: MatchSession;
  snapshot: MatchSnapshot;
  team: Team;
  away: Team;
  tactic: Tactic;
  onContinue: (tactic: Tactic, substitutions: PendingSubstitution[]) => void;
}) {
  const [nextTactic, setNextTactic] = useState(tactic);
  const [pending, setPending] = useState<PendingSubstitution[]>([]);
  const [off, setOff] = useState('');
  const [on, setOn] = useState('');
  const [message, setMessage] = useState('Review the first half, then make up to five changes.');
  const stats = statsFromEvents(snapshot.events, team.id, away.id);
  const states = new Map(snapshot.players.map((player) => [player.playerId, player]));
  const allPlayers = [...team.players, ...(team.bench ?? [])];
  const onPitch = allPlayers.filter((player) => states.get(player.id)?.onPitch);
  const bench = allPlayers.filter(
    (player) => !states.get(player.id)?.onPitch && !states.get(player.id)?.sentOff,
  );
  const addSubstitution = () => {
    const substitution = { off, on };
    const error = validateSubstitution(team, session.snapshot(), substitution, pending);
    if (error) {
      setMessage(error);
      return;
    }
    setPending([...pending, substitution]);
    const offPlayer = allPlayers.find((player) => player.id === off)!;
    const onPlayer = allPlayers.find((player) => player.id === on)!;
    setMessage(`${onPlayer.name} will replace ${offPlayer.name}.`);
    setOff('');
    setOn('');
  };

  return (
    <section className="half-time page-shell">
      <div className="break-heading">
        <p className="eyebrow">Half-time</p>
        <h1>
          {team.name} {snapshot.score.home}–{snapshot.score.away} {away.name}
        </h1>
        <p>The same Match instance and seeded random stream are paused for your decisions.</p>
      </div>
      <div className="half-time-grid">
        <Card className="half-time-card">
          <p className="card-kicker">First-half statistics</p>
          <StatComparison home={stats.home} away={stats.away} />
        </Card>
        <Card className="half-time-card">
          <p className="card-kicker">Player ratings · squad OVR / live condition</p>
          <div className="half-player-list">
            {onPitch.map((player) => {
              const marketPlayer = player as MarketPlayer;
              const state = states.get(player.id)!;
              return (
                <div key={player.id}>
                  <span>{player.name}</span>
                  <small>{player.position}</small>
                  <strong>{marketPlayer.overall ?? '—'}</strong>
                  <span>{Math.round(state.stamina)}% fit</span>
                </div>
              );
            })}
          </div>
          <p className="model-note">
            OVR is the engine input rating. Official 1–10 match ratings are available at full-time;
            the current engine API does not expose interim match ratings.
          </p>
        </Card>
      </div>
      <div className="half-time-actions-grid">
        <Card className="substitution-card">
          <div className="matchday-card-heading">
            <div>
              <p className="card-kicker">Substitutions</p>
              <h2>
                {snapshot.substitutionsUsed.home + pending.length}/{TUNING.maxSubstitutions} used
              </h2>
            </div>
          </div>
          <div className="substitution-fields">
            <label>
              <span>Player off</span>
              <select value={off} onChange={(event) => setOff(event.target.value)}>
                <option value="">Choose starter</option>
                {onPitch.map((player) => (
                  <option value={player.id} key={player.id}>
                    {player.position} · {player.name}
                  </option>
                ))}
              </select>
            </label>
            <label>
              <span>Player on</span>
              <select value={on} onChange={(event) => setOn(event.target.value)}>
                <option value="">Choose substitute</option>
                {bench.map((player) => (
                  <option value={player.id} key={player.id}>
                    {player.position} · {player.name}
                  </option>
                ))}
              </select>
            </label>
            <button
              type="button"
              className="button button-secondary button-small"
              onClick={addSubstitution}
            >
              Add change
            </button>
          </div>
          <ol className="pending-subs">
            {pending.map((substitution, index) => (
              <li key={`${substitution.off}-${substitution.on}`}>
                {allPlayers.find((player) => player.id === substitution.on)?.name} for{' '}
                {allPlayers.find((player) => player.id === substitution.off)?.name}
                <button
                  type="button"
                  aria-label={`Remove substitution ${index + 1}`}
                  onClick={() => setPending(pending.filter((_, itemIndex) => itemIndex !== index))}
                >
                  Remove
                </button>
              </li>
            ))}
          </ol>
          <p className="match-live-message" aria-live="polite">
            {message}
          </p>
        </Card>
        <TacticPicker value={nextTactic} onChange={setNextTactic} />
      </div>
      <div className="continue-half-row">
        <button
          type="button"
          className="button button-primary button-default"
          onClick={() => onContinue(nextTactic, pending)}
        >
          Continue second half <span aria-hidden="true">→</span>
        </button>
      </div>
    </section>
  );
}

const playerById = (teams: readonly Team[], id: string | null): Player | undefined =>
  teams
    .flatMap((team) => [...team.players, ...(team.bench ?? [])])
    .find((player) => player.id === id);

function FullTimeScreen({ result, home, away }: { result: MatchResult; home: Team; away: Team }) {
  const playerOfMatch = [...result.playerRatings].sort(
    (a, b) => b.rating - a.rating || a.name.localeCompare(b.name),
  )[0];
  const reportEvents = result.events.filter(
    (event) =>
      (event.action === 'shot' && event.outcome === 'goal') ||
      ['card', 'substitution', 'injury'].includes(event.action),
  );
  return (
    <section className="full-time page-shell">
      <div className="full-time-score">
        <p className="eyebrow">Full-time · Matchday 01</p>
        <div>
          <strong>{home.name}</strong>
          <b>
            {result.score.home}–{result.score.away}
          </b>
          <strong>{away.name}</strong>
        </div>
      </div>
      <div className="full-time-grid">
        <Card className="full-time-card">
          <p className="card-kicker">Match statistics</p>
          <StatComparison home={result.stats.home} away={result.stats.away} />
        </Card>
        <Card className="full-time-card player-of-match">
          <p className="card-kicker">Player of the match</p>
          <strong>{playerOfMatch?.rating.toFixed(1)}</strong>
          <h2>{playerOfMatch?.name}</h2>
          <p>
            {playerOfMatch?.goals ?? 0} goals · {playerOfMatch?.assists ?? 0} assists ·{' '}
            {playerOfMatch?.shots ?? 0} shots
          </p>
        </Card>
      </div>
      <div className="full-time-grid details-grid">
        <Card className="full-time-card incident-report">
          <p className="card-kicker">Goals, cards, substitutions and injuries</p>
          {reportEvents.length ? (
            <ol>
              {reportEvents.map((event, index) => (
                <li key={`${event.elapsed}-${index}`}>
                  <time>{formatMatchClock(event)}</time>
                  <span>{event.commentary}</span>
                  {event.playerId ? (
                    <small>{playerById([home, away], event.playerId)?.name}</small>
                  ) : null}
                </li>
              ))}
            </ol>
          ) : (
            <p className="model-note">No major incidents.</p>
          )}
        </Card>
        <Card className="full-time-card ratings-report">
          <p className="card-kicker">Official player ratings</p>
          {[...result.playerRatings]
            .sort((a, b) => b.rating - a.rating || a.name.localeCompare(b.name))
            .map((rating) => (
              <div key={`${rating.teamId}-${rating.playerId}`}>
                <span>{rating.name}</span>
                <small>{rating.teamId === home.id ? home.name : away.name}</small>
                <strong>{rating.rating.toFixed(1)}</strong>
              </div>
            ))}
        </Card>
      </div>
      <div className="full-time-continue">
        <button
          type="button"
          className="button button-primary button-default"
          disabled
          title="League table arrives in Phase 5"
        >
          Continue to league table <span aria-hidden="true">→</span>
        </button>
        <span>Season table and fixture persistence arrive in Phase 5.</span>
      </div>
    </section>
  );
}

export function MatchFlow() {
  const [hydrated, setHydrated] = useState(false);
  const [restored, setRestored] = useState<RestoredFlow | null>(null);
  const [preparation, setPreparation] = useState<MatchPreparation | null>(null);
  const [mode, setMode] = useState<PlaybackMode>('highlights');
  const [stage, setStage] = useState<MatchStage>('preparation');
  const [snapshot, setSnapshot] = useState<MatchSnapshot | null>(null);
  const [result, setResult] = useState<MatchResult | null>(null);
  const sessionRef = useRef<MatchSession | null>(null);

  useEffect(() => {
    try {
      const phase3 = parseSavedFlow(localStorage.getItem(STORAGE_KEY), market);
      if (!phase3 || validateLineup(phase3.selected, phase3.starterIds, phase3.formation).length) {
        setRestored(null);
        return;
      }
      const savedMatch = parseSavedMatchFlow(
        localStorage.getItem(MATCH_STORAGE_KEY),
        phase3.selected,
      );
      const next: MatchPreparation = {
        identity: phase3.identity,
        squad: phase3.selected,
        starterIds: savedMatch?.starterIds ?? phase3.starterIds,
        formation: savedMatch?.formation ?? phase3.formation,
        tactic: savedMatch?.tactic ?? 'balanced',
      };
      setRestored(phase3);
      setPreparation(next);
      setMode(savedMatch?.mode ?? 'highlights');
    } catch {
      setRestored(null);
      try {
        localStorage.removeItem(MATCH_STORAGE_KEY);
      } catch {
        // Recovery screen remains available if storage access is blocked.
      }
    } finally {
      setHydrated(true);
    }
  }, []);

  useEffect(() => {
    if (!hydrated || !preparation) return;
    const saved: SavedMatchFlow = {
      version: 1,
      starterIds: preparation.starterIds,
      formation: preparation.formation,
      tactic: preparation.tactic,
      mode,
    };
    try {
      localStorage.setItem(MATCH_STORAGE_KEY, JSON.stringify(saved));
    } catch {
      // Matchday remains usable without persistent browser storage.
    }
  }, [hydrated, mode, preparation]);

  const input = useMemo(
    () => (preparation ? createMatchInput(preparation, market) : null),
    [preparation],
  );
  const home = useMemo(
    () => (preparation ? createUserMatchTeam(preparation) : null),
    [preparation],
  );
  const away = input?.away ?? null;

  const kickOff = () => {
    if (!input) return;
    const session = new MatchSession(input);
    sessionRef.current = session;
    const half = session.playFirstHalf();
    setSnapshot(half);
    setStage('first_half');
  };

  const reachHalfTime = useCallback(() => setStage('half_time'), []);
  const reachFullTime = useCallback(() => setStage('full_time'), []);
  const skipFirstHalfToFullTime = useCallback(() => {
    const session = sessionRef.current;
    if (!session || !preparation) return;
    setResult(session.continueSecondHalf(preparation.tactic, []));
    setStage('full_time');
  }, [preparation]);
  const continueSecondHalf = (tactic: Tactic, substitutions: PendingSubstitution[]) => {
    const session = sessionRef.current;
    if (!session || !preparation) return;
    const final = session.continueSecondHalf(tactic, substitutions);
    setPreparation({ ...preparation, tactic });
    setResult(final);
    setStage('second_half');
  };

  if (!hydrated) return <main className="match-shell" />;
  if (!restored || !preparation || !input || !home || !away) return <InvalidState />;

  const secondHalfEvents = result
    ? result.events.slice(result.events.findIndex((event) => event.action === 'half_time') + 1)
    : [];

  return (
    <main className="match-shell">
      <MatchHeader identity={preparation.identity} stage={stage} />
      {stage === 'preparation' ? (
        <PreparationScreen
          preparation={preparation}
          setPreparation={setPreparation}
          opponent={away}
          onKickOff={kickOff}
        />
      ) : null}
      {stage === 'first_half' && snapshot ? (
        <MatchViewer
          events={snapshot.events}
          home={home}
          away={away}
          mode={mode}
          setMode={setMode}
          onComplete={mode === 'instant' ? skipFirstHalfToFullTime : reachHalfTime}
          onSkipToFullTime={skipFirstHalfToFullTime}
        />
      ) : null}
      {stage === 'half_time' && snapshot && sessionRef.current ? (
        <HalfTimeScreen
          session={sessionRef.current}
          snapshot={snapshot}
          team={home}
          away={away}
          tactic={preparation.tactic}
          onContinue={continueSecondHalf}
        />
      ) : null}
      {stage === 'second_half' && result ? (
        <MatchViewer
          events={secondHalfEvents}
          home={home}
          away={away}
          mode={mode}
          setMode={setMode}
          onComplete={reachFullTime}
          onSkipToFullTime={reachFullTime}
          initialScore={snapshot?.score}
        />
      ) : null}
      {stage === 'full_time' && result ? (
        <FullTimeScreen result={result} home={home} away={away} />
      ) : null}
    </main>
  );
}
