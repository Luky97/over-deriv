'use client';

import { useRef } from 'react';
import { useDerivWS } from '@deriv/core';
import { AnalyzerDashboard } from '@/components/analyzer-dashboard';
import { useMultiSymbolTicks } from '@/hooks/use-multi-symbol-ticks';
import { useThirtySecondDigitAnalysis } from '@/hooks/use-thirty-second-digit-analysis';
import type { ConnectionState } from '@/lib/types';

export default function AnalyzerPage() {
  // Public market-data connection only. This page never authorizes or trades.
  const { ws, isConnected, isExhausted, error } = useDerivWS();
  const hasConnectedRef = useRef(false);
  if (isConnected) hasConnectedRef.current = true;

  const connectionState: ConnectionState = isConnected
    ? 'connected'
    : isExhausted
      ? 'offline'
      : hasConnectedRef.current || error
        ? 'reconnecting'
        : 'connecting';

  const scanner = useMultiSymbolTicks(ws, isConnected);
  const analyses = useThirtySecondDigitAnalysis(scanner.markets, scanner.selectedSymbols);

  return (
    <AnalyzerDashboard
      connectionState={connectionState}
      symbols={scanner.symbols}
      selectedSymbols={scanner.selectedSymbols}
      focusedSymbol={scanner.focusedSymbol}
      markets={scanner.markets}
      analyses={analyses}
      isLoadingSymbols={scanner.isLoadingSymbols}
      symbolsError={scanner.symbolsError ?? (isExhausted ? error : null)}
      setSelectedSymbols={scanner.setSelectedSymbols}
      toggleSymbol={scanner.toggleSymbol}
      focusSymbol={scanner.focusSymbol}
      restartMarket={scanner.restartMarket}
    />
  );
}
