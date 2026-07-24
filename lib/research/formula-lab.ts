import type { FormulaCandidate, FeatureSnapshot } from '@/lib/types';

export class FormulaLab {
  private candidates: FormulaCandidate[] = [];
  private updates = 0;

  update(snapshot: FeatureSnapshot, actualDigit: number): void {
    this.updates++;
    const w = snapshot.windows['20'];
    if (!w) return;
    const mostCommon = w.counts.indexOf(Math.max(...w.counts));
    const correct = mostCommon === actualDigit;
    const existing = this.candidates.find(c => c.id === 'most_common');
    if (existing) {
      existing.validationSamples++;
      if (correct) existing.validationCorrect++;
      existing.validationAccuracy = existing.validationCorrect / existing.validationSamples;
      existing.wilsonLowerBound = computeWilson(existing.validationCorrect, existing.validationSamples);
      if (existing.validationSamples >= 50 && existing.validationAccuracy < 0.2) { existing.status = 'REJECTED'; existing.reason = 'Accuracy below 20%'; }
      else if (existing.validationSamples >= 50 && existing.validationAccuracy > 0.4) { existing.status = 'UNDER_SHADOW_VALIDATION'; existing.reason = `${(existing.validationAccuracy * 100).toFixed(0)}% accuracy`; }
    } else {
      this.candidates.push({ id: 'most_common', label: 'Most Common Digit', status: 'PROMISING_EXPERIMENTAL_FORMULA', validationAccuracy: correct ? 1 : 0, wilsonLowerBound: 0, validationSamples: 1, validationCorrect: correct ? 1 : 0, trainingSamples: 1, reason: 'Initial' });
    }
  }

  list(): FormulaCandidate[] { return [...this.candidates].slice(0, 10); }
  serialize(): Record<string, unknown> { return { candidates: this.candidates, updates: this.updates }; }
  restore(d: Record<string, unknown>): void { this.candidates = (d.candidates as FormulaCandidate[]) ?? []; this.updates = (d.updates as number) ?? 0; }
}

function computeWilson(correct: number, total: number): number {
  if (total === 0) return 0;
  const p = correct / total;
  const z = 1.96;
  const denom = 1 + z * z / total;
  const center = p + z * z / (2 * total);
  const margin = z * Math.sqrt((p * (1 - p) / total) + (z * z / (4 * total * total)));
  return Math.max(0, (center - margin) / denom);
}
