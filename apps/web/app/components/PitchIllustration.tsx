const home = [
  [10, 50],
  [28, 18],
  [28, 39],
  [28, 61],
  [28, 82],
  [49, 25],
  [49, 50],
  [49, 75],
  [71, 20],
  [74, 50],
  [71, 80],
];
const away = [
  [90, 50],
  [80, 23],
  [80, 42],
  [80, 61],
  [80, 79],
  [62, 28],
  [62, 52],
  [62, 75],
  [43, 18],
  [40, 50],
  [43, 82],
];

export function PitchIllustration() {
  return (
    <div className="pitch-frame">
      <div className="scoreboard">
        <span>NOR</span>
        <strong>2–1</strong>
        <span>ARS</span>
        <time>76:24</time>
      </div>
      <svg
        className="pitch"
        viewBox="0 0 100 100"
        role="img"
        aria-label="A top-down football match in progress"
      >
        <rect x="1" y="1" width="98" height="98" rx="1" />
        <path d="M50 1v98M1 50h98" />
        <circle cx="50" cy="50" r="10" />
        <circle cx="50" cy="50" r="0.8" className="pitch-fill" />
        <path d="M35 1v15H65V1M35 99V84H65V99" />
        <path d="M42 1v6H58V1M42 99V93H58V99" />
        {home.map(([x, y], index) => (
          <circle key={`home-${index}`} cx={x} cy={y} r="1.7" className="home-player" />
        ))}
        {away.map(([x, y], index) => (
          <circle key={`away-${index}`} cx={x} cy={y} r="1.7" className="away-player" />
        ))}
        <circle cx="55" cy="39" r="0.9" className="ball" />
        <path d="M54 40l-8 9" className="ball-path" />
      </svg>
      <div className="match-event">
        <span>76&apos;</span>
        <div>
          <strong>Chance created</strong>
          <p>Northstar break through the middle.</p>
        </div>
      </div>
    </div>
  );
}
