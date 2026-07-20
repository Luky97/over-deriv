'use client';

import { useRef, useState } from 'react';
import { useDerivWS } from '@deriv/core';
import { useMultiSymbolTicks } from '@/hooks/use-multi-symbol-ticks';
import { useAdaptiveResearch } from '@/hooks/use-adaptive-research';
import { AdaptiveResearchDashboard } from '@/components/research-dashboard';
import type { ConnectionState } from '@/lib/types';
import type { TriggerMode } from '@/lib/ml-types';

export default function AnalyzerPage() {
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
  
  const [triggerMode, setTriggerMode] = useState<TriggerMode>('Digit');
  const [triggerDigit, setTriggerDigit] = useState<number>(1);
  
  const researchState = useAdaptiveResearch(scanner.markets, triggerMode, triggerDigit);

  return (
    <AdaptiveResearchDashboard
      connectionState={connectionState}
      symbols={scanner.symbols}
      selectedSymbols={scanner.selectedSymbols}
      focusedSymbol={scanner.focusedSymbol}
      markets={scanner.markets}
      researchState={researchState}
      isLoadingSymbols={scanner.isLoadingSymbols}
      symbolsError={scanner.symbolsError ?? (isExhausted ? error : null)}
      setSelectedSymbols={scanner.setSelectedSymbols}
      toggleSymbol={scanner.toggleSymbol}
      focusSymbol={scanner.focusSymbol}
      restartMarket={scanner.restartMarket}
      triggerMode={triggerMode}
      setTriggerMode={setTriggerMode}
      triggerDigit={triggerDigit}
      setTriggerDigit={setTriggerDigit}
    />
  );
}
