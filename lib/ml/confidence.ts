import type {
  ConfidenceBreakdown,
  DriftSeverity,
  LearningMode,
} from '@/lib/types';
import { clamp, mean } from '@/lib/features/statistics';

export interface EvidenceState {
  total: number;
  wins: number;
  recentOutcomes: number[];
  brierTotal: number;
  consecutiveWins: number;
  consecutiveLosses: number;
  contextTotal: number;
  contextWins: number;
  lastConfidence: number;
}

export function createEvidenceState(): EvidenceState {
  return {
    total: 0,
    wins: 0,
    recentOutcomes: [],
    brierTotal: 0,
    consecutiveWins: 0,
    consecutiveLosses: 0,
    contextTotal: 0,
    contextWins: 0,
    lastConfidence: 0,
  };
}

export function updateEvidence(
  state: EvidenceState,
  won: boolean,
  predictedProbability: number,
  similarContext: boolean,
): EvidenceState {
  const next = structuredClone(state);
  next.total += 1;
  next.wins += Number(won);
  next.recentOutcomes.push(Number(won));
  next.recentOutcomes = next.recentOutcomes.slice(-100);
  next.brierTotal += (predictedProbability - Number(won)) ** 2;
  next.consecutiveWins = won ? next.consecutiveWins + 1 : 0;
  next.consecutiveLosses = won ? 0 : next.consecutiveLosses + 1;
  if (similarContext) {
    next.contextTotal += 1;
    next.contextWins += Number(won);
  }
  return next;
}

export function wilsonLowerBound(wins: number, total: number, z = 1.96): number {
  if (total <= 0) return 0;
  const rate = wins / total;
  const denominator = 1 + (z ** 2) / total;
  const centre = rate + (z ** 2) / (2 * total);
  const spread = z * Math.sqrt((rate * (1 - rate) + (z ** 2) / (4 * total)) / total);
  return clamp((centre - spread) / denominator);
}

export function bayesianLowerBound(wins: number, total: number): number {
  if (total <= 0) return 0;
  const alpha = wins + 1;
  const beta = total - wins + 1;
  const posteriorMean = alpha / (alpha + beta);
  const deviation = Math.sqrt((alpha * beta) / (((alpha + beta) ** 2) * (alpha + beta + 1)));
  return clamp(posteriorMean - 1.645 * deviation);
}

export interface ConfidenceInputs {
  evidence: EvidenceState;
  minimumSamples: number;
  agreement: number;
  regimeStability: number;
  driftSeverity: DriftSeverity;
  driftScore: number;
  mode: LearningMode;
  activeThreshold: number;
}

export function computeConfidence(inputs: ConfidenceInputs): ConfidenceBreakdown {
  const { evidence } = inputs;
  if (evidence.total === 0) {
    return {
      value: 0, previousValue: evidence.lastConfidence, delta: -evidence.lastConfidence,
      verifiedEvidence: 0, sampleSizeCap: 0, wilsonLowerBound: 0, bayesianLowerBound: 0,
      recentWinRate: 0, longTermWinRate: 0, ensembleAgreement: inputs.agreement,
      regimeStability: inputs.regimeStability, similarContextSuccess: 0,
      driftPenalty: 0, lossPenalty: 0, calibrationPenalty: 0, modeCap: 100,
      reasons: ['0%: no settled shadow evidence yet'],
    };
  }
  const longTermWinRate = evidence.wins / evidence.total;
  const recentWinRate = evidence.recentOutcomes.length === 0 ? 0 : mean(evidence.recentOutcomes);
  const wilson = wilsonLowerBound(evidence.wins, evidence.total);
  const bayesian = bayesianLowerBound(evidence.wins, evidence.total);
  const brier = evidence.brierTotal / evidence.total;
  const calibrationScore = clamp(1 - brier / 0.5);
  const similarContextSuccess = evidence.contextTotal < 5
    ? 0.5
    : (evidence.contextWins + 2) / (evidence.contextTotal + 4);
  const sampleSizeCap = clamp(evidence.total / Math.max(1, inputs.minimumSamples));
  const verifiedEvidence = clamp(
    0.28 * wilson
    + 0.18 * bayesian
    + 0.16 * recentWinRate
    + 0.1 * longTermWinRate
    + 0.1 * calibrationScore
    + 0.1 * inputs.agreement
    + 0.08 * similarContextSuccess,
  );
  const driftPenalty = inputs.driftSeverity === 'SEVERE'
    ? 22 + inputs.driftScore * 8
    : inputs.driftSeverity === 'WATCH' ? 6 + inputs.driftScore * 5 : 0;
  const lossPenalty = evidence.consecutiveLosses * 7 + (evidence.consecutiveLosses >= 3 ? 12 : 0);
  const calibrationPenalty = Math.max(0, (0.18 - calibrationScore) * 35);
  let value = 100 * verifiedEvidence * sampleSizeCap * clamp(inputs.regimeStability, 0.25, 1)
    - driftPenalty - lossPenalty - calibrationPenalty;
  let modeCap = 100;
  if (inputs.mode === 'COOLDOWN' || inputs.driftSeverity === 'SEVERE' || evidence.consecutiveLosses >= 3) modeCap = 49;
  else if (inputs.mode === 'RECOVERY') modeCap = Math.min(69, inputs.activeThreshold - 1);
  else if (inputs.mode === 'QUALIFYING') modeCap = Math.max(0, inputs.activeThreshold - 0.1);
  value = clamp(value, 0, modeCap);
  const rounded = Math.round(value * 10) / 10;
  const delta = Math.round((rounded - evidence.lastConfidence) * 10) / 10;
  const reasons = [
    `${delta >= 0 ? '+' : ''}${delta.toFixed(1)}%: ${delta >= 0 ? 'verified evidence improved' : 'evidence or penalties weakened'}`,
    `${evidence.total}/${inputs.minimumSamples} exact strategy-target shadow samples`,
    `${(wilson * 100).toFixed(1)}% Wilson lower bound`,
  ];
  if (lossPenalty > 0) reasons.push(`-${lossPenalty.toFixed(1)}%: consecutive-loss penalty`);
  if (driftPenalty > 0) reasons.push(`-${driftPenalty.toFixed(1)}%: regime drift penalty`);
  if (modeCap < 100) reasons.push(`Capped at ${modeCap.toFixed(0)}%: ${inputs.mode.toLowerCase().replace('_', ' ')} active`);
  return {
    value: rounded,
    previousValue: evidence.lastConfidence,
    delta,
    verifiedEvidence,
    sampleSizeCap,
    wilsonLowerBound: wilson,
    bayesianLowerBound: bayesian,
    recentWinRate,
    longTermWinRate,
    ensembleAgreement: inputs.agreement,
    regimeStability: inputs.regimeStability,
    similarContextSuccess,
    driftPenalty,
    lossPenalty,
    calibrationPenalty,
    modeCap,
    reasons,
  };
}
