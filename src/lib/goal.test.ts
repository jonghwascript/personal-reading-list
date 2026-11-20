import { goalProgress, yearFraction } from './goal';

describe('goalProgress', () => {
  const goal = { year: 2026, target: 24 };

  it('expects ~12 books on July 1st for a 24-book goal (spec example)', () => {
    const july1 = new Date(2026, 6, 1);
    expect(yearFraction(july1)).toBeCloseTo(0.496, 2);
    expect(goalProgress(goal, 12, july1).status).toBe('on-track');
  });

  it('reports ahead and behind with a one-book tolerance', () => {
    const july1 = new Date(2026, 6, 1);
    expect(goalProgress(goal, 14, july1).status).toBe('ahead');
    expect(goalProgress(goal, 11, july1).status).toBe('on-track');
    expect(goalProgress(goal, 9, july1).status).toBe('behind');
  });

  it('marks completion and caps percent at 100', () => {
    const p = goalProgress(goal, 30, new Date(2026, 10, 20));
    expect(p.status).toBe('complete');
    expect(p.percent).toBe(100);
  });

  it('treats past years as fully elapsed', () => {
    expect(goalProgress({ year: 2025, target: 10 }, 5, new Date(2026, 1, 1)).expected).toBe(10);
  });
});
