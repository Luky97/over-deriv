import type { FeatureSnapshot, MarketTick, RegimeLabel, WindowFeatures, SequenceFeatures } from '@/lib/types';

export function buildFeatureSnapshot(market: string, ticks: MarketTick[]): FeatureSnapshot {
  const digits = ticks.map((t) => t.digit);
  const w20 = computeWindow(digits.slice(-20), 20);
  const w100 = computeWindow(digits.slice(-100), 100);
  const sampleSize = digits.length;
  const parityImbalance = w20.evenPercentage - w20.oddPercentage;
  const seq = computeSequence(digits);
  const regime = detectRegime(w20, sampleSize);
  const regStab = computeRegimeStability(digits);
  const entropy = computeEntropy(digits.slice(-20));
  const vector = [w20.evenPercentage / 100, w20.oddPercentage / 100, w20.over3Percentage / 100, w20.under7Percentage / 100, entropy / 4, parityImbalance / 100, regStab, w100.evenPercentage / 100, w100.oddPercentage / 100, w100.over3Percentage / 100, w100.under7Percentage / 100];
  const epoch = ticks.length > 0 ? ticks[ticks.length - 1].epoch : Date.now();
  return { schemaVersion: 1, id: `${market}:snapshot:${epoch}`, market, createdAtEpoch: epoch, sampleSize, windows: { '20': w20, '100': w100 }, parityImbalance, sequence: seq, regime, featureNames: ['even20','odd20','over320','under720','entropy20','parityImbalance','regimeStability','even100','odd100','over3100','under7100'], vector, randomness: { regimeStability: regStab, shannonEntropy: entropy } };
}

function computeWindow(digits: number[], size: number): WindowFeatures {
  const counts = Array(10).fill(0);
  for (const d of digits) counts[d]++;
  const total = digits.length || 1;
  const pcts = counts.map((c) => (c / total) * 100);
  const even = counts.filter((_, i) => i % 2 === 0).reduce((a, b) => a + b, 0);
  const odd = total - even;
  const over3 = counts.slice(4).reduce((a, b) => a + b, 0);
  const under7 = counts.slice(0, 7).reduce((a, b) => a + b, 0);
  const entropy = -pcts.reduce((s, p) => { const prob = p / 100; return prob > 0 ? s + prob * Math.log2(prob) : s; }, 0);
  return { size, counts, percentages: pcts, evenPercentage: (even / total) * 100, oddPercentage: (odd / total) * 100, over3Percentage: (over3 / total) * 100, under7Percentage: (under7 / total) * 100, entropy };
}

function computeSequence(digits: number[]): SequenceFeatures {
  const len = digits.length;
  return { previousDigits: { '1': len >= 1 ? [digits[len - 1]] : [], '2': len >= 2 ? [digits[len - 2], digits[len - 1]] : [], '3': len >= 3 ? digits.slice(-3) : [], '5': len >= 5 ? digits.slice(-5) : [], '10': len >= 10 ? digits.slice(-10) : [], '20': len >= 20 ? digits.slice(-20) : [] }, firstOrderDigit: Array.from({ length: 10 }, () => Array(10).fill(0)), parityFirstOrder: { labels: ['Even', 'Odd'], counts: [[0, 0], [0, 0]], probabilities: [[0.5, 0.5], [0.5, 0.5]] }, ngramOccurrences: {} };
}

function detectRegime(w: WindowFeatures, total: number): RegimeLabel {
  if (total < 20) return 'UNSTABLE';
  if (w.entropy > 3.2) return 'HIGH_ENTROPY';
  if (w.entropy < 2.8) return 'LOW_ENTROPY';
  if (w.evenPercentage > 60) return 'EVEN_DOMINANT';
  if (w.oddPercentage > 60) return 'ODD_DOMINANT';
  if (w.over3Percentage > 70) return 'OVER3_DOMINANT';
  if (w.under7Percentage > 80) return 'UNDER7_DOMINANT';
  return 'MIXED';
}

function computeRegimeStability(digits: number[]): number {
  if (digits.length < 40) return 0;
  const recent = digits.slice(-20);
  const older = digits.slice(-40, -20);
  return 1 - Math.abs(recent.filter(d => d % 2 === 0).length / 20 - older.filter(d => d % 2 === 0).length / 20);
}

function computeEntropy(digits: number[]): number {
  if (!digits.length) return 0;
  const counts = Array(10).fill(0);
  for (const d of digits) counts[d]++;
  return -counts.reduce((s, c) => { const p = c / digits.length; return p > 0 ? s + p * Math.log2(p) : s; }, 0);
}
