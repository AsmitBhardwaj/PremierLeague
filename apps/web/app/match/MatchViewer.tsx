'use client';

import type { MatchEvent, Side, Team } from '@pl/engine';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useHighlightsPitch } from './components/useHighlightsPitch';
import { userDotColour } from './lib/colours';
import { SPEEDS, usePlaybackSpeed } from './lib/speed';
import {
  bannerAt,
  bannerEntriesOf,
  bannerFor,
  buildSchedule,
  formatClock,
  frameAt,
  isFeedKind,
  isGoal,
  scoreAt,
  type Banner,
  type PlaybackMode,
} from './lib/timeline';

export const MODES: { id: PlaybackMode; label: string }[] = [
  { id: 'highlights', label: 'Highlights' },
  { id: 'commentary', label: 'Text commentary' },
  { id: 'instant', label: 'Instant result' },
];

const FEED_TAGS: Record<string, string> = {
  goal: 'Goal',
  big_chance: 'Chance',
  shot: 'Shot',
  card: 'Card',
  injury: 'Injury',
  substitution: 'Sub',
  tactic_change: 'Tactic',
  kickoff: 'KO',
  half_time: 'HT',
  full_time: 'FT',
  foul: 'Foul',
  corner: 'Corner',
};

export interface ViewerSides {
  home: Team;
  away: Team;
  /** Short broadcast names for the score bug. */
  homeLabel: string;
  awayLabel: string;
  userSide: Side;
  userColour: string;
}

interface Ui {
  revealed: number;
  banner: (Banner & { key: number }) | null;
  paused: boolean;
}

export function MatchViewer({
  allEvents,
  startIndex,
  sides,
  period,
  mode,
  onModeChange,
  onComplete,
  onSkip,
  seed,
}: {
  /** Every event from kick-off through the end of this half. */
  allEvents: readonly MatchEvent[];
  /** Index of the first event of this half within `allEvents`. */
  startIndex: number;
  sides: ViewerSides;
  period: 1 | 2;
  mode: Exclude<PlaybackMode, 'instant'>;
  onModeChange: (mode: PlaybackMode) => void;
  onComplete: () => void;
  onSkip: () => void;
  seed: number;
}) {
  const { home, away, userSide } = sides;
  const halfEvents = useMemo(() => allEvents.slice(startIndex), [allEvents, startIndex]);
  const schedule = useMemo(() => buildSchedule(halfEvents), [halfEvents]);
  const bannerEntries = useMemo(() => bannerEntriesOf(schedule), [schedule]);
  const feedEntries = useMemo(
    () =>
      schedule.entries
        .map((entry, index) => ({ entry, index }))
        .filter(({ entry }) => isFeedKind(entry.kind)),
    [schedule],
  );

  const timeRef = useRef(0);
  const pausedRef = useRef(false);
  const doneRef = useRef(false);
  const [speed, setSpeed] = usePlaybackSpeed();
  const speedRef = useRef(speed);
  speedRef.current = speed;
  const [ui, setUi] = useState<Ui>({ revealed: 0, banner: null, paused: false });
  const [finished, setFinished] = useState(false);
  const onCompleteRef = useRef(onComplete);
  onCompleteRef.current = onComplete;

  const { wrapperRef, canvasRef, draw, reset } = useHighlightsPitch({
    allEvents,
    startIndex,
    schedule,
    home,
    away,
    userSide,
    userColour: sides.userColour,
  });

  useEffect(() => {
    timeRef.current = 0;
    doneRef.current = false;
    setFinished(false);
    reset();
    let raf = 0;
    let last = performance.now();
    let completeTimer: ReturnType<typeof setTimeout> | undefined;
    const tick = (now: number) => {
      // Speed scales the playback clock (and the animation step with it); nothing else.
      const dt = Math.min(64, now - last) * speedRef.current;
      last = now;
      if (!pausedRef.current && !doneRef.current) {
        timeRef.current = Math.min(schedule.totalMs, timeRef.current + dt);
      }
      const frame = frameAt(schedule, timeRef.current);
      const banner: Ui['banner'] = bannerAt(bannerEntries, timeRef.current);
      setUi((previous) =>
        previous.revealed === frame.revealed &&
        previous.banner?.key === banner?.key &&
        previous.paused === pausedRef.current
          ? previous
          : { revealed: frame.revealed, banner, paused: pausedRef.current },
      );
      draw(frame, dt);
      if (timeRef.current >= schedule.totalMs && !doneRef.current) {
        doneRef.current = true;
        setFinished(true);
        completeTimer = setTimeout(() => onCompleteRef.current(), 1100);
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(raf);
      if (completeTimer) clearTimeout(completeTimer);
    };
  }, [schedule, bannerEntries, draw, reset]);

  const seen = allEvents.slice(0, startIndex + ui.revealed);
  const score = scoreAt(seen, home.id);
  const lastEvent = seen.at(-1);
  const visibleFeed = feedEntries
    .filter(({ index }) => index < ui.revealed)
    .slice(-60)
    .reverse();
  const status = finished ? (period === 1 ? 'HT' : 'FT') : null;
  const userLabel = userSide === 'home' ? sides.homeLabel : sides.awayLabel;

  const togglePause = () => {
    pausedRef.current = !pausedRef.current;
    setUi((previous) => ({ ...previous, paused: pausedRef.current }));
  };

  return (
    <section className="mv page-shell" aria-label="Match viewer">
      <div className="mv-bug" role="group" aria-label="Scoreboard">
        {status ? (
          <span className="mv-tag">{status}</span>
        ) : (
          <span className="mv-tag live">Live</span>
        )}
        <span className={`mv-team ${userSide === 'home' ? 'user' : ''}`}>
          <i
            aria-hidden="true"
            style={
              userSide === 'home' ? { background: userDotColour(sides.userColour) } : undefined
            }
          />
          {sides.homeLabel}
        </span>
        <strong className="mv-score" aria-label={`Score ${score.home} ${score.away}`}>
          {score.home}
          <span aria-hidden="true">–</span>
          {score.away}
        </strong>
        <span className={`mv-team away ${userSide === 'away' ? 'user' : ''}`}>
          {sides.awayLabel}
          <i
            aria-hidden="true"
            style={
              userSide === 'away' ? { background: userDotColour(sides.userColour) } : undefined
            }
          />
        </span>
        <time className="mv-clock">{formatClock(lastEvent)}</time>
        <span className="mv-half">{period === 1 ? '1st half' : '2nd half'}</span>
      </div>
      <p className="mv-you">
        <i aria-hidden="true" style={{ background: userDotColour(sides.userColour) }} />
        {userLabel} are the {userSide === 'home' ? 'home' : 'away'} side. Home attacks left to
        right.
      </p>

      <div className={`mv-grid ${mode === 'commentary' ? 'text-only' : ''}`}>
        {mode === 'highlights' ? (
          <div className="mv-stage">
            <div
              className="mv-pitch viewer-pitch"
              ref={wrapperRef}
              role="img"
              aria-label="Top-down pitch playing back the match events"
            >
              <canvas ref={canvasRef} />
              {ui.banner ? (
                <div className={`mv-banner ${ui.banner.tone}`} key={ui.banner.key}>
                  <strong>{ui.banner.title}</strong>
                  <span>{ui.banner.text}</span>
                </div>
              ) : null}
            </div>
          </div>
        ) : null}

        <div className="mv-feed">
          <h2>Live commentary</h2>
          <ol role="log" aria-live="off">
            {visibleFeed.map(({ entry, index }) => {
              const banner = bannerFor(entry);
              return (
                <li key={index} className={`feed-${banner?.tone ?? entry.kind}`}>
                  <time>{formatClock(entry.event)}</time>
                  <b>{entry.kind === 'card' && banner ? banner.title : FEED_TAGS[entry.kind]}</b>
                  <span>{entry.event.commentary}</span>
                </li>
              );
            })}
          </ol>
          <p className="mv-sr" aria-live="polite">
            {lastEvent && isGoal(lastEvent) ? lastEvent.commentary : ''}
          </p>
        </div>
      </div>

      <div className="mv-controls">
        <div className="mv-modes" role="group" aria-label="Viewing mode">
          {MODES.map((item) => (
            <button
              key={item.id}
              type="button"
              className={mode === item.id ? 'selected' : ''}
              aria-pressed={mode === item.id}
              onClick={() => onModeChange(item.id)}
            >
              {item.label}
            </button>
          ))}
        </div>
        <div className="mv-modes mv-speed" role="group" aria-label="Playback speed">
          {SPEEDS.map((item) => (
            <button
              key={item}
              type="button"
              className={speed === item ? 'selected' : ''}
              aria-pressed={speed === item}
              onClick={() => setSpeed(item)}
            >
              ×{item}
            </button>
          ))}
        </div>
        <button type="button" className="mv-pause" onClick={togglePause} disabled={finished}>
          {ui.paused ? 'Resume' : 'Pause'}
        </button>
        <button type="button" className="button button-primary button-default" onClick={onSkip}>
          Skip to full time <span aria-hidden="true">→</span>
        </button>
      </div>
      <p className="mt-seed">Match seed {seed}</p>
    </section>
  );
}
