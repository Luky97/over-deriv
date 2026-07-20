import React from 'react';
import type { MarketTickState } from '@/lib/types';
import type { MarketResearchState } from '@/hooks/use-adaptive-research';

interface MarketOverviewCardProps {
  symbol: string;
  marketState?: MarketTickState;
  researchState?: MarketResearchState;
  onFocus: () => void;
}

export function MarketOverviewCard({ symbol, marketState, researchState, onFocus }: MarketOverviewCardProps) {
  if (!marketState) return null;

  const ticksLoaded = marketState.prices.length;
  const targetMet = ticksLoaded >= 1000;
  
  const currentPrediction = researchState?.prediction;
  const currentRound = researchState?.currentRound;

  return (
    <div 
      className="bg-slate-900 border border-slate-700 rounded-lg p-4 cursor-pointer hover:border-blue-500 transition-colors"
      onClick={onFocus}
    >
      <div className="flex justify-between items-center border-b border-slate-800 pb-2 mb-2">
        <h2 className="font-bold text-lg">{(marketState.symbol as any)?.display_name || symbol}</h2>
        <span className={`text-sm ${targetMet ? 'text-green-400' : 'text-yellow-400'}`}>
          {ticksLoaded} / 1000
        </span>
      </div>

      <div className="flex justify-between items-center mb-4">
        <div className="text-sm text-slate-400">Quote</div>
        <div className="font-mono text-xl">{marketState.currentQuote?.toFixed(marketState.pipSize) || '---'}</div>
      </div>

      <div className="flex justify-between items-center mb-4">
        <div className="text-sm text-slate-400">Regime</div>
        <div className="font-mono text-sm text-purple-400">
          {researchState?.features?.regime || 'COLLECTING'}
        </div>
      </div>

      <div className="flex justify-between items-center mb-4">
        <div className="text-sm text-slate-400">Sequence</div>
        <div className="font-mono text-sm text-orange-400">
          {researchState?.sequence || 'WAITING'}
        </div>
      </div>

      {currentPrediction && (
        <div className="bg-slate-950 p-2 rounded mb-2 border border-slate-800">
          <div className="flex justify-between mb-1">
            <span className="text-xs text-slate-500">Action</span>
            <span className={`text-xs font-bold ${currentPrediction.virtualAction === 'TRADE' ? 'text-green-500' : 'text-red-500'}`}>
              {currentPrediction.virtualAction}
            </span>
          </div>
          <div className="flex justify-between mb-1">
            <span className="text-xs text-slate-500">Target</span>
            <span className="text-xs">{currentPrediction.target} ({(currentPrediction.probability * 100).toFixed(1)}%)</span>
          </div>
          <div className="flex justify-between">
            <span className="text-xs text-slate-500">Confidence</span>
            <span className="text-xs">{currentPrediction.confidence.toFixed(1)}%</span>
          </div>
          {currentPrediction.rejectionReason && (
             <div className="text-xs text-red-400 mt-1">Reason: {currentPrediction.rejectionReason}</div>
          )}
        </div>
      )}

      {currentRound && (
        <div className="bg-slate-950 p-2 rounded border border-slate-800">
          <div className="text-xs text-slate-500 mb-1">Active Virtual Round</div>
          <div className="flex gap-1">
            {currentRound.contracts.map((c, i) => (
              <div key={i} className={`w-4 h-4 rounded-full ${c.isWin ? 'bg-green-500' : 'bg-red-500'}`} />
            ))}
            {Array.from({ length: 5 - currentRound.contracts.length }).map((_, i) => (
              <div key={`empty-${i}`} className="w-4 h-4 rounded-full bg-slate-700" />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
