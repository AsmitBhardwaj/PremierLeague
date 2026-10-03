import { createSyntheticTeam, predictSeason } from '@pl/engine';
import { Button } from './components/Button';
import { Card } from './components/Card';
import { Stat } from './components/Stat';
import playerData from './play/data/players.json';
import {
  FORMATIONS,
  MAX_PER_REAL_CLUB,
  POSITION_ORDER,
  POSITION_QUOTAS,
  SQUAD_BUDGET,
  SQUAD_SIZE,
} from './play/lib/squad';

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
const pointsPeak = Math.max(...samplePrediction.pointsDistribution.map((bin) => bin.probability));
const pointsMax = Math.max(...samplePrediction.pointsDistribution.map((bin) => bin.max));
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
  `${MAX_PER_REAL_CLUB} per real club rule in force`,
  `${samplePrediction.seasons.toLocaleString()} seasons simulated per prediction`,
  `${SQUAD_SIZE} places to fill before opening day`,
];

function ChannelMark() {
  return (
    <a className="broadcast-mark" href="#top" aria-label="The Final Third home">
      <span className="channel-bars" aria-hidden="true">
        <i />
        <i />
        <i />
      </span>
      <span className="channel-name">THE FINAL THIRD</span>
    </a>
  );
}

function NewsTicker() {
  return (
    <section className="news-ticker" aria-label="Club builder headlines">
      <span className="ticker-label">CLUB NEWS</span>
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

function StudioPitch({ formation }: { formation: string }) {
  const shape = FORMATIONS[formation as keyof typeof FORMATIONS];
  const line = (count: number, y: number) =>
    Array.from({ length: count }, (_, index) => [((index + 1) * 100) / (count + 1), y]);
  const dots = [[[50, 91]], line(shape.DEF, 68), line(shape.MID, 43), line(shape.FWD, 17)].flat();

  return (
    <div className="analysis-pitch-wrap">
      <div className="analysis-pitch" role="img" aria-label={`Tactical formation ${formation}`}>
        <span className="pitch-box pitch-box-top" />
        <span className="pitch-box pitch-box-bottom" />
        <span className="pitch-circle" />
        {dots.map(([x, y], index) => (
          <span className="tactic-dot" key={index} style={{ left: `${x}%`, top: `${y}%` }} />
        ))}
      </div>
      <div className="formation-caption">
        <span>TACTICAL SHAPE</span>
        <strong>{formation}</strong>
      </div>
    </div>
  );
}

function DistributionGraphic() {
  return (
    <div className="analysis-distribution" aria-label="Engine forecast points distribution">
      <div className="analysis-bars">
        {samplePrediction.pointsDistribution.map((bin) => (
          <span
            key={bin.min}
            style={{ height: `${Math.max(5, (bin.probability / pointsPeak) * 100)}%` }}
            title={`${bin.min}–${bin.max} points: ${pct(bin.probability)}`}
          />
        ))}
      </div>
      <div className="distribution-axis">
        <span>0 PTS</span>
        <span>{pointsMax} PTS</span>
      </div>
    </div>
  );
}

function HighlightsPlaceholder() {
  return (
    <div className="highlights-screen" aria-label="Highlights screen reserved for a future feature">
      <div className="highlights-topline">
        <span>HIGHLIGHTS</span>
        <span>COMING IN PHASE 4</span>
      </div>
      <div className="highlights-screen-center">
        <span className="screen-mark" aria-hidden="true">
          <i />
          <i />
          <i />
        </span>
        <strong>Match playback will appear here</strong>
        <span>Reserved for future match coverage</span>
      </div>
      <div className="highlights-controls" aria-hidden="true">
        <span />
        <span />
        <span />
        <span />
      </div>
    </div>
  );
}

export default function Home() {
  return (
    <main className="broadcast-page" id="top">
      <header className="broadcast-header page-shell">
        <ChannelMark />
        <nav aria-label="Main navigation">
          <a href="#deadline">Transfer desk</a>
          <a href="#analysis">The analysis</a>
        </nav>
        <Button href="/play" size="small">
          Build your club
        </Button>
      </header>

      <section className="broadcast-hero section">
        <div className="page-shell">
          <div className="broadcast-kicker">
            <span>THE FINAL THIRD</span>
            <span>FOOTBALL. REFRAMED.</span>
          </div>
          <div className="studio-frame">
            <div className="studio-stage">
              <div className="studio-grid" aria-hidden="true" />
              <div className="studio-copy">
                <p className="eyebrow">Breaking news · League entry confirmed</p>
                <h1>
                  A new club.
                  <br />
                  <em>A place in the league.</em>
                </h1>
                <p className="studio-intro">
                  A fresh badge. A real player market. One promoted place up for grabs.
                </p>
                <div className="studio-signal">
                  <span />
                  THIS IS YOUR CLUB&apos;S FIRST DAY
                </div>
              </div>
              <div className="live-bug">
                <i />
                LIVE <span>01:21:26</span>
              </div>
              <div className="broadcast-watermark" aria-hidden="true">
                FT<span>01</span>
              </div>
              <div className="breaking-banner">
                <span>BREAKING</span>
                <strong>New club confirmed for the Premier League</strong>
                <span>JUST IN</span>
              </div>
            </div>
            <div className="lower-third">
              <div className="lower-third-copy">
                <span className="lower-third-label">YOUR CLUB. YOUR CALL.</span>
                <p>
                  Build a squad from real players, then see its season forecast across 10,000
                  simulations.
                </p>
              </div>
              <Button href="/play" className="broadcast-primary-cta">
                Build your club
              </Button>
            </div>
          </div>
          <div className="hero-footnote">
            <span>THE PROMOTED PLACE IS YOURS TO TAKE</span>
            <span>20 CLUBS · 38 MATCHES</span>
          </div>
        </div>
      </section>

      <NewsTicker />

      <section className="highlights-section section" aria-labelledby="highlights-title">
        <div className="page-shell highlights-layout">
          <div className="highlights-heading">
            <p className="eyebrow">Next on The Final Third</p>
            <h2 id="highlights-title">Highlights</h2>
            <p>
              Match coverage is on the way. This screen is reserved for future playback once your
              club takes the field.
            </p>
            <span className="coming-tag">UPCOMING FEATURE</span>
          </div>
          <HighlightsPlaceholder />
        </div>
      </section>

      <section className="deadline-section section" id="deadline">
        <div className="page-shell">
          <div className="desk-heading">
            <div>
              <p className="eyebrow">Transfer Deadline Desk · Squad briefing</p>
              <h2>
                There are 18 places
                <br />
                to get right.
              </h2>
            </div>
            <p className="desk-summary">
              The new side has a fixed allowance and a strict registration list. Every selection has
              to fit before the window closes.
            </p>
          </div>
          <Card className="deadline-card">
            <div className="deadline-budget">
              <span>AVAILABLE TRANSFER BUDGET</span>
              <strong>{money(SQUAD_BUDGET)}</strong>
              <small>FPL price units · existing market prices</small>
              <div className="budget-rule">
                <i />
              </div>
            </div>
            <div className="deadline-roster">
              <div className="roster-label">
                <span>SQUAD REGISTRATION</span>
                <span>{SQUAD_SIZE} PLAYERS</span>
              </div>
              <div className="roster-lines">
                {POSITION_ORDER.map((position) => (
                  <div className="roster-line" key={position}>
                    <span>{position}</span>
                    <div
                      className="roster-slots"
                      aria-label={`${POSITION_QUOTAS[position]} ${position} places`}
                    >
                      {Array.from({ length: POSITION_QUOTAS[position] }, (_, index) => (
                        <i key={index} />
                      ))}
                    </div>
                    <strong>{POSITION_QUOTAS[position]}</strong>
                  </div>
                ))}
              </div>
              <div className="club-limit">
                <span className="limit-number">{String(MAX_PER_REAL_CLUB).padStart(2, '0')}</span>
                <div>
                  <strong>{MAX_PER_REAL_CLUB} per real club</strong>
                  <small>
                    No side can supply more than {MAX_PER_REAL_CLUB} players to the new roster.
                  </small>
                </div>
              </div>
            </div>
            <div className="deadline-card-footer">
              <span>NO PLAYER POINT TOTALS · TEAM SIMULATION ONLY</span>
              <Button href="/play" variant="secondary">
                Enter the market
              </Button>
            </div>
          </Card>
        </div>
      </section>

      <section className="analysis-section section" id="analysis">
        <div className="page-shell">
          <div className="analysis-heading">
            <p className="eyebrow">The Analysis · Season model</p>
            <h2>
              Shape matters.
              <br />
              <span>Then the numbers.</span>
            </h2>
            <p>
              A sample side put through the same team-versus-team forecast your club gets after
              squad building.
            </p>
          </div>
          <div className="analysis-board">
            <div className="analysis-board-head">
              <div>
                <span>TACTICAL BOARD</span>
                <strong>NORTHSTAR FC</strong>
              </div>
              <span className="analysis-seasons">
                {samplePrediction.seasons.toLocaleString()} SIMULATED SEASONS
              </span>
            </div>
            <div className="analysis-grid">
              <div className="analysis-shape">
                <StudioPitch formation={sampleSquad.formation} />
                <p>
                  One keeper, three lines. The shape sets the balance before the first result is
                  simulated.
                </p>
              </div>
              <div className="analysis-readout">
                <div className="points-readout">
                  <span>AVERAGE POINTS</span>
                  <strong>{samplePrediction.meanPoints.toFixed(1)}</strong>
                  <small>{ordinal(likelyPosition)} most likely finish</small>
                </div>
                <div className="analysis-mini-stats">
                  <Stat label="Title chance" value={pct(samplePrediction.titleProbability)} />
                  <Stat label="Top four" value={pct(samplePrediction.top4Probability)} />
                  <Stat label="Relegation" value={pct(samplePrediction.relegationProbability)} />
                </div>
                <div className="points-distribution-heading">
                  <span>POINTS DISTRIBUTION</span>
                  <span>SIMULATED SEASONS</span>
                </div>
                <DistributionGraphic />
              </div>
            </div>
            <div className="opponent-readout">
              <div className="opponent-readout-heading">
                <div>
                  <span>FIXTURE MODEL</span>
                  <h3>Expected points by opponent</h3>
                </div>
                <span>HOME + AWAY</span>
              </div>
              <div className="analysis-opponent-table">
                <div className="analysis-opponent-row analysis-opponent-head">
                  <span>OPPONENT</span>
                  <span>HOME</span>
                  <span>AWAY</span>
                  <span>TOTAL</span>
                </div>
                {sampleOpponents.map((opponent) => (
                  <div className="analysis-opponent-row" key={opponent.opponentId}>
                    <strong>{opponent.opponentName}</strong>
                    <span>{opponent.home.toFixed(2)}</span>
                    <span>{opponent.away.toFixed(2)}</span>
                    <strong>{opponent.total.toFixed(2)}</strong>
                  </div>
                ))}
              </div>
              <p className="model-note">
                Forecasts come from simulated fixtures against the 19 remaining clubs.
              </p>
            </div>
          </div>
        </div>
      </section>

      <section className="signoff-section">
        <div className="page-shell signoff-inner">
          <div className="signoff-stamp">
            <span>THE FINAL THIRD</span>
            <strong>
              END OF
              <br />
              BRIEFING
            </strong>
            <i>01 / 01</i>
          </div>
          <div className="signoff-copy">
            <p className="eyebrow">The story starts with you</p>
            <h2>
              One place.
              <br />
              Your name on it.
            </h2>
            <p>Build the club that takes the promoted place. See the forecast. Make your move.</p>
            <Button href="/play" className="broadcast-primary-cta">
              Build your club
            </Button>
          </div>
        </div>
      </section>

      <footer className="broadcast-footer page-shell">
        <ChannelMark />
        <p>
          An independent football club-building game. Not affiliated with the league or any club.
        </p>
        <span>20 CLUBS · ONE NEW STORY</span>
      </footer>
    </main>
  );
}
