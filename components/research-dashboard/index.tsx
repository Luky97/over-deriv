'use client';

import { useEffect, useMemo, useState } from 'react';
import type { ActiveSymbol, ConnectionState, MarketResearchView, MarketTickState, ResearchSettings } from '@/lib/types';
import type { AdaptiveResearchController } from '@/hooks/use-adaptive-research';
import { MarketDetail } from './market-detail';
import { MarketOverviewCard } from './market-overview-card';
import { SettingsDialog } from './settings-dialog';

interface Props {
  connectionState: ConnectionState;
  symbols: ActiveSymbol[];
  markets: Record<string, MarketTickState>;
  research: AdaptiveResearchController;
  settings: ResearchSettings;
  setSettings: (next: ResearchSettings | ((current: ResearchSettings) => ResearchSettings)) => void;
  settingsReady: boolean;
  symbolsError: string | null;
  settingsError: string | null;
  restartMarket: (market: string) => void;
}

export function AdaptiveResearchDashboard(props: Props) {
  const [focused, setFocused] = useState<string | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const marketIds = useMemo(() => props.settings.enabledMarkets.filter((market) => props.markets[market]), [props.markets, props.settings.enabledMarkets]);
  useEffect(() => {
    if (!focused || !marketIds.includes(focused as never)) setFocused(marketIds[0] ?? null);
  }, [focused, marketIds]);
  const focusedMarket = focused ? props.markets[focused] : undefined;
  const focusedResearch: MarketResearchView | undefined = focused ? props.research.markets[focused] : undefined;
  const error = props.symbolsError ?? props.settingsError ?? props.research.workerError ?? props.research.storageError;
  return <main className="research-app">
    <header className="app-header">
      <div className="header-brand"><div className="brand-mark">AR</div><div><p className="eyebrow">Public Deriv market-data research</p><h1>Adaptive Digit Research Lab</h1></div></div>
      <div className="header-actions"><span className={`connection-pill connection-${props.connectionState}`}><i />{props.connectionState}</span><button className="secondary-button" type="button" onClick={() => void props.research.exportJson()}>Export</button><button className="primary-button" type="button" onClick={() => setSettingsOpen(true)}>Settings</button></div>
    </header>
    <div className="safety-banner"><strong>Research & paper trading only.</strong><span>No login, API token, proposal, buy, sell, transaction, or real-money endpoint exists in this application. Confidence is evidence, never a guarantee.</span></div>
    {error && <div className="error-banner">{error}</div>}
    <section className="overview-section">
      <div className="section-title"><div><p className="eyebrow">Independent market engines</p><h2>Live research overview</h2></div><p>{props.settings.triggerMode === 'DIGIT' ? `Digit ${props.settings.triggerDigit} trigger` : 'Automatic ML trigger'} · {props.settings.activeConfidenceThreshold}% active threshold · {props.settings.minimumShadowSamples}+ exact shadow samples</p></div>
      {!props.settingsReady ? <div className="empty-state">Restoring local research settings…</div> : marketIds.length === 0 ? <div className="empty-state">No enabled supported market is available. Open Settings to select a market.</div> : <div className="market-grid">{marketIds.map((market) => <MarketOverviewCard key={market} market={props.markets[market]} research={props.research.markets[market]} selected={focused === market} onSelect={() => setFocused(market)} />)}</div>}
    </section>
    {focusedMarket && <MarketDetail key={focusedMarket.symbol.underlying_symbol} market={focusedMarket} research={focusedResearch} settings={props.settings} onRestart={() => props.restartMarket(focusedMarket.symbol.underlying_symbol)} />}
    <footer className="app-footer"><span>Adaptive Digit Research Lab · public ticks only</span><span>Losses, invalidations, and rejected formulas are retained</span></footer>
    <SettingsDialog open={settingsOpen} onClose={() => setSettingsOpen(false)} settings={props.settings} setSettings={props.setSettings} availableSymbols={props.symbols} focusedMarket={focused} onExportJson={props.research.exportJson} onExportCsv={props.research.exportCsv} onImportJson={props.research.importJson} onResetMarket={props.research.resetMarket} onResetAll={props.research.resetAll} onClearHistory={props.research.clearRoundHistory} />
  </main>;
}
