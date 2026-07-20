import type { MarketFeatures } from '../features/engine';
import type { PredictionTarget } from '../ml-types';

export interface ModelPrediction {
  target: PredictionTarget;
  probability: number;
}

export interface IOnlineModel {
  id: string;
  predict(features: MarketFeatures): ModelPrediction[];
  update(features: MarketFeatures, actualDigit: number): void;
}

export class FrequencyMomentumModel implements IOnlineModel {
  id = 'freq_momentum';
  
  predict(features: MarketFeatures): ModelPrediction[] {
    const w100 = features.windows[100];
    const w20 = features.windows[20];
    if (!w100 || !w20 || w100.size < 50) return [];

    // Simple momentum logic
    const evenMom = w20.evenPercent - w100.evenPercent;
    
    return [
      { target: 'EVEN' as PredictionTarget, probability: 0.5 + (evenMom / 100) },
      { target: 'ODD' as PredictionTarget, probability: 0.5 - (evenMom / 100) },
      { target: 'OVER_3' as PredictionTarget, probability: w20.over3Percent / 100 },
      { target: 'UNDER_7' as PredictionTarget, probability: w20.under7Percent / 100 }
    ].map(p => ({
      ...p,
      probability: Math.max(0.01, Math.min(0.99, p.probability))
    }));
  }

  update(features: MarketFeatures, actualDigit: number): void {
    // Online update stub for momentum (usually stateless, relies on engine)
  }
}

export class MarkovTransitionModel implements IOnlineModel {
  id = 'markov_1st_order';
  private transitions: Record<number, Record<number, number>> = {};
  private lastDigit: number | null = null;

  predict(features: MarketFeatures): ModelPrediction[] {
    if (this.lastDigit === null) return [];
    
    const freqs = this.transitions[this.lastDigit];
    if (!freqs) return [];

    let total = 0;
    let evenCount = 0;
    let over3Count = 0;
    let under7Count = 0;

    for (const [nextD, count] of Object.entries(freqs)) {
      const d = parseInt(nextD, 10);
      total += count;
      if (d % 2 === 0) evenCount += count;
      if (d > 3) over3Count += count;
      if (d < 7) under7Count += count;
    }

    if (total === 0) return [];

    return [
      { target: 'EVEN', probability: evenCount / total },
      { target: 'ODD', probability: (total - evenCount) / total },
      { target: 'OVER_3', probability: over3Count / total },
      { target: 'UNDER_7', probability: under7Count / total }
    ];
  }

  update(features: MarketFeatures, actualDigit: number): void {
    if (this.lastDigit !== null) {
      if (!this.transitions[this.lastDigit]) {
        this.transitions[this.lastDigit] = {};
        for(let i=0; i<=9; i++) this.transitions[this.lastDigit][i] = 0;
      }
      this.transitions[this.lastDigit][actualDigit]++;
    }
    this.lastDigit = actualDigit;
  }
}
