import React, { useState } from 'react';
import { MarketOverviewCard } from './market-overview-card';
import type { ConnectionState, MarketTickState, ActiveSymbol } from '@/lib/types';
import type { MarketResearchState } from '@/hooks/use-adaptive-research';
import type { TriggerMode } from '@/lib/ml-types';

interface AdaptiveResearchDashboardProps {
  connectionState: ConnectionState;
  symbols: ActiveSymbol[];
  selectedSymbols: string[];
  focusedSymbol: string | null;
  markets: Record<string, MarketTickState>;
  researchState: Record<string, MarketResearchState>;
  isLoadingSymbols: boolean;
  symbolsError: string | null;
  setSelectedSymbols: (symbols: string[]) => void;
  toggleSymbol: (symbol: string) => void;
  focusSymbol: (symbol: string) => void;
  restartMarket: (symbol: string) => void;
  triggerMode: TriggerMode;
  setTriggerMode: (mode: TriggerMode) => void;
  triggerDigit: number;
  setTriggerDigit: (d: number) => void;
}

export function AdaptiveResearchDashboard(props: AdaptiveResearchDashboardProps) {
  return (
    <div className="flex flex-col h-full bg-slate-950 text-slate-50 overflow-auto">
      <header className="p-4 border-b border-slate-800 flex justify-between items-center">
        <div>
          <h1 className="text-xl font-bold text-blue-400">Adaptive Digit Research AI</h1>
          <p className="text-xs text-red-400">Research and paper trading only.</p>
        </div>
        <div className="flex items-center gap-4 text-sm">
          <div className="flex gap-2 items-center">
            <span className={props.connectionState === 'connected' ? 'text-green-500' : 'text-yellow-500'}>
              {props.connectionState}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <label className="text-slate-400">Trigger Mode:</label>
            <select 
              className="bg-slate-900 border border-slate-700 rounded px-2 py-1"
              value={props.triggerMode}
              onChange={e => props.setTriggerMode(e.target.value as TriggerMode)}
            >
              <option value="Digit">Digit</option>
              <option value="Automatic">Automatic ML</option>
            </select>
          </div>
          {props.triggerMode === 'Digit' && (
            <div className="flex items-center gap-2">
              <label className="text-slate-400">Digit:</label>
              <select 
                className="bg-slate-900 border border-slate-700 rounded px-2 py-1"
                value={props.triggerDigit}
                onChange={e => props.setTriggerDigit(parseInt(e.target.value, 10))}
              >
                {[0,1,2,3,4,5,6,7,8,9].map(d => <option key={d} value={d}>{d}</option>)}
              </select>
            </div>
          )}
        </div>
      </header>

      <main className="flex-1 p-4">
        {props.symbolsError && (
          <div className="bg-red-900/50 text-red-200 p-4 rounded mb-4">
            {props.symbolsError}
          </div>
        )}
        
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {props.selectedSymbols.map(symbol => (
            <MarketOverviewCard 
              key={symbol}
              symbol={symbol}
              marketState={props.markets[symbol]}
              researchState={props.researchState[symbol]}
              onFocus={() => props.focusSymbol(symbol)}
            />
          ))}
        </div>
      </main>
    </div>
  );
}
