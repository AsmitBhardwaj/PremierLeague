'use client';

import type { AwardLine } from '@pl/engine';
import { useState } from 'react';
import { Card } from '../components/Card';
import { LeagueTable } from './LeagueTable';
import {
  ordinal,
  placesSummary,
  predictedPosition,
  resultLetter,
  userPosition,
} from './lib/format';
import type { SeasonView } from './lib/protocol';

function Award({
  label,
  line,
  names,
  stat,
}: {
  label: string;
  line: AwardLine | null;
  names: ReadonlyMap<string, string>;
  stat: (line: AwardLine) => string;
}) {
  return (
    <div className="se-award">
      <dt>{label}</dt>
      {line ? (
        <dd>
          <strong>{line.name}</strong>
          <span>
            {line.position} · {names.get(line.clubId) ?? line.clubId}
          </span>
          <span>{stat(line)}</span>
        </dd>
      ) : (
        <dd>
          <span>None</span>
        </dd>
      )}
    </div>
  );
}

const goalsLine = (l: AwardLine) =>
  `${l.goals} ${l.goals === 1 ? 'goal' : 'goals'} · ${l.assists} ${l.assists === 1 ? 'assist' : 'assists'}`;
const ratingLine = (l: AwardLine) =>
  `${l.averageRating.toFixed(2)} average rating · ${l.appearances} appearances`;

/** The season is over: final table, finish against the prediction, awards and a share card. */
export function SeasonFinale({
  view,
  names,
  onNewSeason,
}: {
  view: SeasonView;
  names: ReadonlyMap<string, string>;
  onNewSeason: () => void;
}) {
  const [shareStatus, setShareStatus] = useState('');
  const [manualCopy, setManualCopy] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const position = userPosition(view.table);
  const row = view.table[position - 1]!;
  const predicted = predictedPosition(view.prediction);
  const won = view.results.filter((r) => resultLetter(r) === 'W').length;
  const drawn = view.results.filter((r) => resultLetter(r) === 'D').length;
  const lost = view.results.filter((r) => resultLetter(r) === 'L').length;
  const summary = placesSummary(predicted, position);
  const awards = view.awards;
  const name = view.identity.name;
  const shareText = `${name} finished ${ordinal(position)} with ${row.points} points in a simulated Premier League season (${won}W ${drawn}D ${lost}L). ${summary}.${
    awards?.userTopScorer
      ? ` Top scorer: ${awards.userTopScorer.name}, ${awards.userTopScorer.goals} goals.`
      : ''
  }`;
  const link = () => `${location.origin}/`;

  const share = async () => {
    try {
      if (navigator.share) {
        await navigator.share({ title: `${name} season`, text: shareText, url: link() });
        setShareStatus('Season shared.');
        return;
      }
      if (navigator.clipboard) {
        await navigator.clipboard.writeText(`${shareText} ${link()}`);
        setShareStatus('Season copied to your clipboard.');
        return;
      }
      setManualCopy(true);
      setShareStatus('Select and copy the result below.');
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') return;
      setManualCopy(true);
      setShareStatus('Select and copy the result below.');
    }
  };

  return (
    <section className="se-window se-finale page-shell" aria-labelledby="se-end-title">
      <p className="mt-kicker">Full time on the season</p>
      <h1 id="se-end-title">
        Finished {ordinal(position)} with {row.points} points
      </h1>
      <p className="se-finale-places">{summary}</p>
      <p>
        {won} won, {drawn} drawn, {lost} lost · {row.goalsFor} scored, {row.goalsAgainst} conceded ·
        pre-season forecast about {view.prediction.meanPoints.toFixed(0)} points.
      </p>

      <Card className="se-season-card" aria-label="Season card">
        <p className="card-kicker">{name} · season card</p>
        <p className="se-card-position">{ordinal(position)}</p>
        <dl className="se-facts">
          <div>
            <dt>Points</dt>
            <dd>{row.points}</dd>
          </div>
          <div>
            <dt>Record</dt>
            <dd>
              {won}-{drawn}-{lost}
            </dd>
          </div>
          <div>
            <dt>Goal difference</dt>
            <dd>{row.goalDifference > 0 ? `+${row.goalDifference}` : row.goalDifference}</dd>
          </div>
        </dl>
        <p className="se-card-places">{summary}</p>
        {awards?.userTopScorer ? (
          <p className="mt-muted">
            Top scorer: {awards.userTopScorer.name}, {awards.userTopScorer.goals} goals
          </p>
        ) : null}
        <div className="share-row">
          <button className="button button-primary button-default" type="button" onClick={share}>
            Share season <span aria-hidden="true">↗</span>
          </button>
          <span aria-live="polite">{shareStatus}</span>
        </div>
        {manualCopy ? (
          <textarea
            readOnly
            value={`${shareText} ${typeof location === 'undefined' ? '' : link()}`}
            aria-label="Season text to copy"
          />
        ) : null}
      </Card>

      {awards ? (
        <div className="se-awards-grid">
          <Card>
            <p className="card-kicker">League awards</p>
            <dl className="se-awards">
              <Award label="Top scorer" line={awards.topScorer} names={names} stat={goalsLine} />
              <Award
                label="Player of the season"
                line={awards.playerOfSeason}
                names={names}
                stat={ratingLine}
              />
            </dl>
          </Card>
          <Card>
            <p className="card-kicker">Your club</p>
            <dl className="se-awards">
              <Award
                label="Your top scorer"
                line={awards.userTopScorer}
                names={names}
                stat={goalsLine}
              />
              <Award
                label="Your best player"
                line={awards.userBestPlayer}
                names={names}
                stat={ratingLine}
              />
            </dl>
          </Card>
        </div>
      ) : null}

      <LeagueTable table={view.table} names={names} caption="Final league table" />

      <div className="se-actions">
        {confirming ? (
          <div className="se-swap" role="group" aria-label="Confirm a new season">
            <p>
              Start a new season? This season&apos;s save is cleared. You keep your club, and go
              back to building a new squad.
            </p>
            <div className="se-actions">
              <button
                type="button"
                className="button button-primary button-default"
                onClick={onNewSeason}
              >
                Yes, start a new season
              </button>
              <button
                type="button"
                className="button button-secondary button-default"
                onClick={() => setConfirming(false)}
              >
                Keep this summary
              </button>
            </div>
          </div>
        ) : (
          <button
            type="button"
            className="button button-primary button-default"
            onClick={() => setConfirming(true)}
          >
            Start a new season <span aria-hidden="true">→</span>
          </button>
        )}
      </div>
    </section>
  );
}
