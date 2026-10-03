import type { Point } from '@pl/engine';
import { CREAM, INK } from '../lib/colours';

export interface PitchDot {
  id: string;
  x: number;
  y: number;
  user: boolean;
}

export interface PitchScene {
  dots: readonly PitchDot[];
  ball: Point;
  /** The player involved in the moment currently animating. */
  highlight: string | null;
  userColour: string;
}

const LINE = 'rgba(245, 241, 228, 0.5)';

/** Draws the 105x68 pitch markings, players and ball. Stripes are CSS (60px bands) underneath. */
export function drawPitch(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  scene: PitchScene,
): void {
  const k = width / 105;
  const px = (x: number) => x * k;
  const py = (y: number) => y * k;
  ctx.clearRect(0, 0, width, height);

  ctx.strokeStyle = LINE;
  ctx.lineWidth = 2;
  ctx.strokeRect(1, 1, width - 2, height - 2);
  ctx.beginPath();
  ctx.moveTo(px(52.5), 0);
  ctx.lineTo(px(52.5), height);
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(px(52.5), py(34), 9.15 * k, 0, Math.PI * 2);
  ctx.stroke();
  for (const side of [0, 1]) {
    const dir = side === 0 ? 1 : -1;
    const edge = side === 0 ? 0 : 105;
    const box = (depth: number, span: number) => {
      const x = side === 0 ? px(edge) : px(edge - depth);
      ctx.strokeRect(x, py(34 - span / 2), depth * k, span * k);
    };
    box(16.5, 40.3);
    box(5.5, 18.3);
    ctx.beginPath();
    ctx.arc(px(edge + dir * 11), py(34), 0.5 * k + 1, 0, Math.PI * 2);
    ctx.fillStyle = LINE;
    ctx.fill();
    ctx.beginPath();
    ctx.arc(
      px(edge + dir * 11),
      py(34),
      9.15 * k,
      side === 0 ? -0.93 : Math.PI - 0.93,
      side === 0 ? 0.93 : Math.PI + 0.93,
    );
    ctx.stroke();
  }

  const radius = Math.max(6, k * 1.15);
  for (const dot of scene.dots) {
    const highlighted = dot.id === scene.highlight;
    ctx.beginPath();
    ctx.arc(px(dot.x), py(dot.y), highlighted ? radius * 1.3 : radius, 0, Math.PI * 2);
    ctx.fillStyle = dot.user ? scene.userColour : CREAM;
    ctx.fill();
    ctx.lineWidth = highlighted ? 3.5 : 2.5;
    ctx.strokeStyle = INK;
    ctx.stroke();
  }

  ctx.beginPath();
  ctx.arc(px(scene.ball.x), py(scene.ball.y), Math.max(4.5, k * 0.7), 0, Math.PI * 2);
  ctx.fillStyle = '#FFFDF6';
  ctx.fill();
  ctx.lineWidth = 2;
  ctx.strokeStyle = INK;
  ctx.stroke();
}
