import { describe, expect, it } from 'vitest';
import type { MarketTick } from '../lib/types';
import { AdaptiveMarketEngine } from '../lib/research/market-engine';
import { appendDigit, losingDigit, makeEngine, makeHistory, testSettings } from './helpers';

function process(
  engine: AdaptiveMarketEngine,
  ticks: MarketTick[],
  sessionKey = 'runtime-a:R_10:1',
  gap = false,
) {
  return engine.process({
    tick: ticks[ticks.length - 1],
    ticks,
    sessionKey,
    continuityGap: gap,
    gapReason: gap ? 'Test continuity gap.' : null,
  });
}

describe('adaptive market execution integration', () => {
  it('runs trigger → skip/freeze → result without future-data leakage', () => {
    const engine = makeEngine();
    let ticks = makeHistory();
    ticks = appendDigit(ticks, 1);
    const trigger = process(engine, ticks);
    expect(trigger.view.schedulerPhase).toBe('SKIP');
    expect(trigger.view.currentRound?.contracts).toHaveLength(0);

    ticks = appendDigit(ticks, 4);
    const skipped = process(engine, ticks);
    expect(skipped.view.schedulerPhase).toBe('BUY');
    const frozen = skipped.persisted.pendingPrediction;
    expect(frozen?.frozenAtEpoch).toBe(ticks[ticks.length - 1].epoch);
    const modelBeforeResult = JSON.stringify(skipped.persisted.ensemble.models);

    ticks = appendDigit(ticks, 2);
    const settled = process(engine, ticks);
    expect(settled.contract).toBeDefined();
    expect(settled.contract?.prediction.featureSnapshot.sourceLastEpoch)
      .toBeLessThan(settled.contract?.resultEpoch ?? 0);
    expect(settled.contract?.prediction.featureSnapshot.id).toBe(frozen?.featureSnapshot.id);
    expect(JSON.stringify(settled.persisted.ensemble.models)).not.toBe(modelBeforeResult);
    expect(settled.view.schedulerPhase).toBe('SKIP');
  });

  it('does not train online models on trigger or skipped ticks', () => {
    const engine = makeEngine();
    let ticks = makeHistory();
    const initial = JSON.stringify(engine.serialize().ensemble.models);
    ticks = appendDigit(ticks, 1);
    const trigger = process(engine, ticks);
    ticks = appendDigit(ticks, 3);
    const skip = process(engine, ticks);
    expect(JSON.stringify(trigger.persisted.ensemble.models)).toBe(initial);
    expect(JSON.stringify(skip.persisted.ensemble.models)).toBe(initial);
  });

  it('prevents overlapping rounds on one market', () => {
    const engine = makeEngine();
    let ticks = appendDigit(makeHistory(), 1);
    const first = process(engine, ticks);
    const id = first.view.currentRound?.id;
    ticks = appendDigit(ticks, 1);
    const second = process(engine, ticks);
    expect(second.view.currentRound?.id).toBe(id);
    expect(second.view.currentRound?.roundNumber).toBe(1);
  });

  it('invalidates an uncertain round on a gap and excludes it from wins/losses', () => {
    const engine = makeEngine();
    let ticks = appendDigit(makeHistory(), 1);
    process(engine, ticks);
    ticks = appendDigit(ticks, 3, 20);
    const output = process(engine, ticks, 'runtime-a:R_10:1', true);
    expect(output.completedRound?.status).toBe('INVALIDATED');
    expect(output.completedRound?.invalidationReason).toContain('Test continuity gap');
    expect(output.view.learningMode).toBe('COOLDOWN');
    expect(output.view.metrics.rounds.SHADOW.invalidated).toBe(1);
  });

  it('invalidates a restored in-progress round when the browser session changes', () => {
    const settings = testSettings();
    const engine = makeEngine('R_10', settings);
    let ticks = appendDigit(makeHistory(), 1);
    process(engine, ticks);
    ticks = appendDigit(ticks, 4);
    const skipped = process(engine, ticks);
    const restored = new AdaptiveMarketEngine('R_10', settings, skipped.persisted);
    ticks = appendDigit(ticks, 2);
    const output = process(restored, ticks, 'runtime-after-reload:R_10:1');
    expect(output.completedRound?.status).toBe('INVALIDATED');
    expect(output.contract).toBeUndefined();
  });

  it('restores model and scheduler state when continuity is explicitly unchanged', () => {
    const settings = testSettings();
    const engine = makeEngine('R_10', settings);
    let ticks = appendDigit(makeHistory(), 1);
    process(engine, ticks);
    ticks = appendDigit(ticks, 4);
    const skipped = process(engine, ticks);
    const restored = new AdaptiveMarketEngine('R_10', settings, skipped.persisted);
    ticks = appendDigit(ticks, 2);
    const output = process(restored, ticks);
    expect(output.contract).toBeDefined();
    expect(output.view.currentRound?.contracts).toHaveLength(1);
  });

  it('enters cooldown after three consecutive virtual contract losses', () => {
    const engine = makeEngine();
    let ticks = appendDigit(makeHistory(), 1);
    process(engine, ticks);
    let completed;
    for (let contractIndex = 0; contractIndex < 3; contractIndex += 1) {
      ticks = appendDigit(ticks, 4);
      const skip = process(engine, ticks);
      const target = skip.persisted.pendingPrediction?.target;
      expect(target).toBeDefined();
      ticks = appendDigit(ticks, losingDigit(target ?? 'EVEN'));
      const result = process(engine, ticks);
      completed = result.completedRound;
    }
    expect(completed?.status).toBe('ROUND_LOSS');
    expect(engine.view().learningMode).toBe('COOLDOWN');
    expect(engine.view().confidence.value).toBeLessThan(80);
    expect(engine.serialize().recoverySettlements).toBe(1);
  });

  it('honors the Formula Lab disable switch during settlement', () => {
    const engine = makeEngine('R_10', testSettings({ formulaExperimentsEnabled: false }));
    let ticks = appendDigit(makeHistory(), 1);
    process(engine, ticks);
    ticks = appendDigit(ticks, 4);
    process(engine, ticks);
    ticks = appendDigit(ticks, 2);
    const settled = process(engine, ticks);
    expect(settled.contract).toBeDefined();
    expect(settled.persisted.formulaLab.candidates.every((candidate) => candidate.trainingSamples === 0)).toBe(true);
  });

  it('keeps market engines completely isolated', () => {
    const first = makeEngine('R_10');
    const second = makeEngine('R_25');
    const firstTicks = appendDigit(makeHistory(), 1);
    const secondTicks = appendDigit(makeHistory(1000, 3), 2);
    const firstOutput = process(first, firstTicks, 'runtime:R_10:1');
    const secondOutput = second.process({ tick: secondTicks[999], ticks: secondTicks, sessionKey: 'runtime:R_25:1', continuityGap: false });
    expect(firstOutput.view.currentRound).not.toBeNull();
    expect(secondOutput.view.currentRound).toBeNull();
    expect(secondOutput.view.metrics.shadow.total).toBe(0);
  });
});
