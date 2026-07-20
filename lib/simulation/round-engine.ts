import type { VirtualContractResult } from '../ml-types';

export function evaluateRoundStatus(contracts: VirtualContractResult[]): 'WIN' | 'LOSS' | 'IN_PROGRESS' {
  if (contracts.length === 0) return 'IN_PROGRESS';

  const wins = contracts.filter(c => c.isWin).length;
  const losses = contracts.length - wins;

  // Rule: 4 wins means ROUND WIN
  if (wins >= 4) return 'WIN';

  // Rule: 3 consecutive losses means immediate ROUND LOSS
  let consecutiveLosses = 0;
  for (const c of contracts) {
    if (!c.isWin) {
      consecutiveLosses++;
      if (consecutiveLosses >= 3) return 'LOSS';
    } else {
      consecutiveLosses = 0;
    }
  }

  // If 5 contracts are completed and wins < 4, it's a LOSS
  if (contracts.length === 5) {
    return 'LOSS';
  }

  return 'IN_PROGRESS';
}

export function isTargetMet(target: string, digit: number): boolean {
  switch (target) {
    case 'EVEN': return digit % 2 === 0;
    case 'ODD': return digit % 2 !== 0;
    case 'OVER_3': return digit > 3;
    case 'UNDER_7': return digit < 7;
    default: return false;
  }
}
