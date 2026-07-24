import type { PredictionTarget } from '@/lib/types';

export function targetOutcome(target: PredictionTarget, digit: number): boolean {
  if (target === 'EVEN') return digit % 2 === 0;
  if (target === 'ODD') return digit % 2 !== 0;
  if (target === 'OVER_3') return digit > 3;
  return digit < 7;
}

export function baselineProbabilities(): Record<PredictionTarget, number> {
  return { EVEN: 0.5, ODD: 0.5, OVER_3: 0.6, UNDER_7: 0.7 };
}
