import type { RadarAxis } from '../lib/radar';

const SIZE = 260;
const CENTRE = SIZE / 2;
const RADIUS = 78;

const point = (index: number, count: number, scale: number): [number, number] => {
  const angle = -Math.PI / 2 + (index / count) * Math.PI * 2;
  return [CENTRE + Math.cos(angle) * RADIUS * scale, CENTRE + Math.sin(angle) * RADIUS * scale];
};

const path = (points: [number, number][]) =>
  points.map(([x, y], index) => `${index ? 'L' : 'M'}${x.toFixed(1)} ${y.toFixed(1)}`).join(' ') +
  ' Z';

/** Six-axis radar of engine ratings (0-100). Ink outline, volt fill, no gradients. */
export function Radar({ axes, name }: { axes: RadarAxis[]; name: string }) {
  const count = axes.length;
  return (
    <svg
      className="mt-radar"
      viewBox={`0 0 ${SIZE} ${SIZE - 36}`}
      role="img"
      aria-label={`${name} radar: ${axes.map((axis) => `${axis.label} ${axis.value}`).join(', ')}`}
    >
      <g transform="translate(0 -18)">
        {[0.25, 0.5, 0.75, 1].map((ring) => (
          <path
            key={ring}
            d={path(axes.map((_, index) => point(index, count, ring)))}
            className="mt-radar-ring"
          />
        ))}
        {axes.map((axis, index) => {
          const [x, y] = point(index, count, 1);
          return (
            <line key={axis.key} x1={CENTRE} y1={CENTRE} x2={x} y2={y} className="mt-radar-spoke" />
          );
        })}
        <path
          d={path(axes.map((axis, index) => point(index, count, axis.value / 100)))}
          className="mt-radar-shape"
        />
        {axes.map((axis, index) => {
          const [x, y] = point(index, count, 1.26);
          const anchor = Math.abs(x - CENTRE) < 4 ? 'middle' : x < CENTRE ? 'end' : 'start';
          return (
            <text key={axis.key} x={x} y={y + 4} textAnchor={anchor} className="mt-radar-label">
              {axis.short}
            </text>
          );
        })}
      </g>
    </svg>
  );
}
