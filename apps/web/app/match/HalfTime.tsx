'use client';

import {
  TUNING,
  type MatchEvent,
  type MatchSnapshot,
  type Player,
  type Tactic,
  type Team,
} from '@pl/engine';
import { useMemo, useState } from 'react';
import { pitchPositions } from '../play/lib/lineup';
import { POSITION_ORDER, type Formation } from '../play/lib/squad';
import { userDotColour } from './lib/colours';
import {
  fitnessTone,
  halfTimeTip,
  ratingTone,
  shareOf,
  type TipInput,
  type TipPlayer,
} from './lib/halftime';
import { statsFromEvents, validateSubstitution, type PendingSubstitution } from './lib/match';
import { keyMoments } from './lib/moments';
import { TACTICS } from './lib/tactics';
import { activePlayers, scoreAt } from './lib/timeline';
import type { ViewerSides } from './MatchViewer';
import { ScoreBug } from './ScoreBug';
import './halftime.css';

const roundTo = (value: number, digits = 0): string => value.toFixed(digits);

function StatRow({
  label,
  us,
  them,
  digits = 0,
  suffix = '',
  colour,
}: {
  label: string;
  us: number;
  them: number;
  digits?: number;
  suffix?: string;
  colour: string;
}) {
  return (
    <div className="hs-stat">
      <dt>{label}</dt>
      <dd>
        {roundTo(us, digits)}
        {suffix} – {roundTo(them, digits)}
        {suffix}
      </dd>
      <i aria-hidden="true">
        <b style={{ width: `${shareOf(us, them)}%`, background: colour }} />
      </i>
    </div>
  );
}

function PlayerCard({
  player,
  rating,
  fitness,
  injured,
  incoming,
  selected,
  dimmed,
  compatible,
  disabled,
  onClick,
  style,
  crowded,
}: {
  player: Player;
  /** Live rating, or null for a player who has not played yet. */
  rating: number | null;
  fitness: number;
  injured: boolean;
  incoming?: boolean;
  selected?: boolean;
  dimmed?: boolean;
  compatible?: boolean;
  disabled?: boolean;
  onClick?: () => void;
  style?: React.CSSProperties;
  /** 0 or 1 for alternate cards in a line of five or more (stacked on narrow screens). */
  crowded?: 0 | 1;
}) {
  const fit = Math.round(fitness);
  return (
    <button
      type="button"
      className={[
        'hp',
        `hp-${player.position.toLowerCase()}`,
        selected ? 'selected' : '',
        dimmed ? 'dimmed' : '',
        compatible ? 'compatible' : '',
        injured ? 'injured' : '',
      ]
        .filter(Boolean)
        .join(' ')}
      style={style}
      data-crowded={crowded}
      disabled={disabled}
      aria-pressed={selected === undefined ? undefined : selected}
      aria-label={`${player.name}, ${player.position}, ${
        rating === null ? 'not rated yet' : `rated ${rating.toFixed(1)}`
      }, fitness ${fit}%${injured ? ', injured' : ''}${incoming ? ', coming on' : ''}`}
      onClick={onClick}
    >
      <span className="hp-top">
        <span className="hp-pos">{player.position}</span>
        <span className={`hp-rating tone-${rating === null ? 'none' : ratingTone(rating)}`}>
          {rating === null ? '–' : rating.toFixed(1)}
        </span>
      </span>
      <strong className="hp-name">{player.name}</strong>
      <span className="hp-fit">
        <i aria-hidden="true">
          <b className={`fit-${fitnessTone(fitness)}`} style={{ width: `${Math.max(2, fit)}%` }} />
        </i>
        <small>{fit}%</small>
      </span>
      {injured ? <em className="hp-flag">INJ</em> : null}
      {incoming ? <em className="hp-flag on">ON</em> : null}
    </button>
  );
}

export function HalfTime({
  team,
  snapshot,
  firstHalf,
  sides,
  tactic,
  matchdayLabel,
  onContinue,
}: {
  /** The user's side as fielded for this match. */
  team: Team;
  snapshot: MatchSnapshot;
  firstHalf: readonly MatchEvent[];
  sides: ViewerSides;
  tactic: Tactic;
  /** "Matchday 12" in a season, "Friendly" otherwise. */
  matchdayLabel: string;
  /** `skip` plays the second half out of sight and goes straight to full time. */
  onContinue: (tactic: Tactic, substitutions: PendingSubstitution[], skip: boolean) => void;
}) {
  const { home, away, userSide } = sides;
  const themSide = userSide === 'home' ? 'away' : 'home';
  const [nextTactic, setNextTactic] = useState<Tactic>(tactic);
  const [pending, setPending] = useState<PendingSubstitution[]>([]);
  const [off, setOff] = useState<string | null>(null);
  const [message, setMessage] = useState('');

  const score = scoreAt(firstHalf, home.id);
  const stats = statsFromEvents(firstHalf, home.id, away.id);
  const us = stats[userSide];
  const them = stats[themSide];
  const possession = snapshot.possession;
  const colour = userDotColour(sides.userColour);

  const everyone: Player[] = [...team.players, ...(team.bench ?? [])];
  const byId = new Map(everyone.map((player) => [player.id, player]));
  const nameById = useMemo(
    () =>
      new Map(
        [...home.players, ...(home.bench ?? []), ...away.players, ...(away.bench ?? [])].map(
          (p) => [p.id, p.name],
        ),
      ),
    [home, away],
  );
  const state = new Map(snapshot.players.map((player) => [player.playerId, player]));
  const rating = new Map(snapshot.ratings.map((item) => [item.playerId, item.rating]));
  const fitnessOf = (id: string): number => state.get(id)?.stamina ?? 100;

  const wentOff = new Set(
    firstHalf
      .filter(
        (event) =>
          event.teamId === team.id &&
          event.action === 'substitution' &&
          event.offPlayerId !== undefined,
      )
      .map((event) => event.offPlayerId as string),
  );
  const pitchIds = new Set(activePlayers(team, firstHalf).map((player) => player.playerId));
  const pendingOff = new Set(pending.map((item) => item.off));
  const pendingOn = new Set(pending.map((item) => item.on));
  const onFor = new Map(pending.map((item) => [item.off, item.on]));

  const starters = POSITION_ORDER.flatMap((position) =>
    [...pitchIds]
      .map((id) => byId.get(id))
      .filter((player): player is Player => player !== undefined && player.position === position),
  );
  const bench = (team.bench ?? []).filter((player) => {
    const entry = state.get(player.id);
    return (
      !pitchIds.has(player.id) && !wentOff.has(player.id) && !entry?.sentOff && !entry?.injured
    );
  });
  const availableBench = bench.filter((player) => !pendingOn.has(player.id));
  const remaining = TUNING.maxSubstitutions - snapshot.substitutionsUsed[userSide] - pending.length;
  const offPlayer = off ? byId.get(off) : undefined;
  const hasBenchFor = (position: string): boolean =>
    availableBench.some((player) => player.position === position);

  const choose = (player: Player) => {
    if (remaining <= 0) {
      setMessage('No substitutions left.');
      return;
    }
    if (off === player.id) {
      setOff(null);
      setMessage('');
      return;
    }
    setOff(player.id);
    setMessage(
      hasBenchFor(player.position)
        ? `Choose a ${player.position} from the bench to replace ${player.name}.`
        : `No ${player.position} left on the bench to replace ${player.name}.`,
    );
  };

  const bring = (player: Player) => {
    if (!off) {
      setMessage('Tap the player to take off first.');
      return;
    }
    const proposal = { off, on: player.id };
    const error = validateSubstitution(team, userSide, snapshot, proposal, pending);
    if (error) {
      setMessage(error);
      return;
    }
    setPending([...pending, proposal]);
    setOff(null);
    setMessage(`${player.name} will replace ${byId.get(off)?.name} for the second half.`);
  };

  const undo = (item: PendingSubstitution) => {
    setPending(pending.filter((entry) => entry !== item));
    setMessage('');
  };

  // ---- the assistant's tip: from first-half facts only; swapped-out players no longer count
  const candidates = starters.filter((player) => !pendingOff.has(player.id));
  const asTip = (player: Player): TipPlayer => ({ name: player.name, position: player.position });
  const rated = candidates.filter((player) => rating.has(player.id));
  const tiredOne = candidates
    .filter((player) => fitnessOf(player.id) < 50 && hasBenchFor(player.position))
    .sort((a, b) => fitnessOf(a.id) - fitnessOf(b.id))[0];
  const strugglingOne = rated
    .filter((player) => rating.get(player.id)! < 5.5 && hasBenchFor(player.position))
    .sort((a, b) => rating.get(a.id)! - rating.get(b.id)!)[0];
  const bookedOne = candidates.find(
    (player) => (state.get(player.id)?.yellowCards ?? 0) > 0 && !state.get(player.id)?.sentOff,
  );
  const bestOne = [...rated].sort((a, b) => rating.get(b.id)! - rating.get(a.id)!)[0];
  const tipInput: TipInput = {
    score: {
      us: userSide === 'home' ? score.home : score.away,
      them: userSide === 'home' ? score.away : score.home,
    },
    shots: { us: us.shots, them: them.shots },
    xg: { us: us.xg, them: them.xg },
    possession: { us: possession[userSide], them: possession[themSide] },
    tactic: nextTactic,
    subsLeft: remaining,
    reds: { us: us.redCards, them: them.redCards },
    tired: tiredOne ? { ...asTip(tiredOne), fitness: fitnessOf(tiredOne.id) } : null,
    struggling: strugglingOne
      ? { ...asTip(strugglingOne), rating: rating.get(strugglingOne.id)! }
      : null,
    booked: bookedOne ? asTip(bookedOne) : null,
    best: bestOne ? { ...asTip(bestOne), rating: rating.get(bestOne.id)! } : null,
  };
  const tip = halfTimeTip(tipInput);

  const userCode = userSide === 'home' ? sides.homeLabel : sides.awayLabel;
  const themCode = userSide === 'home' ? sides.awayLabel : sides.homeLabel;
  const moments = keyMoments(
    firstHalf,
    (id) => nameById.get(id) ?? 'A player',
    (teamId) => (teamId === home.id ? sides.homeLabel : sides.awayLabel),
  );

  const formation = team.formation as Formation;
  const slots = pitchPositions[formation] ?? pitchPositions['4-4-2'];
  const slotFor = (player: Player, indexInPosition: number): [number, number] => {
    const line = slots[player.position];
    return (line[indexInPosition] ?? line[line.length - 1] ?? [50, 50]) as [number, number];
  };
  const seen: Record<string, number> = {};
  const incomingOf = (player: Player): Player | undefined => {
    const id = onFor.get(player.id);
    return id ? byId.get(id) : undefined;
  };
  const tacticLine = TACTICS.find((item) => item.id === nextTactic)!;

  return (
    <section className="ht page-shell">
      <ScoreBug
        titleId="ht-title"
        tag="HALF-TIME"
        subtitle={`${matchdayLabel} · ${userSide === 'home' ? 'Home' : 'Away'}`}
        sides={sides}
        score={score}
      />

      <div className="hs-card">
        <h2 className="hs-title">
          First half{' '}
          <span>
            {userCode} – {themCode}
          </span>
        </h2>
        <dl className="hs-stats">
          <StatRow
            label="Possession"
            us={possession[userSide]}
            them={possession[themSide]}
            suffix="%"
            colour={colour}
          />
          <StatRow label="Shots" us={us.shots} them={them.shots} colour={colour} />
          <StatRow
            label="On target"
            us={us.shotsOnTarget}
            them={them.shotsOnTarget}
            colour={colour}
          />
          <StatRow label="Expected goals" us={us.xg} them={them.xg} digits={2} colour={colour} />
          <StatRow label="Corners" us={us.corners} them={them.corners} colour={colour} />
          <StatRow label="Fouls" us={us.fouls} them={them.fouls} colour={colour} />
          <StatRow
            label="Cards"
            us={us.yellowCards + us.redCards}
            them={them.yellowCards + them.redCards}
            colour={colour}
          />
        </dl>
      </div>

      <div className="hs-card hs-moments">
        <h2 className="hs-title">Key moments</h2>
        {moments.length ? (
          <ul>
            {moments.map((moment, index) => (
              <li key={index}>
                <b className="km-min">{moment.minute}</b>
                <span className={`km-tag tag-${moment.tag.toLowerCase()}`}>{moment.tag}</span>
                <span className="km-text">{moment.text}</span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="hs-empty">A quiet half: no goals, cards or injuries.</p>
        )}
      </div>

      <div className="ht-layout">
        <div className="ht-left hs-card">
          <div className="ht-left-head">
            <h2 className="hs-title">
              Your XI <span>{formation}</span>
            </h2>
            <p className="ht-subs-left" aria-live="polite">
              <strong>{Math.max(remaining, 0)}</strong> {remaining === 1 ? 'sub' : 'subs'} left
            </p>
          </div>
          <div className="ht-pitch" role="group" aria-label={`${formation} starting eleven`}>
            <div className="ht-pitch-lines" aria-hidden="true" />
            {starters.map((player) => {
              const index = (seen[player.position] = (seen[player.position] ?? -1) + 1);
              const [x, y] = slotFor(player, index);
              const lineSize = slots[player.position].length;
              const incoming = incomingOf(player);
              const shown = incoming ?? player;
              const swapped = incoming !== undefined;
              const isOff = off === player.id;
              const dim = off !== null && !isOff;
              return (
                <PlayerCard
                  key={player.id}
                  player={shown}
                  rating={swapped ? null : (rating.get(player.id) ?? null)}
                  fitness={swapped ? 100 : fitnessOf(player.id)}
                  injured={!swapped && Boolean(state.get(player.id)?.injured)}
                  incoming={swapped}
                  selected={swapped ? undefined : isOff}
                  dimmed={dim && !swapped}
                  disabled={swapped}
                  style={{ left: `${x}%`, top: `${y}%` }}
                  crowded={lineSize >= 5 ? ((index % 2) as 0 | 1) : undefined}
                  onClick={() => choose(player)}
                />
              );
            })}
          </div>

          <h3 className="ht-bench-title">Bench</h3>
          <div className="ht-bench">
            {bench.map((player) => {
              const picked = pendingOn.has(player.id);
              const compatible =
                offPlayer !== undefined && offPlayer.position === player.position && !picked;
              return (
                <PlayerCard
                  key={player.id}
                  player={player}
                  rating={rating.get(player.id) ?? null}
                  fitness={fitnessOf(player.id)}
                  injured={false}
                  compatible={compatible}
                  dimmed={offPlayer !== undefined && !compatible}
                  disabled={picked}
                  onClick={() => bring(player)}
                />
              );
            })}
          </div>
          <p className="ht-message" aria-live="polite">
            {message || 'Tap a player to take off, then a same-position substitute.'}
          </p>
          {pending.length ? (
            <ul className="ht-pending">
              {pending.map((item) => (
                <li key={item.on}>
                  <span>
                    {byId.get(item.on)?.name} <i>for</i> {byId.get(item.off)?.name}
                  </span>
                  <button type="button" onClick={() => undo(item)}>
                    Undo
                  </button>
                </li>
              ))}
            </ul>
          ) : null}
        </div>

        <aside className="ht-tip" aria-label="Assistant's tip">
          <p className="ht-tip-kicker">Assistant&apos;s tip</p>
          <p className="ht-tip-text">{tip}</p>
        </aside>

        <div className="ht-plan hs-card">
          <h2 className="hs-title">Second-half approach</h2>
          <div className="ht-seg" role="radiogroup" aria-label="Second-half approach">
            {TACTICS.map((item) => (
              <button
                key={item.id}
                type="button"
                role="radio"
                aria-checked={nextTactic === item.id}
                className={nextTactic === item.id ? 'selected' : ''}
                onClick={() => setNextTactic(item.id)}
              >
                {item.label}
              </button>
            ))}
          </div>
          <p className="ht-tradeoff" aria-live="polite">
            {tacticLine.tradeOff}
          </p>
          <div className="ht-actions">
            <button
              type="button"
              className="button button-primary button-default ht-start"
              onClick={() => onContinue(nextTactic, pending, false)}
            >
              Start second half <span aria-hidden="true">→</span>
            </button>
            <button
              type="button"
              className="ht-skip"
              onClick={() => onContinue(nextTactic, pending, true)}
            >
              Skip to full time
            </button>
          </div>
        </div>
      </div>
    </section>
  );
}
