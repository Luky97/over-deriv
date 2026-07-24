'use client';
import { useState } from 'react';
import type { ResearchSettings, PredictionTarget, SupportedMarketSymbol } from '@/lib/types';
import { SUPPORTED_MARKET_SYMBOLS } from '@/lib/types';
import { isSupabaseConfigured, getSupabaseConfig, saveLocalConfig, clearLocalConfig } from '@/lib/supabase/client';
import { checkHealth } from '@/lib/supabase/repositories';

export function SettingsDialog({ settings, onUpdate, onClose }: { settings: ResearchSettings; onUpdate: (s: ResearchSettings) => void; onClose: () => void }) {
  const [tab, setTab] = useState<'research' | 'supabase'>('research');
  return (
    <div className="modal-backdrop">
      <div className="settings-modal">
        <header><h3>Settings</h3><button className="icon-button" onClick={onClose}>✕</button></header>
        <div className="tab-strip">
          <button className={tab === 'research' ? 'tab-active' : ''} onClick={() => setTab('research')}>Research</button>
          <button className={tab === 'supabase' ? 'tab-active' : ''} onClick={() => setTab('supabase')}>Supabase</button>
        </div>
        <div className="settings-body">
          {tab === 'research' && <ResearchSettingsPanel settings={settings} onUpdate={onUpdate} />}
          {tab === 'supabase' && <SupabaseSettingsPanel />}
        </div>
        <footer><p>Research and virtual-trading only. No real-money trading.</p><button className="primary-button" onClick={onClose}>Close</button></footer>
      </div>
    </div>
  );
}

function ResearchSettingsPanel({ settings, onUpdate }: { settings: ResearchSettings; onUpdate: (s: ResearchSettings) => void }) {
  const toggleMarket = (s: SupportedMarketSymbol) => onUpdate({ ...settings, enabledMarkets: settings.enabledMarkets.includes(s) ? settings.enabledMarkets.filter(x => x !== s) : [...settings.enabledMarkets, s] });
  const toggleTarget = (t: PredictionTarget) => onUpdate({ ...settings, enabledTargets: { ...settings.enabledTargets, [t]: !settings.enabledTargets[t] } });
  return (
    <>
      <div className="settings-section"><h3>Markets</h3><div className="settings-grid three">{SUPPORTED_MARKET_SYMBOLS.map(s => <label key={s} className="check-row"><input type="checkbox" checked={settings.enabledMarkets.includes(s)} onChange={() => toggleMarket(s)} /><div><strong>{s}</strong><small>Volatility {s.replace('R_','')}%</small></div></label>)}</div></div>
      <div className="settings-section"><h3>Trigger</h3><div className="settings-grid"><div className="field-label"><label>Mode</label><select className="control-input" value={settings.triggerMode} onChange={e => onUpdate({ ...settings, triggerMode: e.target.value as 'DIGIT'|'AUTOMATIC' })}><option value="DIGIT">Digit</option><option value="AUTOMATIC">Automatic</option></select></div>{settings.triggerMode === 'DIGIT' && <div className="field-label"><label>Digit (0-9)</label><input className="control-input" type="number" min={0} max={9} value={settings.triggerDigit} onChange={e => onUpdate({ ...settings, triggerDigit: parseInt(e.target.value) || 0 })} /></div>}</div></div>
      <div className="settings-section"><h3>Prediction Targets</h3><div className="settings-grid three">{(['EVEN','ODD','OVER_3','UNDER_7'] as PredictionTarget[]).map(t => <label key={t} className="check-row"><input type="checkbox" checked={settings.enabledTargets[t]} onChange={() => toggleTarget(t)} /><div><strong>{t}</strong></div></label>)}</div></div>
      <div className="settings-section"><h3>Thresholds</h3><div className="settings-grid"><div className="field-label"><label>Confidence ({settings.activeConfidenceThreshold}%)</label><input className="control-input" type="range" min={50} max={99} value={settings.activeConfidenceThreshold} onChange={e => onUpdate({ ...settings, activeConfidenceThreshold: parseInt(e.target.value) })} /></div><div className="field-label"><label>Shadow Samples ({settings.minimumShadowSamples})</label><input className="control-input" type="range" min={10} max={200} value={settings.minimumShadowSamples} onChange={e => onUpdate({ ...settings, minimumShadowSamples: parseInt(e.target.value) })} /></div></div></div>
      <div className="settings-section"><h3>Round Rules</h3><div className="settings-grid"><div className="field-label"><label>Max Contracts ({settings.maximumContractsPerRound})</label><input className="control-input" type="range" min={1} max={10} value={settings.maximumContractsPerRound} onChange={e => onUpdate({ ...settings, maximumContractsPerRound: parseInt(e.target.value) })} /></div><div className="field-label"><label>Required Wins ({settings.requiredWins})</label><input className="control-input" type="range" min={1} max={10} value={settings.requiredWins} onChange={e => onUpdate({ ...settings, requiredWins: parseInt(e.target.value) })} /></div></div></div>
      <div className="settings-section"><h3>Features</h3><div className="settings-grid three"><label className="check-row"><input type="checkbox" checked={settings.formulaExperimentsEnabled} onChange={e => onUpdate({ ...settings, formulaExperimentsEnabled: e.target.checked })} /><div><strong>Formula Experiments</strong></div></label><label className="check-row"><input type="checkbox" checked={settings.automaticChallengersEnabled} onChange={e => onUpdate({ ...settings, automaticChallengersEnabled: e.target.checked })} /><div><strong>Auto Challengers</strong></div></label></div></div>
    </>
  );
}

function SupabaseSettingsPanel() {
  const [url, setUrl] = useState('');
  const [key, setKey] = useState('');
  const [testResult, setTestResult] = useState<string | null>(null);
  const [testing, setTesting] = useState(false);
  const configured = isSupabaseConfigured();
  const config = getSupabaseConfig();
  const testConnection = async () => {
    setTesting(true); setTestResult(null);
    try { const ok = await checkHealth(); setTestResult(ok ? 'PASS: Connection OK' : 'FAIL: Health check failed'); }
    catch (e) { setTestResult(`FAIL: ${(e as Error).message}`); }
    finally { setTesting(false); }
  };
  return (
    <>
      <div className="settings-section"><h3>Status</h3><p>Supabase: <strong style={{ color: configured ? '#66dcd7' : '#fb7185' }}>{configured ? 'Configured' : 'Not configured'}</strong>{config && <span style={{ color: '#718398', fontSize: '.72rem', marginLeft: '.5rem' }}>(env)</span>}</p></div>
      <div className="settings-section"><h3>Manual Configuration</h3><p>Enter your Supabase project URL and publishable key.</p><div className="settings-grid"><div className="field-label"><label>Project URL</label><input className="control-input" type="url" value={url} onChange={e => setUrl(e.target.value)} placeholder="https://xxxxx.supabase.co" style={{ width: '100%' }} /></div><div className="field-label"><label>Publishable Key</label><input className="control-input" type="text" value={key} onChange={e => setKey(e.target.value)} placeholder="eyJhbGciOi..." style={{ width: '100%' }} /></div></div><div style={{ display: 'flex', gap: '.5rem', marginTop: '.75rem' }}><button className="primary-button" onClick={() => { saveLocalConfig(url, key); setTestResult('Saved. Reload to apply.'); }} disabled={!url || !key}>Save</button><button className="secondary-button" onClick={() => { clearLocalConfig(); setTestResult('Cleared.'); }}>Clear</button></div></div>
      <div className="settings-section"><h3>Connection Test</h3><button className="secondary-button" onClick={testConnection} disabled={!configured || testing}>{testing ? 'Testing...' : 'Test Connection'}</button>{testResult && <div className="error-banner" style={{ marginTop: '.75rem', borderColor: testResult.startsWith('PASS') ? 'rgba(52,211,153,.3)' : undefined, background: testResult.startsWith('PASS') ? 'rgba(52,211,153,.08)' : undefined, color: testResult.startsWith('PASS') ? '#6ee7b7' : undefined }}>{testResult}</div>}</div>
    </>
  );
}
