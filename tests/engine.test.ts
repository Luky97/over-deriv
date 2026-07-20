import { describe, it, expect } from 'vitest';
import { extractDigit, calculateWindowFeatures } from '../lib/features/engine';
import { evaluateRoundStatus } from '../lib/simulation/round-engine';
import type { VirtualContractResult } from '../lib/ml-types';
import { advanceSequence } from '../lib/simulation/skip-buy-scheduler';

describe('Feature Engine', () => {
  it('extracts final digit correctly', () => {
    expect(extractDigit(1.2345, 4)).toBe(5);
    expect(extractDigit(1234.50, 2)).toBe(0); // tests trailing zeros
  });

  it('calculates most and least frequent with ties', () => {
    // 0 appears twice, 1 appears twice, 2 appears once
    const quotes = [1.00, 1.00, 1.01, 1.01, 1.02];
    const features = calculateWindowFeatures(quotes, 2);
    
    expect(features.mostFrequent).toContain(0);
    expect(features.mostFrequent).toContain(1);
    expect(features.mostFrequent).not.toContain(2);
  });
});

describe('Simulation Rules', () => {
  it('advances sequence correctly Trigger -> Skip -> Predict -> Buy', () => {
    let state = advanceSequence({ sequence: 'WAITING_FOR_TRIGGER', contractsFinished: 0, results: [], lastTickEpoch: 1 }, true);
    expect(state).toBe('SKIP_1');
    state = advanceSequence({ sequence: state, contractsFinished: 0, results: [], lastTickEpoch: 2 }, false);
    expect(state).toBe('PREDICT_FROZEN');
    state = advanceSequence({ sequence: state, contractsFinished: 0, results: [], lastTickEpoch: 3 }, false);
    expect(state).toBe('WAITING_FOR_BUY_1');
    state = advanceSequence({ sequence: state, contractsFinished: 0, results: [], lastTickEpoch: 4 }, false);
    expect(state).toBe('SKIP_2');
  });

  it('evaluates round as LOSS on 3 consecutive losses immediately', () => {
    const contracts: VirtualContractResult[] = [
      { prediction: { target: 'EVEN', probability: 0, confidence: 0, virtualAction: 'TRADE', modelVotes: {}, featuresSnapshotId: '' }, actualDigit: 1, isWin: false, tickEpoch: 1 },
      { prediction: { target: 'EVEN', probability: 0, confidence: 0, virtualAction: 'TRADE', modelVotes: {}, featuresSnapshotId: '' }, actualDigit: 1, isWin: false, tickEpoch: 2 },
      { prediction: { target: 'EVEN', probability: 0, confidence: 0, virtualAction: 'TRADE', modelVotes: {}, featuresSnapshotId: '' }, actualDigit: 1, isWin: false, tickEpoch: 3 },
    ];
    
    expect(evaluateRoundStatus(contracts)).toBe('LOSS');
  });

  it('evaluates round as WIN on 4 wins out of 5', () => {
    const contracts: VirtualContractResult[] = [
      { prediction: { target: 'EVEN', probability: 0, confidence: 0, virtualAction: 'TRADE', modelVotes: {}, featuresSnapshotId: '' }, actualDigit: 2, isWin: true, tickEpoch: 1 },
      { prediction: { target: 'EVEN', probability: 0, confidence: 0, virtualAction: 'TRADE', modelVotes: {}, featuresSnapshotId: '' }, actualDigit: 1, isWin: false, tickEpoch: 2 },
      { prediction: { target: 'EVEN', probability: 0, confidence: 0, virtualAction: 'TRADE', modelVotes: {}, featuresSnapshotId: '' }, actualDigit: 2, isWin: true, tickEpoch: 3 },
      { prediction: { target: 'EVEN', probability: 0, confidence: 0, virtualAction: 'TRADE', modelVotes: {}, featuresSnapshotId: '' }, actualDigit: 2, isWin: true, tickEpoch: 4 },
      { prediction: { target: 'EVEN', probability: 0, confidence: 0, virtualAction: 'TRADE', modelVotes: {}, featuresSnapshotId: '' }, actualDigit: 2, isWin: true, tickEpoch: 5 },
    ];
    
    expect(evaluateRoundStatus(contracts)).toBe('WIN');
  });
});
