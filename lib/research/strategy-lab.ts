import type { StrategyDefinition } from '@/lib/types';

export class StrategyLab {
  constructor(private strategies: StrategyDefinition[]) {}

  getStrategies(): StrategyDefinition[] { return this.strategies; }

  recordResult(strategyId: string, won: boolean, probability: number): void {
    const s = this.strategies.find(x => x.id === strategyId);
    if (!s) return;
    s.evidence++;
    if (won) s.wins++;
    const err = (won ? 1 : 0) - probability;
    s.brierScore = ((s.brierScore * (s.evidence - 1)) + err ** 2) / s.evidence;
    this.evaluate(s);
  }

  private evaluate(s: StrategyDefinition): void {
    if (s.status === 'EXPERIMENTAL' && s.evidence >= 20 && s.wins >= 14) { s.status = 'SHADOW_TESTING'; s.promotionReason = 'Met experimental threshold'; }
    if (s.status === 'SHADOW_TESTING' && s.evidence >= 50 && s.wins >= 35) { s.status = 'CHALLENGER'; s.promotionReason = 'Met shadow testing threshold'; }
    if (s.status === 'CHALLENGER' && s.evidence >= 100 && s.wins >= 65) {
      const champ = this.strategies.find(x => x.status === 'CHAMPION');
      if (!champ || s.wins / s.evidence > champ.wins / Math.max(1, champ.evidence)) {
        if (champ) { champ.status = 'PAUSED'; champ.promotionReason = 'Replaced'; }
        s.status = 'CHAMPION'; s.promotionReason = 'Promoted from challenger';
      }
    }
  }

  serialize(): Record<string, unknown> { return { strategies: this.strategies.map(s => ({ ...s })) }; }
  restore(d: Record<string, unknown>): void { if (d.strategies) this.strategies = d.strategies as StrategyDefinition[]; }
}

export function createDefaultStrategies(): StrategyDefinition[] {
  return [
    { id: 'even_odd', name: 'Even/Odd Baseline', version: 1, status: 'EXPERIMENTAL', windowSize: 50, enabledTargets: ['EVEN','ODD'], probabilityFloor: 0.52, agreementFloor: 0.5, allowedRegimes: ['EVEN_DOMINANT','ODD_DOMINANT','MIXED'], evidence: 0, wins: 0, brierScore: 0.25, promotionReason: '' },
    { id: 'over_under', name: 'Over/Under Strategy', version: 1, status: 'EXPERIMENTAL', windowSize: 50, enabledTargets: ['OVER_3','UNDER_7'], probabilityFloor: 0.55, agreementFloor: 0.5, allowedRegimes: ['OVER3_DOMINANT','UNDER7_DOMINANT','MIXED'], evidence: 0, wins: 0, brierScore: 0.25, promotionReason: '' },
    { id: 'full_analysis', name: 'Full Analysis', version: 1, status: 'EXPERIMENTAL', windowSize: 100, enabledTargets: ['EVEN','ODD','OVER_3','UNDER_7'], probabilityFloor: 0.5, agreementFloor: 0.5, allowedRegimes: ['EVEN_DOMINANT','ODD_DOMINANT','OVER3_DOMINANT','UNDER7_DOMINANT','MIXED'], evidence: 0, wins: 0, brierScore: 0.25, promotionReason: '' },
  ];
}
