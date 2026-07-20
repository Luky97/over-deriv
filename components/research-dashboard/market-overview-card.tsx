import type { MarketResearchView, MarketTickState } from '@/lib/types';
import { displayEnum, displayTarget, rate } from './format';

interface Props {
  market: MarketTickState;
  research?: MarketResearchView;
  selected: boolean;
  onSelect: () => void;
}

function rankDigits(digits: number[] | undefined): string {
  return digits?.length ? digits.join(' · ') : '—';
}

export function MarketOverviewCard({ market, research, selected, onSelect }: Props) {
  const features = research?.features?.windows[1000];
  const recommendation = research?.recommendation;
  return (
    <button
      type="button"
      onClick={onSelect}
      className={`research-card market-card text-left ${selected ? 'market-card-selected' : ''}`}
      aria-pressed={selected}
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="eyebrow">{market.symbol.underlying_symbol}</p>
          <h2 className="mt-1 text-lg font-semibold text-white">{market.symbol.underlying_symbol_name}</h2>
        </div>
        <span className={`status-dot-label ${market.connectionState === 'connected' ? 'text-emerald-300' : 'text-amber-300'}`}>
          <i className={market.connectionState === 'connected' ? 'bg-emerald-400' : 'bg-amber-400'} />
          {market.connectionState}
        </span>
      </div>

      <div className="mt-5 flex items-end justify-between gap-4">
        <div>
          <p className="metric-label">Live quote</p>
          <p className="font-mono text-2xl font-semibold tracking-tight text-white">
            {market.currentQuote === null ? '—' : market.currentQuote.toFixed(market.pipSize)}
          </p>
        </div>
        <div className="digit-orb">{market.lastDigit ?? '—'}</div>
      </div>

      <div className="mt-4 sample-track">
        <span style={{ width: `${Math.min(100, market.ticks.length / 10)}%` }} />
      </div>
      <div className="mt-2 flex justify-between text-xs text-slate-400">
        <span>Tick context</span><span>{market.ticks.length} / 1000</span>
      </div>

      <div className="mt-5 grid grid-cols-2 gap-2 text-sm">
        <div className="mini-stat"><span>Mode</span><strong>{displayEnum(research?.learningMode ?? 'COLLECTING')}</strong></div>
        <div className="mini-stat"><span>Regime</span><strong>{displayEnum(research?.regime ?? 'UNSTABLE')}</strong></div>
        <div className="mini-stat"><span>Confidence</span><strong>{(research?.confidence.value ?? 0).toFixed(1)}%</strong></div>
        <div className="mini-stat"><span>Recommendation</span><strong className={recommendation?.action === 'TRADE' ? 'text-emerald-300' : 'text-slate-300'}>
          {recommendation?.action === 'TRADE' ? displayTarget(recommendation.target) : 'NO TRADE'}
        </strong></div>
      </div>

      <div className="mt-4 grid grid-cols-4 gap-2 border-t border-white/5 pt-4 text-center">
        <div><p className="rank-label">Most</p><p className="rank-value">{rankDigits(features?.rankings.most.digits)}</p></div>
        <div><p className="rank-label">2nd most</p><p className="rank-value">{rankDigits(features?.rankings.secondMost.digits)}</p></div>
        <div><p className="rank-label">Least</p><p className="rank-value">{rankDigits(features?.rankings.least.digits)}</p></div>
        <div><p className="rank-label">2nd least</p><p className="rank-value">{rankDigits(features?.rankings.secondLeast.digits)}</p></div>
      </div>

      <div className="mt-4 flex items-center justify-between text-xs text-slate-400">
        <span>Shadow {rate(research?.metrics.shadow.wins ?? 0, research?.metrics.shadow.total ?? 0)}</span>
        <span>Active virtual {rate(research?.metrics.activeVirtual.wins ?? 0, research?.metrics.activeVirtual.total ?? 0)}</span>
        <span className={research?.drift.severity === 'SEVERE' ? 'text-rose-300' : research?.drift.severity === 'WATCH' ? 'text-amber-300' : 'text-emerald-300'}>
          Drift {research?.drift.severity ?? 'NONE'}
        </span>
      </div>
    </button>
  );
}
