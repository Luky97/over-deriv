import type {
  ExecutionKind,
  FrozenPrediction,
  PredictionTarget,
  RegimeLabel,
  ResearchSettings,
  RoundStatus,
  TriggerMode,
  VirtualContractResult,
  VirtualRound,
} from '@/lib/types';
import { targetOutcome } from '@/lib/ml/models';

export function isTargetMet(target: PredictionTarget, digit: number): boolean {
  return targetOutcome(target, digit);
}

export function evaluateRoundStatus(
  contracts: readonly VirtualContractResult[],
  settings: Pick<ResearchSettings, 'maximumContractsPerRound' | 'requiredWins' | 'consecutiveLossStop'>,
): RoundStatus {
  const valid = contracts.filter((contract) => contract.outcome !== 'INVALIDATED');
  const wins = valid.filter((contract) => contract.outcome === 'WIN').length;
  if (wins >= settings.requiredWins) return 'ROUND_WIN';
  let consecutiveLosses = 0;
  for (const contract of valid) {
    consecutiveLosses = contract.outcome === 'LOSS' ? consecutiveLosses + 1 : 0;
    if (consecutiveLosses >= settings.consecutiveLossStop) return 'ROUND_LOSS';
  }
  if (valid.length >= settings.maximumContractsPerRound) return 'ROUND_LOSS';
  return 'IN_PROGRESS';
}

export interface CreateRoundInput {
  id: string;
  roundNumber: number;
  market: string;
  executionKind: ExecutionKind;
  triggerType: TriggerMode;
  triggerDigit?: number;
  automaticTriggerReason?: string;
  triggerEpoch: number;
  triggerTickDigit: number;
  regime: RegimeLabel;
  strategyId: string;
  modelVersions: Record<string, number>;
}

export function createRound(input: CreateRoundInput): VirtualRound {
  return {
    ...input,
    skippedTicks: [],
    contracts: [],
    status: 'IN_PROGRESS',
    timeline: [{
      id: `${input.id}:trigger`,
      epoch: input.triggerEpoch,
      stage: 'TRIGGER',
      digit: input.triggerTickDigit,
      detail: input.triggerType === 'DIGIT'
        ? `Digit ${input.triggerTickDigit} triggered the round`
        : input.automaticTriggerReason ?? 'Qualified automatic shadow trigger',
    }],
    startedAt: Date.now(),
    completedAt: null,
  };
}

export function createContractResult(
  round: VirtualRound,
  prediction: FrozenPrediction,
  actualDigit: number,
  resultEpoch: number,
): VirtualContractResult {
  const won = isTargetMet(prediction.target, actualDigit);
  return {
    id: `${round.id}:contract:${round.contracts.length + 1}`,
    market: round.market,
    roundId: round.id,
    executionKind: round.executionKind,
    prediction,
    actualDigit,
    resultEpoch,
    outcome: won ? 'WIN' : 'LOSS',
    settledAt: Date.now(),
  };
}

export function invalidateRound(round: VirtualRound, epoch: number, reason: string): VirtualRound {
  return {
    ...round,
    status: 'INVALIDATED',
    completedAt: Date.now(),
    invalidationReason: reason,
    timeline: [...round.timeline, {
      id: `${round.id}:invalidated:${epoch}`,
      epoch,
      stage: 'INVALIDATED',
      detail: reason,
    }],
  };
}

export function hasThreeConsecutiveLosses(contracts: readonly VirtualContractResult[]): boolean {
  let losses = 0;
  for (const contract of contracts) {
    losses = contract.outcome === 'LOSS' ? losses + 1 : 0;
    if (losses >= 3) return true;
  }
  return false;
}
