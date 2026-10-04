'use client';

import type { ForecastSummary, PlayerForecast, SeasonPrediction } from '@pl/engine';
import { useState } from 'react';
import { Card } from '../components/Card';
import type { ClubIdentity } from './lib/persistence';
import {
  about,
  finishRange,
  fixturePicks,
  oddsLines,
  ordinal,
  pointsFrom,
  recordLine,
  signed,
  verdictOf,
  type FixturePick,
} from './lib/preview';
import './preview.css';

const venueText = (pick: FixturePick, kind: 'trip' | 'home' | 'banker'): string =>
  kind === 'trip'
    ? `${pick.opponent} away`
    : kind === 'home'
      ? `${pick.opponent} at home`
      : `${pick.opponent} ${pick.venue === 'home' ? 'at home' : 'away'}`;

/** Plain-text summary used by the share button. */
export function previewShareText(
  clubName: string,
  prediction: SeasonPrediction,
  forecast: ForecastSummary | null,
): string {
  const finish = finishRange(prediction.positionDistribution);
  const verdict = verdictOf(prediction);
  const stats = prediction.teamStats;
  const parts = [
    `${clubName}: ${verdict.label}. Most likely ${ordinal(finish.likely)}, anywhere from ${ordinal(finish.best)} to ${ordinal(finish.worst)}.`,
  ];
  if (stats) {
    parts.push(
      `Predicted record ${recordLine(stats)}, ${about(pointsFrom(stats))} points, ${about(stats.goalsFor)} goals scored, ${about(stats.goalsAgainst)} conceded.`,
    );
  }
  if (forecast?.topScorer) {
    parts.push(`Top scorer ${forecast.topScorer.name} (${about(forecast.topScorer.goals)} goals).`);
  }
  return parts.join(' ');
}

function Fact({ label, value, note }: { label: string; value: string; note?: string }) {
  return (
    <div className="pv-fact">
      <dt>{label}</dt>
      <dd>
        {value}
        {note ? <small>{note}</small> : null}
      </dd>
    </div>
  );
}

function PlayerLine({
  label,
  player,
  value,
}: {
  label: string;
  player: PlayerForecast | null | undefined;
  value: (p: PlayerForecast) => string;
}) {
  return (
    <div className="pv-player">
      <dt>{label}</dt>
      {player ? (
        <dd>
          <strong>{player.name}</strong>
          <span className={`pv-pos pv-pos-${player.position.toLowerCase()}`}>
            {player.position}
          </span>
          <em>{value(player)}</em>
        </dd>
      ) : (
        <dd className="pv-pending" aria-busy="true">
          Working it out…
        </dd>
      )}
    </div>
  );
}

export function SeasonPreview({
  identity,
  replacedName,
  prediction,
  forecast,
  forecastDone,
  crest,
  onBack,
}: {
  identity: ClubIdentity;
  replacedName: string;
  prediction: SeasonPrediction;
  forecast: ForecastSummary | null;
  /** The player batch has finished (it may have produced nothing). */
  forecastDone: boolean;
  crest: React.ReactNode;
  onBack: () => void;
}) {
  const [shareStatus, setShareStatus] = useState('');
  const [manualCopy, setManualCopy] = useState(false);
  const finish = finishRange(prediction.positionDistribution);
  const verdict = verdictOf(prediction);
  const stats = prediction.teamStats;
  const picks = fixturePicks(prediction.perOpponentExpectedPoints);
  const shareText = previewShareText(identity.name, prediction, forecast);
  const share = async () => {
    try {
      if (navigator.share) {
        await navigator.share({
          title: `${identity.name} season preview`,
          text: shareText,
          url: location.href,
        });
        setShareStatus('Preview shared.');
        return;
      }
      if (navigator.clipboard) {
        await navigator.clipboard.writeText(`${shareText} ${location.href}`);
        setShareStatus('Preview copied to your clipboard.');
        return;
      }
      setManualCopy(true);
      setShareStatus('Select and copy the preview below.');
    } catch (shareError) {
      if (shareError instanceof DOMException && shareError.name === 'AbortError') return;
      setManualCopy(true);
      setShareStatus('Select and copy the preview below.');
    }
  };
  const goalDifference = stats ? Math.round(stats.goalsFor) - Math.round(stats.goalsAgainst) : 0;

  return (
    <section className="builder-step page-shell pv">
      <header className="pv-band grass-stripes">
        <p className="pv-eyebrow">21st Club · Step 04</p>
        <h1>Season preview</h1>
        <div className="pv-identity">
          {crest}
          <div>
            <strong>{identity.name}</strong>
            <span>
              {identity.stadium} · replacing {replacedName} in a 20-club league
            </span>
          </div>
        </div>
      </header>

      <Card className="pv-verdict-card">
        <p className="pv-tag" data-verdict={verdict.key}>
          {verdict.label}
        </p>
        <p className="pv-finish">
          Most likely <strong>{ordinal(finish.likely)}</strong>
          {finish.best !== finish.worst
            ? ` — anywhere from ${ordinal(finish.best)} to ${ordinal(finish.worst)}`
            : null}
        </p>
        {stats ? (
          <dl className="pv-facts">
            <Fact label="Record (W–D–L)" value={recordLine(stats)} />
            <Fact label="Points" value={about(pointsFrom(stats))} />
            <Fact label="Goals scored" value={about(stats.goalsFor)} />
            <Fact label="Goals conceded" value={about(stats.goalsAgainst)} />
            <Fact label="Goal difference" value={`~${signed(goalDifference)}`} />
            <Fact label="Clean sheets" value={about(stats.cleanSheets)} />
            <Fact
              label="Yellow cards"
              value={forecast ? about(forecast.yellowCards) : forecastDone ? '—' : '…'}
            />
            <Fact
              label="Red cards"
              value={forecast ? about(forecast.redCards) : forecastDone ? '—' : '…'}
            />
          </dl>
        ) : null}
      </Card>

      <div className="pv-grid">
        <Card className="pv-card">
          <h2>Your players</h2>
          <dl className="pv-players">
            <PlayerLine
              label="Top scorer"
              player={forecast?.topScorer}
              value={(p) => `${about(p.goals)} goals`}
            />
            <PlayerLine
              label="Top assister"
              player={forecast?.topAssister}
              value={(p) => `${about(p.assists)} assists`}
            />
            <PlayerLine
              label="Star player"
              player={forecast?.starPlayer}
              value={(p) => `${p.averageRating.toFixed(2)} average rating`}
            />
          </dl>
          {forecastDone && !forecast ? (
            <p className="pv-note">Player stats are not available right now.</p>
          ) : null}
        </Card>

        <Card className="pv-card">
          <h2>Fixtures to circle</h2>
          {picks ? (
            <dl className="pv-fixtures">
              <div>
                <dt>Toughest trip</dt>
                <dd>{venueText(picks.toughestTrip, 'trip')}</dd>
              </div>
              <div>
                <dt>Toughest at home</dt>
                <dd>{venueText(picks.toughestHome, 'home')}</dd>
              </div>
              <div>
                <dt>Banker</dt>
                <dd>{venueText(picks.banker, 'banker')}</dd>
              </div>
            </dl>
          ) : null}
        </Card>

        <Card className="pv-card">
          <h2>The odds</h2>
          <ul className="pv-odds">
            {oddsLines(prediction).map((line) => (
              <li key={line.label}>
                <span>{line.label}</span>
                <strong>{line.phrase}</strong>
              </li>
            ))}
          </ul>
        </Card>
      </div>

      <div className="share-row">
        <button className="button button-primary button-default" type="button" onClick={share}>
          Share preview <span aria-hidden="true">↗</span>
        </button>
        <span aria-live="polite">{shareStatus}</span>
      </div>
      {manualCopy ? (
        <textarea
          className="pv-copy"
          readOnly
          value={`${shareText} ${location.href}`}
          aria-label="Preview text to copy"
        />
      ) : null}

      <div className="step-actions">
        <button className="button button-secondary button-default" type="button" onClick={onBack}>
          ← Change starting XI
        </button>
        <a className="button button-secondary button-default" href="/match">
          Play a friendly
        </a>
        <a className="button button-primary button-default" href="/season">
          Start season <span aria-hidden="true">→</span>
        </a>
      </div>
    </section>
  );
}
