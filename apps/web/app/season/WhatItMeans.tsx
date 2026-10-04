import type { Projection } from '@pl/engine';
import { about, finishRange, ordinal } from '../play/lib/preview';
import { percent } from './lib/format';
import type { MatchFinish, SeasonView } from './lib/protocol';
import { USER_CLUB_ID } from './lib/setup';

const rawId = (seasonId: string): string => seasonId.slice(USER_CLUB_ID.length + 1);

const likelyOf = (projection: Projection): number =>
  finishRange(
    projection.positions.map((probability, i) => ({ position: i + 1, probability, count: 0 })),
  ).likely;

/** What the player was out for, from the match's own injury and red-card events. */
function absences(view: SeasonView, finish: MatchFinish): string[] {
  const team = finish.userSide === 'home' ? finish.home : finish.away;
  const names = new Map([...team.players, ...(team.bench ?? [])].map((p) => [p.id, p.name]));
  const state = new Map(view.squad.map((p) => [p.id, p]));
  const lines: string[] = [];
  const seen = new Set<string>();
  for (const event of finish.result.events) {
    if (event.teamId !== team.id || !event.playerId || seen.has(event.playerId + event.action))
      continue;
    const name = names.get(event.playerId) ?? 'A player';
    const entry = state.get(rawId(event.playerId));
    if (event.action === 'injury') {
      seen.add(event.playerId + event.action);
      const out = entry?.injuredFor ?? 0;
      lines.push(
        out > 0
          ? `${name} injured, out for ${out} ${out === 1 ? 'match' : 'matches'}`
          : `${name} took a knock`,
      );
    } else if (event.action === 'card' && event.outcome === 'red_card') {
      seen.add(event.playerId + event.action);
      lines.push(`${name} sent off, suspended for the next match`);
    }
  }
  return lines;
}

/** The ink panel after a season match: table move, projected finish, absences and what is next. */
export function WhatItMeans({
  view,
  finish,
  before,
  names,
}: {
  view: SeasonView;
  finish: MatchFinish;
  /** The league position and projection before kick-off; unknown after a reload mid-match. */
  before: { projection: Projection; position: number } | null;
  names: ReadonlyMap<string, string>;
}) {
  const index = view.table.findIndex((row) => row.clubId === USER_CLUB_ID);
  const row = view.table[index]!;
  const position = index + 1;
  const projected = likelyOf(view.projection);
  const out = absences(view, finish);
  const from = before?.position ?? row.previousPosition;
  const { next } = view;
  return (
    <section className="fs-means" aria-label="What it means">
      <h2>What it means</h2>
      <dl>
        <div>
          <dt>League position</dt>
          <dd>
            <strong>
              {from === position
                ? `${ordinal(position)}`
                : `${ordinal(from)} → ${ordinal(position)}`}
            </strong>
            <small>
              {from === position ? 'Unchanged · ' : ''}
              {row.points} {row.points === 1 ? 'point' : 'points'} from {row.played}{' '}
              {row.played === 1 ? 'game' : 'games'}
            </small>
          </dd>
        </div>
        <div>
          <dt>Projected finish</dt>
          <dd>
            <strong>{ordinal(projected)}</strong>
            <small>
              {before
                ? `${likelyOf(before.projection) === projected ? 'Same as' : `Was ${ordinal(likelyOf(before.projection))} before`} kick-off · `
                : ''}
              on course for {about(view.projection.meanPoints)} points
            </small>
          </dd>
        </div>
        <div>
          <dt>Injuries and suspensions</dt>
          <dd>
            {out.length ? (
              <>
                {out.map((line) => (
                  <span key={line} style={{ display: 'block' }}>
                    {line}
                  </span>
                ))}
              </>
            ) : (
              'Everyone came through fit.'
            )}
          </dd>
        </div>
        <div>
          <dt>Next up</dt>
          <dd>
            {next ? (
              <>
                {names.get(next.opponentId) ?? next.opponentId},{' '}
                {next.venue === 'home' ? 'home' : 'away'}
                {next.odds ? (
                  <small>
                    Win {percent(next.odds.win)} · Draw {percent(next.odds.draw)} · Loss{' '}
                    {percent(next.odds.loss)}
                  </small>
                ) : null}
              </>
            ) : view.phase === 'window' ? (
              'The January window opens.'
            ) : (
              'That was the last match of the season.'
            )}
          </dd>
        </div>
      </dl>
    </section>
  );
}
