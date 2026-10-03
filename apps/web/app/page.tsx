import sampleData from './data/landing-sample.json';
import playerData from './play/data/players.json';
import {
  MAX_PER_REAL_CLUB,
  POSITION_ORDER,
  POSITION_QUOTAS,
  SQUAD_BUDGET,
  SQUAD_SIZE,
} from './play/lib/squad';

export const dynamic = 'force-static';

const { club: sampleClub, prediction: samplePrediction } = sampleData;
const likelyPosition = samplePrediction.positionDistribution.reduce((best, row) =>
  row.probability > best.probability ? row : best,
).position;
const pointsPeak = Math.max(...samplePrediction.pointsDistribution.map((bin) => bin.probability));
const modalPointsBin = samplePrediction.pointsDistribution.reduce((best, bin) =>
  bin.probability > best.probability ? bin : best,
).min;
const sampleOpponents = [...samplePrediction.perOpponentExpectedPoints]
  .sort((a, b) => b.total - a.total)
  .slice(0, 5);

const money = (units: number): string => `£${(units / 10).toFixed(1)}m`;
const pct = (value: number): string => `${Math.round(value * 100)}%`;
const ordinal = (position: number): string => {
  const mod100 = position % 100;
  if (mod100 >= 11 && mod100 <= 13) return `${position}th`;
  return `${position}${position % 10 === 1 ? 'st' : position % 10 === 2 ? 'nd' : position % 10 === 3 ? 'rd' : 'th'}`;
};

const headlines = [
  `${money(SQUAD_BUDGET)} budget confirmed`,
  `${playerData.length} players on the market`,
  `Max ${MAX_PER_REAL_CLUB} per real club`,
  `${samplePrediction.seasons.toLocaleString()} seasons simulated per prediction`,
  `${SQUAD_SIZE} places to fill before opening day`,
];

function BrandMark() {
  return (
    <a className="brand-mark" href="#top" aria-label="21st Club home">
      <span className="brand-tile">21</span>
      <span>21ST CLUB</span>
    </a>
  );
}

function Arrow() {
  return <span aria-hidden="true">→</span>;
}

function ForecastHistogram({ compact = false }: { compact?: boolean }) {
  return (
    <div className={`forecast-histogram ${compact ? 'compact' : ''}`}>
      <div className="forecast-bars" aria-label="Points across 10,000 simulated seasons">
        {samplePrediction.pointsDistribution.map((bin) => (
          <span
            className={bin.min === modalPointsBin ? 'modal' : ''}
            key={bin.min}
            style={{ height: `${Math.max(5, (bin.probability / pointsPeak) * 100)}%` }}
            title={`${bin.min}–${bin.max} points: ${pct(bin.probability)}`}
          />
        ))}
      </div>
      {compact ? (
        <div className="forecast-axis">
          <span>Fewer points</span>
          <span>Points distribution</span>
          <span>More points</span>
        </div>
      ) : null}
    </div>
  );
}

function StudioScreen() {
  return (
    <div className="studio-screen">
      <div className="studio-screen-bar">
        <span>Season preview</span>
        <span>Sample club</span>
      </div>
      <div className="studio-screen-body">
        <div className="studio-club-line">
          <div>
            <h2>{sampleClub.name}</h2>
            <p>
              {sampleClub.formation} · {samplePrediction.seasons.toLocaleString()} simulated seasons
            </p>
          </div>
          <div className="studio-points">
            <strong>{samplePrediction.meanPoints.toFixed(1)}</strong>
            <span>Avg points</span>
          </div>
        </div>
        <div className="studio-chips">
          <div className="finish-chip">
            <span>Finish</span>
            <strong>{ordinal(likelyPosition)}</strong>
          </div>
          <div>
            <span>Title</span>
            <strong>{pct(samplePrediction.titleProbability)}</strong>
          </div>
          <div className="top-four-chip">
            <span>Top 4</span>
            <strong>{pct(samplePrediction.top4Probability)}</strong>
          </div>
          <div>
            <span>Releg.</span>
            <strong>{pct(samplePrediction.relegationProbability)}</strong>
          </div>
        </div>
        <ForecastHistogram compact />
      </div>
    </div>
  );
}

function NewsTicker() {
  return (
    <section className="news-ticker" aria-label="Club news headlines">
      <span className="ticker-label">Club news</span>
      <div className="ticker-window">
        <div className="ticker-track">
          {[0, 1].map((copy) => (
            <div className="ticker-run" key={copy} aria-hidden={copy === 1}>
              {headlines.map((headline) => (
                <span className="ticker-headline" key={`${copy}-${headline}`}>
                  <i aria-hidden="true" />
                  {headline}
                </span>
              ))}
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

const formationRows = [
  { position: 'FWD', count: 3, y: 19 },
  { position: 'MID', count: 3, y: 49 },
  { position: 'DEF', count: 4, y: 74 },
  { position: 'GK', count: 1, y: 91 },
] as const;

function TacticalBoard() {
  return (
    <div className="tactical-panel">
      <div className="tactical-header">
        <span>Tactical board</span>
        <strong>{sampleClub.formation}</strong>
      </div>
      <div className="tactical-pitch" role="img" aria-label="Northstar FC 4-3-3 tactical shape">
        <span className="pitch-halfway" />
        <span className="pitch-centre-circle" />
        <span className="pitch-penalty top" />
        <span className="pitch-penalty bottom" />
        {formationRows.flatMap((row) =>
          Array.from({ length: row.count }, (_, index) => (
            <span
              className={`position-dot position-${row.position.toLowerCase()}`}
              key={`${row.position}-${index}`}
              style={{
                left: `${((index + 1) * 100) / (row.count + 1)}%`,
                top: `${row.y}%`,
              }}
            />
          )),
        )}
      </div>
      <div className="position-legend">
        {POSITION_ORDER.map((position) => (
          <span key={position}>
            <i className={`position-${position.toLowerCase()}`} /> {position}
          </span>
        ))}
      </div>
    </div>
  );
}

function AnalysisForecast() {
  return (
    <div className="analysis-cards">
      <div className="analysis-forecast-card">
        <div className="analysis-points-line">
          <div>
            <span>{sampleClub.name} · Average points</span>
            <strong>{samplePrediction.meanPoints.toFixed(1)}</strong>
          </div>
          <b>Most likely: {ordinal(likelyPosition)}</b>
        </div>
        <div className="analysis-stat-row">
          <div>
            <span>Title</span>
            <strong>{pct(samplePrediction.titleProbability)}</strong>
          </div>
          <div>
            <span>Top four</span>
            <strong>{pct(samplePrediction.top4Probability)}</strong>
          </div>
          <div>
            <span>Relegation</span>
            <strong>{pct(samplePrediction.relegationProbability)}</strong>
          </div>
        </div>
        <p className="chart-label">
          Points across {samplePrediction.seasons.toLocaleString()} seasons
        </p>
        <ForecastHistogram />
      </div>
      <div className="fixtures-card">
        <div className="fixtures-title">
          <h3>Expected points by opponent</h3>
          <span>Best fixtures</span>
        </div>
        <div className="fixtures-scroll">
          <div
            className="fixtures-table"
            role="table"
            aria-label="Five best expected-points fixtures"
          >
            <div className="fixtures-row fixtures-head" role="row">
              <span>Opponent</span>
              <span>Home</span>
              <span>Away</span>
              <span>Total</span>
            </div>
            {sampleOpponents.map((opponent) => (
              <div className="fixtures-row" role="row" key={opponent.opponentId}>
                <strong>{opponent.opponentName}</strong>
                <span>{opponent.home.toFixed(2)}</span>
                <span>{opponent.away.toFixed(2)}</span>
                <strong>{opponent.total.toFixed(2)}</strong>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

// Deliberately static: this reserves the match-viewer space until that experience is available.
function MatchHighlightsPlaceholder() {
  return (
    <div className="match-tv" aria-label="Match highlights preview">
      <div className="match-tv-pitch">
        <span className="tv-halfway" />
        <span className="tv-circle" />
        <span className="tv-box left" />
        <span className="tv-box right" />
        <div className="score-bug">
          <strong>Your club</strong>
          <span>KO</span>
          <strong>Opponent</strong>
        </div>
        <div className="tv-caption">Match highlights arrive soon</div>
      </div>
    </div>
  );
}

export default function Home() {
  return (
    <main className="landing-page" id="top">
      <section className="landing-hero grass-stripes">
        <div className="hero-pitch-lines" aria-hidden="true">
          <span className="hero-halfway" />
          <span className="hero-circle" />
        </div>
        <header className="landing-nav page-shell">
          <BrandMark />
          <nav aria-label="Main navigation">
            <a href="#transfer-desk">Transfer desk</a>
            <a href="#analysis">The analysis</a>
            <a href="#highlights">Highlights</a>
          </nav>
          <a className="button button-primary button-small" href="/play">
            Build your club
          </a>
        </header>
        <div className="hero-content page-shell">
          <div className="hero-copy">
            <div className="live-line">
              <span className="live-badge">
                <i /> Live
              </span>
              <span>Matchday 1 · Season preview</span>
            </div>
            <h1>
              A new club.
              <span>A place in the league.</span>
            </h1>
            <p className="hero-lead">
              FPL is your weekly fantasy team. This is where you find out if you could actually run
              a club.
            </p>
            <p className="hero-support">
              Sign real Premier League players on a {money(SQUAD_BUDGET)} budget and see where
              you&apos;d finish.
            </p>
          </div>
          <StudioScreen />
        </div>
        <div className="hero-lower-third page-shell">
          <div>
            <span>This is your club&apos;s first day</span>
            <p>Name it, sign {SQUAD_SIZE} players, get your forecast in minutes.</p>
          </div>
          <a className="button button-primary button-hero" href="/play">
            Build your club <Arrow />
          </a>
        </div>
      </section>

      <div className="breaking-strip">
        <div className="page-shell">
          <span className="breaking-tag">Breaking</span>
          <strong>New club confirmed for the Premier League</strong>
          <span>20 clubs · 38 matches</span>
        </div>
      </div>

      <NewsTicker />

      <section className="transfer-section" id="transfer-desk">
        <div className="page-shell">
          <span className="segment-tag transfer-tag">Transfer deadline desk</span>
          <div className="section-heading-row">
            <h2>There are {SQUAD_SIZE} places to get right.</h2>
            <p>
              A fixed budget and a strict registration list. Every signing has to fit before the
              window shuts.
            </p>
          </div>
          <div className="transfer-panel">
            <div className="transfer-budget">
              <span>Transfer budget</span>
              <div>
                <strong>{money(SQUAD_BUDGET)}</strong>
                <p>Spend it on real Premier League players at their current market prices.</p>
              </div>
            </div>
            <div className="registration-panel">
              <div className="registration-heading">
                <span>Squad registration</span>
                <span>{SQUAD_SIZE} players</span>
              </div>
              {POSITION_ORDER.map((position) => (
                <div className="registration-row" key={position}>
                  <span className={`position-badge position-${position.toLowerCase()}`}>
                    {position}
                  </span>
                  <div aria-label={`${POSITION_QUOTAS[position]} ${position} places`}>
                    {Array.from({ length: POSITION_QUOTAS[position] }, (_, index) => (
                      <i className={`slot-${position.toLowerCase()}`} key={index} />
                    ))}
                  </div>
                  <strong>{POSITION_QUOTAS[position]}</strong>
                </div>
              ))}
              <div className="registration-rule">
                <b>{String(MAX_PER_REAL_CLUB).padStart(2, '0')}</b>
                <div>
                  <strong>Max three per real club</strong>
                  <span>No club can supply more than three players to your squad.</span>
                </div>
                <a className="button transfer-button" href="/play">
                  Enter the market
                </a>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="landing-analysis" id="analysis">
        <div className="page-shell">
          <span className="segment-tag analysis-tag">The analysis</span>
          <h2>
            Shape matters.
            <span>Then the numbers.</span>
          </h2>
          <p className="analysis-intro">
            Every squad, yours included, plays full team-versus-team simulations against the other
            19 clubs. No summed player points.
          </p>
          <div className="analysis-layout">
            <TacticalBoard />
            <AnalysisForecast />
          </div>
        </div>
      </section>

      <section className="coming-section" id="highlights">
        <div className="page-shell coming-layout">
          <div>
            <span className="segment-tag coming-tag">Coming up</span>
            <h2>Watch every match.</h2>
            <p>
              Pick your XI, set your tactics, and watch each match play out in 20 seconds. Make your
              changes at half-time.
            </p>
            <span className="coming-soon">Coming soon</span>
          </div>
          <MatchHighlightsPlaceholder />
        </div>
      </section>

      <section className="landing-signoff grass-stripes">
        <div className="page-shell">
          <p>The story starts with you</p>
          <h2>
            One place.
            <span>Your name on it.</span>
          </h2>
          <p>Build the club that takes the promoted place. See the forecast. Make your move.</p>
          <a className="button button-primary button-hero" href="/play">
            Build your club <Arrow />
          </a>
        </div>
      </section>

      <footer className="landing-footer">
        <div className="page-shell">
          <BrandMark />
          <p>Not affiliated with the Premier League or any club.</p>
        </div>
      </footer>
    </main>
  );
}
