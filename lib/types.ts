import type { z } from 'zod';

export const SUPPORTED_MARKET_SYMBOLS = ['R_10', 'R_25', 'R_50', 'R_75', 'R_100'] as const;
export type SupportedMarketSymbol = (typeof SUPPORTED_MARKET_SYMBOLS)[number];

export interface MarketTick {
  epoch: number;
  quote: number;
  digit: number;
  pipSize: number;
  key: string;
  source: 'history' | 'live';
}

export type ConnectionState = 'connected' | 'connecting' | 'reconnecting' | 'offline';
export type MarketConnectionState = ConnectionState | 'error';

export interface MarketContinuity {
  status: 'SYNCED' | 'PARTIAL' | 'GAP' | 'RESYNCING';
  duplicateCount: number;
  lastGapEpoch: number | null;
  lastGapReason: string | null;
  resyncedAtEpoch: number | null;
}

export type PredictionTarget = 'EVEN' | 'ODD' | 'OVER_3' | 'UNDER_7';
export type RegimeLabel =
  | 'EVEN_DOMINANT' | 'ODD_DOMINANT' | 'OVER3_DOMINANT' | 'UNDER7_DOMINANT'
  | 'MIXED' | 'HIGH_ENTROPY' | 'LOW_ENTROPY' | 'TRANSITION' | 'UNSTABLE';
export type LearningMode = 'COLLECTING' | 'SILENT_LEARNING' | 'QUALIFYING' | 'ACTIVE_VIRTUAL' | 'COOLDOWN' | 'RECOVERY';
export type SchedulerPhase = 'WAITING' | 'SKIP' | 'BUY' | 'COMPLETE';
export type TriggerMode = 'DIGIT' | 'AUTOMATIC';
export type StrategyStatus = 'EXPERIMENTAL' | 'SHADOW_TESTING' | 'CHALLENGER' | 'CHAMPION' | 'PAUSED' | 'RETIRED';
export type ExecutionKind = 'SHADOW' | 'ACTIVE_VIRTUAL' | 'FORMULA_EXPERIMENT';
export type RoundStatus = 'IN_PROGRESS' | 'ROUND_WIN' | 'ROUND_LOSS' | 'INVALIDATED';
export type DriftSeverity = 'NONE' | 'WATCH' | 'SEVERE';
export type ContractType = 'DIGITEVEN' | 'DIGITODD' | 'DIGITOVER' | 'DIGITUNDER';

export interface WindowFeatures {
  size: number;
  counts: number[];
  percentages: number[];
  evenPercentage: number;
  oddPercentage: number;
  over3Percentage: number;
  under7Percentage: number;
  entropy: number;
}

export interface SequenceFeatures {
  previousDigits: Record<'1' | '2' | '3' | '5' | '10' | '20', number[]>;
  firstOrderDigit: number[][];
  parityFirstOrder: { labels: string[]; counts: number[][]; probabilities: number[][] };
  ngramOccurrences: Record<string, number>;
}

export interface FeatureSnapshot {
  schemaVersion: number;
  id: string;
  market: string;
  createdAtEpoch: number;
  sampleSize: number;
  windows: Record<string, WindowFeatures>;
  parityImbalance: number;
  sequence: SequenceFeatures;
  regime: RegimeLabel;
  featureNames: string[];
  vector: number[];
  randomness: { regimeStability: number; shannonEntropy: number };
}

export interface ConfidenceBreakdown {
  value: number;
  previousValue: number;
  delta: number;
  verifiedEvidence: number;
  recentWinRate: number;
  longTermWinRate: number;
  ensembleAgreement: number;
  regimeStability: number;
  similarContextSuccess: number;
  driftPenalty: number;
  lossPenalty: number;
  calibrationPenalty: number;
  reasons: string[];
}

export interface ModelVote {
  modelId: string;
  probability: number;
  agreement: number;
  weight: number;
}

export interface FrozenPrediction {
  id: string;
  market: string;
  frozenAtEpoch: number;
  target: PredictionTarget;
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
}

export interface VirtualContract {
  id: string;
  market: string;
  contractType: ContractType;
  prediction: PredictionTarget;
  confidence: number;
  predictionEpoch: number;
  settlementEpoch: number;
  actualDigit: number;
  outcome: 'WIN' | 'LOSS' | 'INVALIDATED';
  strategyId: string;
  roundId: string;
  executionKind: ExecutionKind;
}

export interface VirtualRound {
  id: string;
  roundNumber: number;
  market: string;
  executionKind: ExecutionKind;
  triggerType: TriggerMode;
  triggerDigit?: number;
  triggerEpoch: number;
  triggerTickDigit: number;
  contracts: VirtualContract[];
  status: RoundStatus;
  strategyId: string;
  startedAt: number;
  completedAt: number | null;
  invalidationReason?: string;
}

export interface StrategyDefinition {
  id: string;
  name: string;
  version: number;
  status: StrategyStatus;
  windowSize: number;
  enabledTargets: PredictionTarget[];
  probabilityFloor: number;
  agreementFloor: number;
  allowedRegimes: RegimeLabel[];
  evidence: number;
  wins: number;
  brierScore: number;
  promotionReason: string;
}

export interface DriftState {
  severity: DriftSeverity;
  score: number;
  regimeChanged: boolean;
  reasons: string[];
}

export interface FormulaCandidate {
  id: string;
  label: string;
  status: 'PROMISING_EXPERIMENTAL_FORMULA' | 'UNDER_SHADOW_VALIDATION' | 'REJECTED' | 'NO_RELIABLE_FORMULA';
  validationAccuracy: number;
  wilsonLowerBound: number;
  validationSamples: number;
  validationCorrect: number;
  trainingSamples: number;
  reason: string;
}

export interface ContractMetricBucket {
  total: number;
  wins: number;
  losses: number;
  winRate: number;
}

export interface PerformanceMetrics {
  shadow: ContractMetricBucket;
  activeVirtual: ContractMetricBucket;
  trainingUpdates: number;
  forwardEvaluations: number;
}

export interface ResearchSettings {
  enabledMarkets: SupportedMarketSymbol[];
  triggerMode: TriggerMode;
  triggerDigit: number;
  activeConfidenceThreshold: number;
  minimumShadowSamples: number;
  maximumContractsPerRound: number;
  requiredWins: number;
  consecutiveLossStop: number;
  enabledTargets: Record<PredictionTarget, boolean>;
  formulaExperimentsEnabled: boolean;
  automaticChallengersEnabled: boolean;
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
  features: FeatureSnapshot | null;
  drift: DriftState;
  strategies: StrategyDefinition[];
  championStrategyId: string;
  formulas: FormulaCandidate[];
  metrics: PerformanceMetrics;
  shadowEvidenceByTarget: Record<PredictionTarget, number>;
  cooldownRemaining: number;
  stateRestored: boolean;
  persistenceError: string | null;
}

export interface CompactCloudCheckpoint {
  version: number;
  symbol: string;
  savedAt: string;
  continuity: {
    lastProcessedEpoch: number | null;
    lastProcessedQuote: number | null;
    lastProcessedDigit: number | null;
    totalTicksProcessed: number;
  };
  modelParameters: Record<string, unknown>;
  normalizationState: Record<string, unknown>;
  transitionState: Record<string, unknown>;
  confidenceState: Record<string, unknown>;
  regimeState: Record<string, unknown>;
  strategyState: Record<string, unknown>;
  formulaState: Record<string, unknown>;
  aggregateMetrics: Record<string, unknown>;
  schedulerState: Record<string, unknown>;
  activeRound: Record<string, unknown> | null;
  recentContextDigits: number[];
}

export interface CloudSyncStatus {
  configured: boolean;
  connected: boolean;
  signedIn: boolean;
  email: string | null;
  deviceId: string;
  lastLocalSave: number | null;
  lastCloudSave: number | null;
  nextScheduledSave: number | null;
  dirtyMarkets: string[];
  pendingEvents: number;
  checkpointSizes: Record<string, number>;
  revisions: Record<string, number>;
  leaseStatus: Record<string, string>;
  observerMarkets: string[];
  offline: boolean;
  circuitOpen: boolean;
  error: string | null;
}

export interface SyncError {
  name: string;
  code: string;
  message: string;
  details: string | null;
  hint: string | null;
  status: number | null;
  statusText: string | null;
  stage: 'configuration' | 'authentication' | 'preparation' | 'validation' | 'request' | 'conflict' | 'restore';
  symbol: string | null;
  payloadSizeKb: number | null;
}

export function createDefaultSettings(): ResearchSettings {
  return {
    enabledMarkets: [...SUPPORTED_MARKET_SYMBOLS],
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
  };
}
