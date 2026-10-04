import type { ReactNode } from 'react';
import { userDotColour } from './lib/colours';
import type { ViewerSides } from './MatchViewer';
import './scorebug.css';

/**
 * The ink scoreboard bar for half-time and full-time: a volt tag, the home club (the user's club
 * carries its colour marker), the score in cream boxes, the away club, and a one-line subtitle.
 * `homeNote` and `awayNote` sit under each club (goalscorers at full-time).
 */
export function ScoreBug({
  tag,
  subtitle,
  sides,
  score,
  homeNote,
  awayNote,
  titleId,
}: {
  tag: string;
  subtitle: string;
  sides: ViewerSides;
  score: { home: number; away: number };
  homeNote?: ReactNode;
  awayNote?: ReactNode;
  titleId: string;
}) {
  const marker = (side: 'home' | 'away') =>
    side === sides.userSide ? { background: userDotColour(sides.userColour) } : undefined;
  const club = (side: 'home' | 'away', note: ReactNode) => (
    <div className={`sb-club sb-${side}${side === sides.userSide ? ' user' : ''}`}>
      <p className="sb-name">
        {side === 'home' ? <i aria-hidden="true" style={marker(side)} /> : null}
        <span className="sb-long">{sides[side].name}</span>
        <span className="sb-short">{side === 'home' ? sides.homeLabel : sides.awayLabel}</span>
        {side === 'away' ? <i aria-hidden="true" style={marker(side)} /> : null}
      </p>
      {note ? <div className="sb-note">{note}</div> : null}
    </div>
  );
  return (
    <section className="sb" aria-labelledby={titleId}>
      <h1 id={titleId} className="sb-tag">
        {tag}
      </h1>
      <p className="sb-sub">{subtitle}</p>
      <div className="sb-main">
        {club('home', homeNote)}
        <p className="sb-score" aria-label={`Score ${score.home} ${score.away}`}>
          <b>{score.home}</b>
          <b>{score.away}</b>
        </p>
        {club('away', awayNote)}
      </div>
    </section>
  );
}
