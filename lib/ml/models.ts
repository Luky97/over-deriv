import type { FeatureSnapshot, PredictionTarget, RegimeLabel } from '@/lib/types';
import { PREDICTION_TARGETS } from '@/lib/types';
import { clamp } from '@/lib/features/statistics';

export type TargetProbabilities = Record<PredictionTarget, number>;

export interface SerializedModel {
  id: string;
  version: number;
  state: unknown;
}

export interface OnlineModel {
  readonly id: string;
  readonly version: number;
  predict(snapshot: FeatureSnapshot): TargetProbabilities;
  update(snapshot: FeatureSnapshot, actualDigit: number): void;
  serialize(): SerializedModel;
  restore(state: unknown): void;
}

export function targetOutcome(target: PredictionTarget, digit: number): boolean {
  if (target === 'EVEN') return digit % 2 === 0;
  if (target === 'ODD') return digit % 2 !== 0;
  if (target === 'OVER_3') return digit > 3;
  return digit < 7;
}

export function baselineProbabilities(): TargetProbabilities {
  return { EVEN: 0.5, ODD: 0.5, OVER_3: 0.6, UNDER_7: 0.7 };
}

function sigmoid(value: number): number {
  if (value >= 0) return 1 / (1 + Math.exp(-Math.min(30, value)));
  const exponential = Math.exp(Math.max(-30, value));
  return exponential / (1 + exponential);
}

interface LogisticState {
  weights: Partial<Record<PredictionTarget, number[]>>;
  bias: Partial<Record<PredictionTarget, number>>;
  updates: number;
}

export class OnlineLogisticModel implements OnlineModel {
  readonly id = 'online_logistic';
  readonly version = 2;
  private state: LogisticState = { weights: {}, bias: {}, updates: 0 };

  private usableVector(snapshot: FeatureSnapshot): number[] {
    return snapshot.vector.map((value, index) => snapshot.featureNames[index]?.startsWith('time.') ? 0 : value);
  }

  predict(snapshot: FeatureSnapshot): TargetProbabilities {
    const vector = this.usableVector(snapshot);
    const baseline = baselineProbabilities();
    return Object.fromEntries(PREDICTION_TARGETS.map((target) => {
      const weights = this.state.weights[target];
      if (!weights || this.state.updates < 5) return [target, baseline[target]];
      let score = this.state.bias[target] ?? 0;
      for (let index = 0; index < Math.min(weights.length, vector.length); index += 1) score += weights[index] * vector[index];
      return [target, clamp(sigmoid(score), 0.02, 0.98)];
    })) as TargetProbabilities;
  }

  update(snapshot: FeatureSnapshot, actualDigit: number): void {
    const vector = this.usableVector(snapshot);
    const learningRate = 0.025 / Math.sqrt(1 + this.state.updates / 150);
    for (const target of PREDICTION_TARGETS) {
      const weights = this.state.weights[target] ?? Array<number>(vector.length).fill(0);
      const prediction = this.predict(snapshot)[target];
      const label = targetOutcome(target, actualDigit) ? 1 : 0;
      const error = label - prediction;
      for (let index = 0; index < vector.length; index += 1) {
        weights[index] = (weights[index] ?? 0) * (1 - learningRate * 0.0005) + learningRate * error * vector[index];
      }
      this.state.weights[target] = weights;
      this.state.bias[target] = (this.state.bias[target] ?? 0) + learningRate * error;
    }
    this.state.updates += 1;
  }

  serialize(): SerializedModel { return { id: this.id, version: this.version, state: this.state }; }
  restore(state: unknown): void {
    const candidate = state as Partial<LogisticState> | null;
    if (candidate && typeof candidate.updates === 'number' && candidate.weights && candidate.bias) {
      this.state = { weights: candidate.weights, bias: candidate.bias, updates: candidate.updates };
    }
  }
}

interface MarkovState { counts: number[][]; updates: number }

export class FirstOrderMarkovModel implements OnlineModel {
  readonly id = 'markov_first_order';
  readonly version = 2;
  private state: MarkovState = {
    counts: Array.from({ length: 10 }, () => Array<number>(10).fill(0.5)),
    updates: 0,
  };

  predict(snapshot: FeatureSnapshot): TargetProbabilities {
    const previous = snapshot.sequence.previousDigits['1'][0];
    if (previous === undefined) return baselineProbabilities();
    const row = this.state.counts[previous];
    const total = row.reduce((sum, count) => sum + count, 0);
    const probability = (predicate: (digit: number) => boolean) =>
      row.reduce((sum, count, digit) => sum + (predicate(digit) ? count : 0), 0) / total;
    return {
      EVEN: probability((digit) => digit % 2 === 0),
      ODD: probability((digit) => digit % 2 !== 0),
      OVER_3: probability((digit) => digit > 3),
      UNDER_7: probability((digit) => digit < 7),
    };
  }

  update(snapshot: FeatureSnapshot, actualDigit: number): void {
    const previous = snapshot.sequence.previousDigits['1'][0];
    if (previous !== undefined) this.state.counts[previous][actualDigit] += 1;
    this.state.updates += 1;
  }

  serialize(): SerializedModel { return { id: this.id, version: this.version, state: this.state }; }
  restore(state: unknown): void {
    const candidate = state as MarkovState | null;
    if (candidate?.counts?.length === 10) this.state = candidate;
  }
}

interface SecondOrderState { counts: Record<string, number[]>; updates: number }

export class SecondOrderMarkovModel implements OnlineModel {
  readonly id = 'markov_second_order';
  readonly version = 2;
  private state: SecondOrderState = { counts: {}, updates: 0 };

  predict(snapshot: FeatureSnapshot): TargetProbabilities {
    const previous = snapshot.sequence.previousDigits['2'];
    const row = this.state.counts[previous.join(',')];
    if (!row) return baselineProbabilities();
    const total = row.reduce((sum, count) => sum + count, 0);
    const probability = (predicate: (digit: number) => boolean) =>
      row.reduce((sum, count, digit) => sum + (predicate(digit) ? count : 0), 0) / total;
    return {
      EVEN: probability((digit) => digit % 2 === 0),
      ODD: probability((digit) => digit % 2 !== 0),
      OVER_3: probability((digit) => digit > 3),
      UNDER_7: probability((digit) => digit < 7),
    };
  }

  update(snapshot: FeatureSnapshot, actualDigit: number): void {
    const previous = snapshot.sequence.previousDigits['2'];
    if (previous.length === 2) {
      const key = previous.join(',');
      const row = this.state.counts[key] ?? Array<number>(10).fill(0.5);
      row[actualDigit] += 1;
      this.state.counts[key] = row;
    }
    this.state.updates += 1;
  }

  serialize(): SerializedModel { return { id: this.id, version: this.version, state: this.state }; }
  restore(state: unknown): void {
    const candidate = state as SecondOrderState | null;
    if (candidate?.counts && typeof candidate.updates === 'number') this.state = candidate;
  }
}

export class FrequencyMomentumModel implements OnlineModel {
  readonly id = 'frequency_momentum';
  readonly version = 2;
  predict(snapshot: FeatureSnapshot): TargetProbabilities {
    const recent = snapshot.windows[20];
    const medium = snapshot.windows[100];
    const blend = (recentValue: number, mediumValue: number, baseline: number) =>
      clamp((0.5 * recentValue + 0.35 * mediumValue + 0.15 * baseline) / 100, 0.02, 0.98);
    return {
      EVEN: blend(recent.evenPercentage, medium.evenPercentage, 50),
      ODD: blend(recent.oddPercentage, medium.oddPercentage, 50),
      OVER_3: blend(recent.over3Percentage, medium.over3Percentage, 60),
      UNDER_7: blend(recent.under7Percentage, medium.under7Percentage, 70),
    };
  }
  update(): void { /* Stateless rolling model; evaluation still changes its ensemble weight. */ }
  serialize(): SerializedModel { return { id: this.id, version: this.version, state: {} }; }
  restore(): void { /* no state */ }
}

interface NGramState { contexts: Record<string, number[]>; updates: number }

export class NGramModel implements OnlineModel {
  readonly id = 'ngram_context';
  readonly version = 2;
  private state: NGramState = { contexts: {}, updates: 0 };

  private probabilities(row: number[]): TargetProbabilities {
    const total = row.reduce((sum, count) => sum + count, 0);
    const probability = (predicate: (digit: number) => boolean) =>
      row.reduce((sum, count, digit) => sum + (predicate(digit) ? count : 0), 0) / total;
    return {
      EVEN: probability((digit) => digit % 2 === 0), ODD: probability((digit) => digit % 2 !== 0),
      OVER_3: probability((digit) => digit > 3), UNDER_7: probability((digit) => digit < 7),
    };
  }

  predict(snapshot: FeatureSnapshot): TargetProbabilities {
    for (const size of [5, 3, 2]) {
      const key = snapshot.sequence.previousDigits[size === 5 ? '5' : size === 3 ? '3' : '2'].join('');
      const row = this.state.contexts[`${size}:${key}`];
      if (row && row.reduce((sum, count) => sum + count, 0) >= 8) return this.probabilities(row);
    }
    return baselineProbabilities();
  }

  update(snapshot: FeatureSnapshot, actualDigit: number): void {
    for (const size of [2, 3, 5]) {
      const keyName = size === 2 ? '2' : size === 3 ? '3' : '5';
      const context = snapshot.sequence.previousDigits[keyName].join('');
      if (context.length !== size) continue;
      const key = `${size}:${context}`;
      const row = this.state.contexts[key] ?? Array<number>(10).fill(0.25);
      row[actualDigit] += 1;
      this.state.contexts[key] = row;
    }
    this.state.updates += 1;
    const entries = Object.entries(this.state.contexts);
    if (entries.length > 1_500) {
      entries.sort((a, b) => a[1].reduce((sum, value) => sum + value, 0) - b[1].reduce((sum, value) => sum + value, 0));
      for (const [key] of entries.slice(0, entries.length - 1_200)) delete this.state.contexts[key];
    }
  }

  serialize(): SerializedModel { return { id: this.id, version: this.version, state: this.state }; }
  restore(state: unknown): void {
    const candidate = state as NGramState | null;
    if (candidate?.contexts && typeof candidate.updates === 'number') this.state = candidate;
  }
}

interface RegimeState { buckets: Record<string, Record<PredictionTarget, [number, number]>> }

export class RegimeConditionedModel implements OnlineModel {
  readonly id = 'regime_conditioned';
  readonly version = 2;
  private state: RegimeState = { buckets: {} };

  predict(snapshot: FeatureSnapshot): TargetProbabilities {
    const bucket = this.state.buckets[snapshot.regime];
    const baseline = baselineProbabilities();
    if (!bucket) return baseline;
    return Object.fromEntries(PREDICTION_TARGETS.map((target) => {
      const [successes, total] = bucket[target];
      return [target, (successes + baseline[target] * 10) / (total + 10)];
    })) as TargetProbabilities;
  }

  update(snapshot: FeatureSnapshot, actualDigit: number): void {
    const bucket = this.state.buckets[snapshot.regime] ?? Object.fromEntries(
      PREDICTION_TARGETS.map((target) => [target, [0, 0]]),
    ) as Record<PredictionTarget, [number, number]>;
    for (const target of PREDICTION_TARGETS) {
      bucket[target][1] += 1;
      if (targetOutcome(target, actualDigit)) bucket[target][0] += 1;
    }
    this.state.buckets[snapshot.regime] = bucket;
  }

  serialize(): SerializedModel { return { id: this.id, version: this.version, state: this.state }; }
  restore(state: unknown): void {
    const candidate = state as RegimeState | null;
    if (candidate?.buckets) this.state = candidate;
  }
}

interface Moment { count: number; mean: number; m2: number }
interface NaiveBayesState { moments: Record<PredictionTarget, { positive: Moment[]; negative: Moment[] }> }

export class OnlineNaiveBayesModel implements OnlineModel {
  readonly id = 'online_naive_bayes';
  readonly version = 2;
  private state: NaiveBayesState = { moments: {} as NaiveBayesState['moments'] };

  private values(snapshot: FeatureSnapshot): number[] {
    const indices = snapshot.vector.map((_, index) => index).filter((index) => index % 11 === 0).slice(0, 48);
    return indices.map((index) => snapshot.vector[index]);
  }

  predict(snapshot: FeatureSnapshot): TargetProbabilities {
    const values = this.values(snapshot);
    const baseline = baselineProbabilities();
    return Object.fromEntries(PREDICTION_TARGETS.map((target) => {
      const classes = this.state.moments[target];
      if (!classes || classes.positive[0]?.count < 10 || classes.negative[0]?.count < 10) return [target, baseline[target]];
      let positiveLog = Math.log(baseline[target]);
      let negativeLog = Math.log(1 - baseline[target]);
      values.forEach((value, index) => {
        for (const [label, moments] of [['positive', classes.positive], ['negative', classes.negative]] as const) {
          const moment = moments[index];
          const variance = Math.max(0.05, moment.m2 / Math.max(1, moment.count - 1));
          const logLikelihood = -0.5 * Math.log(2 * Math.PI * variance) - ((value - moment.mean) ** 2) / (2 * variance);
          if (label === 'positive') positiveLog += clamp(logLikelihood, -10, 2);
          else negativeLog += clamp(logLikelihood, -10, 2);
        }
      });
      return [target, clamp(sigmoid(positiveLog - negativeLog), 0.02, 0.98)];
    })) as TargetProbabilities;
  }

  update(snapshot: FeatureSnapshot, actualDigit: number): void {
    const values = this.values(snapshot);
    for (const target of PREDICTION_TARGETS) {
      const empty = () => values.map(() => ({ count: 0, mean: 0, m2: 0 }));
      const classes = this.state.moments[target] ?? { positive: empty(), negative: empty() };
      const moments = targetOutcome(target, actualDigit) ? classes.positive : classes.negative;
      values.forEach((value, index) => {
        const moment = moments[index];
        moment.count += 1;
        const delta = value - moment.mean;
        moment.mean += delta / moment.count;
        moment.m2 += delta * (value - moment.mean);
      });
      this.state.moments[target] = classes;
    }
  }

  serialize(): SerializedModel { return { id: this.id, version: this.version, state: this.state }; }
  restore(state: unknown): void {
    const candidate = state as NaiveBayesState | null;
    if (candidate?.moments) this.state = candidate;
  }
}

interface ContextItem { vector: number[]; digit: number; regime: RegimeLabel }
interface ContextState { items: ContextItem[]; maximum: number }

export class NearestContextModel implements OnlineModel {
  readonly id = 'nearest_context';
  readonly version = 2;
  private state: ContextState;
  constructor(maximum = 300) { this.state = { items: [], maximum }; }

  private vector(snapshot: FeatureSnapshot): number[] {
    return snapshot.vector.filter((_, index) => index % 13 === 0).slice(0, 40);
  }

  predict(snapshot: FeatureSnapshot): TargetProbabilities {
    if (this.state.items.length < 30) return baselineProbabilities();
    const current = this.vector(snapshot);
    const nearest = this.state.items.map((item) => ({
      item,
      distance: Math.sqrt(current.reduce((sum, value, index) => sum + (value - (item.vector[index] ?? 0)) ** 2, 0))
        + (item.regime === snapshot.regime ? 0 : 1),
    })).sort((a, b) => a.distance - b.distance).slice(0, 15);
    const totalWeight = nearest.reduce((sum, entry) => sum + 1 / (0.1 + entry.distance), 0);
    const probability = (target: PredictionTarget) => nearest.reduce((sum, entry) =>
      sum + (targetOutcome(target, entry.item.digit) ? 1 : 0) / (0.1 + entry.distance), 0) / totalWeight;
    return Object.fromEntries(PREDICTION_TARGETS.map((target) => [target, clamp(probability(target), 0.02, 0.98)])) as TargetProbabilities;
  }

  update(snapshot: FeatureSnapshot, actualDigit: number): void {
    this.state.items.push({ vector: this.vector(snapshot), digit: actualDigit, regime: snapshot.regime });
    this.state.items = this.state.items.slice(-this.state.maximum);
  }

  serialize(): SerializedModel { return { id: this.id, version: this.version, state: this.state }; }
  restore(state: unknown): void {
    const candidate = state as ContextState | null;
    if (candidate?.items && typeof candidate.maximum === 'number') this.state = candidate;
  }
}

interface TimeState { buckets: Record<string, number[]> }

export class TimeExperimentalModel implements OnlineModel {
  readonly id = 'time_experimental';
  readonly version = 2;
  private state: TimeState = { buckets: {} };
  private key(snapshot: FeatureSnapshot): string {
    return `${Math.floor(snapshot.time.serverSecond / 10)}:${snapshot.time.serverMinute % 5}`;
  }
  predict(snapshot: FeatureSnapshot): TargetProbabilities {
    const row = this.state.buckets[this.key(snapshot)];
    if (!row || row.reduce((sum, value) => sum + value, 0) < 30) return baselineProbabilities();
    const total = row.reduce((sum, value) => sum + value, 0);
    const probability = (target: PredictionTarget) => row.reduce((sum, count, digit) => sum + (targetOutcome(target, digit) ? count : 0), 0) / total;
    return Object.fromEntries(PREDICTION_TARGETS.map((target) => [target, probability(target)])) as TargetProbabilities;
  }
  update(snapshot: FeatureSnapshot, actualDigit: number): void {
    const key = this.key(snapshot);
    const row = this.state.buckets[key] ?? Array<number>(10).fill(0.5);
    row[actualDigit] += 1;
    this.state.buckets[key] = row;
  }
  serialize(): SerializedModel { return { id: this.id, version: this.version, state: this.state }; }
  restore(state: unknown): void {
    const candidate = state as TimeState | null;
    if (candidate?.buckets) this.state = candidate;
  }
}

export function createModels(maximumContextMemory = 300): OnlineModel[] {
  return [
    new OnlineLogisticModel(),
    new FirstOrderMarkovModel(),
    new SecondOrderMarkovModel(),
    new FrequencyMomentumModel(),
    new NGramModel(),
    new RegimeConditionedModel(),
    new OnlineNaiveBayesModel(),
    new NearestContextModel(maximumContextMemory),
    new TimeExperimentalModel(),
  ];
}
