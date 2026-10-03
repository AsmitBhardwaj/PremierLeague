'use client';

import type { MatchEvent, Point, Side } from '@pl/engine';
import { useCallback, useMemo, useRef } from 'react';
import { userDotColour } from '../lib/colours';
import {
  activePlayers,
  formationAnchors,
  offBallTarget,
  type LineupTeam,
  type PlaybackFrame,
  type Schedule,
} from '../lib/timeline';
import { drawPitch, type PitchDot } from './pitchDraw';

/**
 * The real match renderer: draws the engine's event timeline on a canvas. It only reads events;
 * the ball follows event positions and off-ball dots drift cosmetically around formation anchors.
 * Shared by the match viewer and the landing-page preview.
 */
export function useHighlightsPitch({
  allEvents,
  startIndex,
  schedule,
  home,
  away,
  userSide,
  userColour,
}: {
  allEvents: readonly MatchEvent[];
  startIndex: number;
  schedule: Schedule;
  home: LineupTeam;
  away: LineupTeam;
  /** The side drawn in the club colour; null draws both sides cream. */
  userSide: Side | null;
  userColour: string | undefined;
}) {
  const wrapperRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const anchors = useMemo(
    () => ({ home: formationAnchors(home, 'home'), away: formationAnchors(away, 'away') }),
    [home, away],
  );
  const scene = useRef({
    dots: new Map<string, { x: number; y: number }>(),
    ball: { x: 52.5, y: 34 } as Point,
    holdFrom: { x: 52.5, y: 34 } as Point,
    holdIndex: -1,
    possession: null as Side | null,
    revealed: -1,
    actives: [] as { id: string; side: Side; slot: number; keeper: boolean }[],
  });

  const reset = useCallback(() => {
    const state = scene.current;
    state.revealed = -1;
    state.dots.clear();
    state.ball = { x: 52.5, y: 34 };
    state.holdIndex = -1;
    state.possession = null;
  }, []);

  const draw = useCallback(
    (frame: PlaybackFrame, dt: number) => {
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
        userColour: userDotColour(userColour),
      });
    },
    [allEvents, anchors, home, away, schedule, startIndex, userSide, userColour],
  );

  return { wrapperRef, canvasRef, draw, reset };
}
