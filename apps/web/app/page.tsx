import { HeroMatch } from './components/HeroMatch';
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
/** The opponent in the checked-in sample match (see scripts/src/generate-landing-match.ts). */
const landingAwayName = 'Brighton';
/** Presentation only: the sample club's primary colour in the match preview. */
const SAMPLE_CLUB_COLOUR = '#FF6B2C';
const likelyPosition = samplePrediction.positionDistribution.reduce((best, row) =>
  row.probability > best.probability ? row : best,
).position;
const pointsPeak = Math.max(...samplePrediction.pointsDistribution.map((bin) => bin.probability));
const modalPointsBin = samplePrediction.pointsDistribution.reduce((best, bin) =>
  bin.probability > best.probability ? bin : best,
).min;

const money = (units: number): string => `£${(units / 10).toFixed(1)}m`;
const pct = (value: number): string => `${Math.round(value * 100)}%`;
const ordinal = (position: number): string => {
  const mod100 = position % 100;
  if (mod100 >= 11 && mod100 <= 13) return `${position}th`;
  return `${position}${position % 10 === 1 ? 'st' : position % 10 === 2 ? 'nd' : position % 10 === 3 ? 'rd' : 'th'}`;
};

const numberWords = ['zero', 'one', 'two', 'three', 'four', 'five', 'six'];
const maxPerClubWord = numberWords[MAX_PER_REAL_CLUB] ?? String(MAX_PER_REAL_CLUB);

const headlines = [
  'Transfer window open',
  `${money(SQUAD_BUDGET)} to spend`,
  `${playerData.length} real players available`,
  `Max ${maxPerClubWord} from any club`,
  `${SQUAD_SIZE} squad spots to fill`,
];

const careerSteps = [
  {
    title: 'Found your club',
    text: 'Pick a name, colours and a crest.',
    accent: 'gk',
  },
  {
    title: 'Sign your squad',
    text: `Real players, real prices, ${money(SQUAD_BUDGET)} to spend.`,
    accent: 'def',
  },
  {
    title: 'See your season',
    text: "An instant prediction of where you'll finish.",
    accent: 'mid',
  },
  {
    title: 'Play every match',
    text: 'Watch 20-second matches and make half-time changes.',
    accent: 'fwd',
  },
] as const;

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

function ForecastHistogram() {
  return (
    <div className="forecast-histogram">
      <div className="forecast-bars" aria-label="How the points of a season could land">
        {samplePrediction.pointsDistribution.map((bin) => (
          <span
            className={bin.min === modalPointsBin ? 'modal' : ''}
            key={bin.min}
            style={{ height: `${Math.max(5, (bin.probability / pointsPeak) * 100)}%` }}
            title={`${bin.min}–${bin.max} points: ${pct(bin.probability)}`}
          />
        ))}
      </div>
    </div>
  );
}

function NewsTicker() {
  return (
    <section className="news-ticker" aria-label="Transfer window headlines">
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

// Percent coordinates for a 4-3-3: the line bows slightly the way a broadcast graphic draws it.
const formationDots = [
  { position: 'FWD', x: 19, y: 25 },
  { position: 'FWD', x: 50, y: 19 },
  { position: 'FWD', x: 81, y: 25 },
  { position: 'MID', x: 27, y: 50 },
  { position: 'MID', x: 51, y: 55 },
  { position: 'MID', x: 74, y: 50 },
  { position: 'DEF', x: 15, y: 72 },
  { position: 'DEF', x: 39, y: 76 },
  { position: 'DEF', x: 63, y: 76 },
  { position: 'DEF', x: 86, y: 72 },
  { position: 'GK', x: 50, y: 91 },
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
        {formationDots.map((dot, index) => (
          <span
            className={`position-dot position-${dot.position.toLowerCase()}`}
            key={index}
            style={{ left: `${dot.x}%`, top: `${dot.y}%` }}
          />
        ))}
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
            <span>{sampleClub.name} · Avg points</span>
            <strong>{samplePrediction.meanPoints.toFixed(1)}</strong>
          </div>
          <b>Most likely finish: {ordinal(likelyPosition)}</b>
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
        <p className="chart-label">How your points could land</p>
        <ForecastHistogram />
      </div>
    </div>
  );
}

const matchdayFeatures = [
  { title: 'Pick your XI', text: 'Choose a formation and swap players into your best eleven.' },
  {
    title: 'Set tactics',
    text: 'Balanced, high press, counter or defensive, each with a real trade-off.',
  },
  { title: '20-second matches', text: 'Highlights, text commentary or an instant result.' },
  {
    title: 'Half-time changes',
    text: 'Make substitutions and switch tactic before the second half.',
  },
] as const;

function MatchdayFeatures() {
  return (
    <div className="matchday-board">
      <ol className="matchday-features">
        {matchdayFeatures.map((feature, index) => (
          <li key={feature.title}>
            <span>{String(index + 1).padStart(2, '0')}</span>
            <h3>{feature.title}</h3>
            <p>{feature.text}</p>
          </li>
        ))}
      </ol>
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
            <a href="#how-it-works">How it works</a>
            <a href="#transfer-desk">Transfer desk</a>
            <a href="#analysis">Your season</a>
            <a href="#highlights">Highlights</a>
          </nav>
          <a className="button button-primary button-small" href="/play">
            Start your career
          </a>
        </header>
        <div className="hero-content page-shell">
          <div className="hero-copy">
            <div className="live-line">
              <span className="live-badge">
                <i /> Live
              </span>
              <span>New season · Transfer window open</span>
            </div>
            <h1>
              Start a club.
              <span>Take on the Premier League.</span>
            </h1>
            <p className="hero-lead">
              A football career mode you play in your browser. Found your club, sign real players on
              a {money(SQUAD_BUDGET)} budget, and see how far they can take you.
            </p>
            <ul className="hero-badges" aria-label="Highlights">
              <li>Free</li>
              <li>No download</li>
              <li>Plays on your phone</li>
            </ul>
          </div>
          <HeroMatch
            homeName={sampleClub.name}
            awayName={landingAwayName}
            clubColour={SAMPLE_CLUB_COLOUR}
          />
        </div>
        <div className="hero-lower-third page-shell">
          <div>
            <span>Your career starts today</span>
            <p>Name your club, sign {SQUAD_SIZE} players, and see where you&apos;ll finish.</p>
          </div>
          <a className="button button-primary button-hero" href="/play">
            Start your career <Arrow />
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

      <section className="steps-section" id="how-it-works">
        <div className="page-shell">
          <span className="segment-tag steps-tag">How it works</span>
          <h2>How your career works</h2>
          <ol className="steps-grid">
            {careerSteps.map((step, index) => (
              <li className={`step-card step-${step.accent}`} key={step.title}>
                <span className="step-number">{String(index + 1).padStart(2, '0')}</span>
                <h3>{step.title}</h3>
                <p>{step.text}</p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      <section className="transfer-section" id="transfer-desk">
        <div className="page-shell">
          <span className="segment-tag transfer-tag">Transfer deadline desk</span>
          <div className="section-heading-row">
            <h2>
              {SQUAD_SIZE} spots. {money(SQUAD_BUDGET)}. Choose wisely.
            </h2>
            <p>
              Pick from {playerData.length} real players. Stay on budget, and take no more than{' '}
              {maxPerClubWord} from any one club.
            </p>
          </div>
          <div className="transfer-panel">
            <div className="transfer-budget">
              <span>Your transfer budget</span>
              <div>
                <strong>{money(SQUAD_BUDGET)}</strong>
                <p>Spend it on real players at their current prices.</p>
                <i className="budget-bar" aria-hidden="true" />
              </div>
            </div>
            <div className="registration-panel">
              <div className="registration-heading">
                <span>Your squad</span>
                <span>{SQUAD_SIZE} spots</span>
              </div>
              {POSITION_ORDER.map((position) => (
                <div className="registration-row" key={position}>
                  <span className={`position-badge position-${position.toLowerCase()}`}>
                    {position}
                  </span>
                  <div aria-label={`${POSITION_QUOTAS[position]} ${position} places`}>
                    {Array.from({ length: POSITION_QUOTAS[position] }, (_, index) => (
                      <i
                        className={index === 0 ? `slot-${position.toLowerCase()}` : undefined}
                        key={index}
                      />
                    ))}
                  </div>
                  <strong>{POSITION_QUOTAS[position]}</strong>
                </div>
              ))}
              <div className="registration-rule">
                <b>{String(MAX_PER_REAL_CLUB).padStart(2, '0')}</b>
                <div>
                  <strong>Max {maxPerClubWord} per real club</strong>
                  <span>No club can supply more than {maxPerClubWord} players to your squad.</span>
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
          <span className="segment-tag analysis-tag">Your season</span>
          <h2>
            Your season,
            <span>predicted.</span>
          </h2>
          <p className="analysis-intro">
            Every match is played out team against team, so balance and shape decide your finish.
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
            <span className="segment-tag coming-tag">Highlights</span>
            <h2>Watch every match.</h2>
            <p>
              Pick your XI, set your tactics, and watch each match play out in 20 seconds. Make your
              changes at half-time, then see it through to full time.
            </p>
            <a className="button button-primary button-default" href="/play">
              Play your first match <Arrow />
            </a>
          </div>
          <MatchdayFeatures />
        </div>
      </section>

      <section className="landing-signoff grass-stripes">
        <div className="page-shell">
          <h2>
            Your club. Your career.
            <span>Your name on the trophy.</span>
          </h2>
          <a className="button button-primary button-hero" href="/play">
            Start your career <Arrow />
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
