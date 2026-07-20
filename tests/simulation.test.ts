import { describe, expect, it } from 'vitest';
import type { FrozenPrediction, VirtualContractResult } from '../lib/types';
import { createDefaultSettings } from '../lib/types';
import { isTargetMet, evaluateRoundStatus } from '../lib/simulation/round-engine';
import { advanceScheduler } from '../lib/simulation/skip-buy-scheduler';

function contract(won: boolean, index: number): VirtualContractResult {
  return { id: String(index), market: 'R_10', roundId: 'round', executionKind: 'SHADOW', prediction: {} as FrozenPrediction, actualDigit: won ? 2 : 1, resultEpoch: index, outcome: won ? 'WIN' : 'LOSS', settledAt: index };
}

describe('virtual settlement definitions', () => {
  it('settles EVEN and ODD exactly', () => {
    expect(isTargetMet('EVEN', 0)).toBe(true);
    expect(isTargetMet('EVEN', 9)).toBe(false);
    expect(isTargetMet('ODD', 9)).toBe(true);
    expect(isTargetMet('ODD', 0)).toBe(false);
  });

  it('treats OVER 3 and UNDER 7 as separate overlapping targets', () => {
    expect(isTargetMet('OVER_3', 4)).toBe(true);
    expect(isTargetMet('OVER_3', 3)).toBe(false);
    expect(isTargetMet('UNDER_7', 6)).toBe(true);
    expect(isTargetMet('UNDER_7', 7)).toBe(false);
    expect(isTargetMet('OVER_3', 5) && isTargetMet('UNDER_7', 5)).toBe(true);
  });
});

describe('skip scheduler and round rules', () => {
  const settings = createDefaultSettings();
  it('orders trigger, skip/freeze, buy, skip/freeze, buy', () => {
    const trigger = advanceScheduler('WAITING', true);
    expect(trigger).toEqual({ action: 'TRIGGER', nextPhase: 'SKIP' });
    const skip = advanceScheduler(trigger.nextPhase, false);
    expect(skip).toEqual({ action: 'SKIP_AND_FREEZE', nextPhase: 'BUY' });
    const buy = advanceScheduler(skip.nextPhase, false);
    expect(buy).toEqual({ action: 'SETTLE', nextPhase: 'SKIP' });
    expect(advanceScheduler(buy.nextPhase, false).action).toBe('SKIP_AND_FREEZE');
  });

  it('wins immediately upon the fourth win', () => {
    expect(evaluateRoundStatus([contract(true, 1), contract(false, 2), contract(true, 3), contract(true, 4), contract(true, 5)], settings)).toBe('ROUND_WIN');
    expect(evaluateRoundStatus([contract(true, 1), contract(true, 2), contract(true, 3), contract(true, 4)], settings)).toBe('ROUND_WIN');
  });

  it('stops immediately after three consecutive losses', () => {
    expect(evaluateRoundStatus([contract(true, 1), contract(false, 2), contract(false, 3), contract(false, 4)], settings)).toBe('ROUND_LOSS');
  });

  it('loses after five contracts with fewer than four wins', () => {
    expect(evaluateRoundStatus([contract(true, 1), contract(false, 2), contract(true, 3), contract(false, 4), contract(true, 5)], settings)).toBe('ROUND_LOSS');
  });
});
