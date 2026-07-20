import { buildFeatureSnapshot } from '../lib/features/engine';
import { EnsembleModel } from '../lib/ml/ensemble';
import { detectRegime } from '../lib/ml/regime';
import { computeConfidence } from '../lib/ml/confidence';
import { evaluateTradeAction } from '../lib/ml/no-trade-model';

// Store ensemble state locally per market
const ensembles: Record<string, EnsembleModel> = {};
const stats: Record<string, { wins: number; total: number; consecutiveLosses: number }> = {};

self.addEventListener('message', (e) => {
  const { type, payload } = e.data;

  if (type === 'PROCESS_TICK') {
    const { market, quotes, pipSize } = payload;
    
    if (!ensembles[market]) {
      ensembles[market] = new EnsembleModel();
      stats[market] = { wins: 0, total: 0, consecutiveLosses: 0 };
    }
    
    const features = buildFeatureSnapshot(quotes, pipSize);
    features.regime = detectRegime(features);
    
    const ensemble = ensembles[market];
    const predictions = ensemble.predict(features);
    
    // Find best target
    let bestTarget = 'EVEN';
    let maxProb = 0;
    for (const [target, prob] of Object.entries(predictions)) {
      if (prob > maxProb) {
        maxProb = prob;
        bestTarget = target;
      }
    }
    
    const s = stats[market];
    const confidence = computeConfidence(maxProb, s.wins, s.total, s.consecutiveLosses, features.regime !== 'UNSTABLE' && features.regime !== 'TRANSITION');
    const { action, reason } = evaluateTradeAction(maxProb, confidence, features, s.consecutiveLosses);
    
    self.postMessage({
      type: 'TICK_PROCESSED',
      payload: {
        market,
        features,
        prediction: {
          target: bestTarget,
          probability: maxProb,
          confidence,
          virtualAction: action,
          rejectionReason: reason,
          modelVotes: ensemble.weights
        }
      }
    });
  } else if (type === 'SETTLE_CONTRACT') {
    const { market, quotes, pipSize, actualDigit, isWin } = payload;
    const ensemble = ensembles[market];
    if (ensemble) {
      const features = buildFeatureSnapshot(quotes, pipSize);
      ensemble.update(features, actualDigit);
      
      const s = stats[market];
      s.total++;
      if (isWin) {
        s.wins++;
        s.consecutiveLosses = 0;
      } else {
        s.consecutiveLosses++;
      }
    }
  }
});
