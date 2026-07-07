'use client';

import { useMemo, useRef } from 'react';
import { useDerivWS } from '@deriv/core';
import { AnalyzerDashboard } from '@/components/analyzer-dashboard';
import { useAnalyzerMarketData } from '@/hooks/use-analyzer-market-data';
import { useFiveMinuteDigitAnalysis } from '@/hooks/use-five-minute-digit-analysis';
import { getLastDigit } from '@/lib/digit-stats';
import type { ConnectionState } from '@/lib/types';

export default function AnalyzerPage() {
  // No URL means the core hook opens Deriv's public WebSocket endpoint only.
  const {
    ws,
    isConnected,
    isExhausted,
    error: connectionError,
  } = useDerivWS();
  const market = useAnalyzerMarketData(ws, isConnected);
  const hasConnectedRef = useRef(false);
  if (isConnected) hasConnectedRef.current = true;

  const connectionState: ConnectionState = isConnected
    ? 'connected'
    : isExhausted
      ? 'offline'
      : hasConnectedRef.current || connectionError
        ? 'reconnecting'
        : 'connecting';

  const lastDigit = useMemo(() => {
    const latestPrice = market.currentTick?.quote ?? market.prices[market.prices.length - 1];
    return latestPrice === undefined
      ? null
      : getLastDigit(latestPrice, market.pipSize);
  }, [market.currentTick, market.pipSize, market.prices]);

  const analysis = useFiveMinuteDigitAnalysis({
    prices: market.prices,
    pipSize: market.pipSize,
    sessionKey: market.sessionKey,
  });

  return (
    <AnalyzerDashboard
      connectionState={connectionState}
      isLoading={market.isLoading}
      error={market.error ?? (isExhausted ? connectionError : null)}
      symbols={market.symbols}
      activeSymbol={market.activeSymbol}
      selectSymbol={market.selectSymbol}
      currentTick={market.currentTick}
      lastDigit={lastDigit}
      pipSize={market.pipSize}
      restartHistory={market.restartHistory}
      analyzerState={analysis.analyzerState}
      tickCount={analysis.tickCount}
      digitCounts={analysis.digitCounts}
      digitPercentages={analysis.digitPercentages}
      rankings={analysis.rankings}
      lowGroup={analysis.lowGroup}
      highGroup={analysis.highGroup}
      digitMovements={analysis.digitMovements}
      lowGroupMovement={analysis.lowGroupMovement}
      highGroupMovement={analysis.highGroupMovement}
      countdownSeconds={analysis.countdownSeconds}
      lastComparisonTime={analysis.lastComparisonTime}
      baselineTime={analysis.baselineTime}
    />
  );
}
