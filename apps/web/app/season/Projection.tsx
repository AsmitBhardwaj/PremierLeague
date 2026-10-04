import type { Projection as ProjectionData, SeasonPrediction } from '@pl/engine';
import { ordinal, percent } from './lib/format';

/** Predicted finish from the current table, next to the pre-season prediction. */
export function ProjectionPanel({
  projection,
  prediction,
  heading = 'Predicted finish',
}: {
  projection: ProjectionData;
  prediction: SeasonPrediction;
  heading?: string;
}) {
  const likely = projection.positions.reduce(
    (best, p, i) => (p > projection.positions[best]! ? i : best),
    0,
  );
  const preLikely = prediction.positionDistribution.reduce((best, row) =>
    row.probability > best.probability ? row : best,
  ).position;
  return (
    <div className="se-card">
      <p className="mt-kicker">{heading}</p>
      <p className="se-big">
        {ordinal(likely + 1)}
        <span> most likely · about {projection.meanPoints.toFixed(0)} points</span>
      </p>
      <dl className="se-facts">
        <div>
          <dt>Title</dt>
          <dd>{percent(projection.title)}</dd>
        </div>
        <div>
          <dt>Top four</dt>
          <dd>{percent(projection.top4)}</dd>
        </div>
        <div>
          <dt>Relegation</dt>
          <dd>{percent(projection.relegation)}</dd>
        </div>
      </dl>
      <p className="mt-muted">
        Pre-season: {ordinal(preLikely)} most likely, about {prediction.meanPoints.toFixed(0)}{' '}
        points.
      </p>
    </div>
  );
}
