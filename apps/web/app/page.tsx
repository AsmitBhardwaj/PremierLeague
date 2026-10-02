import { createSyntheticTeam, predictSeason } from '@pl/engine';
import { Button } from './components/Button';
import { Card } from './components/Card';
import { PitchIllustration } from './components/PitchIllustration';
import { SectionHeading } from './components/SectionHeading';
import { Stat } from './components/Stat';

export const dynamic = 'force-static';

const sampleSquad = createSyntheticTeam({
  id: 'sample-xi',
  name: 'Northstar FC',
  strength: 68,
  formation: '4-3-3',
  seed: 21,
});
const samplePrediction = predictSeason(sampleSquad, { seed: 21 });
const likelyPosition = samplePrediction.positionDistribution.reduce((best, row) =>
  row.probability > best.probability ? row : best,
).position;
const histogramPeak = Math.max(
  ...samplePrediction.pointsDistribution.map((bin) => bin.probability),
);

const pct = (value: number): string => `${Math.round(value * 100)}%`;
const ordinal = (position: number): string => {
  const mod100 = position % 100;
  if (mod100 >= 11 && mod100 <= 13) return `${position}th`;
  return `${position}${position % 10 === 1 ? 'st' : position % 10 === 2 ? 'nd' : position % 10 === 3 ? 'rd' : 'th'}`;
};

const steps = [
  {
    number: '01',
    title: 'Found your club',
    copy: 'Choose a name, identity and the promoted side your club will replace.',
  },
  {
    number: '02',
    title: 'Build your squad',
    copy: 'Spend your budget on real players. Balance the XI, the bench and every position.',
  },
  {
    number: '03',
    title: 'Play the season',
    copy: 'Get an instant forecast, then take control for every match of the 38-game season.',
  },
];

export default function Home() {
  return (
    <main>
      <header className="site-header page-shell">
        <a className="wordmark" href="#top" aria-label="21st Club home">
          21ST CLUB
        </a>
        <nav aria-label="Main navigation">
          <a href="#how-it-works">How it works</a>
          <a href="#matchday">Matchday</a>
          <a href="#league">The league</a>
        </nav>
        <Button href="/play" size="small">
          Build your club
        </Button>
      </header>

      <section className="hero section" id="top">
        <div className="page-shell split hero-grid">
          <div className="hero-copy">
            <p className="eyebrow">Your players. Your tactics. A real season.</p>
            <h1>
              Could your XI
              <br /> win the league?
            </h1>
            <p className="hero-lede">
              Found a club, recruit real Premier League players and see how your squad performs in a
              full 38-match campaign—then play every fixture yourself.
            </p>
            <div className="button-row">
              <Button href="/play">Build your club</Button>
              <Button href="#how-it-works" variant="secondary">
                See how it works
              </Button>
            </div>
            <p className="hero-note">Your club replaces a promoted side. The league stays at 20.</p>
          </div>

          <Card className="prediction-card" aria-label="Sample season prediction">
            <div className="prediction-header">
              <div>
                <p className="card-kicker">Sample prediction</p>
                <h2>Northstar FC</h2>
              </div>
              <span className="live-chip">10,000 seasons</span>
            </div>
            <div className="primary-prediction">
              <span className="label">Most likely finish</span>
              <strong>{ordinal(likelyPosition)}</strong>
              <span>{samplePrediction.meanPoints.toFixed(1)} mean points</span>
            </div>
            <div className="prediction-stats">
              <Stat label="Title" value={pct(samplePrediction.titleProbability)} />
              <Stat label="Top four" value={pct(samplePrediction.top4Probability)} />
              <Stat label="Relegation" value={pct(samplePrediction.relegationProbability)} />
            </div>
            <div className="histogram" aria-label="Predicted points distribution">
              {samplePrediction.pointsDistribution.map((bin) => (
                <span
                  key={bin.min}
                  style={{ height: `${Math.max(8, (bin.probability / histogramPeak) * 100)}%` }}
                  title={`${bin.min}–${bin.max} points: ${pct(bin.probability)}`}
                />
              ))}
            </div>
            <div className="chart-labels">
              <span>Fewer points</span>
              <span>More points</span>
            </div>
            <p className="model-note">Calculated by the match engine, not player-point totals.</p>
          </Card>
        </div>
      </section>

      <section className="section" id="how-it-works">
        <div className="page-shell">
          <SectionHeading
            eyebrow="Three steps to kick-off"
            title="Build it. Test it. Take control."
            copy="No weekly spreadsheet and no waiting until May. Your club has a forecast in seconds and a season ready to play."
          />
          <div className="steps-grid">
            {steps.map((step) => (
              <article className="step" key={step.number}>
                <span>{step.number}</span>
                <h3>{step.title}</h3>
                <p>{step.copy}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="section" id="matchday">
        <div className="page-shell split feature-grid">
          <div>
            <SectionHeading
              eyebrow="Watch every match"
              title="Ninety minutes. Twenty seconds. Every decision matters."
              copy="See attacks unfold on a live 2D pitch. Change shape at half-time, make substitutions or skip straight to the result. The animation replays the match—it never invents it."
            />
            <ul className="feature-list">
              <li>Highlights, live text or instant result</li>
              <li>Four tactics with real trade-offs</li>
              <li>Player ratings, match stats and commentary</li>
            </ul>
            <Button href="/play" variant="secondary">
              See matchday
            </Button>
          </div>
          <PitchIllustration />
        </div>
      </section>

      <section className="section" id="league">
        <div className="page-shell split league-grid">
          <div>
            <SectionHeading
              eyebrow="A proper competition"
              title="A real league table, not fantasy points."
              copy="Your balanced squad plays team against team. Wins, draws and losses move you through the same 20-club, 38-match format as everyone else."
            />
            <Button href="/play" variant="secondary">
              Enter the league
            </Button>
          </div>
          <Card className="table-card">
            <div className="table-head table-row">
              <span>Pos</span>
              <span>Club</span>
              <span>W</span>
              <span>D</span>
              <span>L</span>
              <span>Pts</span>
            </div>
            {[
              ['1', 'Man City', '24', '8', '6', '80'],
              ['2', 'Liverpool', '22', '9', '7', '75'],
              ['3', 'Arsenal', '19', '10', '9', '67'],
              [
                '4',
                'Northstar FC',
                '18',
                '9',
                '11',
                String(Math.round(samplePrediction.meanPoints)),
              ],
            ].map((row) => (
              <div
                className={`table-row ${row[1] === 'Northstar FC' ? 'your-club' : ''}`}
                key={row[1]}
              >
                {row.map((cell, index) => (
                  <span key={`${row[1]}-${index}`}>{cell}</span>
                ))}
              </div>
            ))}
            <p className="table-caption">Illustrative final table · your club highlighted</p>
          </Card>
        </div>
      </section>

      <section className="section final-cta">
        <div className="page-shell cta-inner">
          <p className="eyebrow">The promoted place is waiting</p>
          <h2>Think you can build a club that stays up?</h2>
          <p>Pick the players. Set the tactics. Find out across 10,000 simulated seasons.</p>
          <Button href="/play">Start building</Button>
        </div>
      </section>

      <footer className="site-footer">
        <div className="page-shell footer-inner">
          <span className="wordmark">21ST CLUB</span>
          <p>Not affiliated with the Premier League or any club.</p>
          <span>Built for the people who would do it differently.</span>
        </div>
      </footer>
    </main>
  );
}
