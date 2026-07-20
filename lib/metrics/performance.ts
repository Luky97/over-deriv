import type {
  ContractMetricBucket,
  PerformanceMetrics,
  PredictionTarget,
  RoundMetricBucket,
  TriggerMode,
  VirtualContractResult,
  VirtualRound,
} from '@/lib/types';
import { PREDICTION_TARGETS } from '@/lib/types';

export function emptyContractMetrics(): ContractMetricBucket {
  return {
    total: 0, wins: 0, losses: 0, winRate: 0, currentStreak: 0,
    maxWinStreak: 0, maxLossStreak: 0, brierScore: 0,
  };
}

function emptyRoundMetrics(): RoundMetricBucket {
  return {
    total: 0, wins: 0, losses: 0, invalidated: 0, winRate: 0,
    averageContracts: 0, earlyWins: 0, earlyLossStops: 0,
  };
}

export function createPerformanceMetrics(): PerformanceMetrics {
  return {
    shadow: emptyContractMetrics(),
    activeVirtual: emptyContractMetrics(),
    formulaExperiments: emptyContractMetrics(),
    rounds: {
      SHADOW: emptyRoundMetrics(),
      ACTIVE_VIRTUAL: emptyRoundMetrics(),
      FORMULA_EXPERIMENT: emptyRoundMetrics(),
    },
    byTarget: Object.fromEntries(PREDICTION_TARGETS.map((target) => [target, emptyContractMetrics()])) as Record<PredictionTarget, ContractMetricBucket>,
    byRegime: {},
    byTrigger: { DIGIT: emptyContractMetrics(), AUTOMATIC: emptyContractMetrics() } as Record<TriggerMode, ContractMetricBucket>,
    trainingUpdates: 0,
    forwardEvaluations: 0,
  };
}

function updateBucket(bucket: ContractMetricBucket, contract: VirtualContractResult): ContractMetricBucket {
  if (contract.outcome === 'INVALIDATED') return bucket;
  const won = contract.outcome === 'WIN';
  const total = bucket.total + 1;
  const wins = bucket.wins + Number(won);
  const losses = bucket.losses + Number(!won);
  const previousBrierTotal = bucket.brierScore * bucket.total;
  const brierScore = (previousBrierTotal + (contract.prediction.probability - Number(won)) ** 2) / total;
  const currentStreak = won
    ? Math.max(1, bucket.currentStreak > 0 ? bucket.currentStreak + 1 : 1)
    : Math.min(-1, bucket.currentStreak < 0 ? bucket.currentStreak - 1 : -1);
  return {
    total, wins, losses, winRate: wins / total, currentStreak,
    maxWinStreak: Math.max(bucket.maxWinStreak, currentStreak > 0 ? currentStreak : 0),
    maxLossStreak: Math.max(bucket.maxLossStreak, currentStreak < 0 ? Math.abs(currentStreak) : 0),
    brierScore,
  };
}

export function recordContract(
  metrics: PerformanceMetrics,
  contract: VirtualContractResult,
  trigger: TriggerMode,
): PerformanceMetrics {
  const next = structuredClone(metrics);
  if (contract.executionKind === 'SHADOW') next.shadow = updateBucket(next.shadow, contract);
  else if (contract.executionKind === 'ACTIVE_VIRTUAL') next.activeVirtual = updateBucket(next.activeVirtual, contract);
  else next.formulaExperiments = updateBucket(next.formulaExperiments, contract);
  next.byTarget[contract.prediction.target] = updateBucket(next.byTarget[contract.prediction.target], contract);
  next.byRegime[contract.prediction.regime] = updateBucket(
    next.byRegime[contract.prediction.regime] ?? emptyContractMetrics(),
    contract,
  );
  next.byTrigger[trigger] = updateBucket(next.byTrigger[trigger], contract);
  next.trainingUpdates += 1;
  next.forwardEvaluations += 1;
  return next;
}

export function recordRound(metrics: PerformanceMetrics, round: VirtualRound): PerformanceMetrics {
  const next = structuredClone(metrics);
  const bucket = next.rounds[round.executionKind];
  const total = bucket.total + 1;
  const wins = bucket.wins + Number(round.status === 'ROUND_WIN');
  const losses = bucket.losses + Number(round.status === 'ROUND_LOSS');
  const invalidated = bucket.invalidated + Number(round.status === 'INVALIDATED');
  next.rounds[round.executionKind] = {
    total, wins, losses, invalidated,
    winRate: wins + losses === 0 ? 0 : wins / (wins + losses),
    averageContracts: (bucket.averageContracts * bucket.total + round.contracts.length) / total,
    earlyWins: bucket.earlyWins + Number(round.status === 'ROUND_WIN' && round.contracts.length < 5),
    earlyLossStops: bucket.earlyLossStops + Number(round.status === 'ROUND_LOSS' && round.contracts.length < 5),
  };
  return next;
}
