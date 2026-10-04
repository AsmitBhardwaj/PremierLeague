'use client';

import type { MatchResult, Player, PlayerMatchRating, Side, Team, TeamStats } from '@pl/engine';
import type { ReactNode } from 'react';
import { ClubBadge } from '../components/ClubBadge';
import { INK, userDotColour } from './lib/colours';
import {
  contributionLine,
  goalScorers,
  playerOfTheMatch,
  playerTags,
  rankPlayers,
  redCardLines,
  statLeader,
} from './lib/fulltime';
import { ratingTone } from './lib/halftime';
import type { ViewerSides } from './MatchViewer';
import { ScoreBug } from './ScoreBug';
import './fulltime.css';

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

function StatSplit({
  label,
  home,
  away,
  digits = 0,
  suffix = '',
  homeColour,
}: {
  label: string;
  home: number;
  away: number;
  digits?: number;
  suffix?: string;
  homeColour: string;
}) {
  const leader = statLeader(home, away);
  const total = home + away;
  const share = total > 0 ? (home / total) * 100 : 50;
  return (
    <div className="fs-row">
      <strong className={leader === 'home' ? 'lead' : ''}>
        {home.toFixed(digits)}
        {suffix}
      </strong>
      <span>{label}</span>
      <strong className={leader === 'away' ? 'lead' : ''}>
        {away.toFixed(digits)}
        {suffix}
      </strong>
      <i aria-hidden="true">
        <b style={{ width: `${share}%`, background: homeColour }} />
      </i>
    </div>
  );
}

export function FullTime({
  result,
  sides,
  seed,
  matchdayLabel,
  venueLabel,
  children,
  actions,
}: {
  result: MatchResult;
  sides: ViewerSides;
  seed: number;
  /** "Matchday 12" in a season, "Friendly" otherwise. */
  matchdayLabel: string;
  /** The stadium the match was played at ("Away" when the user played on the road). */
  venueLabel: string;
  /** Season mode: the "What it means" panel, under the match. */
  children?: ReactNode;
  actions: ReactNode;
}) {
  const { home, away, userSide } = sides;
  const sideOf = (teamId: string): Side => (teamId === home.id ? 'home' : 'away');
  const codeOf = (teamId: string | null): string =>
    teamId === home.id ? sides.homeLabel : sides.awayLabel;
  const everyone = new Map<string, Player & { teamId: string }>(
    [home, away].flatMap((team: Team) =>
      [...team.players, ...(team.bench ?? [])].map(
        (p) => [p.id, { ...p, teamId: team.id }] as const,
      ),
    ),
  );
  const nameOf = (id: string): string => everyone.get(id)?.name ?? 'A player';

  const best = playerOfTheMatch(result.playerRatings);
  const bestPlayer = best ? everyone.get(best.playerId) : undefined;
  const bestSide = best ? sideOf(best.teamId) : null;
  const cleanSheet = bestSide ? result.score[bestSide === 'home' ? 'away' : 'home'] === 0 : false;
  const userTeam = userSide === 'home' ? home : away;
  const mine: PlayerMatchRating[] = rankPlayers(
    result.playerRatings.filter((item) => item.teamId === userTeam.id),
  );
  // The home segment is the home club's colour. When that is the ink fallback, or the home side
  // is the opponent (who has no colour), the grass green keeps it apart from the ink away side.
  const userColour = userDotColour(sides.userColour);
  const homeColour = userSide === 'home' && userColour !== INK ? userColour : 'var(--grass-dark)';

  const notes = (team: Team) => {
    const scorers = goalScorers(result.events, team.id, nameOf);
    const reds = redCardLines(result.events, team.id, nameOf);
    if (!scorers.length && !reds.length) return undefined;
    return (
      <ul>
        {scorers.map((goal, index) => (
          <li key={`g${index}`}>
            {goal.name} {goal.minute}
            {goal.pen ? ' (pen)' : ''}
            {goal.og ? ' (og)' : ''}
          </li>
        ))}
        {reds.map((card, index) => (
          <li key={`r${index}`} className="sb-red">
            {card.name} {card.minute} (red card)
          </li>
        ))}
      </ul>
    );
  };

  return (
    <section className="ft page-shell">
      <ScoreBug
        titleId="ft-title"
        tag="FULL-TIME"
        subtitle={`${matchdayLabel} · ${venueLabel}`}
        sides={sides}
        score={result.score}
        homeNote={notes(home)}
        awayNote={notes(away)}
      />

      {best && bestPlayer ? (
        <aside className="fs-potm" aria-label="Player of the match">
          <ClubBadge code={codeOf(best.teamId)} />
          <div className="fs-potm-text">
            <p>Player of the match</p>
            <h2>
              {best.name} <span>{bestPlayer.position}</span>
            </h2>
            <p className="fs-potm-line">
              {contributionLine(best, bestPlayer.position, cleanSheet)}
            </p>
          </div>
          <b className="fs-potm-rating" aria-label={`Rating ${best.rating.toFixed(1)}`}>
            {best.rating.toFixed(1)}
          </b>
        </aside>
      ) : null}

      <div className="fs-grid">
        <div className="fs-card fs-stats">
          <h2 className="fs-title">
            Match stats{' '}
            <span>
              {sides.homeLabel} – {sides.awayLabel}
            </span>
          </h2>
          {rows.map((row) => (
            <StatSplit
              key={row.label}
              label={row.label}
              home={row.pick(result.stats.home)}
              away={row.pick(result.stats.away)}
              digits={row.digits}
              suffix={row.suffix}
              homeColour={homeColour}
            />
          ))}
        </div>

        <div className="fs-card fs-ratings">
          <h2 className="fs-title">
            Your ratings <span>{codeOf(userTeam.id)}</span>
          </h2>
          <ol>
            {mine.map((item) => {
              const position = everyone.get(item.playerId)?.position ?? 'MID';
              const tags = playerTags(item, result.events);
              return (
                <li
                  key={item.playerId}
                  className={`fs-player fs-${position.toLowerCase()}${
                    item.playerId === best?.playerId ? ' potm' : ''
                  }`}
                >
                  <b className={`fs-chip tone-${ratingTone(item.rating)}`}>
                    {item.rating.toFixed(1)}
                  </b>
                  <span className="fs-pos">{position}</span>
                  <strong className="fs-name">{item.name}</strong>
                  <span className="fs-tags">
                    {tags.map((tag) => (
                      <em key={tag.label} className={`fs-tag fs-tag-${tag.kind}`}>
                        {tag.label}
                      </em>
                    ))}
                  </span>
                </li>
              );
            })}
          </ol>
        </div>
      </div>

      {children}

      <div className="fs-actions">{actions}</div>
      <p className="fs-seed">Match seed {seed}</p>
    </section>
  );
}
