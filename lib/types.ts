import type { ActiveSymbol, Tick } from '@deriv/core';

export type { ActiveSymbol, Tick } from '@deriv/core';

export const SUPPORTED_MARKET_IDS = ['R_10', 'R_25', 'R_50', 'R_75', 'R_100'] as const;
export type SupportedMarketId = (typeof SUPPORTED_MARKET_IDS)[number];
export const WINDOW_SIZES = [20, 50, 100, 250, 500, 1000] as const;
export type WindowSize = (typeof WINDOW_SIZES)[number];
export const PREDICTION_TARGETS = ['EVEN', 'ODD', 'OVER_3', 'UNDER_7'] as const;
export type PredictionTarget = (typeof PREDICTION_TARGETS)[number];

export type ConnectionState = 'connected' | 'connecting' | 'reconnecting' | 'offline';
export type MarketConnectionState = ConnectionState | 'error';
export type TriggerMode = 'DIGIT' | 'AUTOMATIC';
export type LearningMode =
  | 'COLLECTING'
  | 'SILENT_LEARNING'
  | 'QUALIFYING'
  | 'ACTIVE_VIRTUAL'
  | 'COOLDOWN'
  | 'RECOVERY';
export type RegimeLabel =
  | 'EVEN_DOMINANT'
  | 'ODD_DOMINANT'
  | 'OVER3_DOMINANT'
  | 'UNDER7_DOMINANT'
  | 'MIXED'
  | 'HIGH_ENTROPY'
  | 'LOW_ENTROPY'
  | 'TRANSITION'
  | 'UNSTABLE';
export type StrategyStatus =
  | 'EXPERIMENTAL'
  | 'SHADOW_TESTING'
  | 'CHALLENGER'
  | 'CHAMPION'
  | 'PAUSED'
  | 'RETIRED';
export type ExecutionKind = 'SHADOW' | 'ACTIVE_VIRTUAL' | 'FORMULA_EXPERIMENT';
export type RoundStatus = 'IN_PROGRESS' | 'ROUND_WIN' | 'ROUND_LOSS' | 'INVALIDATED';
export type SchedulerPhase = 'WAITING' | 'SKIP' | 'BUY' | 'COMPLETE';
export type DriftSeverity = 'NONE' | 'WATCH' | 'SEVERE';
export type LogCategory =
  | 'TICK'
  | 'PREDICTION'
  | 'SKIP'
  | 'CONTRACT'
  | 'ROUND'
  | 'MODEL'
  | 'CONFIDENCE'
  | 'DRIFT'
  | 'STRATEGY'
  | 'CONNECTION'
  | 'STORAGE'
  | 'ERROR';

export interface MarketTick {
  epoch: number;
  quote: number;
  digit: number;
  pipSize: number;
  key: string;
  source: 'history' | 'live';
}

export interface MarketContinuity {
  status: 'SYNCED' | 'PARTIAL' | 'GAP' | 'RESYNCING';
  duplicateCount: number;
  lastGapEpoch: number | null;
  lastGapReason: string | null;
  resyncedAtEpoch: number | null;
}

export interface MarketTickState {
  symbol: ActiveSymbol;
  connectionState: MarketConnectionState;
  ticks: MarketTick[];
  currentTick: Tick | null;
  currentQuote: number | null;
  lastDigit: number | null;
  pipSize: number;
  sessionKey: string;
  continuity: MarketContinuity;
  isLoading: boolean;
  error: string | null;
}

export interface RankGroup {
  digits: number[];
  count: number;
  percentage: number;
}

export interface DigitRankings {
  most: RankGroup;
  secondMost: RankGroup;
  least: RankGroup;
  secondLeast: RankGroup;
  rankByDigit: number[];
  concentration: number;
  spreadPercentagePoints: number;
}

export interface WindowFeatures {
  size: number;
  counts: number[];
  percentages: number[];
  zScores: number[];
  rankings: DigitRankings;
  evenPercentage: number;
  oddPercentage: number;
  over3Percentage: number;
  under7Percentage: number;
  entropy: number;
  chiSquare: number;
}

export interface TransitionTable {
  labels: string[];
  counts: number[][];
  probabilities: number[][];
}

export interface SequenceFeatures {
  previousDigits: Record<'1' | '2' | '3' | '5' | '10' | '20', number[]>;
  firstOrderDigit: number[][];
  secondOrderDigit: Record<string, number[]>;
  parityFirstOrder: TransitionTable;
  paritySecondOrder: Record<string, [number, number]>;
  over3Transition: TransitionTable;
  under7Transition: TransitionTable;
  repeatingPairs: number;
  repeatingTriplets: number;
  currentDigitRun: number;
  alternationRate: number;
  modularDifferences: number[];
  distanceMean: number;
  ngramOccurrences: Record<string, number>;
  autocorrelation: Record<string, number>;
}

export interface QuoteFeatures {
  current: number;
  difference: number;
  absoluteDifference: number;
  direction: 'UP' | 'DOWN' | 'FLAT';
  directionStreak: number;
  normalizedReturn: number;
  rollingMean: number;
  rollingStandardDeviation: number;
  shortVolatility: number;
  longVolatility: number;
  movementSpeed: number;
  movementAcceleration: number;
  distanceFromMean: number;
  volatilityChange: number;
  pipNormalizedChange: number;
}

export interface RandomnessFeatures {
  shannonEntropy: number;
  parityEntropy: number;
  transitionEntropy: number;
  jensenShannon20To1000: number;
  jensenShannon50To1000: number;
  chiSquareUniform: number;
  patternPersistence: number;
  regimeStability: number;
  driftScore: number;
}

export interface TimeFeatures {
  serverSecond: number;
  serverMinute: number;
  serverHour: number;
  secondSin: number;
  secondCos: number;
  minuteSin: number;
  minuteCos: number;
  hourSin: number;
  hourCos: number;
  tickModulo: Record<string, number>;
}

export interface FeatureSnapshot {
  schemaVersion: 2;
  id: string;
  market: string;
  createdAtEpoch: number;
  sourceLastEpoch: number;
  resultOffsetFromTrigger: 2;
  resultOffsetFromSnapshot: 1;
  sampleSize: number;
  windows: Record<WindowSize, WindowFeatures>;
  frequencySlope: number[];
  frequencyAcceleration: number[];
  recentLongDifference: number[];
  rankMomentum: number[];
  parityImbalance: number;
  parityMomentum: number;
  parityStreak: number;
  maximumParityStreak: number;
  over3Streak: number;
  under7Streak: number;
  over3Momentum: number;
  under7Momentum: number;
  sequence: SequenceFeatures;
  quote: QuoteFeatures;
  randomness: RandomnessFeatures;
  time: TimeFeatures;
  regime: RegimeLabel;
  featureNames: string[];
  vector: number[];
}

export interface ModelPerformance {
  evidence: number;
  correct: number;
  recentAccuracy: number;
  brierScore: number;
  calibrationScore: number;
  regimeCompatibility: number;
  weight: number;
}

export interface ModelVote extends ModelPerformance {
  modelId: string;
  probability: number;
  version: number;
}

export interface ConfidenceBreakdown {
  value: number;
  previousValue: number;
  delta: number;
  verifiedEvidence: number;
  sampleSizeCap: number;
  wilsonLowerBound: number;
  bayesianLowerBound: number;
  recentWinRate: number;
  longTermWinRate: number;
  ensembleAgreement: number;
  regimeStability: number;
  similarContextSuccess: number;
  driftPenalty: number;
  lossPenalty: number;
  calibrationPenalty: number;
  modeCap: number;
  reasons: string[];
}

export interface FrozenPrediction {
  id: string;
  market: string;
  frozenAtEpoch: number;
  triggerEpoch: number;
  resultOffsetFromTrigger: 2;
  target: PredictionTarget;
  targetProbabilities: Record<PredictionTarget, number>;
  probability: number;
  systemConfidence: number;
  action: 'TRADE' | 'NO_TRADE';
  rejectionReasons: string[];
  ensembleAgreement: number;
  strategyId: string;
  strategyVersion: number;
  modelVotes: ModelVote[];
  modelVersions: Record<string, number>;
  regime: RegimeLabel;
  featureSnapshot: FeatureSnapshot;
  metaProbability: number;
}

export interface VirtualContractResult {
  id: string;
  market: string;
  roundId: string;
  executionKind: ExecutionKind;
  prediction: FrozenPrediction;
  actualDigit: number;
  resultEpoch: number;
  outcome: 'WIN' | 'LOSS' | 'INVALIDATED';
  settledAt: number;
}

export interface TimelineEvent {
  id: string;
  epoch: number;
  stage:
    | 'WAITING'
    | 'TRIGGER'
    | 'SKIP'
    | 'PREDICTION_FROZEN'
    | 'VIRTUAL_BUY'
    | 'WIN'
    | 'LOSS'
    | 'ROUND_WIN'
    | 'ROUND_LOSS'
    | 'COOLDOWN'
    | 'INVALIDATED';
  digit?: number;
  detail: string;
}

export interface VirtualRound {
  id: string;
  roundNumber: number;
  market: string;
  executionKind: ExecutionKind;
  triggerType: TriggerMode;
  triggerDigit?: number;
  automaticTriggerReason?: string;
  triggerEpoch: number;
  triggerTickDigit: number;
  skippedTicks: Array<{ epoch: number; digit: number }>;
  contracts: VirtualContractResult[];
  status: RoundStatus;
  regime: RegimeLabel;
  strategyId: string;
  modelVersions: Record<string, number>;
  timeline: TimelineEvent[];
  startedAt: number;
  completedAt: number | null;
  invalidationReason?: string;
}

export interface ContractMetricBucket {
  total: number;
  wins: number;
  losses: number;
  winRate: number;
  currentStreak: number;
  maxWinStreak: number;
  maxLossStreak: number;
  brierScore: number;
}

export interface RoundMetricBucket {
  total: number;
  wins: number;
  losses: number;
  invalidated: number;
  winRate: number;
  averageContracts: number;
  earlyWins: number;
  earlyLossStops: number;
}

export interface PerformanceMetrics {
  shadow: ContractMetricBucket;
  activeVirtual: ContractMetricBucket;
  formulaExperiments: ContractMetricBucket;
  rounds: Record<'SHADOW' | 'ACTIVE_VIRTUAL' | 'FORMULA_EXPERIMENT', RoundMetricBucket>;
  byTarget: Record<PredictionTarget, ContractMetricBucket>;
  byRegime: Partial<Record<RegimeLabel, ContractMetricBucket>>;
  byTrigger: Record<TriggerMode, ContractMetricBucket>;
  trainingUpdates: number;
  forwardEvaluations: number;
}

export interface DriftState {
  severity: DriftSeverity;
  score: number;
  pageHinkley: number;
  cusumPositive: number;
  cusumNegative: number;
  adaptiveWindowDifference: number;
  distributionDivergence: number;
  errorRateChange: number;
  regimeChanged: boolean;
  reasons: string[];
}

export interface StrategyDefinition {
  id: string;
  name: string;
  version: number;
  status: StrategyStatus;
  windowSize: WindowSize;
  enabledTargets: PredictionTarget[];
  modelWeights: Record<string, number>;
  probabilityFloor: number;
  agreementFloor: number;
  allowedRegimes: RegimeLabel[];
  featureSubset: 'FULL' | 'DIGITS' | 'SEQUENCE' | 'MOVEMENT';
  evidence: number;
  wins: number;
  brierScore: number;
  ucbScore: number;
  wilsonLowerBound: number;
  promotionReason: string;
}

export type FormulaOperator =
  | 'LAG'
  | 'ADD_MOD_10'
  | 'SUB_MOD_10'
  | 'ABS_DIFF_MOD_10'
  | 'QUOTE_DIFF_MOD_10'
  | 'TIME_MOD_10'
  | 'RANK_MOST'
  | 'RANK_LEAST';

export interface FormulaCandidate {
  id: string;
  label: string;
  operator: FormulaOperator;
  lagA: number;
  lagB?: number;
  period?: number;
  status:
    | 'PROMISING_EXPERIMENTAL_FORMULA'
    | 'UNDER_SHADOW_VALIDATION'
    | 'REJECTED'
    | 'NO_RELIABLE_FORMULA';
  trainingSamples: number;
  validationSamples: number;
  validationCorrect: number;
  validationAccuracy: number;
  wilsonLowerBound: number;
  reason: string;
}

export interface ResearchLog {
  id: string;
  market: string;
  category: LogCategory;
  epoch: number;
  message: string;
  details?: Record<string, string | number | boolean | null>;
}

export interface ResearchSettings {
  enabledMarkets: SupportedMarketId[];
  triggerMode: TriggerMode;
  triggerDigit: number;
  activeConfidenceThreshold: number;
  minimumShadowSamples: number;
  maximumContractsPerRound: 5;
  requiredWins: 4;
  consecutiveLossStop: 3;
  enabledTargets: Record<PredictionTarget, boolean>;
  formulaExperimentsEnabled: boolean;
  automaticChallengersEnabled: boolean;
  maximumStoredLogs: number;
  maximumStoredRounds: number;
  maximumContextMemory: number;
}

export interface MarketResearchView {
  market: string;
  learningMode: LearningMode;
  regime: RegimeLabel;
  confidence: ConfidenceBreakdown;
  recommendation: FrozenPrediction | null;
  currentRound: VirtualRound | null;
  recentRounds: VirtualRound[];
  schedulerPhase: SchedulerPhase;
  timeline: TimelineEvent[];
  features: FeatureSnapshot | null;
  drift: DriftState;
  strategies: StrategyDefinition[];
  championStrategyId: string;
  formulas: FormulaCandidate[];
  metrics: PerformanceMetrics;
  logs: ResearchLog[];
  shadowEvidenceByTarget: Record<PredictionTarget, number>;
  modelSummaries: Array<ModelPerformance & { modelId: string; version: number }>;
  cooldownRemaining: number;
  stateRestored: boolean;
  persistenceError: string | null;
}

export interface ResearchExport {
  format: 'adaptive-digit-research';
  schemaVersion: 2;
  exportedAt: string;
  settings: ResearchSettings;
  markets: unknown[];
  rounds: VirtualRound[];
  contracts: VirtualContractResult[];
  logs: ResearchLog[];
}

export function createDefaultSettings(): ResearchSettings {
  return {
    enabledMarkets: [...SUPPORTED_MARKET_IDS],
    triggerMode: 'DIGIT',
    triggerDigit: 1,
    activeConfidenceThreshold: 80,
    minimumShadowSamples: 50,
    maximumContractsPerRound: 5,
    requiredWins: 4,
    consecutiveLossStop: 3,
    enabledTargets: { EVEN: true, ODD: true, OVER_3: true, UNDER_7: true },
    formulaExperimentsEnabled: true,
    automaticChallengersEnabled: true,
    maximumStoredLogs: 2_000,
    maximumStoredRounds: 250,
    maximumContextMemory: 300,
  };
}

export function marketDisplayName(symbol: ActiveSymbol): string {
  return symbol.underlying_symbol_name || symbol.underlying_symbol;
}
