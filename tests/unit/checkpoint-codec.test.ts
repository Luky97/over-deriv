import { describe, it, expect } from 'vitest';
import { encodeCheckpoint, encodeCheckpointBounded, computeChecksum } from '@/lib/cloud-sync/checkpoint-codec';

describe('Checkpoint codec', () => {
  it('encodes minimal checkpoint', () => {
    const r = encodeCheckpoint({ version: 1, symbol: 'R_10', savedAt: new Date().toISOString(), continuity: { lastProcessedEpoch: null, lastProcessedQuote: null, lastProcessedDigit: null, totalTicksProcessed: 0 }, modelParameters: {}, normalizationState: {}, transitionState: {}, confidenceState: {}, regimeState: {}, strategyState: {}, formulaState: {}, aggregateMetrics: {}, schedulerState: {}, activeRound: null, recentContextDigits: [1,2,3] });
    expect(r.ok).toBe(true);
    expect(r.bytes).toBeLessThan(100 * 1024);
  });

  it('produces consistent checksums', () => {
    const d = { version: 1, symbol: 'R_10', savedAt: new Date().toISOString(), continuity: { lastProcessedEpoch: 100, lastProcessedQuote: 1.5, lastProcessedDigit: 5, totalTicksProcessed: 500 }, modelParameters: {}, normalizationState: {}, transitionState: {}, confidenceState: {}, regimeState: {}, strategyState: {}, formulaState: {}, aggregateMetrics: {}, schedulerState: {}, activeRound: null, recentContextDigits: [] };
    expect(computeChecksum(d)).toBe(computeChecksum(d));
  });

  it('different data gives different checksums', () => {
    const d1 = { version: 1, symbol: 'R_10', savedAt: new Date().toISOString(), continuity: { lastProcessedEpoch: 100, lastProcessedQuote: 1.5, lastProcessedDigit: 5, totalTicksProcessed: 500 }, modelParameters: {}, normalizationState: {}, transitionState: {}, confidenceState: {}, regimeState: {}, strategyState: {}, formulaState: {}, aggregateMetrics: {}, schedulerState: {}, activeRound: null, recentContextDigits: [] };
    const d2 = { ...d1, continuity: { ...d1.continuity, totalTicksProcessed: 501 } };
    expect(computeChecksum(d1)).not.toBe(computeChecksum(d2));
  });
});
