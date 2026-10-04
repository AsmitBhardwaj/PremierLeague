import type { Projection as ProjectionData, SeasonPrediction } from '@pl/engine';
import { about, finishRange, oddsLines, ordinal, pointsFrom, verdictOf } from '../play/lib/preview';

/** Predicted finish from the current table, in fan words, next to the pre-season preview. */
export function ProjectionPanel({
  projection,
  prediction,
  heading = 'Predicted finish',
}: {
  projection: ProjectionData;
  prediction: SeasonPrediction;
  heading?: string;
}) {
  const distribution = projection.positions.map((probability, i) => ({
    position: i + 1,
    probability,
    count: 0,
  }));
  const odds = {
    positionDistribution: distribution,
    titleProbability: projection.title,
    top4Probability: projection.top4,
    relegationProbability: projection.relegation,
  };
  const finish = finishRange(distribution);
  const verdict = verdictOf(odds);
  const before = finishRange(prediction.positionDistribution).likely;
  return (
    <div className="se-card">
      <p className="mt-kicker">{heading}</p>
      <p className="se-big">
        {ordinal(finish.likely)}
        <span>
          {' '}
          most likely
          {finish.best !== finish.worst
            ? ` — anywhere from ${ordinal(finish.best)} to ${ordinal(finish.worst)}`
            : ''}
        </span>
      </p>
      <p className="se-verdict">{verdict.label}</p>
      <p className="mt-muted">On course for {about(projection.meanPoints)} points.</p>
      <dl className="se-facts se-odds">
        {oddsLines(odds).map((line) => (
          <div key={line.label}>
            <dt>{line.label}</dt>
            <dd>{line.phrase}</dd>
          </div>
        ))}
      </dl>
      <p className="mt-muted">
        Before kick-off: tipped {ordinal(before)},{' '}
        {about(prediction.teamStats ? pointsFrom(prediction.teamStats) : prediction.meanPoints)}{' '}
        points.
      </p>
    </div>
  );
}
