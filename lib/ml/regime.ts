import type { MarketFeatures } from '../features/engine';
import type { RegimeLabel } from '../ml-types';

export function detectRegime(features: MarketFeatures): RegimeLabel {
  const w1000 = features.windows[1000];
  if (!w1000 || w1000.size < 100) return 'UNSTABLE';

  const { evenPercent, oddPercent, over3Percent, under7Percent } = w1000;

  if (evenPercent > 55) return 'EVEN_DOMINANT';
  if (oddPercent > 55) return 'ODD_DOMINANT';
  if (over3Percent > 65) return 'OVER3_DOMINANT';
  if (under7Percent > 75) return 'UNDER7_DOMINANT';
  
  if (features.entropy > 3.25) return 'HIGH_ENTROPY';
  if (features.entropy < 3.0) return 'LOW_ENTROPY';

  // Compare w50 to w1000 for transitions
  const w50 = features.windows[50];
  if (w50) {
    if (Math.abs(w50.evenPercent - evenPercent) > 10) return 'TRANSITION';
  }

  return 'MIXED';
}
