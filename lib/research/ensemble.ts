import type { ModelVote, PredictionTarget } from '@/lib/types';

export class AdaptiveEnsemble {
  private weights: Record<string, number> = { frequency: 0.25, markov: 0.25, ngram: 0.25, logistic: 0.25 };
  private updates = 0;

  predict(_target: PredictionTarget, _digit: number): number { return 0.5; }

  update(_target: PredictionTarget, _digit: number, won: boolean): void {
    this.updates++;
    const lr = Math.max(0.01, 0.1 / Math.sqrt(1 + this.updates / 100));
    for (const m of Object.keys(this.weights)) {
      this.weights[m] = Math.min(1, Math.max(0.01, this.weights[m] + (won ? lr * 0.1 : -lr * 0.05)));
    }
    const total = Object.values(this.weights).reduce((a, b) => a + b, 0);
    if (total > 0) for (const m of Object.keys(this.weights)) this.weights[m] /= total;
  }

  getVotes(_target: PredictionTarget, _digit: number): ModelVote[] {
    return Object.entries(this.weights).map(([k, w]) => ({ modelId: k, probability: 0.5, agreement: w, weight: w }));
  }

  serialize(): Record<string, unknown> { return { w: this.weights, u: this.updates }; }
  restore(d: Record<string, unknown>): void { this.weights = (d.w as Record<string, number>) ?? { frequency: 0.25, markov: 0.25, ngram: 0.25, logistic: 0.25 }; this.updates = (d.u as number) ?? 0; }
}
