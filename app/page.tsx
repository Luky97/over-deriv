'use client';

import { useRef } from 'react';
import { useDerivWS } from '@deriv/core';
import { AdaptiveResearchDashboard } from '@/components/research-dashboard';
import { useAdaptiveResearch } from '@/hooks/use-adaptive-research';
import { useMultiSymbolTicks } from '@/hooks/use-multi-symbol-ticks';
import { useResearchSettings } from '@/hooks/use-research-settings';
import type { ConnectionState } from '@/lib/types';

export default function ResearchPage() {
  const { ws, isConnected, isExhausted, error } = useDerivWS();
  const connectedBefore = useRef(false);
  if (isConnected) connectedBefore.current = true;
  const connectionState: ConnectionState = isConnected
    ? 'connected'
    : isExhausted
      ? 'offline'
      : connectedBefore.current || error
        ? 'reconnecting'
        : 'connecting';
  const settings = useResearchSettings();
  const tickData = useMultiSymbolTicks(ws, isConnected, settings.settings.enabledMarkets);
  const research = useAdaptiveResearch(tickData.markets, settings.settings, settings.isReady);

  return <AdaptiveResearchDashboard
    connectionState={connectionState}
    symbols={tickData.symbols}
    markets={tickData.markets}
    research={research}
    settings={settings.settings}
    setSettings={settings.setSettings}
    settingsReady={settings.isReady}
    settingsError={settings.error}
    symbolsError={tickData.symbolsError ?? (isExhausted ? error : null)}
    restartMarket={tickData.restartMarket}
  />;
}
