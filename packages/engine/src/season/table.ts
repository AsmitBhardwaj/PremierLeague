export interface TableRow {
  clubId: string;
  played: number;
  won: number;
  drawn: number;
  lost: number;
  goalsFor: number;
  goalsAgainst: number;
  goalDifference: number;
  points: number;
}

export const emptyRow = (clubId: string): TableRow => ({
  clubId,
  played: 0,
  won: 0,
  drawn: 0,
  lost: 0,
  goalsFor: 0,
  goalsAgainst: 0,
  goalDifference: 0,
  points: 0,
});

export function addResult(row: TableRow, scored: number, conceded: number): void {
  row.played++;
  row.goalsFor += scored;
  row.goalsAgainst += conceded;
  row.goalDifference = row.goalsFor - row.goalsAgainst;
  if (scored > conceded) {
    row.won++;
    row.points += 3;
  } else if (scored === conceded) {
    row.drawn++;
    row.points += 1;
  } else row.lost++;
}

/** Points, then goal difference, then goals for, then a deterministic club id order. */
export const compareRows = (a: TableRow, b: TableRow): number =>
  b.points - a.points ||
  b.goalDifference - a.goalDifference ||
  b.goalsFor - a.goalsFor ||
  a.clubId.localeCompare(b.clubId);

export const sortTable = (rows: readonly TableRow[]): TableRow[] => [...rows].sort(compareRows);
