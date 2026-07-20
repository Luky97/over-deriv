import { buildFeatureSnapshot } from '@/lib/features/engine';
import { clamp, mean } from '@/lib/features/statistics';
import { AdaptiveEnsemble, type EnsembleState } from '@/lib/ml/ensemble';
import {
  computeConfidence,
  createEvidenceState,
  updateEvidence,
  type EvidenceState,
} from '@/lib/ml/confidence';
import { DriftDetector, emptyDriftState, type SerializedDriftDetector } from '@/lib/ml/drift';
import { FormulaLab, type FormulaLabState } from '@/lib/ml/formula-lab';
import { baselineProbabilities } from '@/lib/ml/models';
import { NoTradeMetaModel, type NoTradeState, type TradeContext } from '@/lib/ml/no-trade-model';
import {
  advanceStrategyLifecycle,
  createDefaultStrategies,
  enabledStrategyTargets,
  selectLaboratoryStrategy,
  updateStrategyResult,
} from '@/lib/ml/strategy-lab';
import { createPerformanceMetrics, recordContract, recordRound } from '@/lib/metrics/performance';
import {
  createContractResult,
  createRound,
  evaluateRoundStatus,
  invalidateRound,
} from '@/lib/simulation/round-engine';
import type {
  ConfidenceBreakdown,
  DriftState,
  FeatureSnapshot,
  FrozenPrediction,
  LearningMode,
  MarketResearchView,
  MarketTick,
  PerformanceMetrics,
  PredictionTarget,
  ResearchLog,
  ResearchSettings,
  SchedulerPhase,
  StrategyDefinition,
  TimelineEvent,
  VirtualContractResult,
  VirtualRound,
} from '@/lib/types';

export interface ProcessMarketTickInput {
  tick: MarketTick;
  ticks: MarketTick[];
  sessionKey: string;
  continuityGap: boolean;
  gapReason?: string | null;
}

export interface ProcessMarketTickOutput {
  view: MarketResearchView;
  persisted: PersistedMarketEngine;
  contract?: VirtualContractResult;
  completedRound?: VirtualRound;
  changed: boolean;
}

export interface PersistedMarketEngine {
  schemaVersion: 2;
  market: string;
  savedAt: number;
  ensemble: EnsembleState;
  noTrade: NoTradeState;
  driftDetector: SerializedDriftDetector;
  formulaLab: FormulaLabState;
  evidence: Record<string, EvidenceState>;
  strategies: StrategyDefinition[];
  metrics: PerformanceMetrics;
  currentRound: VirtualRound | null;
  pendingPrediction: FrozenPrediction | null;
  recentRounds: VirtualRound[];
  schedulerPhase: SchedulerPhase;
  learningMode: LearningMode;
  cooldownRemaining: number;
  recoverySettlements: number;
  globalConsecutiveLosses: number;
  roundCounter: number;
  predictionCounter: number;
  lastProcessedTickKey: string | null;
  lastSessionKey: string | null;
  lastTimeline: TimelineEvent[];
  logs: ResearchLog[];
  historicalBootstrapComplete: boolean;
}

function zeroConfidence(): ConfidenceBreakdown {
  return {
    value: 0, previousValue: 0, delta: 0, verifiedEvidence: 0, sampleSizeCap: 0,
    wilsonLowerBound: 0, bayesianLowerBound: 0, recentWinRate: 0, longTermWinRate: 0,
    ensembleAgreement: 0, regimeStability: 0, similarContextSuccess: 0,
    driftPenalty: 0, lossPenalty: 0, calibrationPenalty: 0, modeCap: 100,
    reasons: ['0%: no settled shadow evidence yet'],
  };
}

function evidenceKey(strategyId: string, target: PredictionTarget): string {
  return `${strategyId}:${target}`;
}

function regimeSafe(snapshot: FeatureSnapshot): boolean {
  return snapshot.regime !== 'UNSTABLE' && snapshot.regime !== 'TRANSITION';
}

export class AdaptiveMarketEngine {
  private readonly market: string;
  private settings: ResearchSettings;
  private readonly ensemble: AdaptiveEnsemble;
  private readonly noTrade = new NoTradeMetaModel();
  private readonly driftDetector = new DriftDetector();
  private readonly formulaLab = new FormulaLab();
  private evidence: Record<string, EvidenceState> = {};
  private strategies = createDefaultStrategies();
  private metrics = createPerformanceMetrics();
  private currentRound: VirtualRound | null = null;
  private pendingPrediction: FrozenPrediction | null = null;
  private recentRounds: VirtualRound[] = [];
  private schedulerPhase: SchedulerPhase = 'WAITING';
  private learningMode: LearningMode = 'COLLECTING';
  private cooldownRemaining = 0;
  private recoverySettlements = 0;
  private globalConsecutiveLosses = 0;
  private roundCounter = 0;
  private predictionCounter = 0;
  private lastProcessedTickKey: string | null = null;
  private lastSessionKey: string | null = null;
  private lastTimeline: TimelineEvent[] = [];
  private logs: ResearchLog[] = [];
  private historicalBootstrapComplete = false;
  private latestFeatures: FeatureSnapshot | null = null;
  private latestDrift: DriftState = emptyDriftState();
  private latestRecommendation: FrozenPrediction | null = null;
  private latestConfidence: ConfidenceBreakdown = zeroConfidence();

  constructor(market: string, settings: ResearchSettings, restored?: PersistedMarketEngine) {
    this.market = market;
    this.settings = settings;
    this.ensemble = new AdaptiveEnsemble(settings.maximumContextMemory);
    if (restored?.schemaVersion === 2 && restored.market === market) this.restore(restored);
  }

  updateSettings(settings: ResearchSettings): void {
    this.settings = settings;
  }

  process(input: ProcessMarketTickInput): ProcessMarketTickOutput {
    if (input.tick.key === this.lastProcessedTickKey) {
      return { view: this.view(true), persisted: this.serialize(), changed: false };
    }
    let completedRound: VirtualRound | undefined;
    let settledContract: VirtualContractResult | undefined;
    const sessionChanged = this.lastSessionKey !== null && input.sessionKey !== this.lastSessionKey;
    if (sessionChanged || input.continuityGap) {
      const reason = input.gapReason
        ?? (sessionChanged ? 'Market session changed during public WebSocket resynchronization.' : 'Uncertain tick continuity.');
      if (this.currentRound) completedRound = this.invalidateCurrent(input.tick.epoch, reason);
      this.pendingPrediction = null;
      this.schedulerPhase = 'WAITING';
      this.cooldownRemaining = Math.max(this.cooldownRemaining, 12);
      this.recoverySettlements = 0;
      this.log('CONNECTION', input.tick.epoch, `Continuity reset: ${reason}`);
    }
    this.lastSessionKey = input.sessionKey;
    this.lastProcessedTickKey = input.tick.key;

    if (input.ticks.length < 1000) {
      this.learningMode = 'COLLECTING';
      this.latestFeatures = input.ticks.length > 0 ? buildFeatureSnapshot(this.market, input.ticks) : null;
      return { view: this.view(true), persisted: this.serialize(), completedRound, changed: true };
    }

    if (!this.historicalBootstrapComplete) this.bootstrapHistory(input.ticks);
    const snapshot = buildFeatureSnapshot(this.market, input.ticks);
    this.latestFeatures = snapshot;
    this.latestDrift = this.driftDetector.update(snapshot);
    if (this.latestDrift.severity === 'SEVERE' || this.latestDrift.regimeChanged) {
      this.cooldownRemaining = Math.max(this.cooldownRemaining, this.latestDrift.severity === 'SEVERE' ? 25 : 12);
      this.recoverySettlements = 0;
      this.log('DRIFT', input.tick.epoch, `Drift ${this.latestDrift.severity.toLowerCase()}: ${this.latestDrift.reasons.join(', ') || 'change detector threshold reached'}`);
      if (this.currentRound?.executionKind === 'ACTIVE_VIRTUAL') {
        completedRound = this.invalidateCurrent(input.tick.epoch, 'Active virtual round stopped by regime transition.');
      }
    } else if (this.cooldownRemaining > 0) {
      this.cooldownRemaining -= 1;
    }

    if (this.schedulerPhase === 'BUY' && this.currentRound && this.pendingPrediction) {
      settledContract = this.settleCurrent(input.tick);
      const status = evaluateRoundStatus(this.currentRound.contracts, this.settings);
      this.currentRound.status = status;
      if (status !== 'IN_PROGRESS') {
        const stage = status === 'ROUND_WIN' ? 'ROUND_WIN' : 'ROUND_LOSS';
        this.currentRound.timeline.push(this.timeline(input.tick.epoch, stage, undefined, status.replace('_', ' ')));
        this.currentRound.completedAt = Date.now();
        if (status === 'ROUND_LOSS') {
          this.cooldownRemaining = Math.max(this.cooldownRemaining, 30);
          this.recoverySettlements = 1;
          this.currentRound.timeline.push(this.timeline(input.tick.epoch, 'COOLDOWN', undefined, 'Round loss started cooldown.'));
        }
        completedRound = this.completeCurrent();
      } else {
        this.pendingPrediction = null;
        this.schedulerPhase = 'SKIP';
      }
    } else if (this.schedulerPhase === 'SKIP' && this.currentRound) {
      this.currentRound.skippedTicks.push({ epoch: input.tick.epoch, digit: input.tick.digit });
      this.currentRound.timeline.push(this.timeline(
        input.tick.epoch,
        'SKIP',
        input.tick.digit,
        `Skipped tick before virtual contract ${this.currentRound.contracts.length + 1}.`,
      ));
      const strategy = this.strategies.find((candidate) => candidate.id === this.currentRound?.strategyId)
        ?? this.champion();
      this.pendingPrediction = this.createPrediction(snapshot, strategy, this.currentRound.triggerEpoch, false);
      this.currentRound.timeline.push(this.timeline(
        input.tick.epoch,
        'PREDICTION_FROZEN',
        input.tick.digit,
        `${this.pendingPrediction.target} frozen for the following tick; snapshot ${snapshot.id}.`,
      ));
      this.schedulerPhase = 'BUY';
      this.log('PREDICTION', input.tick.epoch, `Frozen ${this.pendingPrediction.target} at ${(this.pendingPrediction.probability * 100).toFixed(1)}%.`);
    } else if (this.schedulerPhase === 'WAITING') {
      this.refreshRecommendation(snapshot);
      const trigger = this.shouldTrigger(input.tick);
      if (trigger.triggered) this.startRound(input.tick, trigger.reason);
    } else if (this.schedulerPhase === 'COMPLETE') {
      this.schedulerPhase = 'WAITING';
    }

    this.refreshRecommendation(snapshot);
    return {
      view: this.view(true),
      persisted: this.serialize(),
      contract: settledContract,
      completedRound,
      changed: true,
    };
  }

  invalidateForGap(epoch: number, reason: string): ProcessMarketTickOutput {
    const completedRound = this.currentRound ? this.invalidateCurrent(epoch, reason) : undefined;
    this.cooldownRemaining = Math.max(this.cooldownRemaining, 12);
    this.learningMode = 'COOLDOWN';
    this.log('ERROR', epoch, reason);
    return { view: this.view(true), persisted: this.serialize(), completedRound, changed: true };
  }

  view(restored = true): MarketResearchView {
    return {
      market: this.market,
      learningMode: this.learningMode,
      regime: this.latestFeatures?.regime ?? 'UNSTABLE',
      confidence: this.latestConfidence,
      recommendation: this.latestRecommendation,
      currentRound: this.currentRound ? structuredClone(this.currentRound) : null,
      recentRounds: structuredClone(this.recentRounds.slice(-20).reverse()),
      schedulerPhase: this.schedulerPhase,
      timeline: structuredClone((this.currentRound?.timeline ?? this.lastTimeline).slice(-30)),
      features: this.latestFeatures,
      drift: this.latestDrift,
      strategies: structuredClone(this.strategies),
      championStrategyId: this.champion().id,
      formulas: this.formulaLab.list(),
      metrics: structuredClone(this.metrics),
      logs: structuredClone(this.logs.slice(-250).reverse()),
      shadowEvidenceByTarget: Object.fromEntries((['EVEN', 'ODD', 'OVER_3', 'UNDER_7'] as PredictionTarget[]).map((target) => [
        target,
        this.evidence[evidenceKey(this.champion().id, target)]?.total ?? 0,
      ])) as Record<PredictionTarget, number>,
      modelSummaries: this.ensemble.summaries(this.latestFeatures?.regime ?? 'UNSTABLE'),
      cooldownRemaining: this.cooldownRemaining,
      stateRestored: restored,
      persistenceError: null,
    };
  }

  serialize(): PersistedMarketEngine {
    return {
      schemaVersion: 2,
      market: this.market,
      savedAt: Date.now(),
      ensemble: this.ensemble.serialize(),
      noTrade: this.noTrade.serialize(),
      driftDetector: this.driftDetector.serialize(),
      formulaLab: this.formulaLab.serialize(),
      evidence: structuredClone(this.evidence),
      strategies: structuredClone(this.strategies),
      metrics: structuredClone(this.metrics),
      currentRound: this.currentRound ? structuredClone(this.currentRound) : null,
      pendingPrediction: this.pendingPrediction ? structuredClone(this.pendingPrediction) : null,
      recentRounds: structuredClone(this.recentRounds.slice(-this.settings.maximumStoredRounds)),
      schedulerPhase: this.schedulerPhase,
      learningMode: this.learningMode,
      cooldownRemaining: this.cooldownRemaining,
      recoverySettlements: this.recoverySettlements,
      globalConsecutiveLosses: this.globalConsecutiveLosses,
      roundCounter: this.roundCounter,
      predictionCounter: this.predictionCounter,
      lastProcessedTickKey: this.lastProcessedTickKey,
      lastSessionKey: this.lastSessionKey,
      lastTimeline: structuredClone(this.lastTimeline),
      logs: structuredClone(this.logs.slice(-this.settings.maximumStoredLogs)),
      historicalBootstrapComplete: this.historicalBootstrapComplete,
    };
  }

  private restore(restored: PersistedMarketEngine): void {
    this.ensemble.restore(restored.ensemble);
    this.noTrade.restore(restored.noTrade);
    this.driftDetector.restore(restored.driftDetector);
    this.formulaLab.restore(restored.formulaLab);
    this.evidence = restored.evidence ?? {};
    this.strategies = restored.strategies?.length ? restored.strategies : createDefaultStrategies();
    this.metrics = restored.metrics ?? createPerformanceMetrics();
    this.currentRound = restored.currentRound;
    this.pendingPrediction = restored.pendingPrediction;
    this.recentRounds = restored.recentRounds ?? [];
    this.schedulerPhase = restored.schedulerPhase ?? 'WAITING';
    this.learningMode = restored.learningMode ?? 'SILENT_LEARNING';
    this.cooldownRemaining = restored.cooldownRemaining ?? 0;
    this.recoverySettlements = restored.recoverySettlements ?? 0;
    this.globalConsecutiveLosses = restored.globalConsecutiveLosses ?? 0;
    this.roundCounter = restored.roundCounter ?? 0;
    this.predictionCounter = restored.predictionCounter ?? 0;
    this.lastProcessedTickKey = restored.lastProcessedTickKey ?? null;
    this.lastSessionKey = restored.lastSessionKey ?? null;
    this.lastTimeline = restored.lastTimeline ?? [];
    this.logs = restored.logs ?? [];
    this.historicalBootstrapComplete = restored.historicalBootstrapComplete ?? false;
  }

  private bootstrapHistory(ticks: readonly MarketTick[]): void {
    const start = Math.max(251, ticks.length - 90);
    for (let index = start; index < ticks.length; index += 1) {
      const training = buildFeatureSnapshot(this.market, ticks.slice(Math.max(0, index - 1000), index));
      this.ensemble.bootstrap(training, ticks[index].digit);
      this.metrics.trainingUpdates += 1;
    }
    this.historicalBootstrapComplete = true;
    this.log('MODEL', ticks[ticks.length - 1].epoch, `${ticks.length - start} chronological history samples warmed model parameters; not counted as forward evidence.`);
  }

  private refreshRecommendation(snapshot: FeatureSnapshot): void {
    const champion = this.champion();
    this.latestRecommendation = this.createPrediction(snapshot, champion, snapshot.createdAtEpoch, true);
  }

  private createPrediction(
    snapshot: FeatureSnapshot,
    strategy: StrategyDefinition,
    triggerEpoch: number,
    updateMode: boolean,
  ): FrozenPrediction {
    const targets = enabledStrategyTargets(strategy, this.settings.enabledTargets);
    const ensemble = this.ensemble.predict(snapshot, targets.length ? targets : ['EVEN'], strategy);
    const key = evidenceKey(strategy.id, ensemble.selectedTarget);
    const evidence = this.evidence[key] ?? createEvidenceState();
    const evidenceWithGlobalLosses = {
      ...evidence,
      consecutiveLosses: Math.max(evidence.consecutiveLosses, this.globalConsecutiveLosses),
    };
    const preliminaryMode = this.modeFor(evidence, 0);
    let confidence = computeConfidence({
      evidence: evidenceWithGlobalLosses,
      minimumSamples: this.settings.minimumShadowSamples,
      agreement: ensemble.agreement,
      regimeStability: snapshot.randomness.regimeStability,
      driftSeverity: this.latestDrift.severity,
      driftScore: this.latestDrift.score,
      mode: preliminaryMode,
      activeThreshold: this.settings.activeConfidenceThreshold,
    });
    const mode = this.modeFor(evidence, confidence.value);
    confidence = computeConfidence({
      evidence: evidenceWithGlobalLosses,
      minimumSamples: this.settings.minimumShadowSamples,
      agreement: ensemble.agreement,
      regimeStability: snapshot.randomness.regimeStability,
      driftSeverity: this.latestDrift.severity,
      driftScore: this.latestDrift.score,
      mode,
      activeThreshold: this.settings.activeConfidenceThreshold,
    });
    if (updateMode) {
      this.learningMode = mode;
      this.latestConfidence = confidence;
    }
    const base = baselineProbabilities()[ensemble.selectedTarget];
    const standardizedEdge = (ensemble.probability - base) / Math.sqrt(base * (1 - base));
    const context = this.tradeContext(
      ensemble.probability,
      standardizedEdge,
      ensemble.agreement,
      confidence,
      snapshot,
      evidence,
      base,
    );
    const metaProbability = this.noTrade.predict(context);
    const rejectionReasons: string[] = [];
    if (evidence.total < this.settings.minimumShadowSamples) rejectionReasons.push(`Needs ${this.settings.minimumShadowSamples - evidence.total} more exact strategy-target shadow samples`);
    if (confidence.value < this.settings.activeConfidenceThreshold) rejectionReasons.push(`Confidence ${confidence.value.toFixed(1)}% is below ${this.settings.activeConfidenceThreshold}%`);
    if (ensemble.probability < strategy.probabilityFloor || standardizedEdge < 0.04) rejectionReasons.push('No credible probability edge over the contract base rate');
    if (ensemble.agreement < strategy.agreementFloor) rejectionReasons.push('Model agreement is too low');
    if (!regimeSafe(snapshot) || !strategy.allowedRegimes.includes(snapshot.regime)) rejectionReasons.push(`Regime ${snapshot.regime} is not qualified`);
    if (this.latestDrift.severity !== 'NONE') rejectionReasons.push(`Drift state is ${this.latestDrift.severity}`);
    if (metaProbability < 0.58) rejectionReasons.push(`No-trade model accepted only ${(metaProbability * 100).toFixed(1)}%`);
    if (mode !== 'ACTIVE_VIRTUAL') rejectionReasons.push(`Learning mode is ${mode}`);
    this.predictionCounter += 1;
    return {
      id: `${this.market}:prediction:${triggerEpoch}:${this.predictionCounter}`,
      market: this.market,
      frozenAtEpoch: snapshot.createdAtEpoch,
      triggerEpoch,
      resultOffsetFromTrigger: 2,
      target: ensemble.selectedTarget,
      targetProbabilities: ensemble.probabilities,
      probability: ensemble.probability,
      systemConfidence: confidence.value,
      action: rejectionReasons.length === 0 ? 'TRADE' : 'NO_TRADE',
      rejectionReasons,
      ensembleAgreement: ensemble.agreement,
      strategyId: strategy.id,
      strategyVersion: strategy.version,
      modelVotes: ensemble.votes,
      modelVersions: ensemble.modelVersions,
      regime: snapshot.regime,
      featureSnapshot: structuredClone(snapshot),
      metaProbability,
    };
  }

  private modeFor(evidence: EvidenceState, confidence: number): LearningMode {
    if (!this.latestFeatures || this.latestFeatures.sampleSize < 1000) return 'COLLECTING';
    if (this.cooldownRemaining > 0 || this.latestDrift.severity === 'SEVERE' || this.globalConsecutiveLosses >= 3) return 'COOLDOWN';
    if (this.recoverySettlements > 0 && this.recoverySettlements < 10) return 'RECOVERY';
    if (evidence.total < Math.min(15, this.settings.minimumShadowSamples)) return 'SILENT_LEARNING';
    if (evidence.total < this.settings.minimumShadowSamples || confidence < this.settings.activeConfidenceThreshold) return 'QUALIFYING';
    return 'ACTIVE_VIRTUAL';
  }

  private tradeContext(
    probability: number,
    standardizedEdge: number,
    agreement: number,
    confidence: ConfidenceBreakdown,
    snapshot: FeatureSnapshot,
    evidence: EvidenceState,
    baseRate: number,
  ): TradeContext {
    const calibrationScore = evidence.total === 0 ? 0.5 : clamp(1 - evidence.brierTotal / evidence.total / 0.5);
    return {
      probability,
      standardizedEdge,
      agreement,
      recentWinRate: confidence.recentWinRate,
      regimeStability: snapshot.randomness.regimeStability,
      similarContextSuccess: confidence.similarContextSuccess,
      sampleSizeCap: confidence.sampleSizeCap,
      calibrationScore,
      driftScore: this.latestDrift.score,
      consecutiveLosses: this.globalConsecutiveLosses,
      automaticTrigger: this.settings.triggerMode === 'AUTOMATIC',
      baseRate,
    };
  }

  private shouldTrigger(tick: MarketTick): { triggered: boolean; reason?: string } {
    if (this.settings.triggerMode === 'DIGIT') {
      return tick.digit === this.settings.triggerDigit
        ? { triggered: true, reason: `Selected trigger digit ${tick.digit}` }
        : { triggered: false };
    }
    const prediction = this.latestRecommendation;
    if (!prediction) return { triggered: false };
    const base = baselineProbabilities()[prediction.target];
    const qualified = prediction.probability >= base + 0.025
      && prediction.ensembleAgreement >= 0.52
      && this.latestDrift.severity !== 'SEVERE'
      && regimeSafe(prediction.featureSnapshot);
    return qualified
      ? { triggered: true, reason: `${prediction.target} edge ${((prediction.probability - base) * 100).toFixed(1)}pp with ${(prediction.ensembleAgreement * 100).toFixed(0)}% agreement` }
      : { triggered: false };
  }

  private startRound(tick: MarketTick, automaticReason?: string): void {
    if (this.currentRound) return;
    const champion = this.champion();
    const mayBeActive = this.learningMode === 'ACTIVE_VIRTUAL'
      && this.latestRecommendation?.action === 'TRADE';
    const strategy = mayBeActive || !this.settings.automaticChallengersEnabled
      ? champion
      : selectLaboratoryStrategy(this.strategies, this.latestFeatures?.regime ?? 'UNSTABLE');
    this.roundCounter += 1;
    this.currentRound = createRound({
      id: `${this.market}:round:${this.roundCounter}:${tick.epoch}`,
      roundNumber: this.roundCounter,
      market: this.market,
      executionKind: mayBeActive ? 'ACTIVE_VIRTUAL' : 'SHADOW',
      triggerType: this.settings.triggerMode,
      triggerDigit: this.settings.triggerMode === 'DIGIT' ? this.settings.triggerDigit : undefined,
      automaticTriggerReason: this.settings.triggerMode === 'AUTOMATIC' ? automaticReason : undefined,
      triggerEpoch: tick.epoch,
      triggerTickDigit: tick.digit,
      regime: this.latestFeatures?.regime ?? 'UNSTABLE',
      strategyId: strategy.id,
      modelVersions: this.latestRecommendation?.modelVersions ?? {},
    });
    this.schedulerPhase = 'SKIP';
    this.log('PREDICTION', tick.epoch, `${this.currentRound.executionKind} round ${this.roundCounter} triggered; immediate next tick will be skipped.`);
  }

  private settleCurrent(tick: MarketTick): VirtualContractResult {
    if (!this.currentRound || !this.pendingPrediction) throw new Error('Cannot settle without a frozen prediction and round.');
    if (tick.epoch <= this.pendingPrediction.frozenAtEpoch) {
      throw new Error('Result tick must be strictly later than the frozen feature snapshot.');
    }
    const contract = createContractResult(this.currentRound, this.pendingPrediction, tick.digit, tick.epoch);
    this.currentRound.timeline.push(this.timeline(tick.epoch, 'VIRTUAL_BUY', tick.digit, `Virtual ${this.pendingPrediction.target} contract settled on digit ${tick.digit}.`));
    this.currentRound.timeline.push(this.timeline(tick.epoch, contract.outcome, tick.digit, contract.outcome));
    this.currentRound.contracts.push(contract);
    const won = contract.outcome === 'WIN';
    const key = evidenceKey(contract.prediction.strategyId, contract.prediction.target);
    const prior = this.evidence[key] ?? createEvidenceState();
    const base = baselineProbabilities()[contract.prediction.target];
    const standardizedEdge = (contract.prediction.probability - base) / Math.sqrt(base * (1 - base));
    const priorConfidence = computeConfidence({
      evidence: prior,
      minimumSamples: this.settings.minimumShadowSamples,
      agreement: contract.prediction.ensembleAgreement,
      regimeStability: contract.prediction.featureSnapshot.randomness.regimeStability,
      driftSeverity: this.latestDrift.severity,
      driftScore: this.latestDrift.score,
      mode: this.learningMode,
      activeThreshold: this.settings.activeConfidenceThreshold,
    });
    this.noTrade.update(this.tradeContext(
      contract.prediction.probability,
      standardizedEdge,
      contract.prediction.ensembleAgreement,
      priorConfidence,
      contract.prediction.featureSnapshot,
      prior,
      base,
    ), won);
    this.ensemble.settleTarget(
      contract.prediction.featureSnapshot,
      contract.prediction.target,
      tick.digit,
      contract.prediction.modelVotes,
    );
    if (this.settings.formulaExperimentsEnabled) {
      this.formulaLab.update(contract.prediction.featureSnapshot, tick.digit);
    }
    this.driftDetector.recordPredictionError(won);
    let updated = updateEvidence(prior, won, contract.prediction.probability, contract.prediction.regime === this.latestFeatures?.regime);
    this.globalConsecutiveLosses = won ? 0 : this.globalConsecutiveLosses + 1;
    if (won && this.learningMode === 'RECOVERY') this.recoverySettlements += 1;
    if (!won) this.recoverySettlements = 0;
    if (this.globalConsecutiveLosses >= 3) {
      this.cooldownRemaining = Math.max(this.cooldownRemaining, 30);
      this.recoverySettlements = 1;
    }
    const updatedConfidence = computeConfidence({
      evidence: { ...updated, consecutiveLosses: Math.max(updated.consecutiveLosses, this.globalConsecutiveLosses) },
      minimumSamples: this.settings.minimumShadowSamples,
      agreement: contract.prediction.ensembleAgreement,
      regimeStability: contract.prediction.featureSnapshot.randomness.regimeStability,
      driftSeverity: this.latestDrift.severity,
      driftScore: this.latestDrift.score,
      mode: this.modeFor(updated, 0),
      activeThreshold: this.settings.activeConfidenceThreshold,
    });
    updated.lastConfidence = updatedConfidence.value;
    this.evidence[key] = updated;
    this.latestConfidence = updatedConfidence;
    this.metrics = recordContract(this.metrics, contract, this.currentRound.triggerType);
    this.strategies = advanceStrategyLifecycle(
      updateStrategyResult(this.strategies, contract.prediction.strategyId, won, contract.prediction.probability),
      this.settings.minimumShadowSamples,
    );
    this.log('CONTRACT', tick.epoch, `${contract.executionKind} ${contract.prediction.target}: ${contract.outcome} on digit ${tick.digit}.`);
    this.log('CONFIDENCE', tick.epoch, updatedConfidence.reasons.join(' · '));
    if (!won) this.log('MODEL', tick.epoch, `Loss preserved with frozen snapshot ${contract.prediction.featureSnapshot.id}; model and no-trade weights updated after settlement.`);
    this.pendingPrediction = null;
    return contract;
  }

  private invalidateCurrent(epoch: number, reason: string): VirtualRound {
    if (!this.currentRound) throw new Error('No round to invalidate.');
    this.currentRound = invalidateRound(this.currentRound, epoch, reason);
    const completed = this.completeCurrent();
    this.log('ROUND', epoch, `Round ${completed.roundNumber} invalidated and excluded from win/loss metrics: ${reason}`);
    return completed;
  }

  private completeCurrent(): VirtualRound {
    if (!this.currentRound) throw new Error('No round to complete.');
    const completed = structuredClone(this.currentRound);
    this.metrics = recordRound(this.metrics, completed);
    this.recentRounds.push(completed);
    this.recentRounds = this.recentRounds.slice(-this.settings.maximumStoredRounds);
    this.lastTimeline = completed.timeline;
    this.currentRound = null;
    this.pendingPrediction = null;
    this.schedulerPhase = 'WAITING';
    this.log('ROUND', completed.triggerEpoch, `Round ${completed.roundNumber}: ${completed.status}.`);
    return completed;
  }

  private champion(): StrategyDefinition {
    return this.strategies.find((strategy) => strategy.status === 'CHAMPION') ?? this.strategies[0];
  }

  private timeline(
    epoch: number,
    stage: TimelineEvent['stage'],
    digit: number | undefined,
    detail: string,
  ): TimelineEvent {
    return { id: `${this.market}:${stage}:${epoch}:${this.predictionCounter}`, epoch, stage, digit, detail };
  }

  private log(category: ResearchLog['category'], epoch: number, message: string): void {
    this.logs.push({
      id: `${this.market}:log:${epoch}:${this.logs.length + 1}`,
      market: this.market,
      category,
      epoch,
      message,
    });
    this.logs = this.logs.slice(-this.settings.maximumStoredLogs);
  }
}

export function isValidPersistedEngine(value: unknown): value is PersistedMarketEngine {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as Partial<PersistedMarketEngine>;
  return candidate.schemaVersion === 2
    && typeof candidate.market === 'string'
    && Array.isArray(candidate.strategies)
    && candidate.ensemble !== undefined
    && candidate.metrics !== undefined;
}
