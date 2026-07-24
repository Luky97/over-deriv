import { describe, it, expect } from 'vitest';
import { createMarketTick, tickKey, appendRollingTick, normalizeHistory } from '@/lib/deriv/ticks';

describe('Deriv ticks', () => {
  it('creates tick with correct digit', () => {
    expect(createMarketTick(1000, 1.23456, 5, 'history').digit).toBe(6);
    expect(createMarketTick(1000, 1.23000, 5, 'history').digit).toBe(0);
  });
  it('detects duplicates', () => {
    const t = createMarketTick(1000, 1.23, 5, 'history');
    expect(appendRollingTick([t], t).duplicate).toBe(true);
  });
  it('appends new tick', () => {
    const t1 = createMarketTick(1000, 1.23, 5, 'history');
    const t2 = createMarketTick(1001, 1.24, 5, 'live');
    expect(appendRollingTick([t1], t2).duplicate).toBe(false);
  });
  it('detects gaps', () => {
    const t1 = createMarketTick(1000, 1.23, 5, 'history');
    const t2 = createMarketTick(999, 1.24, 5, 'live');
    expect(appendRollingTick([t1], t2).gap).toBe(true);
  });
  it('maintains rolling limit', () => {
    const t1 = createMarketTick(0, 1.23, 5, 'history');
    const ticks = [t1];
    for (let i = 1; i <= 1100; i++) {
      const r = appendRollingTick(ticks, createMarketTick(i, 1.23, 5, 'history'));
      ticks.length = 0; ticks.push(...r.ticks);
    }
    expect(ticks.length).toBeLessThanOrEqual(1000);
  });
});
