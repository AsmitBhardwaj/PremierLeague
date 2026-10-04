'use client';

import type { Position } from '@pl/engine';
import { useMemo, useState, type ReactNode } from 'react';
import { POSITION_ORDER, formatMoney, type MarketPlayer } from '../play/lib/squad';
import { matchesName } from '../play/lib/search';
import { ClubBadge, positionEdge } from './ClubBadge';

const statusLabel = (status: string) =>
  ({ a: 'Available', d: 'Doubtful', i: 'Injured', s: 'Suspended' })[status] ?? status;

/** One player row: club badge, position stripe, rating, value and an action. Used wherever players are listed to sign. */
export function MarketRow({
  player,
  note,
  action,
}: {
  player: MarketPlayer;
  /** Replaces the availability status in the subtitle, e.g. "Out 3 matches". */
  note?: string;
  action: ReactNode;
}) {
  return (
    <div className={`player-row ${positionEdge(player.position)}`} role="listitem">
      <ClubBadge code={player.clubShortName} />
      <span className="player-name">
        <strong>{player.name}</strong>
        <small>
          {player.position} · {player.clubName} · {note ?? statusLabel(player.status)}
        </small>
      </span>
      <span className="player-rating">{player.overall}</span>
      <span className="player-value">{formatMoney(player.value)}</span>
      {action}
    </div>
  );
}

/** Search, filters, sort and the rows themselves. */
export function MarketList({
  players,
  lockedPosition,
  note,
  action,
}: {
  players: readonly MarketPlayer[];
  /** Restrict the list to one position and hide the position filter. */
  lockedPosition?: Position;
  note?: (player: MarketPlayer) => string | undefined;
  action: (player: MarketPlayer) => ReactNode;
}) {
  const [search, setSearch] = useState('');
  const [position, setPosition] = useState('ALL');
  const [club, setClub] = useState('ALL');
  const [sort, setSort] = useState('value-desc');
  const clubs = useMemo(() => [...new Set(players.map((p) => p.clubName))].sort(), [players]);
  const filtered = useMemo(
    () =>
      players
        .filter(
          (player) =>
            matchesName(player.name, search) &&
            (lockedPosition ? player.position === lockedPosition : true) &&
            (position === 'ALL' || player.position === position) &&
            (club === 'ALL' || player.clubName === club),
        )
        .sort((a, b) => {
          if (sort === 'value-desc') return b.value - a.value || a.name.localeCompare(b.name);
          if (sort === 'rating-desc') return b.overall - a.overall || a.name.localeCompare(b.name);
          if (sort === 'name') return a.name.localeCompare(b.name);
          return a.value - b.value || a.name.localeCompare(b.name);
        }),
    [club, lockedPosition, players, position, search, sort],
  );

  return (
    <>
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
        {lockedPosition ? null : (
          <label className="field">
            <span>Position</span>
            <select value={position} onChange={(event) => setPosition(event.target.value)}>
              <option value="ALL">All positions</option>
              {POSITION_ORDER.map((item) => (
                <option key={item}>{item}</option>
              ))}
            </select>
          </label>
        )}
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
            <option value="value-desc">Value: high to low</option>
            <option value="value-asc">Value: low to high</option>
            <option value="rating-desc">Rating: high to low</option>
            <option value="name">Name</option>
          </select>
        </label>
      </div>
      <div className="player-list" role="list" aria-label={`${filtered.length} matching players`}>
        {filtered.map((player) => (
          <MarketRow
            key={player.id}
            player={player}
            note={note?.(player)}
            action={action(player)}
          />
        ))}
      </div>
    </>
  );
}
