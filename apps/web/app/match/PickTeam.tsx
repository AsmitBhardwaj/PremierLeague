'use client';

import type { Tactic } from '@pl/engine';
import { useMemo, useState } from 'react';
import { buildRealClubTeam, type RealClub } from '../play/lib/clubs';
import { benchOf, pitchPositions, startersOf, swapStarter } from '../play/lib/lineup';
import {
  FORMATIONS,
  POSITION_ORDER,
  pickFormationXI,
  validateLineup,
  type Formation,
  type MarketPlayer,
} from '../play/lib/squad';
import { Radar } from './components/Radar';
import { createUserMatchTeam, type MatchPreparation } from './lib/match';
import { fixtureOdds } from './lib/odds';
import { RATING_LABELS, radarAxes } from './lib/radar';
import type { Venue } from './lib/seed';
import { TACTICS } from './lib/tactics';
import type { PlaybackMode } from './lib/timeline';
import { MODES } from './MatchViewer';

const percent = (value: number) => `${Math.round(value * 100)}%`;
const statusLabel = (status: string) =>
  ({ a: 'Available', d: 'Doubtful', i: 'Injured', s: 'Suspended' })[status] ?? status;

type Tab = 'team' | 'tactics';

export function PickTeam({
  preparation,
  setPreparation,
  market,
  opponents,
  seed,
  mode,
  onModeChange,
  onKickOff,
}: {
  preparation: MatchPreparation;
  setPreparation: (next: MatchPreparation) => void;
  market: readonly MarketPlayer[];
  opponents: RealClub[];
  seed: number;
  mode: PlaybackMode;
  onModeChange: (mode: PlaybackMode) => void;
  onKickOff: () => void;
}) {
  const { squad, starterIds, formation, tactic, opponentId, venue } = preparation;
  const [tab, setTab] = useState<Tab>('team');
  const [swapSource, setSwapSource] = useState<string | null>(null);
  const [inspectedId, setInspectedId] = useState(starterIds[0] ?? squad[0]?.id ?? '');
  const [message, setMessage] = useState('Select a starter, then a same-position substitute.');

  const starters = startersOf(squad, starterIds);
  const bench = benchOf(squad, starterIds);
  const errors = validateLineup(squad, starterIds, formation);
  const inspected = squad.find((player) => player.id === inspectedId) ?? starters[0];
  const opponent = opponents.find((club) => club.id === opponentId) ?? opponents[0]!;

  const odds = useMemo(() => {
    if (errors.length) return null;
    const user = createUserMatchTeam(preparation);
    return fixtureOdds(user, buildRealClubTeam(market, opponentId), venue);
  }, [errors.length, preparation, market, opponentId, venue]);

  const update = (patch: Partial<MatchPreparation>) => setPreparation({ ...preparation, ...patch });

  const changeFormation = (next: Formation) => {
    const ids = pickFormationXI(squad, next);
    update({ formation: next, starterIds: ids });
    setInspectedId(ids[0] ?? '');
    setSwapSource(null);
    setMessage(`${next} selected. The strongest valid XI for that shape is on the pitch.`);
  };

  const chooseStarter = (player: MarketPlayer) => {
    setInspectedId(player.id);
    setSwapSource(player.id);
    setMessage(`Now choose a ${player.position} from the bench to replace ${player.name}.`);
  };

  const chooseSubstitute = (player: MarketPlayer) => {
    setInspectedId(player.id);
    if (!swapSource) {
      setMessage('Select a starter on the pitch to swap with.');
      return;
    }
    const result = swapStarter(squad, starterIds, formation, swapSource, player.id);
    setMessage(result.message);
    if (!result.ok) return;
    update({ starterIds: result.starterIds });
    setSwapSource(null);
  };

  const swapSourcePosition = squad.find((player) => player.id === swapSource)?.position;

  return (
    <>
      <div className="mt-pick page-shell">
        <div className="mt-pick-main">
          <div className="mt-tabs" role="tablist" aria-label="Pick your team">
            {(['team', 'tactics'] as const).map((item) => (
              <button
                key={item}
                type="button"
                role="tab"
                id={`tab-${item}`}
                aria-selected={tab === item}
                aria-controls={`panel-${item}`}
                className={tab === item ? 'active' : ''}
                onClick={() => setTab(item)}
              >
                {item === 'team' ? 'Team' : 'Tactics'}
              </button>
            ))}
          </div>

          {tab === 'team' ? (
            <div id="panel-team" role="tabpanel" aria-labelledby="tab-team">
              <div className="mt-formations" role="group" aria-label="Formation">
                {(Object.keys(FORMATIONS) as Formation[]).map((item) => (
                  <button
                    type="button"
                    key={item}
                    className={formation === item ? 'selected' : ''}
                    aria-pressed={formation === item}
                    onClick={() => changeFormation(item)}
                  >
                    {item}
                  </button>
                ))}
              </div>
              <div className="mt-team-layout">
                <div className="mt-team-left">
                  <div
                    className="mt-pitch pickteam-pitch"
                    aria-label={`${formation} starting eleven`}
                  >
                    <div className="mt-pitch-lines" aria-hidden="true" />
                    {POSITION_ORDER.flatMap((position) => {
                      const players = starters.filter((player) => player.position === position);
                      const slots = pitchPositions[formation][position];
                      return players.map((player, index) => (
                        <button
                          type="button"
                          key={player.id}
                          className={`mt-slot ${swapSource === player.id ? 'selected' : ''}`}
                          style={{ left: `${slots[index]![0]}%`, top: `${slots[index]![1]}%` }}
                          aria-pressed={swapSource === player.id}
                          onClick={() => chooseStarter(player)}
                        >
                          <span className={`mt-disc pos-${position.toLowerCase()}`}>
                            {player.overall}
                          </span>
                          <strong>{player.name}</strong>
                        </button>
                      ));
                    })}
                  </div>
                  <div className="mt-bench">
                    <h2>Substitutes · {bench.length}</h2>
                    <div>
                      {bench.map((player) => (
                        <button
                          key={player.id}
                          type="button"
                          className={swapSourcePosition === player.position ? 'compatible' : ''}
                          onClick={() => chooseSubstitute(player)}
                        >
                          <span className={`mt-chip pos-${player.position.toLowerCase()}`}>
                            {player.position}
                          </span>
                          <strong>{player.name}</strong>
                          <small>{player.overall}</small>
                        </button>
                      ))}
                    </div>
                  </div>
                  <p className="mt-message" aria-live="polite">
                    {message}
                  </p>
                </div>

                <aside className="mt-player-panel" aria-label="Selected player">
                  {inspected ? (
                    <>
                      <p className="mt-kicker">Selected player</p>
                      <div className="mt-player-head">
                        <span className={`mt-chip pos-${inspected.position.toLowerCase()}`}>
                          {inspected.position}
                        </span>
                        <strong aria-label={`Overall rating ${inspected.overall}`}>
                          {inspected.overall}
                        </strong>
                      </div>
                      <h2>{inspected.name}</h2>
                      <p className="mt-muted">
                        {inspected.clubName} · {statusLabel(inspected.status)}
                      </p>
                      <dl className="mt-facts">
                        <div>
                          <dt>Fitness</dt>
                          <dd>100%</dd>
                        </div>
                        <div>
                          <dt>Form</dt>
                          <dd aria-label="Form not tracked yet">—</dd>
                        </div>
                        <div>
                          <dt>Positions</dt>
                          <dd>{inspected.position}</dd>
                        </div>
                      </dl>
                      <Radar axes={radarAxes(inspected)} name={inspected.name} />
                      <div className="mt-bars" aria-label={`${inspected.name} engine ratings`}>
                        {RATING_LABELS.map(([key, label]) => (
                          <div key={key}>
                            <span>{label}</span>
                            <span className="mt-bar-track" aria-hidden="true">
                              <span style={{ width: `${inspected.ratings[key]}%` }} />
                            </span>
                            <strong>{inspected.ratings[key]}</strong>
                          </div>
                        ))}
                      </div>
                    </>
                  ) : null}
                </aside>
              </div>
            </div>
          ) : (
            <div id="panel-tactics" role="tabpanel" aria-labelledby="tab-tactics">
              <fieldset className="mt-tactics">
                <legend>Match tactic</legend>
                {TACTICS.map((item) => (
                  <label key={item.id} className={tactic === item.id ? 'selected' : ''}>
                    <input
                      type="radio"
                      name="tactic"
                      value={item.id}
                      checked={tactic === item.id}
                      onChange={() => update({ tactic: item.id as Tactic })}
                    />
                    <strong>{item.label}</strong>
                    <span>{item.tradeOff}</span>
                  </label>
                ))}
              </fieldset>
              <p className="mt-muted mt-note">
                Win odds use team ratings only. Tactics play out inside the match itself.
              </p>
            </div>
          )}
        </div>

        <aside className="mt-fixture" aria-label="Fixture">
          <p className="mt-kicker">Fixture</p>
          <h2>
            {preparation.identity.shortName || 'You'} <span>vs</span> {opponent.name}
          </h2>
          <label className="mt-field">
            <span>Opponent</span>
            <select
              value={opponentId}
              onChange={(event) => update({ opponentId: event.target.value })}
            >
              {opponents.map((club) => (
                <option key={club.id} value={club.id}>
                  {club.name}
                </option>
              ))}
            </select>
          </label>
          <div className="mt-field">
            <span id="venue-label">Venue</span>
            <div className="mt-venue" role="radiogroup" aria-labelledby="venue-label">
              {(['home', 'away'] as Venue[]).map((item) => (
                <button
                  key={item}
                  type="button"
                  role="radio"
                  aria-checked={venue === item}
                  className={venue === item ? 'selected' : ''}
                  onClick={() => update({ venue: item })}
                >
                  {item === 'home' ? 'Home' : 'Away'}
                </button>
              ))}
            </div>
          </div>
          <div className="mt-field">
            <span id="mode-label">View</span>
            <div className="mt-modes" role="radiogroup" aria-labelledby="mode-label">
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
          {odds ? (
            <div className="mt-odds" aria-label="Win, draw, loss odds">
              <div className="mt-odds-bar" aria-hidden="true">
                <span className="w" style={{ flexGrow: odds.win }} />
                <span className="d" style={{ flexGrow: odds.draw }} />
                <span className="l" style={{ flexGrow: odds.loss }} />
              </div>
              <dl>
                <div>
                  <dt>Win</dt>
                  <dd>{percent(odds.win)}</dd>
                </div>
                <div>
                  <dt>Draw</dt>
                  <dd>{percent(odds.draw)}</dd>
                </div>
                <div>
                  <dt>Loss</dt>
                  <dd>{percent(odds.loss)}</dd>
                </div>
              </dl>
            </div>
          ) : (
            <p className="mt-warning">Fix the lineup to see the odds.</p>
          )}
          <p className="mt-seed">Match seed {seed}</p>
        </aside>
      </div>

      <div className="mt-kickoff-bar">
        <div className="page-shell">
          <p>
            <strong>
              {preparation.identity.shortName || 'You'} vs {opponent.name}
            </strong>
            <span>
              {venue === 'home' ? 'Home' : 'Away'} · {formation} ·{' '}
              {TACTICS.find((item) => item.id === tactic)?.label}
              {odds
                ? ` · W ${percent(odds.win)} D ${percent(odds.draw)} L ${percent(odds.loss)}`
                : ''}
            </span>
          </p>
          <button
            type="button"
            className="button button-primary button-default"
            onClick={onKickOff}
            disabled={errors.length > 0}
          >
            Kick off <span aria-hidden="true">→</span>
          </button>
        </div>
      </div>
    </>
  );
}
