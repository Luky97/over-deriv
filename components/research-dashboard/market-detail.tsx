'use client';

import { useState } from 'react';
import type { MarketResearchView, MarketTickState, ResearchSettings } from '@/lib/types';
import { ConfidencePanel } from './confidence-panel';
import { FormulaLabPanel } from './formula-lab-panel';
import { LiveMarketPanel } from './live-market-panel';
import { ModelPanel } from './model-panel';
import { PredictionPanel } from './prediction-panel';
import { RegimePanel } from './regime-panel';
import { ResearchLogs } from './research-logs';
import { StrategyPanel } from './strategy-panel';
import { VirtualRoundPanel } from './virtual-round-panel';
import { displayEnum } from './format';

const TABS = ['Live Market', 'Predictions', 'Virtual Rounds', 'Models', 'Regime', 'Strategies', 'Formula Lab', 'Logs'] as const;
type Tab = (typeof TABS)[number];

export function MarketDetail({ market, research, settings, onRestart }: { market: MarketTickState; research?: MarketResearchView; settings: ResearchSettings; onRestart: () => void }) {
  const [tab, setTab] = useState<Tab>('Live Market');
  if (!research) return <section className="detail-shell"><div className="empty-state">Restoring isolated model state for {market.symbol.underlying_symbol_name}…</div></section>;
  return <section className="detail-shell">
    <header className="detail-header"><div><p className="eyebrow">Focused market · {market.symbol.underlying_symbol}</p><h2>{market.symbol.underlying_symbol_name}</h2><p>{displayEnum(research.learningMode)} · {displayEnum(research.regime)} · champion {research.championStrategyId}</p></div><div className="flex items-center gap-3"><div className="text-right"><span className="metric-label">Last digit</span><strong className="ml-3 text-3xl text-white">{market.lastDigit ?? '—'}</strong></div><button className="secondary-button" type="button" onClick={onRestart}>Resync market</button></div></header>
    <nav className="tab-strip" aria-label="Market research sections">{TABS.map((item) => <button type="button" key={item} onClick={() => setTab(item)} className={tab === item ? 'tab-active' : ''}>{item}</button>)}</nav>
    <div className="detail-content">
      {tab === 'Live Market' && <LiveMarketPanel market={market} research={research} />}
      {tab === 'Predictions' && <div className="space-y-5"><PredictionPanel research={research} /><ConfidencePanel research={research} threshold={settings.activeConfidenceThreshold} /></div>}
      {tab === 'Virtual Rounds' && <VirtualRoundPanel research={research} />}
      {tab === 'Models' && <ModelPanel research={research} />}
      {tab === 'Regime' && <RegimePanel research={research} />}
      {tab === 'Strategies' && <StrategyPanel research={research} />}
      {tab === 'Formula Lab' && <FormulaLabPanel research={research} />}
      {tab === 'Logs' && <ResearchLogs research={research} />}
    </div>
  </section>;
}
