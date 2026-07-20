import type { MarketResearchView, MarketTickState, WindowSize } from '@/lib/types';
import { WINDOW_SIZES } from '@/lib/types';
import { percent } from './format';

function digits(value: number[]): string { return value.length ? value.join(', ') : '—'; }

export function LiveMarketPanel({ market, research }: { market: MarketTickState; research: MarketResearchView }) {
  const features = research.features;
  if (!features) return <div className="empty-state">Collecting enough valid ticks to build the first feature snapshot.</div>;
  const last20 = market.ticks.slice(-20);
  const recent = features.windows[20];
  const parity = features.sequence.parityFirstOrder.probabilities;
  return (
    <div className="space-y-5">
      <section className="panel-block">
        <div className="panel-heading"><div><p className="eyebrow">Live sequence</p><h3>Last 20 displayed digits</h3></div><span className="text-sm text-slate-400">Server epoch {features.createdAtEpoch}</span></div>
        <div className="mt-4 flex flex-wrap gap-2">
          {last20.map((tick) => <span key={tick.key} className={`digit-chip ${tick.digit % 2 === 0 ? 'digit-even' : 'digit-odd'}`}>{tick.digit}</span>)}
        </div>
      </section>

      <div className="grid gap-4 lg:grid-cols-4">
        <div className="metric-tile"><span>EVEN / ODD</span><strong>{recent.evenPercentage.toFixed(1)}% / {recent.oddPercentage.toFixed(1)}%</strong><small>Momentum {(features.parityMomentum * 100).toFixed(1)}pp · streak {features.parityStreak}</small></div>
        <div className="metric-tile"><span>OVER 3</span><strong>{recent.over3Percentage.toFixed(1)}%</strong><small>Momentum {(features.over3Momentum * 100).toFixed(1)}pp · run {features.over3Streak}</small></div>
        <div className="metric-tile"><span>UNDER 7</span><strong>{recent.under7Percentage.toFixed(1)}%</strong><small>Momentum {(features.under7Momentum * 100).toFixed(1)}pp · run {features.under7Streak}</small></div>
        <div className="metric-tile"><span>Quote movement</span><strong>{features.quote.direction}</strong><small>{features.quote.pipNormalizedChange.toFixed(1)} pips · streak {features.quote.directionStreak}</small></div>
      </div>

      <section className="panel-block overflow-x-auto">
        <div className="panel-heading"><div><p className="eyebrow">Rank features</p><h3>Overlapping window rankings</h3></div></div>
        <table className="research-table mt-4 min-w-[780px]">
          <thead><tr><th>Window</th><th>Most</th><th>Second most</th><th>Least</th><th>Second least</th><th>Even</th><th>Over 3</th><th>Under 7</th><th>Entropy</th></tr></thead>
          <tbody>{WINDOW_SIZES.map((size: WindowSize) => {
            const window = features.windows[size];
            return <tr key={size}><td>{size}</td><td>{digits(window.rankings.most.digits)}</td><td>{digits(window.rankings.secondMost.digits)}</td><td>{digits(window.rankings.least.digits)}</td><td>{digits(window.rankings.secondLeast.digits)}</td><td>{window.evenPercentage.toFixed(1)}%</td><td>{window.over3Percentage.toFixed(1)}%</td><td>{window.under7Percentage.toFixed(1)}%</td><td>{window.entropy.toFixed(3)}</td></tr>;
          })}</tbody>
        </table>
      </section>

      <div className="grid gap-4 xl:grid-cols-2">
        <section className="panel-block">
          <p className="eyebrow">Transitions</p><h3>Parity and sequence persistence</h3>
          <div className="mt-4 grid grid-cols-2 gap-3 text-sm">
            <div className="mini-stat"><span>ODD → EVEN</span><strong>{percent(parity[0]?.[1] ?? 0)}</strong></div>
            <div className="mini-stat"><span>EVEN → ODD</span><strong>{percent(parity[1]?.[0] ?? 0)}</strong></div>
            <div className="mini-stat"><span>Alternation</span><strong>{percent(features.sequence.alternationRate)}</strong></div>
            <div className="mini-stat"><span>Max parity streak</span><strong>{features.maximumParityStreak}</strong></div>
            <div className="mini-stat"><span>Repeating pairs</span><strong>{percent(features.sequence.repeatingPairs)}</strong></div>
            <div className="mini-stat"><span>Repeating triplets</span><strong>{percent(features.sequence.repeatingTriplets)}</strong></div>
          </div>
        </section>
        <section className="panel-block">
          <p className="eyebrow">Randomness diagnostics</p><h3>Stability and divergence</h3>
          <div className="mt-4 grid grid-cols-2 gap-3 text-sm">
            <div className="mini-stat"><span>Shannon entropy</span><strong>{features.randomness.shannonEntropy.toFixed(3)}</strong></div>
            <div className="mini-stat"><span>Parity entropy</span><strong>{features.randomness.parityEntropy.toFixed(3)}</strong></div>
            <div className="mini-stat"><span>JS 20 ↔ 1000</span><strong>{features.randomness.jensenShannon20To1000.toFixed(4)}</strong></div>
            <div className="mini-stat"><span>Chi-square</span><strong>{features.randomness.chiSquareUniform.toFixed(2)}</strong></div>
            <div className="mini-stat"><span>Stability</span><strong>{percent(features.randomness.regimeStability)}</strong></div>
            <div className="mini-stat"><span>Drift score</span><strong>{percent(features.randomness.driftScore)}</strong></div>
          </div>
        </section>
      </div>
    </div>
  );
}
