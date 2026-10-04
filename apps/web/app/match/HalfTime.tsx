'use client';

import {
  TUNING,
  type MatchEvent,
  type MatchSnapshot,
  type Player,
  type Tactic,
  type Team,
} from '@pl/engine';
import { useState } from 'react';
import { POSITION_ORDER } from '../play/lib/squad';
import { statsFromEvents, validateSubstitution, type PendingSubstitution } from './lib/match';
import { TACTICS } from './lib/tactics';
import { activePlayers, scoreAt } from './lib/timeline';
import type { ViewerSides } from './MatchViewer';

const stat = (value: number, digits = 0) => value.toFixed(digits);

function StatRow({
  label,
  home,
  away,
  digits = 0,
}: {
  label: string;
  home: number;
  away: number;
  digits?: number;
}) {
  const total = home + away;
  return (
    <div className="ht-stat">
      <strong>{stat(home, digits)}</strong>
      <span>
        {label}
        <i aria-hidden="true">
          <b style={{ width: `${total ? (home / total) * 100 : 50}%` }} />
        </i>
      </span>
      <strong>{stat(away, digits)}</strong>
    </div>
  );
}

export function HalfTime({
  team,
  snapshot,
  firstHalf,
  sides,
  tactic,
  onContinue,
}: {
  /** The user's side as fielded for this match. */
  team: Team;
  snapshot: MatchSnapshot;
  firstHalf: readonly MatchEvent[];
  sides: ViewerSides;
  tactic: Tactic;
  onContinue: (tactic: Tactic, substitutions: PendingSubstitution[]) => void;
}) {
  const { home, away, userSide } = sides;
  const [nextTactic, setNextTactic] = useState<Tactic>(tactic);
  const [pending, setPending] = useState<PendingSubstitution[]>([]);
  const [off, setOff] = useState<string | null>(null);
  const [message, setMessage] = useState(
    'Pick a player to take off, then a same-position substitute.',
  );

  const score = scoreAt(firstHalf, home.id);
  const stats = statsFromEvents(firstHalf, home.id, away.id);
  const everyone: Player[] = [...team.players, ...(team.bench ?? [])];
  const byId = new Map(everyone.map((player) => [player.id, player]));
  const stamina = new Map(snapshot.players.map((player) => [player.playerId, player.stamina]));
  const cameOn = new Set(
    firstHalf
      .filter((event) => event.action === 'substitution' && event.teamId === team.id)
      .map((event) => event.playerId),
  );
  const pitchIds = new Set(activePlayers(team, firstHalf).map((player) => player.playerId));
  const pendingOff = new Set(pending.map((item) => item.off));
  const pendingOn = new Set(pending.map((item) => item.on));
  const onPitch = POSITION_ORDER.flatMap((position) =>
    [...pitchIds].map((id) => byId.get(id)!).filter((player) => player?.position === position),
  );
  const bench = (team.bench ?? []).filter(
    (player) => !cameOn.has(player.id) && !pitchIds.has(player.id),
  );
  const remaining = TUNING.maxSubstitutions - snapshot.substitutionsUsed[userSide] - pending.length;
  const offPlayer = off ? byId.get(off) : undefined;
  const sentOff = firstHalf.filter(
    (event) => event.action === 'card' && event.outcome === 'red_card',
  );

  const choose = (player: Player) => {
    if (pendingOff.has(player.id)) return;
    setOff(player.id);
    setMessage(`Choose a ${player.position} from the bench to replace ${player.name}.`);
  };

  const bring = (player: Player) => {
    if (!off) {
      setMessage('Pick the player to take off first.');
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

  return (
    <section className="ht page-shell" aria-labelledby="ht-title">
      <div className="ht-bug">
        <span className="mv-tag">HT</span>
        <h1 id="ht-title">
          {home.name}{' '}
          <strong>
            {score.home}–{score.away}
          </strong>{' '}
          {away.name}
        </h1>
      </div>

      <div className="ht-grid">
        <div className="ht-card">
          <p className="mt-kicker">First half</p>
          <StatRow label="Shots" home={stats.home.shots} away={stats.away.shots} />
          <StatRow
            label="On target"
            home={stats.home.shotsOnTarget}
            away={stats.away.shotsOnTarget}
          />
          <StatRow label="Expected goals" home={stats.home.xg} away={stats.away.xg} digits={2} />
          <StatRow label="Corners" home={stats.home.corners} away={stats.away.corners} />
          <StatRow label="Fouls" home={stats.home.fouls} away={stats.away.fouls} />
          <StatRow
            label="Cards"
            home={stats.home.yellowCards + stats.home.redCards}
            away={stats.away.yellowCards + stats.away.redCards}
          />
          {firstHalf.some(
            (event) => event.action === 'injury' || event.action === 'substitution',
          ) ? (
            <div className="ht-notes">
              <p className="mt-kicker">Injuries and changes</p>
              <ul>
                {firstHalf
                  .filter((event) => event.action === 'injury' || event.action === 'substitution')
                  .map((event, index) => (
                    <li key={index}>
                      <b>{event.minute}&apos;</b> {event.commentary}
                    </li>
                  ))}
              </ul>
            </div>
          ) : null}
          {sentOff.length ? (
            <p className="mt-warning">Red card: you are playing the second half a player down.</p>
          ) : null}
        </div>

        <div className="ht-card">
          <p className="mt-kicker">Tactic · second half</p>
          <fieldset className="mt-tactics compact">
            <legend className="mt-sr">Second-half tactic</legend>
            {TACTICS.map((item) => (
              <label key={item.id} className={nextTactic === item.id ? 'selected' : ''}>
                <input
                  type="radio"
                  name="half-time-tactic"
                  checked={nextTactic === item.id}
                  onChange={() => setNextTactic(item.id)}
                />
                <strong>
                  {item.label}
                  {item.id === tactic ? <em> · current</em> : null}
                </strong>
                <span>{item.tradeOff}</span>
              </label>
            ))}
          </fieldset>
        </div>

        <div className="ht-card ht-subs">
          <p className="mt-kicker">
            Substitutions · {remaining} of {TUNING.maxSubstitutions} left
          </p>
          <div className="ht-lists">
            <div>
              <h2>On the pitch</h2>
              <ul>
                {onPitch.map((player) => (
                  <li key={player.id}>
                    <button
                      type="button"
                      className={off === player.id ? 'selected' : ''}
                      disabled={pendingOff.has(player.id)}
                      aria-pressed={off === player.id}
                      onClick={() => choose(player)}
                    >
                      <span className={`mt-chip pos-${player.position.toLowerCase()}`}>
                        {player.position}
                      </span>
                      <strong>{player.name}</strong>
                      <small>{Math.round(stamina.get(player.id) ?? 100)}% fit</small>
                    </button>
                  </li>
                ))}
              </ul>
            </div>
            <div>
              <h2>Bench</h2>
              <ul>
                {bench.map((player) => (
                  <li key={player.id}>
                    <button
                      type="button"
                      className={
                        offPlayer &&
                        offPlayer.position === player.position &&
                        !pendingOn.has(player.id)
                          ? 'compatible'
                          : ''
                      }
                      disabled={pendingOn.has(player.id)}
                      onClick={() => bring(player)}
                    >
                      <span className={`mt-chip pos-${player.position.toLowerCase()}`}>
                        {player.position}
                      </span>
                      <strong>{player.name}</strong>
                      <small>fresh</small>
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          </div>
          <p className="mt-message" aria-live="polite">
            {message}
          </p>
          {pending.length ? (
            <ul className="ht-pending">
              {pending.map((item) => (
                <li key={item.on}>
                  <span>
                    {byId.get(item.on)?.name} <i>for</i> {byId.get(item.off)?.name}
                  </span>
                  <button
                    type="button"
                    onClick={() => setPending(pending.filter((entry) => entry !== item))}
                  >
                    Undo
                  </button>
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      </div>

      <div className="ht-actions">
        <button
          type="button"
          className="button button-primary button-default"
          onClick={() => onContinue(nextTactic, pending)}
        >
          Continue <span aria-hidden="true">→</span>
        </button>
      </div>
    </section>
  );
}
