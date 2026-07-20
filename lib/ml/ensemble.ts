import type {
  FeatureSnapshot,
  ModelPerformance,
  ModelVote,
  PredictionTarget,
  StrategyDefinition,
} from '@/lib/types';
import { PREDICTION_TARGETS } from '@/lib/types';
import { clamp, mean } from '@/lib/features/statistics';
import {
  baselineProbabilities,
  createModels,
  targetOutcome,
  type OnlineModel,
  type SerializedModel,
  type TargetProbabilities,
} from './models';

interface PerformanceState {
  evidence: number;
  correct: number;
  brierTotal: number;
  recent: number[];
  regimes: Record<string, { correct: number; total: number }>;
}

export interface EnsemblePrediction {
  probabilities: TargetProbabilities;
  selectedTarget: PredictionTarget;
  probability: number;
  agreement: number;
  votes: ModelVote[];
  modelVersions: Record<string, number>;
}

export interface EnsembleState {
  models: SerializedModel[];
  performance: Record<string, Partial<Record<PredictionTarget, PerformanceState>>>;
}

function emptyPerformance(): PerformanceState {
  return { evidence: 0, correct: 0, brierTotal: 0, recent: [], regimes: {} };
}

function performanceView(state: PerformanceState, regime: string): ModelPerformance {
  const recentAccuracy = state.recent.length === 0 ? 0.5 : mean(state.recent);
  const brierScore = state.evidence === 0 ? 0.25 : state.brierTotal / state.evidence;
  const regimeBucket = state.regimes[regime];
  const regimeCompatibility = !regimeBucket || regimeBucket.total < 5
    ? 0.5
    : (regimeBucket.correct + 2) / (regimeBucket.total + 4);
  const calibrationScore = clamp(1 - brierScore / 0.5);
  const evidenceCap = Math.min(1, state.evidence / 50);
  const weight = 0.05 + evidenceCap * (
    0.45 * recentAccuracy + 0.3 * calibrationScore + 0.25 * regimeCompatibility
  );
  return {
    evidence: state.evidence,
    correct: state.correct,
    recentAccuracy,
    brierScore,
    calibrationScore,
    regimeCompatibility,
    weight,
  };
}

export class AdaptiveEnsemble {
  private readonly models: OnlineModel[];
  private performance: Record<string, Partial<Record<PredictionTarget, PerformanceState>>> = {};

  constructor(maximumContextMemory = 300) {
    this.models = createModels(maximumContextMemory);
    for (const model of this.models) this.performance[model.id] = {};
  }

  predict(
    snapshot: FeatureSnapshot,
    enabledTargets: readonly PredictionTarget[],
    strategy: StrategyDefinition,
  ): EnsemblePrediction {
    const predictions = this.models.map((model) => ({ model, probabilities: model.predict(snapshot) }));
    const combined = baselineProbabilities();
    for (const target of PREDICTION_TARGETS) {
      let weightedTotal = 0;
      let weightTotal = 0;
      for (const { model, probabilities } of predictions) {
        const state = this.getPerformance(model.id, target);
        const performance = performanceView(state, snapshot.regime);
        const strategyWeight = strategy.modelWeights[model.id] ?? 1;
        const experimentalPenalty = model.id === 'time_experimental' && state.evidence < 50 ? 0.15 : 1;
        const weight = performance.weight * strategyWeight * experimentalPenalty;
        weightedTotal += probabilities[target] * weight;
        weightTotal += weight;
      }
      combined[target] = weightTotal === 0 ? combined[target] : clamp(weightedTotal / weightTotal, 0.01, 0.99);
    }

    const baselines = baselineProbabilities();
    const candidates = enabledTargets.map((target) => ({
      target,
      probability: combined[target],
      standardizedEdge: (combined[target] - baselines[target])
        / Math.sqrt(baselines[target] * (1 - baselines[target])),
    })).sort((a, b) => b.standardizedEdge - a.standardizedEdge || b.probability - a.probability);
    const selected = candidates[0] ?? { target: 'EVEN' as const, probability: combined.EVEN, standardizedEdge: 0 };

    const selectedVotes = predictions.map(({ model, probabilities }) => {
      const view = performanceView(this.getPerformance(model.id, selected.target), snapshot.regime);
      return {
        modelId: model.id,
        probability: probabilities[selected.target],
        version: model.version,
        ...view,
      };
    });
    const weightSum = selectedVotes.reduce((sum, vote) => sum + vote.weight, 0);
    const weightedVariance = selectedVotes.reduce((sum, vote) =>
      sum + vote.weight * (vote.probability - selected.probability) ** 2, 0) / Math.max(0.0001, weightSum);
    const agreement = clamp(1 - Math.sqrt(weightedVariance) * 3);

    return {
      probabilities: combined,
      selectedTarget: selected.target,
      probability: selected.probability,
      agreement,
      votes: selectedVotes,
      modelVersions: Object.fromEntries(this.models.map((model) => [model.id, model.version])),
    };
  }

  /** Chronological history warm-up. It trains parameters but never counts as forward evidence. */
  bootstrap(snapshot: FeatureSnapshot, actualDigit: number): void {
    for (const model of this.models) model.update(snapshot, actualDigit);
  }

  settleTarget(
    snapshot: FeatureSnapshot,
    target: PredictionTarget,
    actualDigit: number,
    frozenVotes: readonly ModelVote[],
  ): void {
    const outcome = targetOutcome(target, actualDigit) ? 1 : 0;
    for (const vote of frozenVotes) {
      const state = this.getPerformance(vote.modelId, target);
      const predictedClass = vote.probability >= 0.5 ? 1 : 0;
      const correct = predictedClass === outcome ? 1 : 0;
      state.evidence += 1;
      state.correct += correct;
      state.brierTotal += (vote.probability - outcome) ** 2;
      state.recent.push(correct);
      state.recent = state.recent.slice(-100);
      const regime = state.regimes[snapshot.regime] ?? { correct: 0, total: 0 };
      regime.total += 1;
      regime.correct += correct;
      state.regimes[snapshot.regime] = regime;
    }
    for (const model of this.models) model.update(snapshot, actualDigit);
  }

  summaries(regime: string): Array<ModelPerformance & { modelId: string; version: number }> {
    return this.models.map((model) => {
      const views = PREDICTION_TARGETS.map((target) => performanceView(this.getPerformance(model.id, target), regime));
      return {
        modelId: model.id,
        version: model.version,
        evidence: Math.max(...views.map((view) => view.evidence)),
        correct: Math.max(...views.map((view) => view.correct)),
        recentAccuracy: mean(views.map((view) => view.recentAccuracy)),
        brierScore: mean(views.map((view) => view.brierScore)),
        calibrationScore: mean(views.map((view) => view.calibrationScore)),
        regimeCompatibility: mean(views.map((view) => view.regimeCompatibility)),
        weight: mean(views.map((view) => view.weight)),
      };
    });
  }

  serialize(): EnsembleState {
    return { models: this.models.map((model) => model.serialize()), performance: this.performance };
  }

  restore(state: EnsembleState | undefined): void {
    if (!state?.models || !state.performance) return;
    for (const serialized of state.models) {
      const model = this.models.find((candidate) => candidate.id === serialized.id && candidate.version === serialized.version);
      model?.restore(serialized.state);
    }
    this.performance = state.performance;
    for (const model of this.models) this.performance[model.id] ??= {};
  }

  private getPerformance(modelId: string, target: PredictionTarget): PerformanceState {
    const model = this.performance[modelId] ?? {};
    const state = model[target] ?? emptyPerformance();
    model[target] = state;
    this.performance[modelId] = model;
    return state;
  }
}
