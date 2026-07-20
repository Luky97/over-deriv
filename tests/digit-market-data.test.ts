import { describe, expect, it } from 'vitest';
import { calculateRankings, getLastDigit } from '../lib/digit-stats';
import {
  appendRollingTick,
  createMarketTick,
  filterSupportedMarkets,
  normalizeHistory,
} from '../lib/deriv/market-data';
import { makeHistory, makeSymbol, makeTick } from './helpers';

describe('displayed digits and rank ties', () => {
  it('preserves trailing zeroes at the market precision', () => {
    expect(getLastDigit(1234.5, 2)).toBe(0);
    expect(getLastDigit(10, 3)).toBe(0);
    expect(getLastDigit(1.2345, 4)).toBe(5);
  });

  it('retains every tied digit in four distinct rank bands', () => {
    const rankings = calculateRankings([5, 5, 4, 4, 3, 3, 2, 2, 1, 1], 30);
    expect(rankings.most.digits).toEqual([0, 1]);
    expect(rankings.secondMost.digits).toEqual([2, 3]);
    expect(rankings.least.digits).toEqual([8, 9]);
    expect(rankings.secondLeast.digits).toEqual([6, 7]);
  });

  it('does not invent a second rank when all digits tie', () => {
    const rankings = calculateRankings(Array<number>(10).fill(2), 20);
    expect(rankings.most.digits).toHaveLength(10);
    expect(rankings.secondMost.digits).toEqual([]);
    expect(rankings.secondLeast.digits).toEqual([]);
  });
});

describe('public market filtering', () => {
  it('keeps only the five explicit normal Volatility indices in required order', () => {
    const symbols = [
      makeSymbol('R_100', 'Volatility 100 Index'),
      makeSymbol('1HZ10V', 'Volatility 10 (1s) Index'),
      makeSymbol('R_10', 'Volatility 10 Index'),
      makeSymbol('BOOM1000', 'Boom 1000 Index'),
      makeSymbol('R_25', 'Volatility 25 Index'),
      makeSymbol('R_50', 'Volatility 50 Index'),
      makeSymbol('R_75', 'Volatility 75 Index'),
    ];
    expect(filterSupportedMarkets(symbols).map((symbol) => symbol.underlying_symbol))
      .toEqual(['R_10', 'R_25', 'R_50', 'R_75', 'R_100']);
  });

  it('excludes a supported-looking ID when its label says 1s', () => {
    expect(filterSupportedMarkets([makeSymbol('R_10', 'Volatility 10 Index (1s)')])).toEqual([]);
  });
});

describe('rolling tick continuity', () => {
  it('caps each rolling buffer to the newest 1000 ticks', () => {
    const history = makeHistory();
    const next = createMarketTick(history[999].epoch + 2, 100.05, 2, 'live');
    const result = appendRollingTick(history, next);
    expect(result.ticks).toHaveLength(1000);
    expect(result.ticks[0].key).toBe(history[1].key);
    expect(result.ticks[999].key).toBe(next.key);
  });

  it('protects against the final-history / first-live duplicate', () => {
    const history = makeHistory();
    const duplicate = { ...history[999], source: 'live' as const };
    const result = appendRollingTick(history, duplicate);
    expect(result.duplicate).toBe(true);
    expect(result.ticks).toEqual(history);
  });

  it('detects epoch gaps without settling through them', () => {
    const history = makeHistory();
    const result = appendRollingTick(history, makeTick(history[999].epoch + 20, 4, 'live'));
    expect(result.gap).toBe(true);
    expect(result.gapReason).toContain('Tick gap');
  });

  it('pairs and deduplicates history epochs and prices chronologically', () => {
    const ticks = normalizeHistory([100.01, 100.02, 100.02, 100.03], [10, 12, 12, 14], 0.01);
    expect(ticks.map((tick) => tick.digit)).toEqual([1, 2, 3]);
    expect(ticks.map((tick) => tick.epoch)).toEqual([10, 12, 14]);
  });
});
