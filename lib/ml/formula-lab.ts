import type { FeatureSnapshot, FormulaCandidate } from '@/lib/types';
import { wilsonLowerBound } from './confidence';

export interface FormulaLabState { candidates: FormulaCandidate[] }

export function createFormulaCandidates(): FormulaCandidate[] {
  const seed: Array<Pick<FormulaCandidate, 'id' | 'label' | 'operator' | 'lagA' | 'lagB' | 'period'>> = [
    { id: 'lag-1', label: 'Previous digit persistence', operator: 'LAG', lagA: 1 },
    { id: 'lag-2', label: 'Two-tick lag', operator: 'LAG', lagA: 2 },
    { id: 'add-1-2', label: '(lag 1 + lag 2) mod 10', operator: 'ADD_MOD_10', lagA: 1, lagB: 2 },
    { id: 'sub-1-2', label: '(lag 1 - lag 2) mod 10', operator: 'SUB_MOD_10', lagA: 1, lagB: 2 },
    { id: 'distance-1-3', label: '|lag 1 - lag 3| mod 10', operator: 'ABS_DIFF_MOD_10', lagA: 1, lagB: 3 },
    { id: 'quote-difference', label: 'Pip-normalized quote difference mod 10', operator: 'QUOTE_DIFF_MOD_10', lagA: 1 },
    { id: 'server-second', label: 'Server second mod 10', operator: 'TIME_MOD_10', lagA: 1, period: 10 },
    { id: 'rank-most', label: '20-tick most rank', operator: 'RANK_MOST', lagA: 1 },
    { id: 'rank-least', label: '20-tick least rank', operator: 'RANK_LEAST', lagA: 1 },
  ];
  return seed.map((candidate) => ({
    ...candidate,
    status: 'UNDER_SHADOW_VALIDATION',
    trainingSamples: 0,
    validationSamples: 0,
    validationCorrect: 0,
    validationAccuracy: 0,
    wilsonLowerBound: 0,
    reason: 'Chronological training window is collecting',
  }));
}

function lag(snapshot: FeatureSnapshot, amount: number): number {
  const digits = snapshot.sequence.previousDigits['20'];
  return digits[digits.length - amount] ?? 0;
}

export function evaluateFormula(candidate: FormulaCandidate, snapshot: FeatureSnapshot): number {
  const a = lag(snapshot, candidate.lagA);
  const b = lag(snapshot, candidate.lagB ?? candidate.lagA);
  switch (candidate.operator) {
    case 'LAG': return a;
    case 'ADD_MOD_10': return (a + b) % 10;
    case 'SUB_MOD_10': return ((a - b) % 10 + 10) % 10;
    case 'ABS_DIFF_MOD_10': return Math.abs(a - b) % 10;
    case 'QUOTE_DIFF_MOD_10': return Math.abs(Math.round(snapshot.quote.pipNormalizedChange)) % 10;
    case 'TIME_MOD_10': return snapshot.time.serverSecond % (candidate.period ?? 10);
    case 'RANK_MOST': return snapshot.windows[20].rankings.most.digits[0] ?? 0;
    case 'RANK_LEAST': return snapshot.windows[20].rankings.least.digits[0] ?? 0;
  }
}

export class FormulaLab {
  private candidates = createFormulaCandidates();

  update(snapshot: FeatureSnapshot, actualDigit: number): void {
    this.candidates = this.candidates.map((candidate) => {
      if (candidate.status === 'REJECTED') return candidate;
      if (candidate.trainingSamples < 50) {
        return {
          ...candidate,
          trainingSamples: candidate.trainingSamples + 1,
          reason: `${candidate.trainingSamples + 1}/50 chronological training observations`,
        };
      }
      const validationSamples = candidate.validationSamples + 1;
      const validationCorrect = candidate.validationCorrect + Number(evaluateFormula(candidate, snapshot) === actualDigit);
      const validationAccuracy = validationCorrect / validationSamples;
      const lower = wilsonLowerBound(validationCorrect, validationSamples);
      if (validationSamples >= 75) {
        if (validationAccuracy >= 0.18 && lower > 0.1) {
          return {
            ...candidate, validationSamples, validationCorrect, validationAccuracy,
            wilsonLowerBound: lower, status: 'PROMISING_EXPERIMENTAL_FORMULA',
            reason: 'Exact-digit accuracy remains above the random baseline on unseen chronological samples',
          };
        }
        return {
          ...candidate, validationSamples, validationCorrect, validationAccuracy,
          wilsonLowerBound: lower, status: 'REJECTED',
          reason: 'Walk-forward exact-digit validation did not beat the random baseline credibly',
        };
      }
      return {
        ...candidate, validationSamples, validationCorrect, validationAccuracy,
        wilsonLowerBound: lower,
        reason: `${validationSamples}/75 unseen chronological validation observations`,
      };
    });
  }

  list(): FormulaCandidate[] { return structuredClone(this.candidates); }
  serialize(): FormulaLabState { return { candidates: this.list() }; }
  restore(state: FormulaLabState | undefined): void {
    if (state?.candidates?.length) this.candidates = state.candidates;
  }
}
