export function calculateWilsonScore(wins: number, total: number): number {
  if (total === 0) return 0;
  
  const z = 1.96; // 95% confidence
  const p = wins / total;
  
  const denominator = 1 + z * z / total;
  const centre = p + z * z / (2 * total);
  const spread = z * Math.sqrt((p * (1 - p) + z * z / (4 * total)) / total);
  
  const lowerBound = (centre - spread) / denominator;
  return lowerBound;
}

export function computeConfidence(
  probability: number,
  wins: number,
  total: number,
  consecutiveLosses: number,
  regimeStability: boolean
): number {
  if (total < 10) return 0; // Not enough evidence
  
  let confidence = calculateWilsonScore(wins, total) * 100;
  
  // Penalties
  if (!regimeStability) confidence -= 20;
  if (consecutiveLosses > 0) confidence -= (consecutiveLosses * 15);
  
  // Cap based on probability calibration
  if (probability < 0.6) confidence = Math.min(confidence, 40);
  
  return Math.max(0, Math.min(100, confidence));
}
