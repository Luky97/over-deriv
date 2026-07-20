import type {
  PredictionTarget,
  RegimeLabel,
  StrategyDefinition,
  StrategyStatus,
} from '@/lib/types';
import { PREDICTION_TARGETS } from '@/lib/types';
import { wilsonLowerBound } from './confidence';

const ALL_REGIMES: RegimeLabel[] = [
  'EVEN_DOMINANT', 'ODD_DOMINANT', 'OVER3_DOMINANT', 'UNDER7_DOMINANT',
  'MIXED', 'HIGH_ENTROPY', 'LOW_ENTROPY',
];

function baseStrategy(
  id: string,
  name: string,
  status: StrategyStatus,
  overrides: Partial<StrategyDefinition> = {},
): StrategyDefinition {
  return {
    id,
    name,
    version: 2,
    status,
    windowSize: 100,
    enabledTargets: [...PREDICTION_TARGETS],
    modelWeights: {},
    probabilityFloor: 0.55,
    agreementFloor: 0.55,
    allowedRegimes: [...ALL_REGIMES],
    featureSubset: 'FULL',
    evidence: 0,
    wins: 0,
    brierScore: 0.25,
    ucbScore: Number.POSITIVE_INFINITY,
    wilsonLowerBound: 0,
    promotionReason: 'Initial bounded research candidate',
    ...overrides,
  };
}

export function createDefaultStrategies(): StrategyDefinition[] {
  return [
    baseStrategy('balanced-v2', 'Balanced online ensemble', 'CHAMPION'),
    baseStrategy('sequence-v2', 'Sequence-weighted challenger', 'SHADOW_TESTING', {
      windowSize: 250,
      featureSubset: 'SEQUENCE',
      modelWeights: { markov_first_order: 1.3, markov_second_order: 1.5, ngram_context: 1.4 },
      agreementFloor: 0.6,
    }),
    baseStrategy('movement-v2', 'Movement and rank challenger', 'EXPERIMENTAL', {
      windowSize: 50,
      featureSubset: 'MOVEMENT',
      modelWeights: { frequency_momentum: 1.5, online_logistic: 1.2 },
      probabilityFloor: 0.57,
    }),
    baseStrategy('stable-regime-v2', 'Stable-regime challenger', 'SHADOW_TESTING', {
      windowSize: 500,
      featureSubset: 'DIGITS',
      allowedRegimes: ['MIXED', 'EVEN_DOMINANT', 'ODD_DOMINANT', 'OVER3_DOMINANT', 'UNDER7_DOMINANT'],
      modelWeights: { regime_conditioned: 1.5, online_naive_bayes: 1.2 },
      agreementFloor: 0.62,
    }),
  ];
}

export function updateStrategyResult(
  strategies: readonly StrategyDefinition[],
  strategyId: string,
  won: boolean,
  probability: number,
): StrategyDefinition[] {
  const totalEvaluations = strategies.reduce((sum, strategy) => sum + strategy.evidence, 0) + 1;
  return strategies.map((strategy) => {
    if (strategy.id !== strategyId) return {
      ...strategy,
      ucbScore: strategy.evidence === 0
        ? Number.POSITIVE_INFINITY
        : strategy.wins / strategy.evidence + Math.sqrt((2 * Math.log(totalEvaluations)) / strategy.evidence),
    };
    const evidence = strategy.evidence + 1;
    const wins = strategy.wins + Number(won);
    const previousBrierTotal = strategy.brierScore * strategy.evidence;
    const brierScore = (previousBrierTotal + (probability - Number(won)) ** 2) / evidence;
    return {
      ...strategy,
      evidence,
      wins,
      brierScore,
      wilsonLowerBound: wilsonLowerBound(wins, evidence),
      ucbScore: wins / evidence + Math.sqrt((2 * Math.log(totalEvaluations)) / evidence),
    };
  });
}

export function advanceStrategyLifecycle(
  strategies: readonly StrategyDefinition[],
  minimumSamples: number,
): StrategyDefinition[] {
  let next = strategies.map((strategy) => {
    if (strategy.status === 'EXPERIMENTAL' && strategy.evidence >= 15) {
      return { ...strategy, status: 'SHADOW_TESTING' as const, promotionReason: 'Completed initial experimental observations' };
    }
    if (strategy.status === 'SHADOW_TESTING' && strategy.evidence >= minimumSamples
      && strategy.wilsonLowerBound >= 0.52 && strategy.brierScore <= 0.26) {
      return { ...strategy, status: 'CHALLENGER' as const, promotionReason: 'Unseen shadow evidence and calibration qualified' };
    }
    if ((strategy.status === 'SHADOW_TESTING' || strategy.status === 'CHALLENGER')
      && strategy.evidence >= Math.max(100, minimumSamples * 2)
      && (strategy.wilsonLowerBound < 0.35 || strategy.brierScore > 0.36)) {
      return { ...strategy, status: 'RETIRED' as const, promotionReason: 'Sustained unseen performance failed validation' };
    }
    return strategy;
  });
  const champion = next.find((strategy) => strategy.status === 'CHAMPION');
  const challengers = next.filter((strategy) => strategy.status === 'CHALLENGER');
  const best = challengers.sort((a, b) => b.wilsonLowerBound - a.wilsonLowerBound)[0];
  if (champion && best
    && best.evidence >= Math.max(75, minimumSamples)
    && best.wilsonLowerBound >= champion.wilsonLowerBound + 0.03
    && best.brierScore <= champion.brierScore * 0.95) {
    next = next.map((strategy) => {
      if (strategy.id === champion.id) return { ...strategy, status: 'PAUSED' as const, promotionReason: `Replaced by ${best.name}` };
      if (strategy.id === best.id) return { ...strategy, status: 'CHAMPION' as const, promotionReason: 'Superior calibrated unseen lower bound' };
      return strategy;
    });
  }
  return next;
}

export function selectLaboratoryStrategy(
  strategies: readonly StrategyDefinition[],
  regime: RegimeLabel,
): StrategyDefinition {
  const champion = strategies.find((strategy) => strategy.status === 'CHAMPION');
  const eligible = strategies.filter((strategy) =>
    !['RETIRED', 'PAUSED'].includes(strategy.status) && strategy.allowedRegimes.includes(regime));
  // UCB1 occasionally assigns a shadow round to an unseen challenger; the champion remains the active strategy.
  const challenger = eligible.filter((strategy) => strategy.status !== 'CHAMPION')
    .sort((a, b) => b.ucbScore - a.ucbScore)[0];
  if (challenger && (!Number.isFinite(challenger.ucbScore) || challenger.ucbScore > (champion?.ucbScore ?? 0) + 0.08)) {
    return challenger;
  }
  return champion ?? eligible[0] ?? strategies[0];
}

export function enabledStrategyTargets(
  strategy: StrategyDefinition,
  settings: Record<PredictionTarget, boolean>,
): PredictionTarget[] {
  return strategy.enabledTargets.filter((target) => settings[target]);
}
