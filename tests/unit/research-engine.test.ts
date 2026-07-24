import { describe, it, expect } from 'vitest';
import { createResearchEngine, processTick } from '@/lib/research/engine';
import { createMarketTick } from '@/lib/deriv/ticks';
import { createDefaultSettings } from '@/lib/types';

describe('Research Engine', () => {
  it('creates engine in COLLECTING mode', () => {
    const e = createResearchEngine('R_10', createDefaultSettings());
    expect(e.market).toBe('R_10');
    expect(e.learningMode).toBe('COLLECTING');
  });

  it('processes tick without crash', () => {
    const e = createResearchEngine('R_10', createDefaultSettings());
    const t = createMarketTick(1000, 1.23, 5, 'live');
    const out = processTick(e, { tick: t, settings: createDefaultSettings(), continuityGap: false });
    expect(out.changed).toBe(true);
  });

  it('detects duplicate ticks', () => {
    const e = createResearchEngine('R_10', createDefaultSettings());
    const t = createMarketTick(1000, 1.23, 5, 'live');
    processTick(e, { tick: t, settings: createDefaultSettings(), continuityGap: false });
    const out = processTick(e, { tick: t, settings: createDefaultSettings(), continuityGap: false });
    expect(out.changed).toBe(false);
  });

  it('handles continuity gaps', () => {
    const e = createResearchEngine('R_10', createDefaultSettings());
    const t = createMarketTick(1000, 1.23, 5, 'live');
    const out = processTick(e, { tick: t, settings: createDefaultSettings(), continuityGap: true, gapReason: 'Test gap' });
    expect(out.changed).toBe(true);
  });

  it('processes multiple sequential ticks', () => {
    const e = createResearchEngine('R_10', createDefaultSettings());
    for (let i = 0; i < 10; i++) {
      const t = createMarketTick(1000 + i, 1.23 + i * 0.001, 5, 'history');
      const out = processTick(e, { tick: t, settings: createDefaultSettings(), continuityGap: false });
      expect(out.changed).toBe(true);
    }
  });
});
