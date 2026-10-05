'use client';

import { useMemo, useState } from 'react';
import { Card } from '../components/Card';
import { MarketList, MarketRow } from '../components/MarketList';
import playerData from '../play/data/players.json';
import {
  MAX_PER_REAL_CLUB,
  POSITION_ORDER,
  formatMoney,
  squadCost,
  type MarketPlayer,
} from '../play/lib/squad';
import { budgetOf } from '../play/lib/budget';
import { LeagueTable } from './LeagueTable';
import { ProjectionPanel } from './Projection';
import type { SeasonView } from './lib/protocol';

const market = playerData as MarketPlayer[];

const outLabel = (matches: number) => `Out ${matches} ${matches === 1 ? 'match' : 'matches'}`;

/** The January window: up to three same-position swaps at current market values. */
export function TransferWindow({
  view,
  names,
  squad,
  busy,
  onTransfer,
  onClose,
}: {
  view: SeasonView;
  names: ReadonlyMap<string, string>;
  squad: readonly MarketPlayer[];
  busy: boolean;
  onTransfer: (out: MarketPlayer, signing: MarketPlayer) => void;
  onClose: () => void;
}) {
  const [outId, setOutId] = useState<string | null>(null);
  const [inId, setInId] = useState<string | null>(null);
  const { transfersMade, maxTransfers, outFor } = view.window;
  const left = maxTransfers - transfersMade;
  const cost = squadCost(squad);
  const cash = budgetOf(view.identity.budget) - cost;
  const out = squad.find((p) => p.id === outId) ?? null;
  const signing = market.find((p) => p.id === inId) ?? null;
  const owned = useMemo(() => new Set(squad.map((p) => p.id)), [squad]);
  const pool = useMemo(() => market.filter((p) => !owned.has(p.id)), [owned]);
  const squadOut = useMemo(
    () =>
      new Map(
        view.squad.map((p) => [p.id, Math.max(p.injuredFor, p.suspendedFor)] as [string, number]),
      ),
    [view.squad],
  );

  const blockFor = (player: MarketPlayer): string => {
    if (left <= 0) return 'No transfers left';
    if (!out) return 'Sell a player first';
    if (player.position !== out.position) return `${out.position} only`;
    if (
      squad.filter((p) => p.id !== out.id && p.clubId === player.clubId).length >= MAX_PER_REAL_CLUB
    ) {
      return 'Club limit';
    }
    if (cash + out.value - player.value < 0) return 'Over budget';
    return '';
  };

  const confirm = () => {
    if (!out || !signing) return;
    onTransfer(out, signing);
    setOutId(null);
    setInId(null);
  };

  return (
    <section className="se-window page-shell" aria-label="January window">
      <p>
        Swap up to {maxTransfers} players, like for like, at today&apos;s market values. Players out
        injured or suspended cost the same. Other clubs stand still.
      </p>
      <div className="se-window-stats scorebug-strip" aria-label="Window status">
        <div className="stat">
          <span>Cash</span>
          <strong>{formatMoney(cash)}</strong>
        </div>
        <div className="stat">
          <span>Transfers</span>
          <strong>
            {transfersMade}/{maxTransfers}
          </strong>
        </div>
        <div className="stat">
          <span>Squad value</span>
          <strong>{formatMoney(cost)}</strong>
        </div>
      </div>

      {out && signing ? (
        <div className="se-swap" role="group" aria-label="Confirm this swap">
          <p className="se-swap-line">
            <span>
              Sell <strong>{out.name}</strong> ({formatMoney(out.value)})
            </span>
            <span aria-hidden="true">→</span>
            <span>
              Sign <strong>{signing.name}</strong> ({formatMoney(signing.value)}) from{' '}
              {signing.clubName}
            </span>
          </p>
          <p>
            Cash after: <strong>{formatMoney(cash + out.value - signing.value)}</strong> · Transfers
            used after:{' '}
            <strong>
              {transfersMade + 1}/{maxTransfers}
            </strong>
            {outFor[signing.id] ? ` · ${signing.name}: ${outLabel(outFor[signing.id]!)}` : ''}
          </p>
          <div className="se-actions">
            <button
              type="button"
              className="button button-primary button-default"
              disabled={busy}
              onClick={confirm}
            >
              Confirm swap
            </button>
            <button
              type="button"
              className="button button-secondary button-default"
              onClick={() => setInId(null)}
            >
              Choose another
            </button>
          </div>
        </div>
      ) : (
        <p className="se-swap-hint" aria-live="polite">
          {left <= 0
            ? 'No transfers left. Close the window to carry on.'
            : out
              ? `Selling ${out.name}. Now sign a ${out.position} from the market.`
              : 'Pick a player to sell from your squad, then sign a replacement.'}
        </p>
      )}

      <div className="se-window-layout">
        <Card className="selected-card se-window-squad">
          <div className="selected-heading">
            <div>
              <p className="card-kicker">Your 18</p>
              <h2>Your squad</h2>
            </div>
            <span>{formatMoney(cost)}</span>
          </div>
          {POSITION_ORDER.map((position) => (
            <div className="player-list se-squad-group" role="list" key={position}>
              {squad
                .filter((p) => p.position === position)
                .map((player) => {
                  const gone = squadOut.get(player.id) ?? 0;
                  const picked = player.id === outId;
                  return (
                    <MarketRow
                      key={player.id}
                      player={player}
                      note={gone > 0 ? outLabel(gone) : 'Fit'}
                      action={
                        <button
                          type="button"
                          className={`row-action ${picked ? '' : left <= 0 ? 'blocked' : ''}`}
                          disabled={left <= 0}
                          aria-pressed={picked}
                          aria-label={`${picked ? 'Keep' : 'Sell'} ${player.name}`}
                          onClick={() => {
                            setOutId(picked ? null : player.id);
                            setInId(null);
                          }}
                        >
                          {picked ? 'Keep' : 'Sell'}
                        </button>
                      }
                    />
                  );
                })}
            </div>
          ))}
        </Card>
        <Card className="market-card se-window-market">
          <p className="card-kicker">Market</p>
          <h2>{out ? `${out.position} market` : 'Transfer market'}</h2>
          <MarketList
            key={out?.position ?? 'any'}
            players={pool}
            lockedPosition={out?.position}
            note={(player) => (outFor[player.id] ? outLabel(outFor[player.id]!) : undefined)}
            action={(player) => {
              const block = blockFor(player);
              const picked = player.id === inId;
              return (
                <button
                  type="button"
                  className={`row-action ${block ? 'blocked' : ''}`}
                  disabled={Boolean(block)}
                  aria-pressed={picked}
                  aria-label={block ? `${player.name} blocked: ${block}` : `Sign ${player.name}`}
                  title={block || `Sign ${player.name}`}
                  onClick={() => setInId(player.id)}
                >
                  {block || (picked ? 'Chosen' : 'Sign')}
                </button>
              );
            }}
          />
        </Card>
      </div>

      <div className="se-actions">
        <button
          type="button"
          className="button button-primary button-default"
          disabled={busy}
          onClick={onClose}
        >
          Close the window and continue <span aria-hidden="true">→</span>
        </button>
      </div>
      <div className="se-after">
        <LeagueTable table={view.table} names={names} />
        <ProjectionPanel projection={view.projection} prediction={view.prediction} />
      </div>
    </section>
  );
}
