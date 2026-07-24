'use client';

import React, { createContext, useContext, useEffect, useRef, useState, useCallback } from 'react';
import type { MarketTick, MarketContinuity, MarketResearchView, ConnectionState, ResearchSettings } from '@/lib/types';
import { createDefaultSettings } from '@/lib/types';
import { createResearchEngine, processTick, type ResearchEngineState } from '@/lib/research/engine';
import { MarketDataManager } from '@/lib/deriv/markets';
import { saveAppSetting, getAppSetting } from '@/lib/persistence/storage';

interface ResearchValue { markets: Record<string, MarketResearchView>; marketStates: Record<string, { ticks: MarketTick[]; connectionState: ConnectionState }>; settings: ResearchSettings; updateSettings: (s: ResearchSettings) => void; isReady: boolean; error: string | null; symbols: string[]; }

const ResearchCtx = createContext<ResearchValue | null>(null);

export function ResearchProvider({ children }: { children: React.ReactNode }) {
  const [markets, setMarkets] = useState<Record<string, MarketResearchView>>({});
  const [marketStates, setMarketStates] = useState<Record<string, { ticks: MarketTick[]; connectionState: ConnectionState }>>({});
  const [settings, setSettings] = useState<ResearchSettings>(createDefaultSettings());
  const [isReady, setIsReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [symbols, setSymbols] = useState<string[]>([]);
  const engines = useRef<Record<string, ResearchEngineState>>({});
  const manager = useRef<MarketDataManager | null>(null);

  useEffect(() => {
    const m = new MarketDataManager();
    manager.current = m;
    m.initialize(
      (symbol, ticks, continuity) => {
        setSymbols(prev => prev.includes(symbol) ? prev : [...prev, symbol]);
        let engine = engines.current[symbol];
        if (!engine) { engine = createResearchEngine(symbol, settings); engines.current[symbol] = engine; }
        if (ticks.length > 0) {
          const cur = ticks[ticks.length - 1];
          const out = processTick(engine, { tick: cur, settings, continuityGap: continuity.status === 'GAP', gapReason: continuity.lastGapReason ?? undefined });
          if (out.changed) setMarkets(prev => ({ ...prev, [symbol]: out.view }));
        }
        setMarketStates(prev => ({ ...prev, [symbol]: { ticks, connectionState: 'connected' } }));
      },
      (symbol, connectionState) => setMarketStates(prev => ({ ...prev, [symbol]: { ...prev[symbol], connectionState } })),
    );
    setIsReady(true);
    return () => m.destroy();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => { getAppSetting('researchSettings').then(v => { if (v) try { setSettings(JSON.parse(v)); } catch { /* ignore */ } }); }, []);

  const updateSettings = useCallback((s: ResearchSettings) => { setSettings(s); saveAppSetting('researchSettings', JSON.stringify(s)); for (const e of Object.values(engines.current)) e.settings = s; }, []);

  return React.createElement(ResearchCtx.Provider, { value: { markets, marketStates, settings, updateSettings, isReady, error, symbols } }, children);
}

export function useResearch(): ResearchValue { const c = useContext(ResearchCtx); if (!c) throw new Error('useResearch must be in ResearchProvider'); return c; }
