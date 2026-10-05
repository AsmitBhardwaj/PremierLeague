'use client';

import type { AwardLine } from '@pl/engine';
import { useState } from 'react';
import { Card } from '../components/Card';
import { ClubBadge, positionEdge } from '../components/ClubBadge';
import { presetLabel } from '../play/lib/budget';
import { againstPosition } from '../play/lib/preview';
import { LeagueTable } from './LeagueTable';
import {
  cleanSheets,
  ordinal,
  placesSummary,
  predictedPosition,
  previewComparison,
  resultLetter,
  userPosition,
} from './lib/format';
import type { SeasonView } from './lib/protocol';
import { USER_CLUB_ID } from './lib/setup';

type AwardKind = 'goals' | 'rating';

const unit = (n: number, word: string): string => `${n} ${word}${n === 1 ? '' : 's'}`;

/** The hero number and its unit: "46 goals" or "7.28 avg rating". */
const hero = (kind: AwardKind, line: AwardLine): { value: string; unit: string } =>
  kind === 'goals'
    ? { value: String(line.goals), unit: line.goals === 1 ? 'goal' : 'goals' }
    : { value: line.averageRating.toFixed(2), unit: 'avg rating' };

const secondary = (kind: AwardKind, line: AwardLine): string =>
  kind === 'goals'
    ? `${unit(line.assists, 'assist')} · ${unit(line.appearances, 'app')}`
    : `${unit(line.goals, 'goal')} · ${unit(line.assists, 'assist')} · ${unit(line.appearances, 'app')}`;

/** What the top-three number shows: goals, or a rating set against his position's average. */
const raceNumber = (kind: AwardKind, line: AwardLine): string =>
  kind === 'goals'
    ? String(line.goals)
    : `${line.ratingVsPosition >= 0 ? '+' : '−'}${Math.abs(line.ratingVsPosition).toFixed(2)}`;

/** One award: a card for the winner, and the top three underneath so the race is visible. */
function AwardCard({
  label,
  mine,
  kind,
  race,
  codeOf,
}: {
  label: string;
  /** Your club's awards carry a volt label to set them apart from the league's. */
  mine: boolean;
  kind: AwardKind;
  race: readonly AwardLine[];
  codeOf: (clubId: string) => string;
}) {
  const winner = race[0];
  return (
    <article className="aw">
      <div className={`aw-card${winner ? ` ${positionEdge(winner.position)}` : ''}`}>
        <p className={`aw-label${mine ? ' mine' : ''}`}>{label}</p>
        {winner ? (
          <>
            <div className="aw-who">
              <ClubBadge code={codeOf(winner.clubId)} />
              <h3>{winner.name}</h3>
              <span className="aw-pos">{winner.position}</span>
            </div>
            <p className="aw-hero">
              {hero(kind, winner).value} <span>{hero(kind, winner).unit}</span>
            </p>
            <p className="aw-more">{secondary(kind, winner)}</p>
            {kind === 'rating' ? (
              <p className="aw-vs">{againstPosition(winner.ratingVsPosition, winner.position)}</p>
            ) : null}
          </>
        ) : (
          <p className="aw-more">Nobody scored this season.</p>
        )}
      </div>
      {race.length > 0 ? (
        <ol className="aw-race" aria-label={`${label}: top ${race.length}`}>
          {race.map((line, index) => (
            <li key={line.playerId}>
              <b>{index + 1}</b>
              <span className="aw-race-name">{line.name}</span>
              <span className="aw-race-club">{codeOf(line.clubId)}</span>
              <strong>{raceNumber(kind, line)}</strong>
            </li>
          ))}
        </ol>
      ) : null}
    </article>
  );
}

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
  const comparison = previewComparison(
    view.prediction,
    {
      points: row.points,
      goalsFor: row.goalsFor,
      goalsAgainst: row.goalsAgainst,
      cleanSheets: cleanSheets(view.results),
    },
    awards?.userTopScorer ?? null,
  );
  const name = view.identity.name;
  const budgetLabel = presetLabel(view.identity.budget);
  const codeOf = (clubId: string): string =>
    clubId === USER_CLUB_ID ? view.identity.shortName || name : clubId;
  const shareText = `${name} (${budgetLabel}) finished ${ordinal(position)} with ${row.points} points in a 38-match season (${won}W ${drawn}D ${lost}L). ${summary}.${
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
      <h2 id="se-end-title">
        Finished {ordinal(position)} with {row.points} points
      </h2>
      <p className="se-finale-places">{summary}</p>
      <p>
        {won} won, {drawn} drawn, {lost} lost · {row.goalsFor} scored, {row.goalsAgainst} conceded.
      </p>
      {comparison.length > 0 ? (
        <Card className="se-versus" aria-label="The season against the preview">
          <p className="card-kicker">Against the preview</p>
          <ul>
            {comparison.map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ul>
        </Card>
      ) : null}

      <Card className="se-season-card" aria-label="Season card">
        <p className="card-kicker">
          {name} · {budgetLabel} · season card
        </p>
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
        <div className="aw-grid">
          <AwardCard
            label="Top scorer"
            mine={false}
            kind="goals"
            race={awards.races.topScorer}
            codeOf={codeOf}
          />
          <AwardCard
            label="Player of the season"
            mine={false}
            kind="rating"
            race={awards.races.playerOfSeason}
            codeOf={codeOf}
          />
          <AwardCard
            label="Your top scorer"
            mine
            kind="goals"
            race={awards.races.userTopScorer}
            codeOf={codeOf}
          />
          <AwardCard
            label="Your player of the season"
            mine
            kind="rating"
            race={awards.races.userBestPlayer}
            codeOf={codeOf}
          />
        </div>
      ) : null}
      <p className="aw-note">
        Players of the season are ranked by rating against the average for their position (the
        figures in the top three), so a keeper does not win on his position alone.
      </p>

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
