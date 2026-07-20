import type { MarketResearchView, PredictionTarget } from '@/lib/types';
import { PREDICTION_TARGETS } from '@/lib/types';
import { displayTarget, percent } from './format';

export function PredictionPanel({ research }: { research: MarketResearchView }) {
  const prediction = research.recommendation;
  if (!prediction) return <div className="empty-state">No prediction is produced while the market is collecting or resynchronizing.</div>;
  return (
    <div className="space-y-5">
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {PREDICTION_TARGETS.map((target: PredictionTarget) => <div key={target} className={`probability-card ${prediction.target === target ? 'probability-selected' : ''}`}><span>{displayTarget(target)}</span><strong>{percent(prediction.targetProbabilities[target])}</strong><div className="probability-track"><i style={{ width: percent(prediction.targetProbabilities[target], 2) }} /></div></div>)}
      </div>
      <section className="panel-block">
        <div className="flex flex-col justify-between gap-4 md:flex-row md:items-center">
          <div><p className="eyebrow">Recommended action</p><h3 className="mt-1 text-2xl">{prediction.action === 'TRADE' ? `VIRTUAL ${displayTarget(prediction.target)}` : 'NO TRADE'}</h3><p className="mt-2 text-sm text-slate-400">Champion {prediction.strategyId} · probability {percent(prediction.probability)} · meta acceptance {percent(prediction.metaProbability)}</p></div>
          <div className={`action-badge ${prediction.action === 'TRADE' ? 'action-trade' : 'action-no-trade'}`}>{prediction.action.replace('_', ' ')}</div>
        </div>
        {prediction.rejectionReasons.length > 0 && <div className="mt-5 rounded-xl border border-amber-400/15 bg-amber-400/5 p-4"><p className="text-sm font-medium text-amber-200">Why entry is rejected</p><ul className="mt-2 space-y-1 text-sm text-slate-300">{prediction.rejectionReasons.map((reason) => <li key={reason}>• {reason}</li>)}</ul></div>}
        <p className="mt-4 text-xs text-slate-500">This is a research recommendation for the next eligible result tick. A contract prediction becomes immutable only after the required skipped tick.</p>
      </section>
      <section className="panel-block overflow-x-auto">
        <div className="panel-heading"><div><p className="eyebrow">Ensemble evidence</p><h3>Weighted out-of-sample model votes</h3></div><span className="text-sm text-slate-400">Agreement {percent(prediction.ensembleAgreement)}</span></div>
        <table className="research-table mt-4 min-w-[720px]"><thead><tr><th>Model</th><th>Probability</th><th>Weight</th><th>Evidence</th><th>Recent accuracy</th><th>Calibration</th><th>Regime fit</th></tr></thead><tbody>{prediction.modelVotes.map((vote) => <tr key={vote.modelId}><td>{vote.modelId}</td><td>{percent(vote.probability)}</td><td>{vote.weight.toFixed(3)}</td><td>{vote.evidence}</td><td>{percent(vote.recentAccuracy)}</td><td>{percent(vote.calibrationScore)}</td><td>{percent(vote.regimeCompatibility)}</td></tr>)}</tbody></table>
      </section>
    </div>
  );
}
