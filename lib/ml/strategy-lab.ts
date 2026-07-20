export interface Strategy {
  id: string;
  triggerType: 'Digit' | 'Automatic';
  triggerDigit?: number;
  targets: string[];
  weights: Record<string, number>;
  status: 'EXPERIMENTAL' | 'SHADOW_TESTING' | 'CHALLENGER' | 'CHAMPION' | 'PAUSED' | 'RETIRED';
}

export function evaluateStrategyPromotion(
  strategy: Strategy,
  wins: number,
  total: number,
  confidence: number
): Strategy['status'] {
  if (strategy.status === 'EXPERIMENTAL') {
    if (total > 10) return 'SHADOW_TESTING';
  }
  
  if (strategy.status === 'SHADOW_TESTING') {
    if (total >= 50 && confidence >= 80) return 'CHALLENGER';
    if (total >= 100 && confidence < 40) return 'RETIRED';
  }
  
  if (strategy.status === 'CHALLENGER') {
    // If it outperforms champion, it could become champion
    // This logic is typically handled by the engine comparing them
  }
  
  return strategy.status;
}
