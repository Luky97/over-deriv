import type { DriftState, FeatureSnapshot } from '@/lib/types';

export class DriftDetector {
  private cusumPos = 0; private cusumNeg = 0;
  private errors: boolean[] = []; private regimeHistory: string[] = [];
  private consecutiveErrors = 0;

  update(snapshot: FeatureSnapshot, _digit: number): DriftState {
    this.regimeHistory.push(snapshot.regime);
    if (this.regimeHistory.length > 50) this.regimeHistory.shift();
    const regimeChanged = this.detectRegimeChange();
    const score = this.computeScore();
    return { severity: score > 0.6 ? 'SEVERE' : score > 0.3 ? 'WATCH' : 'NONE', score, regimeChanged, reasons: this.buildReasons(score, regimeChanged) };
  }

  recordPredictionError(error: boolean): void {
    this.errors.push(error);
    if (this.errors.length > 100) this.errors.shift();
    this.consecutiveErrors = error ? this.consecutiveErrors + 1 : 0;
    if (error) { this.cusumPos = Math.max(0, this.cusumPos + 0.1 - 0.02); this.cusumNeg = Math.max(0, this.cusumNeg + 0.1 - 0.02); }
    else { this.cusumPos = Math.max(0, this.cusumPos - 0.05); this.cusumNeg = Math.max(0, this.cusumNeg - 0.05); }
  }

  private detectRegimeChange(): boolean {
    if (this.regimeHistory.length < 10) return false;
    const recent = new Set(this.regimeHistory.slice(-5));
    const prev = new Set(this.regimeHistory.slice(-10, -5));
    if (recent.size === 1 && prev.size === 1) { const [r] = recent; const [p] = prev; return r !== p; }
    return false;
  }

  private computeScore(): number {
    const cusum = Math.max(this.cusumPos, this.cusumNeg);
    const errRate = this.errors.length > 0 ? this.errors.filter(Boolean).length / this.errors.length : 0;
    const errScore = errRate > 0.5 ? (errRate - 0.5) * 2 : 0;
    return Math.min(1, cusum * 2 + errScore);
  }

  private buildReasons(score: number, regimeChanged: boolean): string[] {
    const r: string[] = [];
    if (regimeChanged) r.push('Regime transition');
    if (score > 0.3) r.push(`Drift: ${score.toFixed(2)}`);
    if (this.consecutiveErrors >= 3) r.push(`${this.consecutiveErrors} consecutive errors`);
    return r;
  }

  serialize(): Record<string, unknown> { return { cp: this.cusumPos, cn: this.cusumNeg, err: this.errors.slice(-100), rh: this.regimeHistory.slice(-50) }; }
  restore(d: Record<string, unknown>): void { this.cusumPos = (d.cp as number) ?? 0; this.cusumNeg = (d.cn as number) ?? 0; this.errors = (d.err as boolean[]) ?? []; this.regimeHistory = (d.rh as string[]) ?? []; }
}

export function emptyDriftState(): DriftState { return { severity: 'NONE', score: 0, regimeChanged: false, reasons: [] }; }
