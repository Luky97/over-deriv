'use client';

import { useRef } from 'react';
import type { ActiveSymbol, PredictionTarget, ResearchSettings, SupportedMarketId } from '@/lib/types';
import { PREDICTION_TARGETS, SUPPORTED_MARKET_IDS } from '@/lib/types';
import { displayTarget } from './format';

interface Props {
  open: boolean;
  onClose: () => void;
  settings: ResearchSettings;
  setSettings: (next: ResearchSettings | ((current: ResearchSettings) => ResearchSettings)) => void;
  availableSymbols: ActiveSymbol[];
  focusedMarket: string | null;
  onExportJson: () => Promise<void>;
  onExportCsv: () => Promise<void>;
  onImportJson: (file: File) => Promise<void>;
  onResetMarket: (market: string, preserveModels: boolean) => Promise<void>;
  onResetAll: () => Promise<void>;
  onClearHistory: () => Promise<void>;
}

const MARKET_NAMES: Record<SupportedMarketId, string> = {
  R_10: 'Volatility 10 Index', R_25: 'Volatility 25 Index', R_50: 'Volatility 50 Index',
  R_75: 'Volatility 75 Index', R_100: 'Volatility 100 Index',
};

export function SettingsDialog(props: Props) {
  const fileInput = useRef<HTMLInputElement>(null);
  if (!props.open) return null;
  const set = (partial: Partial<ResearchSettings>) => props.setSettings((current) => ({ ...current, ...partial }));
  const available = new Set(props.availableSymbols.map((symbol) => symbol.underlying_symbol));
  const toggleMarket = (market: SupportedMarketId) => {
    const next = props.settings.enabledMarkets.includes(market)
      ? props.settings.enabledMarkets.filter((item) => item !== market)
      : [...props.settings.enabledMarkets, market];
    set({ enabledMarkets: next });
  };
  const toggleTarget = (target: PredictionTarget) => set({
    enabledTargets: { ...props.settings.enabledTargets, [target]: !props.settings.enabledTargets[target] },
  });
  return <div className="modal-backdrop" role="presentation" onMouseDown={props.onClose}>
    <section className="settings-modal" role="dialog" aria-modal="true" aria-label="Research settings" onMouseDown={(event) => event.stopPropagation()}>
      <header><div><p className="eyebrow">Local research controls</p><h2>Settings & data</h2></div><button type="button" className="icon-button" onClick={props.onClose} aria-label="Close">×</button></header>
      <div className="settings-body">
        <section className="settings-section"><h3>Markets</h3><p>Only validated non-1s Volatility indices are available.</p><div className="settings-grid">{SUPPORTED_MARKET_IDS.map((market) => <label className="check-row" key={market}><input type="checkbox" checked={props.settings.enabledMarkets.includes(market)} onChange={() => toggleMarket(market)} /><span><strong>{MARKET_NAMES[market]}</strong><small>{market} · {available.has(market) ? 'available' : 'not reported by active_symbols'}</small></span></label>)}</div></section>
        <section className="settings-section"><h3>Trigger & qualification</h3><div className="settings-grid three"><label className="field-label">Trigger mode<select className="control-input" value={props.settings.triggerMode} onChange={(event) => set({ triggerMode: event.target.value as ResearchSettings['triggerMode'] })}><option value="DIGIT">Digit</option><option value="AUTOMATIC">Automatic ML</option></select></label><label className="field-label">Trigger digit<select className="control-input" disabled={props.settings.triggerMode !== 'DIGIT'} value={props.settings.triggerDigit} onChange={(event) => set({ triggerDigit: Number(event.target.value) })}>{Array.from({ length: 10 }, (_, digit) => <option value={digit} key={digit}>{digit}</option>)}</select></label><label className="field-label">Active confidence<input className="control-input" type="number" min={50} max={99} value={props.settings.activeConfidenceThreshold} onChange={(event) => set({ activeConfidenceThreshold: Math.min(99, Math.max(50, Number(event.target.value) || 50)) })} /></label><label className="field-label">Minimum shadow samples<input className="control-input" type="number" min={50} max={500} value={props.settings.minimumShadowSamples} onChange={(event) => set({ minimumShadowSamples: Math.min(500, Math.max(50, Number(event.target.value) || 50)) })} /></label></div></section>
        <section className="settings-section"><h3>Virtual contract targets</h3><div className="settings-grid">{PREDICTION_TARGETS.map((target) => <label className="check-row" key={target}><input type="checkbox" checked={props.settings.enabledTargets[target]} onChange={() => toggleTarget(target)} /><span><strong>{displayTarget(target)}</strong><small>Virtual settlement only</small></span></label>)}</div></section>
        <section className="settings-section"><h3>Fixed round safety</h3><div className="settings-grid three"><label className="field-label">Maximum contracts<input className="control-input" disabled value="5" /></label><label className="field-label">Required wins<input className="control-input" disabled value="4" /></label><label className="field-label">Consecutive-loss stop<input className="control-input" disabled value="3" /></label></div></section>
        <section className="settings-section"><h3>Laboratories & retention</h3><div className="settings-grid"><label className="check-row"><input type="checkbox" checked={props.settings.formulaExperimentsEnabled} onChange={() => set({ formulaExperimentsEnabled: !props.settings.formulaExperimentsEnabled })} /><span><strong>Formula experiments</strong><small>Safe expression tree, shadow only</small></span></label><label className="check-row"><input type="checkbox" checked={props.settings.automaticChallengersEnabled} onChange={() => set({ automaticChallengersEnabled: !props.settings.automaticChallengersEnabled })} /><span><strong>Automatic challengers</strong><small>Bounded UCB1 candidates</small></span></label><label className="field-label">Stored logs per market<input className="control-input" type="number" min={250} max={10000} value={props.settings.maximumStoredLogs} onChange={(event) => set({ maximumStoredLogs: Number(event.target.value) })} /></label><label className="field-label">Stored rounds per market<input className="control-input" type="number" min={50} max={2000} value={props.settings.maximumStoredRounds} onChange={(event) => set({ maximumStoredRounds: Number(event.target.value) })} /></label></div></section>
        <section className="settings-section"><h3>Export, import & reset</h3><p>JSON contains model state and full frozen research evidence. CSV contains virtual contracts only.</p><div className="flex flex-wrap gap-2"><button className="secondary-button" type="button" onClick={() => void props.onExportJson()}>Export JSON</button><button className="secondary-button" type="button" onClick={() => void props.onExportCsv()}>Export CSV</button><button className="secondary-button" type="button" onClick={() => fileInput.current?.click()}>Import validated JSON</button><input ref={fileInput} type="file" accept="application/json,.json" hidden onChange={(event) => { const file = event.target.files?.[0]; if (file) void props.onImportJson(file); }} /></div><div className="mt-4 flex flex-wrap gap-2"><button className="danger-button" disabled={!props.focusedMarket} type="button" onClick={() => { if (props.focusedMarket && window.confirm(`Reset ${props.focusedMarket} history but preserve model parameters?`)) void props.onResetMarket(props.focusedMarket, true); }}>Reset market history</button><button className="danger-button" disabled={!props.focusedMarket} type="button" onClick={() => { if (props.focusedMarket && window.confirm(`Reset all learning for ${props.focusedMarket}?`)) void props.onResetMarket(props.focusedMarket, false); }}>Reset market + models</button><button className="danger-button" type="button" onClick={() => { if (window.confirm('Clear virtual round history for every market? Model evidence will be preserved.')) void props.onClearHistory(); }}>Clear round history</button><button className="danger-button" type="button" onClick={() => { if (window.confirm('Reset every stored model, loss, round, and log? This cannot be undone.')) void props.onResetAll(); }}>Reset all learning</button></div></section>
      </div>
      <footer><p>No setting can enable real Deriv trading.</p><button type="button" className="primary-button" onClick={props.onClose}>Done</button></footer>
    </section>
  </div>;
}
