import { describe, expect, it } from 'vitest';
import { fitnessTone, halfTimeTip, ratingTone, shareOf, type TipInput } from './halftime';

const base: TipInput = {
  score: { us: 0, them: 0 },
  shots: { us: 4, them: 4 },
  xg: { us: 0.5, them: 0.5 },
  possession: { us: 50, them: 50 },
  tactic: 'balanced',
  subsLeft: 5,
  reds: { us: 0, them: 0 },
  tired: null,
  struggling: null,
  booked: null,
  best: null,
};
const tip = (over: Partial<TipInput>) => halfTimeTip({ ...base, ...over });

describe('tones', () => {
  it('colours ratings volt from 7.0, pink below 6.0', () => {
    expect(ratingTone(7)).toBe('high');
    expect(ratingTone(6.9)).toBe('mid');
    expect(ratingTone(6)).toBe('mid');
    expect(ratingTone(5.9)).toBe('low');
  });
  it('colours fitness green from 75, amber 50-74, red below 50', () => {
    expect(fitnessTone(75)).toBe('good');
    expect(fitnessTone(74)).toBe('warn');
    expect(fitnessTone(50)).toBe('warn');
    expect(fitnessTone(49)).toBe('bad');
  });
  it('shares a pair, with an even bar when both are zero', () => {
    expect(shareOf(3, 1)).toBe(75);
    expect(shareOf(0, 0)).toBe(50);
  });
});

describe('assistant tip: the twelve rules, in priority order', () => {
  it('1 you are a man down', () => {
    expect(tip({ reds: { us: 1, them: 0 } })).toContain('down to ten men');
    expect(tip({ reds: { us: 2, them: 0 } })).toContain('down to nine men');
    expect(tip({ reds: { us: 1, them: 0 }, tactic: 'defensive' })).toContain('already set up');
  });
  it('2 they are a man down', () => {
    expect(tip({ reds: { us: 0, them: 1 } })).toContain("They're down to ten men");
  });
  it('3 a tired starter, only with subs left', () => {
    const tired = { name: 'Roy', position: 'MID', fitness: 41.6 };
    expect(tip({ tired })).toBe(
      'Roy is running on empty at 42%. A fresh MID from the bench would help.',
    );
    expect(tip({ tired, subsLeft: 0 })).not.toContain('running on empty');
  });
  it('4 a struggling starter, only with subs left', () => {
    const struggling = { name: 'Sam', position: 'DEF', rating: 5.2 };
    expect(tip({ struggling })).toBe('Sam is struggling, rated 5.2. A fresh DEF could help.');
    expect(tip({ struggling, subsLeft: 0 })).not.toContain('struggling');
  });
  it('5 a booked starter', () => {
    expect(tip({ booked: { name: 'Lee', position: 'DEF' } })).toContain('Lee is on a yellow card');
  });
  it('6 trailing but out-shooting them', () => {
    const text = tip({ score: { us: 0, them: 1 }, shots: { us: 9, them: 3 } });
    expect(text).toContain('trailing 0–1');
    expect(text).toContain('out-shot them 9–3');
  });
  it('7 trailing and out-shot, aware of the current tactic', () => {
    const text = tip({ score: { us: 0, them: 2 }, shots: { us: 2, them: 8 } });
    expect(text).toContain('Trailing 0–2 and out-shot 2–8');
    expect(text).toContain('High press');
    expect(
      tip({ score: { us: 0, them: 2 }, shots: { us: 2, them: 8 }, tactic: 'high_press' }),
    ).toContain('even with the press on');
  });
  it('8 ahead but outplayed on expected goals', () => {
    const text = tip({ score: { us: 1, them: 0 }, xg: { us: 0.3, them: 1.1 } });
    expect(text).toContain('expected goals 0.30–1.10');
    expect(text).toContain('Defensive');
  });
  it('9 ahead by two or more', () => {
    expect(tip({ score: { us: 3, them: 1 } })).toContain('Comfortably ahead at 3–1');
  });
  it('10 level and they have more of the ball', () => {
    expect(tip({ possession: { us: 42, them: 58 } })).toContain("they've had 58% of the ball");
    expect(tip({ possession: { us: 46, them: 54 } })).toBe(
      'Nothing needs fixing. Stay with your plan and start the second half.',
    );
  });
  it('11 level and you are out-shooting them', () => {
    expect(tip({ shots: { us: 8, them: 3 } })).toContain("you've out-shot them 8–3");
  });
  it('12 otherwise: best player, the lead, or a quiet half', () => {
    expect(tip({ best: { name: 'Ali', position: 'FWD', rating: 7.9 } })).toContain(
      'Ali is your man of the half, rated 7.9',
    );
    expect(tip({ score: { us: 1, them: 0 } })).toBe('Ahead 1–0. Keep your shape and see it out.');
    expect(tip({ score: { us: 0, them: 1 } })).toContain('shots close at 4–4');
  });
  it('never cites a stat that is not in its input', () => {
    // Close shots are only claimed when they really are within one.
    const text = tip({ score: { us: 0, them: 1 }, shots: { us: 5, them: 4 } });
    expect(text).toContain('5–4');
  });
});
