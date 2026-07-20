import type { MarketResearchView } from '@/lib/types';
import { percent } from './format';

export function ConfidencePanel({ research, threshold }: { research: MarketResearchView; threshold: number }) {
  const confidence = research.confidence;
  return <div className="grid gap-5 xl:grid-cols-[1.1fr_1fr]">
    <section className="panel-block">
      <div className="panel-heading"><div><p className="eyebrow">Evidence-based confidence</p><h3>{confidence.value.toFixed(1)}%</h3></div><span className="text-sm text-slate-400">Active threshold {threshold}%</span></div>
      <div className="confidence-track mt-5"><span style={{ width: `${confidence.value}%` }} /><i style={{ left: `${threshold}%` }} /></div>
      <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-3">
        <div className="mini-stat"><span>Sample cap</span><strong>{percent(confidence.sampleSizeCap)}</strong></div>
        <div className="mini-stat"><span>Wilson lower</span><strong>{percent(confidence.wilsonLowerBound)}</strong></div>
        <div className="mini-stat"><span>Bayesian lower</span><strong>{percent(confidence.bayesianLowerBound)}</strong></div>
        <div className="mini-stat"><span>Recent win rate</span><strong>{percent(confidence.recentWinRate)}</strong></div>
        <div className="mini-stat"><span>Agreement</span><strong>{percent(confidence.ensembleAgreement)}</strong></div>
        <div className="mini-stat"><span>Regime stability</span><strong>{percent(confidence.regimeStability)}</strong></div>
      </div>
      <p className="mt-5 text-sm text-slate-400">Confidence is verified evidence × sample-size cap × stability, minus drift, loss, and calibration penalties. It is not a promised win rate.</p>
    </section>
    <section className="panel-block">
      <p className="eyebrow">Change explanation</p><h3>Why the score moved</h3>
      <ul className="mt-4 space-y-3">{confidence.reasons.map((reason) => <li key={reason} className="rounded-lg border border-white/5 bg-black/15 px-3 py-2 text-sm text-slate-300">{reason}</li>)}</ul>
      <div className="mt-4 grid grid-cols-3 gap-2 text-center text-xs"><div className="mini-stat"><span>Drift penalty</span><strong>-{confidence.driftPenalty.toFixed(1)}</strong></div><div className="mini-stat"><span>Loss penalty</span><strong>-{confidence.lossPenalty.toFixed(1)}</strong></div><div className="mini-stat"><span>Calibration</span><strong>-{confidence.calibrationPenalty.toFixed(1)}</strong></div></div>
    </section>
  </div>;
}
