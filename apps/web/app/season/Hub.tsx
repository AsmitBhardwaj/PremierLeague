'use client';

import { useState } from 'react';
import { MODES } from '../match/MatchViewer';
import type { PlaybackMode } from '../match/lib/timeline';
import type { MarketPlayer } from '../play/lib/squad';
import { LeagueTable } from './LeagueTable';
import { ProjectionPanel } from './Projection';
import { FORM_LABEL, ordinal, percent, resultLetter, userPosition } from './lib/format';
import type { SeasonView } from './lib/protocol';

const TOTAL_ROUNDS = 38;

export function Hub({
  view,
  names,
  squad,
  mode,
  onModeChange,
  busy,
  onPickTeam,
  onPlay,
  onSim,
  onAbandon,
}: {
  view: SeasonView;
  names: ReadonlyMap<string, string>;
  squad: readonly MarketPlayer[];
  mode: PlaybackMode;
  onModeChange: (mode: PlaybackMode) => void;
  busy: boolean;
  onPickTeam: () => void;
  onPlay: () => void;
  onSim: (to: 'next' | 'january' | 'end') => void;
  onAbandon: () => void;
}) {
  const [confirming, setConfirming] = useState(false);
  const { next } = view;
  const position = userPosition(view.table);
  const byId = new Map(squad.map((p) => [p.id, p]));
  const out = view.squad.filter((p) => p.injuredFor > 0 || p.suspendedFor > 0);
  const averageFitness = view.squad.reduce((sum, p) => sum + p.fitness, 0) / view.squad.length;
  const inForm = [...view.squad]
    .filter((p) => p.appearances > 0)
    .sort((a, b) => b.form - a.form)
    .slice(0, 3);
  const recent = view.results.slice(-5);
  const beforeWindow = view.round < 20;

  return (
    <div className="se-hub page-shell">
      <div className="se-hub-main">
        <section className="se-card se-fixture" aria-labelledby="se-fixture-title">
          <p className="mt-kicker">
            Matchday {view.round + 1} of {TOTAL_ROUNDS}
          </p>
          {next ? (
            <>
              <h1 id="se-fixture-title">
                {view.identity.shortName || 'You'} <span>{next.venue === 'home' ? 'v' : 'at'}</span>{' '}
                {names.get(next.opponentId) ?? next.opponentId}
              </h1>
              <p className="mt-muted">{next.venue === 'home' ? 'Home' : 'Away'}</p>
              {next.odds ? (
                <div className="mt-odds" aria-label="Win, draw, loss odds">
                  <div className="mt-odds-bar" aria-hidden="true">
                    <span className="w" style={{ flexGrow: next.odds.win }} />
                    <span className="d" style={{ flexGrow: next.odds.draw }} />
                    <span className="l" style={{ flexGrow: next.odds.loss }} />
                  </div>
                  <dl>
                    <div>
                      <dt>Win</dt>
                      <dd>{percent(next.odds.win)}</dd>
                    </div>
                    <div>
                      <dt>Draw</dt>
                      <dd>{percent(next.odds.draw)}</dd>
                    </div>
                    <div>
                      <dt>Loss</dt>
                      <dd>{percent(next.odds.loss)}</dd>
                    </div>
                  </dl>
                </div>
              ) : null}
              <div className="mt-field">
                <span id="se-mode-label">View</span>
                <div className="mt-modes" role="radiogroup" aria-labelledby="se-mode-label">
                  {MODES.map((item) => (
                    <button
                      key={item.id}
                      type="button"
                      role="radio"
                      aria-checked={mode === item.id}
                      className={mode === item.id ? 'selected' : ''}
                      onClick={() => onModeChange(item.id)}
                    >
                      {item.label}
                    </button>
                  ))}
                </div>
              </div>
              <div className="se-actions">
                <button
                  type="button"
                  className="button button-primary button-default"
                  onClick={onPlay}
                  disabled={busy}
                >
                  Play next match <span aria-hidden="true">→</span>
                </button>
                <button
                  type="button"
                  className="button button-secondary button-default"
                  onClick={onPickTeam}
                  disabled={busy}
                >
                  Pick your team
                </button>
              </div>
              <div className="se-sim" role="group" aria-label="Simulate without watching">
                <span>Simulate</span>
                <button type="button" onClick={() => onSim('next')} disabled={busy}>
                  Sim to next match
                </button>
                {beforeWindow ? (
                  <button type="button" onClick={() => onSim('january')} disabled={busy}>
                    Sim to January window
                  </button>
                ) : null}
                <button type="button" onClick={() => onSim('end')} disabled={busy}>
                  Sim to end of season
                </button>
              </div>
              {busy ? (
                <p className="mt-muted" aria-live="polite">
                  Simulating…
                </p>
              ) : null}
            </>
          ) : null}
        </section>

        <ProjectionPanel projection={view.projection} prediction={view.prediction} />

        <section className="se-card" aria-label="Squad">
          <p className="mt-kicker">Squad condition</p>
          <dl className="se-facts">
            <div>
              <dt>Average fitness</dt>
              <dd>{Math.round(averageFitness)}%</dd>
            </div>
            <div>
              <dt>Unavailable</dt>
              <dd>{out.length}</dd>
            </div>
          </dl>
          {out.length ? (
            <ul className="se-list">
              {out.map((p) => {
                const n = Math.max(p.injuredFor, p.suspendedFor);
                return (
                  <li key={p.id}>
                    <strong>{byId.get(p.id)?.name ?? p.id}</strong>
                    <span className="mt-warning-inline">
                      {p.suspendedFor > p.injuredFor ? 'Suspended' : 'Injured'} · Out {n} match
                      {n > 1 ? 'es' : ''}
                    </span>
                  </li>
                );
              })}
            </ul>
          ) : (
            <p className="mt-muted">Everyone is available.</p>
          )}
          {inForm.length ? (
            <>
              <p className="mt-kicker se-gap">Best form</p>
              <ul className="se-list">
                {inForm.map((p) => (
                  <li key={p.id}>
                    <strong>{byId.get(p.id)?.name ?? p.id}</strong>
                    <span>{FORM_LABEL(p.form)}</span>
                  </li>
                ))}
              </ul>
            </>
          ) : null}
        </section>

        {recent.length ? (
          <section className="se-card" aria-label="Recent results">
            <p className="mt-kicker">Recent results</p>
            <ul className="se-list">
              {recent.map((r) => {
                const opponent = r.home === 'USER' ? r.away : r.home;
                const letter = resultLetter(r);
                return (
                  <li key={r.round}>
                    <b className={`se-letter ${letter}`}>{letter}</b>
                    <strong>
                      {names.get(r.home) ?? r.home} {r.homeGoals}–{r.awayGoals}{' '}
                      {names.get(r.away) ?? r.away}
                    </strong>
                    <span className="sr-only">against {names.get(opponent)}</span>
                  </li>
                );
              })}
            </ul>
          </section>
        ) : null}

        <div className="se-abandon">
          {confirming ? (
            <>
              <p>Abandon this season? Your results and decisions are deleted for good.</p>
              <button
                type="button"
                className="button button-secondary button-default"
                onClick={onAbandon}
              >
                Yes, abandon season
              </button>
              <button type="button" className="se-link" onClick={() => setConfirming(false)}>
                Keep playing
              </button>
            </>
          ) : (
            <button type="button" className="se-link" onClick={() => setConfirming(true)}>
              Abandon season
            </button>
          )}
        </div>
      </div>

      <aside className="se-hub-side" aria-label="League table">
        <p className="se-pos">
          {ordinal(position)} <span>in the league</span>
        </p>
        <LeagueTable table={view.table} names={names} />
      </aside>
    </div>
  );
}
