import type { DriftState, FeatureSnapshot, RegimeLabel } from '@/lib/types';
import { clamp, mean } from '@/lib/features/statistics';

export interface SerializedDriftDetector {
  count: number;
  parityMean: number;
  pageCumulative: number;
  pageMinimum: number;
  cusumPositive: number;
  cusumNegative: number;
  errors: number[];
  previousRegime: RegimeLabel | null;
}

export class DriftDetector {
  private state: SerializedDriftDetector = {
    count: 0,
    parityMean: 0.5,
    pageCumulative: 0,
    pageMinimum: 0,
    cusumPositive: 0,
    cusumNegative: 0,
    errors: [],
    previousRegime: null,
  };

  update(snapshot: FeatureSnapshot): DriftState {
    const parity = snapshot.sequence.previousDigits['1'][0] % 2 === 0 ? 1 : 0;
    this.state.count += 1;
    this.state.parityMean += (parity - this.state.parityMean) / this.state.count;
    this.state.pageCumulative += parity - this.state.parityMean - 0.03;
    this.state.pageMinimum = Math.min(this.state.pageMinimum, this.state.pageCumulative);
    const pageHinkley = this.state.pageCumulative - this.state.pageMinimum;
    this.state.cusumPositive = Math.max(0, this.state.cusumPositive + parity - 0.55);
    this.state.cusumNegative = Math.max(0, this.state.cusumNegative + 0.45 - parity);
    const distributionDivergence = Math.max(
      snapshot.randomness.jensenShannon20To1000,
      snapshot.randomness.jensenShannon50To1000,
    );
    const adaptiveWindowDifference = Math.abs(
      snapshot.windows[20].evenPercentage - snapshot.windows[100].evenPercentage,
    ) / 100;
    const recentErrors = this.state.errors.slice(-20);
    const olderErrors = this.state.errors.slice(-60, -20);
    const errorRateChange = recentErrors.length < 10 || olderErrors.length < 10
      ? 0
      : mean(recentErrors) - mean(olderErrors);
    const regimeChanged = this.state.previousRegime !== null
      && snapshot.regime !== this.state.previousRegime
      && snapshot.regime !== 'HIGH_ENTROPY'
      && this.state.previousRegime !== 'HIGH_ENTROPY';
    this.state.previousRegime = snapshot.regime;
    const score = clamp(
      distributionDivergence * 3
      + adaptiveWindowDifference
      + Math.max(0, errorRateChange) * 0.8
      + Math.min(1, pageHinkley / 12) * 0.35
      + Math.min(1, Math.max(this.state.cusumPositive, this.state.cusumNegative) / 10) * 0.25
      + Number(regimeChanged) * 0.25,
    );
    const severe = distributionDivergence >= 0.16
      || errorRateChange >= 0.3
      || pageHinkley >= 15
      || Math.max(this.state.cusumPositive, this.state.cusumNegative) >= 13;
    const watch = severe || score >= 0.35 || regimeChanged || snapshot.regime === 'TRANSITION';
    const reasons: string[] = [];
    if (distributionDivergence >= 0.08) reasons.push('short and long digit distributions diverged');
    if (adaptiveWindowDifference >= 0.12) reasons.push('recent parity balance moved sharply');
    if (errorRateChange >= 0.15) reasons.push('recent forward-test error rate increased');
    if (pageHinkley >= 8) reasons.push('Page-Hinkley change signal elevated');
    if (regimeChanged) reasons.push('regime label changed');
    return {
      severity: severe ? 'SEVERE' : watch ? 'WATCH' : 'NONE',
      score,
      pageHinkley,
      cusumPositive: this.state.cusumPositive,
      cusumNegative: this.state.cusumNegative,
      adaptiveWindowDifference,
      distributionDivergence,
      errorRateChange,
      regimeChanged,
      reasons,
    };
  }

  recordPredictionError(won: boolean): void {
    this.state.errors.push(won ? 0 : 1);
    this.state.errors = this.state.errors.slice(-200);
  }

  serialize(): SerializedDriftDetector { return structuredClone(this.state); }
  restore(state: SerializedDriftDetector | undefined): void {
    if (state && typeof state.count === 'number' && Array.isArray(state.errors)) this.state = state;
  }
}

export function emptyDriftState(): DriftState {
  return {
    severity: 'NONE', score: 0, pageHinkley: 0, cusumPositive: 0, cusumNegative: 0,
    adaptiveWindowDifference: 0, distributionDivergence: 0, errorRateChange: 0,
    regimeChanged: false, reasons: [],
  };
}
