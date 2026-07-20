import { describe, expect, it } from 'vitest';
import { buildFeatureSnapshot } from '../lib/features/engine';
import {
  computeConfidence,
  createEvidenceState,
  updateEvidence,
} from '../lib/ml/confidence';
import { evaluateFormula, FormulaLab } from '../lib/ml/formula-lab';
import {
  advanceStrategyLifecycle,
  createDefaultStrategies,
} from '../lib/ml/strategy-lab';
import { makeHistory } from './helpers';

function score(evidence = createEvidenceState(), severity: 'NONE' | 'SEVERE' = 'NONE') {
  return computeConfidence({
    evidence,
    minimumSamples: 50,
    agreement: 0.9,
    regimeStability: 0.9,
    driftSeverity: severity,
    driftScore: severity === 'SEVERE' ? 0.9 : 0,
    mode: severity === 'SEVERE' ? 'COOLDOWN' : 'SILENT_LEARNING',
    activeThreshold: 80,
  });
}

describe('evidence-based confidence', () => {
  it('starts at exactly zero and is capped by sample size', () => {
    expect(score().value).toBe(0);
    let evidence = createEvidenceState();
    for (let index = 0; index < 10; index += 1) evidence = updateEvidence(evidence, true, 0.75, true);
    const confidence = score(evidence);
    expect(confidence.sampleSizeCap).toBeCloseTo(0.2);
    expect(confidence.value).toBeLessThan(25);
  });

  it('increases on qualified wins and falls more sharply on a loss', () => {
    let evidence = createEvidenceState();
    for (let index = 0; index < 35; index += 1) evidence = updateEvidence(evidence, index % 5 !== 0, 0.72, true);
    const before = score(evidence);
    evidence.lastConfidence = before.value;
    const won = updateEvidence(evidence, true, 0.72, true);
    const afterWin = score(won);
    expect(afterWin.value).toBeGreaterThan(before.value);
    won.lastConfidence = afterWin.value;
    const lost = updateEvidence(won, false, 0.72, true);
    const afterLoss = score(lost);
    expect(afterLoss.value).toBeLessThan(afterWin.value);
    expect(afterWin.value - afterLoss.value).toBeGreaterThan(afterWin.value - before.value);
  });

  it('forces three losses and severe drift below the active threshold', () => {
    let evidence = createEvidenceState();
    for (let index = 0; index < 100; index += 1) evidence = updateEvidence(evidence, true, 0.9, true);
    for (let index = 0; index < 3; index += 1) evidence = updateEvidence(evidence, false, 0.9, true);
    const cooldown = computeConfidence({
      evidence, minimumSamples: 50, agreement: 0.95, regimeStability: 1,
      driftSeverity: 'NONE', driftScore: 0, mode: 'COOLDOWN', activeThreshold: 80,
    });
    expect(cooldown.value).toBeLessThan(50);
    expect(score(evidence, 'SEVERE').value).toBeLessThan(50);
  });
});

describe('strategy and formula validation', () => {
  it('does not promote a short lucky strategy run', () => {
    const strategies = createDefaultStrategies();
    const challenger = strategies[1];
    challenger.evidence = 20;
    challenger.wins = 20;
    challenger.wilsonLowerBound = 0.8;
    const advanced = advanceStrategyLifecycle(strategies, 50);
    expect(advanced.find((strategy) => strategy.id === challenger.id)?.status).toBe('SHADOW_TESTING');
  });

  it('requires unseen evidence, calibration and a stronger lower bound for promotion', () => {
    const strategies = createDefaultStrategies();
    const champion = strategies[0];
    champion.evidence = 100;
    champion.wins = 55;
    champion.wilsonLowerBound = 0.45;
    champion.brierScore = 0.25;
    const challenger = strategies[1];
    challenger.status = 'CHALLENGER';
    challenger.evidence = 100;
    challenger.wins = 75;
    challenger.wilsonLowerBound = 0.65;
    challenger.brierScore = 0.18;
    const advanced = advanceStrategyLifecycle(strategies, 50);
    expect(advanced.find((strategy) => strategy.id === challenger.id)?.status).toBe('CHAMPION');
    expect(advanced.find((strategy) => strategy.id === champion.id)?.status).toBe('PAUSED');
  });

  it('rejects formulas that fail chronological walk-forward validation', () => {
    const lab = new FormulaLab();
    const snapshot = buildFeatureSnapshot('R_10', makeHistory(1000, 0));
    const predicted = new Set(lab.list().map((candidate) => evaluateFormula(candidate, snapshot)));
    const alwaysWrong = Array.from({ length: 10 }, (_, digit) => digit).find((digit) => !predicted.has(digit));
    expect(alwaysWrong).toBeDefined();
    for (let index = 0; index < 125; index += 1) lab.update(snapshot, alwaysWrong ?? 0);
    expect(lab.list().every((candidate) => candidate.status === 'REJECTED')).toBe(true);
  });
});
