import type { MarketFeatures } from '../features/engine';
import type { PredictionTarget, ContractPrediction } from '../ml-types';
import { FrequencyMomentumModel, MarkovTransitionModel, type IOnlineModel } from './models';

export class EnsembleModel {
  models: IOnlineModel[] = [
    new FrequencyMomentumModel(),
    new MarkovTransitionModel()
  ];
  
  weights: Record<string, number> = {
    'freq_momentum': 0.5,
    'markov_1st_order': 0.5
  };

  predict(features: MarketFeatures): Record<PredictionTarget, number> {
    const combined: Record<PredictionTarget, number> = {
      EVEN: 0, ODD: 0, OVER_3: 0, UNDER_7: 0
    };
    
    let totalWeight = 0;

    for (const model of this.models) {
      const preds = model.predict(features);
      const weight = this.weights[model.id] || 0;
      
      if (preds.length > 0 && weight > 0) {
        totalWeight += weight;
        for (const p of preds) {
          combined[p.target] += p.probability * weight;
        }
      }
    }

    if (totalWeight > 0) {
      combined.EVEN /= totalWeight;
      combined.ODD /= totalWeight;
      combined.OVER_3 /= totalWeight;
      combined.UNDER_7 /= totalWeight;
    }

    return combined;
  }

  update(features: MarketFeatures, actualDigit: number): void {
    for (const model of this.models) {
      model.update(features, actualDigit);
    }
    // Weights are updated externally based on win/loss history
  }
}
