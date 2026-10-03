'use client';

import type { MatchEvent, Point, Side, Team } from '@pl/engine';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { drawPitch, type PitchDot } from './components/pitchDraw';
import { userDotColour } from './lib/colours';
import {
  activePlayers,
  bannerFor,
  buildSchedule,
  formationAnchors,
  formatClock,
  frameAt,
  isFeedKind,
  isGoal,
  offBallTarget,
  scoreAt,
  type Banner,
  type PlaybackMode,
} from './lib/timeline';

export const MODES: { id: PlaybackMode; label: string }[] = [
  { id: 'highlights', label: 'Highlights' },
  { id: 'commentary', label: 'Text commentary' },
  { id: 'instant', label: 'Instant result' },
];

const BANNER_LINGER_MS = 700;
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

interface Dot {
  x: number;
  y: number;
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
  const bannerEntries = useMemo(
    () =>
      schedule.entries
        .map((entry, index) => ({ entry, index }))
        .filter(({ entry }) => bannerFor(entry) !== null),
    [schedule],
  );
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
  const [ui, setUi] = useState<Ui>({ revealed: 0, banner: null, paused: false });
  const [finished, setFinished] = useState(false);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const onCompleteRef = useRef(onComplete);
  onCompleteRef.current = onComplete;

  const anchors = useMemo(
    () => ({ home: formationAnchors(home, 'home'), away: formationAnchors(away, 'away') }),
    [home, away],
  );

  const scene = useRef({
    dots: new Map<string, Dot>(),
    ball: { x: 52.5, y: 34 } as Point,
    holdFrom: { x: 52.5, y: 34 } as Point,
    holdIndex: -1,
    possession: null as Side | null,
    revealed: -1,
    actives: [] as { id: string; side: Side; slot: number; keeper: boolean }[],
  });

  const draw = useCallback(
    (frame: ReturnType<typeof frameAt>, dt: number) => {
      const canvas = canvasRef.current;
      const ctx = canvas?.getContext('2d');
      const wrapper = wrapperRef.current;
      if (!canvas || !ctx || !wrapper) return;
      const cssWidth = wrapper.clientWidth;
      const cssHeight = (cssWidth * 68) / 105;
      const ratio = window.devicePixelRatio || 1;
      if (canvas.width !== Math.round(cssWidth * ratio)) {
        canvas.width = Math.round(cssWidth * ratio);
        canvas.height = Math.round(cssHeight * ratio);
      }
      ctx.setTransform(ratio, 0, 0, ratio, 0, 0);

      const state = scene.current;
      const entry = frame.index >= 0 ? schedule.entries[frame.index]! : null;
      if (entry?.event.teamId) state.possession = entry.event.teamId === home.id ? 'home' : 'away';

      // Ball: follows the engine's event positions. Animated moments travel start -> end.
      if (frame.hold && entry) {
        if (state.holdIndex !== frame.index) {
          state.holdIndex = frame.index;
          state.holdFrom = { ...state.ball };
        }
        const { start, end } = entry.event;
        const p = frame.hold.progress;
        if (p < 0.3) {
          const u = p / 0.3;
          state.ball = {
            x: state.holdFrom.x + (start.x - state.holdFrom.x) * u,
            y: state.holdFrom.y + (start.y - state.holdFrom.y) * u,
          };
        } else {
          const u = 1 - (1 - (p - 0.3) / 0.7) ** 2;
          state.ball = { x: start.x + (end.x - start.x) * u, y: start.y + (end.y - start.y) * u };
        }
      } else if (entry) {
        state.holdIndex = -1;
        const k = Math.min(1, dt * 0.012);
        state.ball = {
          x: state.ball.x + (entry.event.end.x - state.ball.x) * k,
          y: state.ball.y + (entry.event.end.y - state.ball.y) * k,
        };
      }

      if (state.revealed !== frame.revealed) {
        state.revealed = frame.revealed;
        const seen = allEvents.slice(0, startIndex + frame.revealed);
        state.actives = (['home', 'away'] as const).flatMap((side) =>
          activePlayers(side === 'home' ? home : away, seen).map(({ playerId, slot }) => ({
            id: playerId,
            side,
            slot,
            keeper: (side === 'home' ? home : away).players[slot]?.position === 'GK',
          })),
        );
      }

      const carrier = entry?.event.playerId ?? null;
      const move = Math.min(1, dt * 0.015);
      const dots: PitchDot[] = [];
      for (const player of state.actives) {
        const anchor = anchors[player.side][player.slot]!;
        let target: Point = offBallTarget(
          anchor,
          player.side,
          player.keeper,
          state.ball,
          state.possession,
        );
        if (carrier === player.id) target = frame.hold && entry ? entry.event.start : state.ball;
        const dot = state.dots.get(player.id) ?? { x: anchor.x, y: anchor.y };
        dot.x += (target.x - dot.x) * move;
        dot.y += (target.y - dot.y) * move;
        state.dots.set(player.id, dot);
        dots.push({ id: player.id, x: dot.x, y: dot.y, user: player.side === userSide });
      }
      drawPitch(ctx, cssWidth, cssHeight, {
        dots,
        ball: state.ball,
        highlight: frame.hold ? (entry?.event.playerId ?? null) : null,
        userColour: userDotColour(sides.userColour),
      });
    },
    [allEvents, anchors, home, schedule, sides.userColour, startIndex, userSide],
  );

  useEffect(() => {
    timeRef.current = 0;
    doneRef.current = false;
    setFinished(false);
    scene.current.revealed = -1;
    scene.current.dots.clear();
    scene.current.ball = { x: 52.5, y: 34 };
    scene.current.holdIndex = -1;
    let raf = 0;
    let last = performance.now();
    let completeTimer: ReturnType<typeof setTimeout> | undefined;
    const tick = (now: number) => {
      const dt = Math.min(64, now - last);
      last = now;
      if (!pausedRef.current && !doneRef.current) {
        timeRef.current = Math.min(schedule.totalMs, timeRef.current + dt);
      }
      const frame = frameAt(schedule, timeRef.current);
      let banner: Ui['banner'] = null;
      for (let i = bannerEntries.length - 1; i >= 0; i--) {
        const { entry, index } = bannerEntries[i]!;
        if (entry.startMs <= timeRef.current) {
          if (timeRef.current <= entry.startMs + entry.holdMs + BANNER_LINGER_MS) {
            banner = { ...bannerFor(entry)!, key: index };
          }
          break;
        }
      }
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
  }, [schedule, bannerEntries, draw]);

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
