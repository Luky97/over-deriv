import type { ConfidenceBreakdown, DriftState, ResearchSettings } from '@/lib/types';

export interface EvidenceState {
  total: number; wins: number; losses: number;
  recentWins: number[]; brierTotal: number;
  consecutiveLosses: number; lastConfidence: number;
  similarContextSuccess: number; similarContextTotal: number;
}

export function createEvidenceState(): EvidenceState {
  return { total: 0, wins: 0, losses: 0, recentWins: [], brierTotal: 0, consecutiveLosses: 0, lastConfidence: 0, similarContextSuccess: 0, similarContextTotal: 0 };
}

export function updateEvidence(evidence: EvidenceState, won: boolean, probability: number, sameRegime: boolean): EvidenceState {
  const recentWins = [...evidence.recentWins, won ? 1 : 0].slice(-50);
  return {
    total: evidence.total + 1,
    wins: evidence.wins + (won ? 1 : 0),
    losses: evidence.losses + (won ? 0 : 1),
    recentWins,
    brierTotal: evidence.brierTotal + (won ? 1 - probability : probability) ** 2,
    consecutiveLosses: won ? 0 : evidence.consecutiveLosses + 1,
    lastConfidence: evidence.lastConfidence,
    similarContextSuccess: sameRegime ? evidence.similarContextSuccess + (won ? 1 : 0) : evidence.similarContextSuccess,
    similarContextTotal: sameRegime ? evidence.similarContextTotal + 1 : evidence.similarContextTotal,
  };
}

export function computeConfidence(evidence: EvidenceState, settings: ResearchSettings, drift: DriftState): ConfidenceBreakdown {
  if (evidence.total === 0) {
    return { value: 0, previousValue: 0, delta: 0, verifiedEvidence: 0, recentWinRate: 0, longTermWinRate: 0, ensembleAgreement: 0, regimeStability: 0, similarContextSuccess: 0, driftPenalty: 0, lossPenalty: 0, calibrationPenalty: 0, reasons: ['No evidence'] };
  }
  const prev = evidence.lastConfidence;
  const recentWinRate = evidence.recentWins.length > 0 ? evidence.recentWins.reduce((a, b) => a + b, 0) / evidence.recentWins.length : evidence.wins / evidence.total;
  const winRate = evidence.wins / evidence.total;
  let value = recentWinRate * 100;
  const reasons: string[] = [];
  let driftPenalty = 0, lossPenalty = 0, calibrationPenalty = 0;
  if (drift.severity === 'WATCH') { driftPenalty = 10; reasons.push('Drift watch: -10%'); }
  else if (drift.severity === 'SEVERE') { driftPenalty = 25; reasons.push('Severe drift: -25%'); }
  value -= driftPenalty;
  if (evidence.consecutiveLosses >= 3) { lossPenalty = 20; reasons.push('3+ consecutive losses: -20%'); }
  else if (evidence.consecutiveLosses >= 2) { lossPenalty = 10; reasons.push('2 consecutive losses: -10%'); }
  value -= lossPenalty;
  const cal = evidence.total > 0 ? 1 - evidence.brierTotal / evidence.total : 0;
  if (cal < 0.3) { calibrationPenalty = 15; reasons.push('Low calibration: -15%'); }
  value -= calibrationPenalty;
  value = Math.max(0, Math.min(100, value));
  reasons.push(`Win rate: ${(winRate * 100).toFixed(0)}%`);
  return { value, previousValue: prev, delta: value - prev, verifiedEvidence: evidence.total, recentWinRate: recentWinRate * 100, longTermWinRate: winRate * 100, ensembleAgreement: 0.5, regimeStability: 0.5, similarContextSuccess: evidence.similarContextTotal > 0 ? (evidence.similarContextSuccess / evidence.similarContextTotal) * 100 : 0, driftPenalty, lossPenalty, calibrationPenalty, reasons };
}
