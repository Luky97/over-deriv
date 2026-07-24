import { buildFeatureSnapshot } from '@/lib/research/features';
import { createEvidenceState, updateEvidence, computeConfidence } from '@/lib/research/confidence';
import type { EvidenceState } from '@/lib/research/confidence';
import { DriftDetector, emptyDriftState } from '@/lib/research/drift';
import { FormulaLab } from '@/lib/research/formula-lab';
import { StrategyLab, createDefaultStrategies } from '@/lib/research/strategy-lab';
import { AdaptiveEnsemble } from '@/lib/research/ensemble';
import { createContractResult, createRound, evaluateRoundStatus, invalidateRound } from '@/lib/research/round-engine';
import { baselineProbabilities } from '@/lib/research/models';
import type { MarketTick, FeatureSnapshot, ResearchSettings, FrozenPrediction, VirtualContract, VirtualRound, LearningMode, SchedulerPhase, ConfidenceBreakdown, DriftState, StrategyDefinition, FormulaCandidate, PerformanceMetrics, PredictionTarget, MarketResearchView, RegimeLabel, ExecutionKind } from '@/lib/types';

export interface ResearchEngineState {
  market: string; settings: ResearchSettings;
  ensemble: AdaptiveEnsemble; driftDetector: DriftDetector;
  formulaLab: FormulaLab; strategyLab: StrategyLab;
  evidence: Record<string, EvidenceState>;
  metrics: PerformanceMetrics;
  currentRound: VirtualRound | null; pendingPrediction: FrozenPrediction | null;
  recentRounds: VirtualRound[];
  schedulerPhase: SchedulerPhase; learningMode: LearningMode;
  cooldownRemaining: number; recoverySettlements: number;
  globalConsecutiveLosses: number; roundCounter: number; predictionCounter: number;
  lastProcessedTickKey: string | null; historicalBootstrapComplete: boolean;
  latestFeatures: FeatureSnapshot | null; latestDrift: DriftState;
  latestRecommendation: FrozenPrediction | null; latestConfidence: ConfidenceBreakdown;
}

export function createResearchEngine(market: string, settings: ResearchSettings): ResearchEngineState {
  return { market, settings: { ...settings }, ensemble: new AdaptiveEnsemble(), driftDetector: new DriftDetector(), formulaLab: new FormulaLab(), strategyLab: new StrategyLab(createDefaultStrategies()), evidence: {}, metrics: { shadow: { total: 0, wins: 0, losses: 0, winRate: 0 }, activeVirtual: { total: 0, wins: 0, losses: 0, winRate: 0 }, trainingUpdates: 0, forwardEvaluations: 0 }, currentRound: null, pendingPrediction: null, recentRounds: [], schedulerPhase: 'WAITING', learningMode: 'COLLECTING', cooldownRemaining: 0, recoverySettlements: 0, globalConsecutiveLosses: 0, roundCounter: 0, predictionCounter: 0, lastProcessedTickKey: null, historicalBootstrapComplete: false, latestFeatures: null, latestDrift: emptyDriftState(), latestRecommendation: null, latestConfidence: { value: 0, previousValue: 0, delta: 0, verifiedEvidence: 0, recentWinRate: 0, longTermWinRate: 0, ensembleAgreement: 0, regimeStability: 0, similarContextSuccess: 0, driftPenalty: 0, lossPenalty: 0, calibrationPenalty: 0, reasons: ['No evidence'] } };
}

export function processTick(state: ResearchEngineState, input: { tick: MarketTick; settings: ResearchSettings; continuityGap: boolean; gapReason?: string | null }): { view: MarketResearchView; contract?: VirtualContract; completedRound?: VirtualRound; changed: boolean } {
  if (input.tick.key === state.lastProcessedTickKey) return { view: buildView(state, true), changed: false };
  state.lastProcessedTickKey = input.tick.key;
  let completedRound: VirtualRound | undefined;
  let settledContract: VirtualContract | undefined;
  if (input.continuityGap) {
    const reason = input.gapReason ?? 'Continuity gap';
    if (state.currentRound) completedRound = invalidateRound(state, state.currentRound, input.tick.epoch, reason);
    state.pendingPrediction = null; state.schedulerPhase = 'WAITING'; state.cooldownRemaining = Math.max(state.cooldownRemaining, 12);
  }
  if (state.historicalBootstrapComplete === false) return { view: buildView(state, true), changed: true };
  const snapshot = buildFeatureSnapshot(state.market, [input.tick]);
  state.latestFeatures = snapshot;
  state.latestDrift = state.driftDetector.update(snapshot, input.tick.digit);
  if (state.latestDrift.severity === 'SEVERE') {
    state.cooldownRemaining = Math.max(state.cooldownRemaining, 25);
    if (state.currentRound?.executionKind === 'ACTIVE_VIRTUAL') completedRound = invalidateRound(state, state.currentRound, input.tick.epoch, 'Severe drift');
  } else if (state.cooldownRemaining > 0) state.cooldownRemaining--;
  if (state.schedulerPhase === 'BUY' && state.currentRound && state.pendingPrediction) {
    settledContract = settlePrediction(state, input.tick, state.pendingPrediction);
    state.pendingPrediction = null;
    const status = evaluateRoundStatus(state.currentRound, state.settings);
    state.currentRound.status = status;
    if (status !== 'IN_PROGRESS') {
      state.currentRound.completedAt = Date.now();
      state.metrics = recordRoundMetrics(state.metrics, state.currentRound);
      state.recentRounds.push(state.currentRound!);
      state.recentRounds = state.recentRounds.slice(-50);
      state.currentRound = null; state.schedulerPhase = 'WAITING';
      completedRound = state.recentRounds[state.recentRounds.length - 1];
    } else state.schedulerPhase = 'SKIP';
  }
  if (state.schedulerPhase === 'WAITING' && !state.currentRound) {
    if (input.tick.digit === state.settings.triggerDigit || (state.settings.triggerMode === 'AUTOMATIC' && state.latestConfidence.value >= state.settings.activeConfidenceThreshold)) startRound(state, input.tick);
  }
  if (state.schedulerPhase === 'SKIP' && state.currentRound && !state.pendingPrediction) {
    state.predictionCounter++;
    const key = `${state.currentRound.strategyId}:${state.currentRound.triggerType}`;
    const evidence = state.evidence[key] ?? createEvidenceState();
    state.pendingPrediction = { id: `${state.market}:pred:${input.tick.epoch}:${state.predictionCounter}`, market: state.market, frozenAtEpoch: snapshot.createdAtEpoch, target: 'EVEN', probability: evidence.total > 0 ? evidence.wins / evidence.total : 0.5, systemConfidence: state.latestConfidence.value, action: state.latestConfidence.value >= state.settings.activeConfidenceThreshold ? 'TRADE' : 'NO_TRADE', rejectionReasons: [], ensembleAgreement: 0.5, strategyId: state.currentRound.strategyId, strategyVersion: 1, modelVotes: [], modelVersions: {}, regime: snapshot.regime };
    state.schedulerPhase = 'BUY';
  }
  state.learningMode = determineMode(state);
  return { view: buildView(state, true), contract: settledContract, completedRound, changed: true };
}

function settlePrediction(state: ResearchEngineState, tick: MarketTick, pred: FrozenPrediction): VirtualContract {
  const contract = createContractResult(state, pred, tick.digit, tick.epoch);
  const won = contract.outcome === 'WIN';
  const key = `${pred.strategyId}:${pred.target}`;
  state.evidence[key] = updateEvidence(state.evidence[key] ?? createEvidenceState(), won, pred.probability, true);
  state.globalConsecutiveLosses = won ? 0 : state.globalConsecutiveLosses + 1;
  const bucket = contract.executionKind === 'ACTIVE_VIRTUAL' ? 'activeVirtual' : 'shadow';
  state.metrics[bucket].total++;
  if (won) state.metrics[bucket].wins++; else state.metrics[bucket].losses++;
  state.metrics[bucket].winRate = (state.metrics[bucket].wins / Math.max(1, state.metrics[bucket].total)) * 100;
  state.metrics.forwardEvaluations++;
  state.ensemble.update(pred.target, tick.digit, won);
  state.strategyLab.recordResult(pred.strategyId, won, pred.probability);
  state.driftDetector.recordPredictionError(!won);
  if (state.settings.formulaExperimentsEnabled && state.latestFeatures) state.formulaLab.update(state.latestFeatures, tick.digit);
  state.latestConfidence = computeConfidence(state.evidence[key], state.settings, state.latestDrift);
  return contract;
}

function startRound(state: ResearchEngineState, tick: MarketTick): void {
  const strategies = state.strategyLab.getStrategies();
  const champ = strategies.find(s => s.status === 'CHAMPION') ?? strategies[0];
  const mayBeActive = state.learningMode === 'ACTIVE_VIRTUAL';
  state.roundCounter++;
  state.currentRound = createRound({ id: `${state.market}:round:${state.roundCounter}:${tick.epoch}`, roundNumber: state.roundCounter, market: state.market, executionKind: mayBeActive ? 'ACTIVE_VIRTUAL' : 'SHADOW', triggerType: state.settings.triggerMode, triggerDigit: state.settings.triggerMode === 'DIGIT' ? state.settings.triggerDigit : undefined, triggerEpoch: tick.epoch, triggerTickDigit: tick.digit, strategyId: champ.id });
  state.schedulerPhase = 'SKIP';
}

function determineMode(state: ResearchEngineState): LearningMode {
  if (state.cooldownRemaining > 0 || state.latestDrift.severity === 'SEVERE' || state.globalConsecutiveLosses >= 3) return 'COOLDOWN';
  const totalEv = Object.values(state.evidence).reduce((s, e) => s + e.total, 0);
  if (totalEv < state.settings.minimumShadowSamples) return 'SILENT_LEARNING';
  if (state.latestConfidence.value < state.settings.activeConfidenceThreshold) return 'QUALIFYING';
  return 'ACTIVE_VIRTUAL';
}

function buildView(state: ResearchEngineState, restored: boolean): MarketResearchView {
  const strategies = state.strategyLab.getStrategies();
  const champ = strategies.find(s => s.status === 'CHAMPION') ?? strategies[0];
  const evByTarget: Record<PredictionTarget, number> = { EVEN: 0, ODD: 0, OVER_3: 0, UNDER_7: 0 };
  for (const s of strategies) for (const t of ['EVEN','ODD','OVER_3','UNDER_7'] as PredictionTarget[]) evByTarget[t] += state.evidence[`${s.id}:${t}`]?.total ?? 0;
  return { market: state.market, learningMode: state.learningMode, regime: state.latestFeatures?.regime ?? 'UNSTABLE', confidence: state.latestConfidence, recommendation: state.latestRecommendation, currentRound: state.currentRound ? { ...state.currentRound } : null, recentRounds: [...state.recentRounds].reverse().slice(0, 20), schedulerPhase: state.schedulerPhase, features: state.latestFeatures, drift: state.latestDrift, strategies: strategies.map(s => ({ ...s })), championStrategyId: champ.id, formulas: state.formulaLab.list(), metrics: { ...state.metrics }, shadowEvidenceByTarget: evByTarget, cooldownRemaining: state.cooldownRemaining, stateRestored: restored, persistenceError: null };
}

function recordRoundMetrics(metrics: PerformanceMetrics, round: VirtualRound): PerformanceMetrics {
  const bucket = round.executionKind === 'ACTIVE_VIRTUAL' ? 'activeVirtual' : 'shadow';
  return { ...metrics, [bucket]: { ...metrics[bucket], total: metrics[bucket].total + 1, wins: metrics[bucket].wins + (round.status === 'ROUND_WIN' ? 1 : 0), losses: metrics[bucket].losses + (round.status === 'ROUND_LOSS' ? 1 : 0) } };
}
