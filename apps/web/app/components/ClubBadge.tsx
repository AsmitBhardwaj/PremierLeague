/** Neutral club badge: ink square, cream three-letter code. Never club colours or crests. */
export function ClubBadge({ code, small = false }: { code: string; small?: boolean }) {
  return (
    <span className={`club-badge${small ? ' club-badge-small' : ''}`} aria-hidden="true">
      {code}
    </span>
  );
}

/** Row modifier class: 6px left-edge stripe in the position colour (text label must accompany it). */
export const positionEdge = (position: string) => `pos-edge pos-edge-${position.toLowerCase()}`;
