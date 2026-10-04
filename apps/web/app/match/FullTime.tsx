'use client';

import type { MatchResult, PlayerMatchRating, Team, TeamStats } from '@pl/engine';
import type { ReactNode } from 'react';
import { rankPlayers, playerOfTheMatch } from './lib/fulltime';
import type { ViewerSides } from './MatchViewer';

const rows: {
  label: string;
  pick: (stats: TeamStats) => number;
  digits?: number;
  suffix?: string;
}[] = [
  { label: 'Possession', pick: (s) => s.possession, suffix: '%' },
  { label: 'Shots', pick: (s) => s.shots },
  { label: 'On target', pick: (s) => s.shotsOnTarget },
  { label: 'Expected goals', pick: (s) => s.xg, digits: 2 },
  { label: 'Corners', pick: (s) => s.corners },
  { label: 'Fouls', pick: (s) => s.fouls },
  { label: 'Yellow cards', pick: (s) => s.yellowCards },
  { label: 'Red cards', pick: (s) => s.redCards },
];

function Ratings({
  team,
  label,
  ratings,
  potm,
}: {
  team: Team;
  label: string;
  ratings: PlayerMatchRating[];
  potm?: string;
}) {
  const list = rankPlayers(ratings.filter((item) => item.teamId === team.id));
  return (
    <div className="ft-card">
      <p className="mt-kicker">{label} · player ratings</p>
      <ol className="ft-ratings">
        {list.map((item) => (
          <li key={item.playerId} className={item.playerId === potm ? 'potm' : ''}>
            <strong>{item.rating.toFixed(1)}</strong>
            <span>
              {item.name}
              {item.playerId === potm ? <em>Player of the match</em> : null}
            </span>
            <small>
              {item.goals ? `${item.goals} goal${item.goals > 1 ? 's' : ''}` : ''}
              {item.assists ? ` ${item.assists} assist${item.assists > 1 ? 's' : ''}` : ''}
              {item.yellowCards ? ' yellow' : ''}
              {item.redCard ? ' red' : ''}
            </small>
          </li>
        ))}
      </ol>
    </div>
  );
}

export function FullTime({
  result,
  sides,
  seed,
  onPlayAgain,
  onChangeTeam,
  actions,
}: {
  result: MatchResult;
  sides: ViewerSides;
  seed: number;
  onPlayAgain?: () => void;
  onChangeTeam?: () => void;
  /** Replaces the friendly's buttons (a season has no replay). */
  actions?: ReactNode;
}) {
  const { home, away, userSide } = sides;
  const best = playerOfTheMatch(result.playerRatings);
  const user = userSide === 'home' ? result.score.home : result.score.away;
  const them = userSide === 'home' ? result.score.away : result.score.home;
  const verdict = user > them ? 'Win' : user === them ? 'Draw' : 'Defeat';

  return (
    <section className="ft page-shell" aria-labelledby="ft-title">
      <div className="ht-bug">
        <span className="mv-tag">FT</span>
        <h1 id="ft-title">
          {home.name}{' '}
          <strong>
            {result.score.home}–{result.score.away}
          </strong>{' '}
          {away.name}
        </h1>
      </div>
      <p className="ft-verdict">
        {verdict} for {userSide === 'home' ? sides.homeLabel : sides.awayLabel}
        {best ? (
          <>
            {' '}
            · Player of the match: <b>{best.name}</b> ({best.rating.toFixed(1)})
          </>
        ) : null}
      </p>

      <div className="ft-grid">
        <div className="ft-card">
          <p className="mt-kicker">Team stats</p>
          {rows.map((row) => {
            const h = row.pick(result.stats.home);
            const a = row.pick(result.stats.away);
            const digits = row.digits ?? 0;
            const total = h + a;
            return (
              <div className="ht-stat" key={row.label}>
                <strong>
                  {h.toFixed(digits)}
                  {row.suffix}
                </strong>
                <span>
                  {row.label}
                  <i aria-hidden="true">
                    <b style={{ width: `${total ? (h / total) * 100 : 50}%` }} />
                  </i>
                </span>
                <strong>
                  {a.toFixed(digits)}
                  {row.suffix}
                </strong>
              </div>
            );
          })}
        </div>
        <Ratings
          team={home}
          label={sides.homeLabel}
          ratings={result.playerRatings}
          potm={best?.playerId}
        />
        <Ratings
          team={away}
          label={sides.awayLabel}
          ratings={result.playerRatings}
          potm={best?.playerId}
        />
      </div>

      {actions !== undefined ? (
        actions
      ) : (
        <div className="ht-actions ft-actions">
          <button
            type="button"
            className="button button-primary button-default"
            onClick={onPlayAgain}
          >
            Play again <span aria-hidden="true">→</span>
          </button>
          <button
            type="button"
            className="button button-secondary button-default"
            onClick={onChangeTeam}
          >
            Change team
          </button>
          <a className="button button-secondary button-default" href="/play">
            Back to prediction
          </a>
        </div>
      )}
      <p className="mt-seed">Match seed {seed}</p>
    </section>
  );
}
