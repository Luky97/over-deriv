'use client';

import { useState, useEffect } from 'react';
import { useResearch } from '@/contexts/research-context';
import { useAuth } from '@/contexts/auth-context';
import { useCloudSync } from '@/contexts/cloud-sync-context';
import { useOnlineStatus } from '@/hooks/use-online-status';
import { AuthPanel } from '@/components/auth/auth-panel';
import { SettingsDialog } from '@/components/settings/settings-dialog';
import { CloudSyncIndicator } from '@/components/cloud-sync/cloud-sync-indicator';
import type { ResearchSettings } from '@/lib/types';
import { createDefaultSettings } from '@/lib/types';

function DashboardContent() {
  const { markets, marketStates, settings, updateSettings, isReady, symbols } = useResearch();
  const auth = useAuth();
  const { status: syncStatus, forceSync } = useCloudSync();
  const online = useOnlineStatus();
  const [selectedMarket, setSelectedMarket] = useState<string | null>(null);
  const [showSettings, setShowSettings] = useState(false);
  const [showAuth, setShowAuth] = useState(false);
  const connectionState = online ? 'connected' : 'offline';
  const sel = selectedMarket ?? symbols[0] ?? '';

  return (
    <div className="research-app">
      <header className="app-header">
        <div className="header-brand">
          <div className="brand-mark">△</div>
          <div><p className="eyebrow">Research Lab</p><h1>Adaptive Digit Research</h1></div>
        </div>
        <div className="header-actions">
          <span className={`connection-pill connection-${connectionState}`}><i/>{connectionState}</span>
          <CloudSyncIndicator status={syncStatus} onSyncNow={forceSync} />
          {auth.user ? (
            <span style={{ color: '#66dcd7', fontSize: '.72rem' }}>
              {auth.user.email}
              <button className="secondary-button" style={{ marginLeft: '.5rem' }} onClick={() => auth.signOut()}>Sign out</button>
            </span>
          ) : (
            <button className="secondary-button" onClick={() => setShowAuth(true)}>Sign in</button>
          )}
          <button className="icon-button" onClick={() => setShowSettings(true)}>⚙</button>
        </div>
      </header>
      {!auth.user && !auth.guest && (
        <div className="safety-banner">
          <strong>Local only</strong> — cloud sync disabled. Sign in to enable.
          <button className="secondary-button" onClick={() => { setShowAuth(true); auth.enterGuestMode(); }}>Continue as Guest</button>
        </div>
      )}
      {auth.user && (
        <div className="safety-banner" style={{ borderColor: 'rgba(52,211,153,.12)', background: 'rgba(52,211,153,.045)' }}>
          <strong>Cloud sync active.</strong> Cross-device sync enabled.
        </div>
      )}
      <div className="overview-section">
        <div className="section-title">
          <h2>Markets</h2>
          <p>Five synthetic volatility markets · Live ticks · Adaptive ML research</p>
        </div>
        <div className="market-grid">
          {settings.enabledMarkets.map((symbol) => {
            const view = markets[symbol];
            const state = marketStates[symbol];
            const ticks = state?.ticks ?? [];
            const con = state?.connectionState ?? 'connecting';
            const confidence = view?.confidence?.value ?? 0;
            const recentRounds = view?.recentRounds ?? [];
            const wins = recentRounds.filter(r => r.status === 'ROUND_WIN').length;
            const losses = recentRounds.filter(r => r.status === 'ROUND_LOSS').length;
            return (
              <div key={symbol} className={`market-card ${sel === symbol ? 'market-card-selected' : ''}`} onClick={() => setSelectedMarket(symbol)} style={{ cursor: 'pointer', display: 'grid', gap: '.5rem' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                  <div>
                    <strong style={{ color: 'white', fontSize: '.9rem' }}>{symbol}</strong>
                    <div className="status-dot-label" style={{ marginTop: '.2rem' }}>
                      <i style={{ display: 'inline-block', width: '6px', height: '6px', borderRadius: '50%', background: con === 'connected' ? '#34d399' : con === 'connecting' ? '#fbbf24' : '#fb7185' }} />
                      {con}
                    </div>
                  </div>
                  <div className="digit-orb" style={{ width: '36px', height: '36px', fontSize: '1rem' }}>{ticks.length > 0 ? ticks[ticks.length - 1].digit : '-'}</div>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ fontSize: '.65rem', color: '#718398' }}>Ticks: {ticks.length}</span>
                  <span style={{ fontSize: '.65rem', color: '#718398' }}>{view?.regime ?? '...'}</span>
                </div>
                <div className="sample-track"><span style={{ width: `${Math.min(100, (ticks.length / 1000) * 100)}%` }}/></div>
                <div><span style={{ color: '#718398', fontSize: '.65rem' }}>Confidence</span></div>
                <div className="confidence-track" style={{ height: '4px' }}>
                  <span style={{ width: `${confidence}%`, display: 'block', height: '100%', borderRadius: '99px', background: 'linear-gradient(90deg,#2bd9d0,#4d8dff)' }}/>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '.65rem' }}>
                  <span style={{ color: '#718398' }}>{view?.learningMode ?? '...'}</span>
                  {wins + losses > 0 && <span style={{ color: '#b7c6d8' }}>{wins}W/{losses}L</span>}
                </div>
              </div>
            );
          })}
        </div>
      </div>
      {selectedMarket && markets[selectedMarket] && (
        <div className="detail-shell" style={{ margin: '0 clamp(1rem,3vw,3rem) 2rem' }}>
          <div className="detail-header">
            <div>
              <h2>{selectedMarket}</h2>
              <p>{markets[selectedMarket].learningMode} · {markets[selectedMarket].regime} · {marketStates[selectedMarket]?.ticks?.length ?? 0} ticks</p>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
              <div className="digit-chip digit-even">{marketStates[selectedMarket]?.ticks?.at(-1)?.digit ?? '-'}</div>
              <div className="mini-stat"><span>Confidence</span><strong style={{ color: markets[selectedMarket].confidence.value >= 80 ? '#34d399' : '#fbbf24' }}>{markets[selectedMarket].confidence.value.toFixed(1)}%</strong></div>
              <div className="mini-stat"><span>Win Rate</span><strong>{((markets[selectedMarket].metrics.shadow.wins / Math.max(1, markets[selectedMarket].metrics.shadow.total)) * 100).toFixed(0)}%</strong></div>
            </div>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '.7rem', padding: '1rem' }}>
            <div className="metric-tile"><span>Shadow</span><strong>{markets[selectedMarket].metrics.shadow.total}</strong><small>{markets[selectedMarket].metrics.shadow.wins}W/{markets[selectedMarket].metrics.shadow.losses}L</small></div>
            <div className="metric-tile"><span>Active</span><strong>{markets[selectedMarket].metrics.activeVirtual.total}</strong><small>{markets[selectedMarket].metrics.activeVirtual.wins}W/{markets[selectedMarket].metrics.activeVirtual.losses}L</small></div>
            <div className="metric-tile"><span>Cooldown</span><strong>{markets[selectedMarket].cooldownRemaining}</strong></div>
            <div className="metric-tile"><span>Mode</span><strong style={{ fontSize: '.8rem' }}>{markets[selectedMarket].learningMode}</strong></div>
          </div>
          {markets[selectedMarket].drift.severity !== 'NONE' && (
            <div style={{ padding: '0 1rem 1rem' }}>
              <div className={`drift-banner drift-${markets[selectedMarket].drift.severity.toLowerCase()}`}>
                <span>Drift: {markets[selectedMarket].drift.severity}</span>
                <span>{markets[selectedMarket].drift.reasons.join('; ')}</span>
              </div>
            </div>
          )}
        </div>
      )}
      <footer className="app-footer">
        <span>Adaptive Digit Research Lab · Virtual trading only · No real-money trading</span>
        <span>v2.0.0</span>
      </footer>
      {showSettings && <SettingsDialog settings={settings} onUpdate={updateSettings} onClose={() => setShowSettings(false)} />}
      {showAuth && <AuthPanel onClose={() => setShowAuth(false)} />}
    </div>
  );
}

export default function Page() {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  if (!mounted) return <div className="research-app"><div className="overview-section"><p>Loading...</p></div></div>;
  return <DashboardContent />;
}
