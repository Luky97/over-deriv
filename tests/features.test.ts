import { describe, expect, it } from 'vitest';
import { buildFeatureSnapshot } from '../lib/features/engine';
import { makeHistory } from './helpers';

describe('feature engine', () => {
  it('builds every required overlapping window and finite model vector', () => {
    const snapshot = buildFeatureSnapshot('R_10', makeHistory());
    expect(Object.keys(snapshot.windows).map(Number)).toEqual([20, 50, 100, 250, 500, 1000]);
    expect(snapshot.windows[1000].size).toBe(1000);
    expect(snapshot.featureNames.length).toBe(snapshot.vector.length);
    expect(snapshot.vector.length).toBeGreaterThan(400);
    expect(snapshot.vector.every(Number.isFinite)).toBe(true);
  });

  it('uses server epoch for experimental time features', () => {
    const ticks = makeHistory();
    const snapshot = buildFeatureSnapshot('R_10', ticks);
    const expected = new Date(ticks[999].epoch * 1000);
    expect(snapshot.time.serverSecond).toBe(expected.getUTCSeconds());
    expect(snapshot.time.serverMinute).toBe(expected.getUTCMinutes());
    expect(snapshot.time.serverHour).toBe(expected.getUTCHours());
  });

  it('includes rank, parity, threshold, transition, quote, entropy and drift inputs', () => {
    const snapshot = buildFeatureSnapshot('R_25', makeHistory());
    expect(snapshot.windows[20].rankings.most.digits.length).toBeGreaterThan(0);
    expect(snapshot.sequence.firstOrderDigit).toHaveLength(10);
    expect(snapshot.sequence.parityFirstOrder.probabilities).toHaveLength(2);
    expect(snapshot.quote.pipNormalizedChange).not.toBeNaN();
    expect(snapshot.randomness.shannonEntropy).toBeGreaterThan(3);
    expect(snapshot.randomness.jensenShannon20To1000).toBeGreaterThanOrEqual(0);
    expect(snapshot.frequencySlope).toHaveLength(10);
    expect(snapshot.rankMomentum).toHaveLength(10);
  });
});
