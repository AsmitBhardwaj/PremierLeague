'use client';

import type { SeasonPrediction } from '@pl/engine';
import { useEffect, useMemo, useState } from 'react';
import { Button } from '../components/Button';
import { Card } from '../components/Card';
import { SectionHeading } from '../components/SectionHeading';
import { Stat } from '../components/Stat';
import playerData from './data/players.json';
import {
  FORMATIONS,
  POSITION_ORDER,
  POSITION_QUOTAS,
  SQUAD_BUDGET,
  formatMoney,
  assessSelection,
  cheapestLegalCompletion,
  createPredictionTeam,
  pickFormationXI,
  positionCounts,
  squadCost,
  validateLineup,
  validateSquad,
  type Formation,
  type MarketPlayer,
} from './lib/squad';
import { buildOpponentTeams, computeReplacedClub } from './lib/clubs';
import { benchOf, pitchPositions, startersOf, swapStarter } from './lib/lineup';
import {
  STORAGE_KEY,
  emptyIdentity,
  parseSavedFlow,
  validateIdentity,
  type ClubIdentity,
  type CrestShape,
  type SavedFlow,
  type Step,
} from './lib/persistence';

const market = playerData as MarketPlayer[];
const PREDICTION_SEED = 2103;
/** Computed from the plan's rule (weakest promoted squad), never hardcoded. */
const REPLACED_CLUB = computeReplacedClub(market);
const stepOrder: Step[] = ['identity', 'squad', 'lineup', 'prediction'];
const stepNames: Record<Step, string> = {
  identity: 'Found club',
  squad: 'Build squad',
  lineup: 'Pick XI',
  prediction: 'Prediction',
};

const money = formatMoney;
const pct = (value: number) => `${(value * 100).toFixed(value > 0 && value < 0.01 ? 1 : 0)}%`;
const ordinal = (position: number) => {
  const mod100 = position % 100;
  if (mod100 >= 11 && mod100 <= 13) return `${position}th`;
  const endings = ['th', 'st', 'nd', 'rd'];
  return `${position}${endings[position % 10] ?? 'th'}`;
};
const statusLabel = (status: string) =>
  ({ a: 'Available', d: 'Doubtful', i: 'Injured', s: 'Suspended' })[status] ?? status;

function Crest({ identity, large = false }: { identity: ClubIdentity; large?: boolean }) {
  const clip =
    identity.crestShape === 'diamond'
      ? 'polygon(50% 2%, 96% 50%, 50% 98%, 4% 50%)'
      : identity.crestShape === 'roundel'
        ? 'circle(48%)'
        : 'polygon(10% 4%, 90% 4%, 90% 62%, 50% 98%, 10% 62%)';
  return (
    <div
      className={`club-crest ${large ? 'club-crest-large' : ''}`}
      style={{ background: identity.primaryColor, color: identity.secondaryColor, clipPath: clip }}
      aria-label={`${identity.shortName || 'Club'} geometric crest`}
    >
      <span style={{ borderColor: identity.secondaryColor }}>{identity.shortName || 'FC'}</span>
    </div>
  );
}

function FlowHeader({ step, identity }: { step: Step; identity: ClubIdentity }) {
  const active = stepOrder.indexOf(step);
  return (
    <header className="builder-header page-shell">
      <div className="builder-brand">
        <a className="wordmark" href="/">
          21ST CLUB
        </a>
        <span>Matchday studio</span>
      </div>
      <ol className="builder-progress" aria-label="Club creation progress">
        {stepOrder.map((item, index) => (
          <li key={item} className={index === active ? 'active' : index < active ? 'complete' : ''}>
            <span>{index + 1}</span>
            {stepNames[item]}
          </li>
        ))}
      </ol>
      <div className="builder-club-mark">
        {identity.name ? <Crest identity={identity} /> : null}
        <span>{identity.shortName || 'New club'}</span>
      </div>
    </header>
  );
}

function IdentityStep({
  identity,
  setIdentity,
  onContinue,
}: {
  identity: ClubIdentity;
  setIdentity: (identity: ClubIdentity) => void;
  onContinue: () => void;
}) {
  const [errors, setErrors] = useState<Record<string, string>>({});
  const update = <K extends keyof ClubIdentity>(key: K, value: ClubIdentity[K]) =>
    setIdentity({ ...identity, [key]: value });
  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    const next = validateIdentity(identity);
    setErrors(next);
    if (Object.keys(next).length === 0) onContinue();
  };

  return (
    <section className="builder-step page-shell">
      <SectionHeading
        eyebrow="21st Club · Club registry · Step 01"
        title="Found your club"
        copy={`Create an original identity for the club replacing ${REPLACED_CLUB.name} in the 20-team league.`}
      />
      <form className="identity-grid" onSubmit={submit} noValidate>
        <Card className="identity-form-card">
          <div className="field-grid">
            <label className="field field-wide">
              <span>Club name</span>
              <input
                value={identity.name}
                onChange={(event) => update('name', event.target.value)}
                aria-invalid={Boolean(errors.name)}
                aria-describedby={errors.name ? 'club-name-error' : undefined}
                autoComplete="off"
              />
              {errors.name ? (
                <small id="club-name-error" className="field-error">
                  {errors.name}
                </small>
              ) : null}
            </label>
            <label className="field">
              <span>Short name</span>
              <input
                value={identity.shortName}
                onChange={(event) => update('shortName', event.target.value.toUpperCase())}
                maxLength={4}
                aria-invalid={Boolean(errors.shortName)}
                aria-describedby={errors.shortName ? 'short-name-error' : 'short-name-hint'}
                autoComplete="off"
              />
              <small
                id={errors.shortName ? 'short-name-error' : 'short-name-hint'}
                className={errors.shortName ? 'field-error' : ''}
              >
                {errors.shortName || '2–4 letters or numbers.'}
              </small>
            </label>
            <label className="field">
              <span>Stadium name</span>
              <input
                value={identity.stadium}
                onChange={(event) => update('stadium', event.target.value)}
                aria-invalid={Boolean(errors.stadium)}
                aria-describedby={errors.stadium ? 'stadium-error' : undefined}
                autoComplete="off"
              />
              {errors.stadium ? (
                <small id="stadium-error" className="field-error">
                  {errors.stadium}
                </small>
              ) : null}
            </label>
          </div>
          <fieldset className="crest-options">
            <legend>Geometric crest</legend>
            <div>
              {(['shield', 'diamond', 'roundel'] as CrestShape[]).map((shape) => (
                <label key={shape} className={identity.crestShape === shape ? 'selected' : ''}>
                  <input
                    type="radio"
                    name="crest"
                    value={shape}
                    checked={identity.crestShape === shape}
                    onChange={() => update('crestShape', shape)}
                  />
                  {shape}
                </label>
              ))}
            </div>
          </fieldset>
          <div className="colour-fields">
            <label className="field">
              <span>Primary colour</span>
              <input
                type="color"
                value={identity.primaryColor}
                onChange={(event) => update('primaryColor', event.target.value)}
              />
            </label>
            <label className="field">
              <span>Secondary colour</span>
              <input
                type="color"
                value={identity.secondaryColor}
                onChange={(event) => update('secondaryColor', event.target.value)}
              />
            </label>
          </div>
          <div className="form-actions">
            <Button href="/" variant="secondary">
              Back home
            </Button>
            <button className="button button-primary button-default" type="submit">
              Build squad <span aria-hidden="true">→</span>
            </button>
          </div>
        </Card>
        <Card className="identity-preview">
          <p className="card-kicker">Club preview</p>
          <Crest identity={identity} large />
          <h2>{identity.name || 'Your club'}</h2>
          <p>{identity.stadium || 'Your stadium'}</p>
          <span>Entering in place of {REPLACED_CLUB.name}</span>
        </Card>
      </form>
    </section>
  );
}

function SquadStep({
  selected,
  setSelected,
  onBack,
  onContinue,
}: {
  selected: MarketPlayer[];
  setSelected: (players: MarketPlayer[]) => void;
  onBack: () => void;
  onContinue: () => void;
}) {
  const [search, setSearch] = useState('');
  const [position, setPosition] = useState('ALL');
  const [club, setClub] = useState('ALL');
  const [sort, setSort] = useState('value-asc');
  const [message, setMessage] = useState('');
  const selectedIds = useMemo(() => new Set(selected.map((player) => player.id)), [selected]);
  const counts = positionCounts(selected);
  const cost = squadCost(selected);
  const completion = useMemo(() => cheapestLegalCompletion(selected, market), [selected]);
  const errors = validateSquad(selected);
  const clubUsage = useMemo(() => {
    const usage = new Map<string, { name: string; count: number }>();
    for (const player of selected) {
      const current = usage.get(player.clubId);
      usage.set(player.clubId, { name: player.clubName, count: (current?.count ?? 0) + 1 });
    }
    return [...usage.values()].sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
  }, [selected]);
  const clubs = useMemo(() => [...new Set(market.map((player) => player.clubName))].sort(), []);
  const filtered = useMemo(() => {
    const term = search.trim().toLocaleLowerCase();
    return market
      .filter(
        (player) =>
          (!term || player.name.toLocaleLowerCase().includes(term)) &&
          (position === 'ALL' || player.position === position) &&
          (club === 'ALL' || player.clubName === club),
      )
      .sort((a, b) => {
        if (sort === 'value-desc') return b.value - a.value || a.name.localeCompare(b.name);
        if (sort === 'rating-desc') return b.overall - a.overall || a.name.localeCompare(b.name);
        if (sort === 'name') return a.name.localeCompare(b.name);
        return a.value - b.value || a.name.localeCompare(b.name);
      });
  }, [club, position, search, sort]);

  const add = (player: MarketPlayer) => {
    const assessment = assessSelection(player, selected, market);
    if (!assessment.allowed) {
      setMessage(assessment.message ?? 'That player cannot be selected.');
      return;
    }
    setSelected([...selected, player]);
    setMessage(`${player.name} added. The squad can still be completed within budget.`);
  };
  const remove = (player: MarketPlayer) => {
    setSelected(selected.filter((item) => item.id !== player.id));
    setMessage(`${player.name} removed.`);
  };
  const obviousBlock = (player: MarketPlayer) => {
    if (selectedIds.has(player.id)) return 'Already selected';
    if (counts[player.position] >= POSITION_QUOTAS[player.position])
      return `${player.position} full`;
    if (selected.filter((item) => item.clubId === player.clubId).length >= 3) return 'Club limit';
    if (cost + player.value > SQUAD_BUDGET) return 'Over budget';
    return '';
  };

  return (
    <section className="builder-step page-shell squad-step">
      <SectionHeading
        eyebrow="21st Club · Transfer desk · Step 02"
        title="Build your squad"
        copy="Sign exactly 18 real players. Every choice is checked against the budget, positional quotas and three-per-club rule."
      />
      <div className="squad-summary scorebug-strip" aria-label="Squad status">
        <Stat label="Players" value={`${selected.length}/18`} />
        {POSITION_ORDER.map((item) => (
          <Stat
            key={item}
            className={`position-stat position-${item.toLowerCase()}`}
            label={item}
            value={`${counts[item]}/${POSITION_QUOTAS[item]}`}
          />
        ))}
        <Stat label="Remaining" value={money(SQUAD_BUDGET - cost)} />
      </div>
      <p className="budget-guidance">
        {completion
          ? `${money(cost + completion.cost)} is the cheapest possible final cost from here.`
          : 'No legal completion is available from the current selection.'}
      </p>
      <div className="club-usage" aria-label="Real club selection limits">
        <span>Club limit</span>
        {clubUsage.length ? (
          clubUsage.map((item) => (
            <span key={item.name} className={item.count === 3 ? 'at-limit' : ''}>
              {item.name} <strong>{item.count}/3</strong>
            </span>
          ))
        ) : (
          <span>No players selected</span>
        )}
      </div>
      <div className="squad-layout">
        <Card className="market-card">
          <div className="market-filters">
            <label className="field market-search">
              <span>Search players</span>
              <input
                type="search"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Player name"
              />
            </label>
            <label className="field">
              <span>Position</span>
              <select value={position} onChange={(event) => setPosition(event.target.value)}>
                <option value="ALL">All positions</option>
                {POSITION_ORDER.map((item) => (
                  <option key={item}>{item}</option>
                ))}
              </select>
            </label>
            <label className="field">
              <span>Real club</span>
              <select value={club} onChange={(event) => setClub(event.target.value)}>
                <option value="ALL">All clubs</option>
                {clubs.map((item) => (
                  <option key={item}>{item}</option>
                ))}
              </select>
            </label>
            <label className="field">
              <span>Sort</span>
              <select value={sort} onChange={(event) => setSort(event.target.value)}>
                <option value="value-asc">Value: low to high</option>
                <option value="value-desc">Value: high to low</option>
                <option value="rating-desc">Rating: high to low</option>
                <option value="name">Name</option>
              </select>
            </label>
          </div>
          <div
            className="player-list"
            role="list"
            aria-label={`${filtered.length} matching players`}
          >
            {filtered.map((player) => {
              const block = obviousBlock(player);
              return (
                <div className="player-row" role="listitem" key={player.id}>
                  <span className={`position-chip position-${player.position.toLowerCase()}`}>
                    {player.position}
                  </span>
                  <span className="player-name">
                    <strong>{player.name}</strong>
                    <small>
                      {player.clubName} · {statusLabel(player.status)}
                    </small>
                  </span>
                  <span className="player-rating">{player.overall}</span>
                  <span className="player-value">{money(player.value)}</span>
                  <button
                    type="button"
                    className={`row-action ${block && !selectedIds.has(player.id) ? 'blocked' : ''}`}
                    onClick={() => (selectedIds.has(player.id) ? remove(player) : add(player))}
                    aria-label={
                      selectedIds.has(player.id)
                        ? `Remove ${player.name}`
                        : block
                          ? `${player.name} blocked: ${block}`
                          : `Add ${player.name}`
                    }
                    title={block || `Add ${player.name}`}
                  >
                    {selectedIds.has(player.id) ? 'Remove' : block || 'Add'}
                  </button>
                </div>
              );
            })}
          </div>
        </Card>
        <Card className="selected-card">
          <div className="selected-heading">
            <div>
              <p className="card-kicker">Your 18</p>
              <h2>Selected players</h2>
            </div>
            <span>{money(cost)}</span>
          </div>
          {POSITION_ORDER.map((item) => (
            <div className="selected-group" key={item}>
              <h3>
                <span className={`selected-position position-${item.toLowerCase()}`}>{item}</span>{' '}
                <span>
                  {counts[item]}/{POSITION_QUOTAS[item]}
                </span>
              </h3>
              {selected
                .filter((player) => player.position === item)
                .map((player) => (
                  <button key={player.id} type="button" onClick={() => remove(player)}>
                    <span>{player.name}</span>
                    <small>{player.clubShortName}</small>
                    <strong>{money(player.value)}</strong>
                    <span aria-hidden="true">×</span>
                  </button>
                ))}
              {Array.from({ length: POSITION_QUOTAS[item] - counts[item] }, (_, index) => (
                <div className="empty-player" key={`${item}-${index}`}>
                  Empty {item} slot
                </div>
              ))}
            </div>
          ))}
        </Card>
      </div>
      <div
        className={`validation-banner builder-lower-third ${message ? 'visible' : ''}`}
        aria-live="polite"
      >
        {message || 'Player selection updates will appear here.'}
      </div>
      <div className="step-actions">
        <button className="button button-secondary button-default" type="button" onClick={onBack}>
          ← Club identity
        </button>
        <button
          className="button button-primary button-default"
          type="button"
          onClick={onContinue}
          disabled={errors.length > 0}
          aria-describedby={errors.length ? 'squad-errors' : undefined}
        >
          Pick starting XI <span aria-hidden="true">→</span>
        </button>
      </div>
      <div id="squad-errors" className="sr-only" aria-live="polite">
        {errors.join(' ')}
      </div>
    </section>
  );
}

function LineupStep({
  squad,
  formation,
  setFormation,
  starterIds,
  setStarterIds,
  onBack,
  onContinue,
}: {
  squad: MarketPlayer[];
  formation: Formation;
  setFormation: (formation: Formation) => void;
  starterIds: string[];
  setStarterIds: (ids: string[]) => void;
  onBack: () => void;
  onContinue: () => void;
}) {
  const [swapSource, setSwapSource] = useState<string | null>(null);
  const [inspectedId, setInspectedId] = useState(starterIds[0] ?? squad[0]?.id ?? '');
  const [message, setMessage] = useState(
    'Choose a starter, then a same-position substitute to swap.',
  );
  const starters = startersOf(squad, starterIds);
  const bench = benchOf(squad, starterIds);
  const errors = validateLineup(squad, starterIds, formation);
  const inspectedPlayer = squad.find((player) => player.id === inspectedId) ?? starters[0];
  const changeFormation = (next: Formation) => {
    const nextStarters = pickFormationXI(squad, next);
    setFormation(next);
    setStarterIds(nextStarters);
    setInspectedId(nextStarters[0] ?? '');
    setSwapSource(null);
    setMessage(`${next} selected. The strongest valid XI for that shape is on the pitch.`);
  };
  const swap = (substitute: MarketPlayer) => {
    const result = swapStarter(squad, starterIds, formation, swapSource, substitute.id);
    setMessage(result.message);
    if (!result.ok) return;
    setStarterIds(result.starterIds);
    setInspectedId(substitute.id);
    setSwapSource(null);
  };

  return (
    <section className="builder-step page-shell lineup-step">
      <SectionHeading
        eyebrow="21st Club · Tactical screen · Step 03"
        title="Pick your XI"
        copy="Choose one of the engine-supported formations. Your remaining seven players form the bench."
      />
      <div className="formation-picker" aria-label="Formation">
        {(Object.keys(FORMATIONS) as Formation[]).map((item) => (
          <button
            type="button"
            key={item}
            className={formation === item ? 'selected' : ''}
            onClick={() => changeFormation(item)}
            aria-pressed={formation === item}
          >
            {item}
          </button>
        ))}
      </div>
      <div className="lineup-layout">
        <div>
          <div className="selection-pitch" aria-label={`${formation} starting eleven`}>
            <div className="pitch-markings" aria-hidden="true" />
            {POSITION_ORDER.flatMap((position) => {
              const positionPlayers = starters.filter((player) => player.position === position);
              const points = pitchPositions[formation][position];
              return positionPlayers.map((player, index) => (
                <button
                  type="button"
                  key={player.id}
                  className={swapSource === player.id ? 'selected' : ''}
                  style={{ left: `${points[index]![0]}%`, top: `${points[index]![1]}%` }}
                  onClick={() => {
                    setInspectedId(player.id);
                    setSwapSource(player.id);
                    setMessage(
                      `Now choose a ${player.position} from the bench to replace ${player.name}.`,
                    );
                  }}
                  aria-pressed={swapSource === player.id}
                >
                  <span className={`position-${player.position.toLowerCase()}`}>
                    {player.position}
                  </span>
                  <strong>{player.name}</strong>
                </button>
              ));
            })}
          </div>
          <div className="bench-list">
            <h2>Substitutes · 7</h2>
            <div>
              {bench.map((player) => (
                <button
                  key={player.id}
                  type="button"
                  onClick={() => {
                    setInspectedId(player.id);
                    swap(player);
                  }}
                  className={
                    swapSource &&
                    squad.find((item) => item.id === swapSource)?.position === player.position
                      ? 'compatible'
                      : ''
                  }
                >
                  <span className={`position-${player.position.toLowerCase()}`}>
                    {player.position}
                  </span>
                  <strong>{player.name}</strong>
                  <small>{player.clubShortName}</small>
                </button>
              ))}
            </div>
          </div>
        </div>
        <Card className="lineup-detail">
          <p className="card-kicker">Selected player</p>
          {inspectedPlayer ? (
            <>
              <div className="player-detail-heading">
                <span className={`position-${inspectedPlayer.position.toLowerCase()}`}>
                  {inspectedPlayer.position}
                </span>
                <strong>{inspectedPlayer.overall}</strong>
              </div>
              <h2>{inspectedPlayer.name}</h2>
              <p className="player-detail-meta">
                {inspectedPlayer.clubName} · {money(inspectedPlayer.value)} ·{' '}
                {statusLabel(inspectedPlayer.status)}
              </p>
              <div className="rating-bars" aria-label={`${inspectedPlayer.name} engine ratings`}>
                {Object.entries(inspectedPlayer.ratings).map(([label, value]) => (
                  <div key={label}>
                    <span>{label}</span>
                    <span className="rating-track" aria-hidden="true">
                      <span style={{ width: `${value}%` }} />
                    </span>
                    <strong>{value}</strong>
                  </div>
                ))}
              </div>
            </>
          ) : null}
          <p className="card-kicker lineup-check-label">XI check · {formation}</p>
          <div className="lineup-counts">
            <span>
              Goalkeepers <strong>1</strong>
            </span>
            <span>
              Defenders <strong>{FORMATIONS[formation].DEF}</strong>
            </span>
            <span>
              Midfielders <strong>{FORMATIONS[formation].MID}</strong>
            </span>
            <span>
              Forwards <strong>{FORMATIONS[formation].FWD}</strong>
            </span>
            <span>
              Substitutes <strong>{bench.length}</strong>
            </span>
          </div>
          <p className="model-note">
            Select a starter, then a same-position substitute. Invalid swaps are rejected.
          </p>
        </Card>
      </div>
      <div className="validation-banner builder-lower-third visible" aria-live="polite">
        {message}
      </div>
      <div className="step-actions">
        <button className="button button-secondary button-default" type="button" onClick={onBack}>
          ← Squad builder
        </button>
        <button
          className="button button-primary button-default"
          type="button"
          onClick={onContinue}
          disabled={errors.length > 0}
        >
          Run prediction <span aria-hidden="true">→</span>
        </button>
      </div>
    </section>
  );
}

function PredictionStep({
  identity,
  prediction,
  loading,
  error,
  onBack,
  onRetry,
}: {
  identity: ClubIdentity;
  prediction: SeasonPrediction | null;
  loading: boolean;
  error: string;
  onBack: () => void;
  onRetry: () => void;
}) {
  const [shareStatus, setShareStatus] = useState('');
  const [manualCopy, setManualCopy] = useState(false);
  if (loading)
    return (
      <section className="builder-step page-shell prediction-loading" aria-live="polite">
        <span className="loading-mark" />
        <p className="eyebrow">10,000 seasons in progress</p>
        <h1>Calculating the campaign.</h1>
        <p>The prediction runs off the main browser thread, so this page remains responsive.</p>
      </section>
    );
  if (error || !prediction)
    return (
      <section className="builder-step page-shell prediction-loading">
        <p className="eyebrow">Prediction unavailable</p>
        <h1>Something stopped the simulation.</h1>
        <p>{error || 'No result was returned.'}</p>
        <div className="button-row">
          <button className="button button-secondary button-default" onClick={onBack}>
            Back to XI
          </button>
          <button className="button button-primary button-default" onClick={onRetry}>
            Try again
          </button>
        </div>
      </section>
    );
  const likely = prediction.positionDistribution.reduce((best, item) =>
    item.probability > best.probability ? item : best,
  );
  const peak = Math.max(...prediction.positionDistribution.map((item) => item.probability));
  const pointsPeak = Math.max(...prediction.pointsDistribution.map((item) => item.probability));
  const shareText = `${identity.name} are predicted to finish ${ordinal(likely.position)} with ${prediction.meanPoints.toFixed(1)} points across ${prediction.seasons.toLocaleString()} simulated seasons.`;
  const share = async () => {
    try {
      if (navigator.share) {
        await navigator.share({
          title: `${identity.name} season prediction`,
          text: shareText,
          url: location.href,
        });
        setShareStatus('Prediction shared.');
        return;
      }
      if (navigator.clipboard) {
        await navigator.clipboard.writeText(`${shareText} ${location.href}`);
        setShareStatus('Prediction copied to your clipboard.');
        return;
      }
      setManualCopy(true);
      setShareStatus('Select and copy the result below.');
    } catch (shareError) {
      if (shareError instanceof DOMException && shareError.name === 'AbortError') return;
      setManualCopy(true);
      setShareStatus('Select and copy the result below.');
    }
  };

  return (
    <section className="builder-step page-shell prediction-step">
      <SectionHeading
        eyebrow="21st Club · Forecast desk · Step 04"
        title="Your prediction"
        copy={`A real ${prediction.seasons.toLocaleString()}-season engine forecast. ${identity.name} replaces ${REPLACED_CLUB.name} in a 20-club league.`}
      />
      <Card className="result-card">
        <div className="result-identity">
          <Crest identity={identity} large />
          <div>
            <p className="card-kicker">Most likely finish</p>
            <h2>{identity.name}</h2>
            <span>{identity.stadium}</span>
          </div>
          <strong>{ordinal(likely.position)}</strong>
        </div>
        <div className="result-stats">
          <Stat label="Mean points" value={prediction.meanPoints.toFixed(1)} />
          <Stat label="Title" value={pct(prediction.titleProbability)} />
          <Stat label="Top four" value={pct(prediction.top4Probability)} />
          <Stat label="Relegation" value={pct(prediction.relegationProbability)} />
        </div>
        <div className="distribution-grid">
          <figure>
            <figcaption>Finishing position distribution</figcaption>
            <div
              className="position-chart"
              aria-label="Finishing position probability distribution"
            >
              {prediction.positionDistribution.map((item) => (
                <div
                  key={item.position}
                  title={`${ordinal(item.position)}: ${pct(item.probability)}`}
                >
                  <span style={{ height: `${Math.max(2, (item.probability / peak) * 100)}%` }} />
                  <small>{item.position}</small>
                </div>
              ))}
            </div>
            <p className="chart-caption">Position · 1st to 20th</p>
          </figure>
          <figure>
            <figcaption>Points distribution</figcaption>
            <div className="points-chart" aria-label="Season points probability distribution">
              {prediction.pointsDistribution.map((item) => (
                <div
                  key={item.min}
                  title={`${item.min}–${item.max} points: ${pct(item.probability)}`}
                >
                  <span
                    style={{ height: `${Math.max(2, (item.probability / pointsPeak) * 100)}%` }}
                  />
                  <small>{item.min}</small>
                </div>
              ))}
            </div>
            <p className="chart-caption">Points · five-point bands</p>
          </figure>
        </div>
        <div className="share-row">
          <button className="button button-primary button-default" type="button" onClick={share}>
            Share prediction <span aria-hidden="true">↗</span>
          </button>
          <span aria-live="polite">{shareStatus}</span>
        </div>
        {manualCopy ? (
          <textarea
            readOnly
            value={`${shareText} ${location.href}`}
            aria-label="Prediction text to copy"
          />
        ) : null}
      </Card>
      <div className="opponent-section">
        <div>
          <p className="eyebrow">Fixture outlook</p>
          <h2>Expected points by opponent</h2>
        </div>
        <Card className="opponent-table">
          <div className="opponent-row opponent-head">
            <span>Opponent</span>
            <span>Home</span>
            <span>Away</span>
            <span>Total</span>
          </div>
          {[...prediction.perOpponentExpectedPoints]
            .sort((a, b) => b.total - a.total)
            .map((opponent) => (
              <div className="opponent-row" key={opponent.opponentId}>
                <strong>{opponent.opponentName}</strong>
                <span>{opponent.home.toFixed(2)}</span>
                <span>{opponent.away.toFixed(2)}</span>
                <strong>{opponent.total.toFixed(2)}</strong>
              </div>
            ))}
        </Card>
      </div>
      <div className="step-actions">
        <button className="button button-secondary button-default" type="button" onClick={onBack}>
          ← Change starting XI
        </button>
        <a className="button button-primary button-default" href="/match">
          Start season <span aria-hidden="true">→</span>
        </a>
      </div>
    </section>
  );
}

export function PlayFlow() {
  const [hydrated, setHydrated] = useState(false);
  const [step, setStep] = useState<Step>('identity');
  const [identity, setIdentity] = useState<ClubIdentity>(emptyIdentity);
  const [selected, setSelected] = useState<MarketPlayer[]>([]);
  const [formation, setFormation] = useState<Formation>('4-4-2');
  const [starterIds, setStarterIds] = useState<string[]>([]);
  const [prediction, setPrediction] = useState<SeasonPrediction | null>(null);
  const [predictionError, setPredictionError] = useState('');
  const [predictionRun, setPredictionRun] = useState(0);

  useEffect(() => {
    try {
      const restored = parseSavedFlow(localStorage.getItem(STORAGE_KEY), market);
      if (restored) {
        setIdentity(restored.identity);
        setSelected(restored.selected);
        setFormation(restored.formation);
        setStarterIds(restored.starterIds);
        setStep(restored.step);
      }
    } catch {
      localStorage.removeItem(STORAGE_KEY);
    } finally {
      setHydrated(true);
    }
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    const saved: SavedFlow = {
      step,
      identity,
      selectedIds: selected.map((player) => player.id),
      formation,
      starterIds,
    };
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(saved));
    } catch {
      // The flow remains fully usable when storage is unavailable or full.
    }
  }, [formation, hydrated, identity, selected, starterIds, step]);

  useEffect(() => {
    if (
      step !== 'prediction' ||
      validateSquad(selected).length > 0 ||
      validateLineup(selected, starterIds, formation).length > 0
    )
      return;
    setPrediction(null);
    setPredictionError('');
    const worker = new Worker(new URL('./prediction.worker.ts', import.meta.url));
    worker.onmessage = ({
      data,
    }: MessageEvent<{ prediction?: SeasonPrediction; error?: string }>) => {
      if (data.prediction) setPrediction(data.prediction);
      if (data.error) setPredictionError(data.error);
      worker.terminate();
    };
    worker.onerror = () => {
      setPredictionError('The browser could not start the prediction worker.');
      worker.terminate();
    };
    worker.postMessage({
      team: createPredictionTeam('user-club', identity.name, selected, starterIds, formation),
      seed: PREDICTION_SEED,
      replacedClubId: REPLACED_CLUB.id,
      opponents: buildOpponentTeams(market, REPLACED_CLUB.id, selected),
    });
    return () => worker.terminate();
  }, [formation, identity.name, predictionRun, selected, starterIds, step]);

  if (!hydrated) return <main className="builder-shell" />;
  return (
    <main className="builder-shell">
      <FlowHeader step={step} identity={identity} />
      {step === 'identity' ? (
        <IdentityStep
          identity={identity}
          setIdentity={setIdentity}
          onContinue={() => setStep('squad')}
        />
      ) : null}
      {step === 'squad' ? (
        <SquadStep
          selected={selected}
          setSelected={setSelected}
          onBack={() => setStep('identity')}
          onContinue={() => {
            setStarterIds(pickFormationXI(selected, formation));
            setStep('lineup');
          }}
        />
      ) : null}
      {step === 'lineup' ? (
        <LineupStep
          squad={selected}
          formation={formation}
          setFormation={setFormation}
          starterIds={starterIds}
          setStarterIds={setStarterIds}
          onBack={() => setStep('squad')}
          onContinue={() => setStep('prediction')}
        />
      ) : null}
      {step === 'prediction' ? (
        <PredictionStep
          identity={identity}
          prediction={prediction}
          loading={!prediction && !predictionError}
          error={predictionError}
          onBack={() => setStep('lineup')}
          onRetry={() => setPredictionRun((value) => value + 1)}
        />
      ) : null}
    </main>
  );
}
