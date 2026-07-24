import type { VirtualRound, VirtualContract, FrozenPrediction, ResearchSettings } from '@/lib/types';
import type { ResearchEngineState } from '@/lib/research/engine';
import type { ContractType, ExecutionKind, TriggerMode, RoundStatus } from '@/lib/types';

export function createRound(p: { id: string; roundNumber: number; market: string; executionKind: ExecutionKind; triggerType: TriggerMode; triggerDigit?: number; triggerEpoch: number; triggerTickDigit: number; strategyId: string }): VirtualRound {
  return { id: p.id, roundNumber: p.roundNumber, market: p.market, executionKind: p.executionKind, triggerType: p.triggerType, triggerDigit: p.triggerDigit, triggerEpoch: p.triggerEpoch, triggerTickDigit: p.triggerTickDigit, contracts: [], status: 'IN_PROGRESS', strategyId: p.strategyId, startedAt: Date.now(), completedAt: null };
}

export function createContractResult(_state: ResearchEngineState, pred: FrozenPrediction, actualDigit: number, epoch: number): VirtualContract {
  const t2c: Record<string, ContractType> = { EVEN: 'DIGITEVEN', ODD: 'DIGITODD', OVER_3: 'DIGITOVER', UNDER_7: 'DIGITUNDER' };
  const ct = t2c[pred.target] ?? 'DIGITEVEN';
  const won = checkWin(ct, pred.target, actualDigit);
  return { id: `${pred.id}:contract`, market: pred.market, contractType: ct, prediction: pred.target, confidence: pred.systemConfidence, predictionEpoch: pred.frozenAtEpoch, settlementEpoch: epoch, actualDigit, outcome: won ? 'WIN' : 'LOSS', strategyId: pred.strategyId, roundId: '', executionKind: 'SHADOW' };
}

function checkWin(_ct: ContractType, target: string, digit: number): boolean {
  if (target === 'EVEN') return digit % 2 === 0;
  if (target === 'ODD') return digit % 2 !== 0;
  if (target === 'OVER_3') return digit > 3;
  if (target === 'UNDER_7') return digit < 7;
  return false;
}

export function evaluateRoundStatus(round: VirtualRound, settings: ResearchSettings): RoundStatus {
  const wins = round.contracts.filter(c => c.outcome === 'WIN').length;
  const losses = round.contracts.filter(c => c.outcome === 'LOSS').length;
  if (wins >= settings.requiredWins) return 'ROUND_WIN';
  if (losses >= settings.consecutiveLossStop) return 'ROUND_LOSS';
  if (round.contracts.length >= settings.maximumContractsPerRound) return wins > losses ? 'ROUND_WIN' : 'ROUND_LOSS';
  return 'IN_PROGRESS';
}

export function invalidateRound(_state: ResearchEngineState, round: VirtualRound, epoch: number, reason: string): VirtualRound {
  round.status = 'INVALIDATED';
  round.invalidationReason = reason;
  round.completedAt = epoch;
  for (const c of round.contracts) { if (c.outcome !== 'WIN' && c.outcome !== 'LOSS') c.outcome = 'INVALIDATED'; }
  return round;
}
