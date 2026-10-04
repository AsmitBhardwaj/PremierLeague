import { USER_CLUB_ID } from './lib/setup';
import { movement } from './lib/format';
import type { TableEntry } from './lib/protocol';

/** The full 20-club table with the user's row highlighted and movement since last matchday. */
export function LeagueTable({
  table,
  names,
  caption = 'League table',
}: {
  table: readonly TableEntry[];
  names: ReadonlyMap<string, string>;
  caption?: string;
}) {
  return (
    <div className="se-table-wrap">
      <table className="se-table">
        <caption>{caption}</caption>
        <thead>
          <tr>
            <th scope="col">Pos</th>
            <th scope="col">
              <span className="sr-only">Movement</span>
            </th>
            <th scope="col" className="se-club">
              Club
            </th>
            <th scope="col">P</th>
            <th scope="col">W</th>
            <th scope="col">D</th>
            <th scope="col">L</th>
            <th scope="col" className="se-hide-small">
              GF
            </th>
            <th scope="col" className="se-hide-small">
              GA
            </th>
            <th scope="col">GD</th>
            <th scope="col">Pts</th>
          </tr>
        </thead>
        <tbody>
          {table.map((row, index) => {
            const position = index + 1;
            const moved = movement(row, position);
            return (
              <tr
                key={row.clubId}
                className={[
                  row.clubId === USER_CLUB_ID ? 'se-user' : '',
                  position === 4 ? 'se-line-top4' : '',
                  position === 17 ? 'se-line-drop' : '',
                ].join(' ')}
                aria-current={row.clubId === USER_CLUB_ID ? 'true' : undefined}
              >
                <th scope="row">{position}</th>
                <td
                  className={`se-move ${moved > 0 ? 'up' : moved < 0 ? 'down' : ''}`}
                  aria-label={
                    moved > 0 ? `Up ${moved}` : moved < 0 ? `Down ${-moved}` : 'No change'
                  }
                >
                  {moved > 0 ? '▲' : moved < 0 ? '▼' : '–'}
                </td>
                <td className="se-club">{names.get(row.clubId) ?? row.clubId}</td>
                <td>{row.played}</td>
                <td>{row.won}</td>
                <td>{row.drawn}</td>
                <td>{row.lost}</td>
                <td className="se-hide-small">{row.goalsFor}</td>
                <td className="se-hide-small">{row.goalsAgainst}</td>
                <td>{row.goalDifference > 0 ? `+${row.goalDifference}` : row.goalDifference}</td>
                <td>
                  <strong>{row.points}</strong>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
