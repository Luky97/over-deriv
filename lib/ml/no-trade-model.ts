import type { MarketFeatures } from '../features/engine';

export function evaluateTradeAction(
  probability: number,
  confidence: number,
  features: MarketFeatures,
  consecutiveLosses: number
): { action: 'TRADE' | 'NO_TRADE'; reason?: string } {
  if (features.regime === 'UNSTABLE' || features.regime === 'TRANSITION') {
    return { action: 'NO_TRADE', reason: 'Unstable Regime' };
  }
  
  if (consecutiveLosses >= 3) {
    return { action: 'NO_TRADE', reason: 'Cooldown Active' };
  }
  
  if (confidence < 80) {
    return { action: 'NO_TRADE', reason: 'Insufficient Confidence' };
  }
  
  if (probability < 0.55) {
    return { action: 'NO_TRADE', reason: 'Low Probability' };
  }
  
  return { action: 'TRADE' };
}
