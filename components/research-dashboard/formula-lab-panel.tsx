import type { MarketResearchView } from '@/lib/types';
import { displayEnum, percent } from './format';

export function FormulaLabPanel({ research }: { research: MarketResearchView }) {
  const promising = research.formulas.some((formula) => formula.status === 'PROMISING_EXPERIMENTAL_FORMULA');
  const active = research.formulas.some((formula) => formula.status === 'UNDER_SHADOW_VALIDATION');
  const headline = promising ? 'Promising experimental formula' : active ? 'Formula under shadow validation' : 'No reliable formula found';
  return <section className="panel-block overflow-x-auto"><div className="panel-heading"><div><p className="eyebrow">Safe nth-term research</p><h3>{headline}</h3></div><span className="text-sm text-slate-400">Chronological walk-forward only</span></div><table className="research-table mt-4 min-w-[850px]"><thead><tr><th>Candidate</th><th>Operator</th><th>Status</th><th>Training</th><th>Unseen validation</th><th>Exact-digit accuracy</th><th>Wilson lower</th><th>Decision</th></tr></thead><tbody>{research.formulas.map((formula) => <tr key={formula.id}><td>{formula.label}</td><td>{displayEnum(formula.operator)}</td><td>{displayEnum(formula.status)}</td><td>{formula.trainingSamples}</td><td>{formula.validationSamples}</td><td>{formula.validationSamples ? percent(formula.validationAccuracy) : '—'}</td><td>{formula.validationSamples ? percent(formula.wilsonLowerBound) : '—'}</td><td className="max-w-[280px] text-slate-400">{formula.reason}</td></tr>)}</tbody></table><p className="mt-5 text-sm text-slate-400">The formula lab uses a fixed expression tree (lag, modular arithmetic, quote difference, rank, and server-time operators). It never uses <code>eval</code>, and rejected results remain visible.</p></section>;
}
