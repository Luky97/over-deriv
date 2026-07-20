'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { ActiveSymbol, DerivWS, Tick, TicksHistoryResponse } from '@deriv/core';
import type { MarketTick, MarketTickState } from '@/lib/types';
import { appendRollingTick, createMarketTick, filterSupportedMarkets, normalizeHistory, normalizePrecision } from '@/lib/deriv/market-data';
import { pipSizeFromPip } from '@/lib/digit-stats';

interface SubscriptionEntry {
  disposed: boolean;
  unsubscribe: (() => void) | null;
  resyncTimer: ReturnType<typeof setTimeout> | null;
}

export interface MultiSymbolTicksResult {
  symbols: ActiveSymbol[];
  markets: Record<string, MarketTickState>;
  isLoadingSymbols: boolean;
  symbolsError: string | null;
  restartMarket: (symbol: string) => void;
}

function initialContinuity(): MarketTickState['continuity'] {
  return {
    status: 'RESYNCING', duplicateCount: 0, lastGapEpoch: null,
    lastGapReason: null, resyncedAtEpoch: null,
  };
}

export function useMultiSymbolTicks(
  ws: DerivWS | null,
  isConnected: boolean,
  enabledMarkets: readonly string[],
): MultiSymbolTicksResult {
  const [symbols, setSymbols] = useState<ActiveSymbol[]>([]);
  const [markets, setMarkets] = useState<Record<string, MarketTickState>>({});
  const [isLoadingSymbols, setIsLoadingSymbols] = useState(true);
  const [symbolsError, setSymbolsError] = useState<string | null>(null);
  const [restartVersions, setRestartVersions] = useState<Record<string, number>>({});
  const tickBuffers = useRef(new Map<string, MarketTick[]>());
  const subscriptions = useRef(new Map<string, SubscriptionEntry>());
  const sessions = useRef(new Map<string, number>());
  const runtimeSession = useRef(`${Date.now()}:${Math.random().toString(36).slice(2)}`);
  const wsRef = useRef<DerivWS | null>(null);

  const updateMarket = useCallback((symbol: string, update: Partial<MarketTickState>) => {
    setMarkets((current) => current[symbol]
      ? { ...current, [symbol]: { ...current[symbol], ...update } }
      : current);
  }, []);

  const disposeSymbol = useCallback((symbol: string) => {
    const entry = subscriptions.current.get(symbol);
    if (entry) {
      entry.disposed = true;
      entry.unsubscribe?.();
      if (entry.resyncTimer) clearTimeout(entry.resyncTimer);
      subscriptions.current.delete(symbol);
    }
    tickBuffers.current.delete(symbol);
  }, []);

  const restartMarket = useCallback((symbol: string) => {
    disposeSymbol(symbol);
    setRestartVersions((current) => ({ ...current, [symbol]: (current[symbol] ?? 0) + 1 }));
  }, [disposeSymbol]);

  const startSymbol = useCallback(async (symbolInfo: ActiveSymbol, socket: DerivWS) => {
    const symbol = symbolInfo.underlying_symbol;
    if (subscriptions.current.has(symbol)) return;
    const entry: SubscriptionEntry = { disposed: false, unsubscribe: null, resyncTimer: null };
    subscriptions.current.set(symbol, entry);
    const fallbackPipSize = pipSizeFromPip(symbolInfo.pip_size);
    const session = (sessions.current.get(symbol) ?? 0) + 1;
    sessions.current.set(symbol, session);
    const sessionKey = `${runtimeSession.current}:${symbol}:${session}`;
    tickBuffers.current.set(symbol, []);
    updateMarket(symbol, {
      connectionState: 'connecting', ticks: [], currentTick: null, currentQuote: null,
      lastDigit: null, pipSize: fallbackPipSize, sessionKey, continuity: initialContinuity(),
      isLoading: true, error: null,
    });
    try {
      const response = await socket.send<TicksHistoryResponse>({
        ticks_history: symbol,
        end: 'latest',
        start: 1,
        count: 1000,
        style: 'ticks',
      });
      if (entry.disposed) return;
      const history = normalizeHistory(
        response.history?.prices ?? [],
        response.history?.times ?? [],
        symbolInfo.pip_size,
      );
      if (history.length === 0) throw new Error('Deriv returned no valid tick history.');
      tickBuffers.current.set(symbol, history);
      const finalHistoryTick = history[history.length - 1];
      const continuity: MarketTickState['continuity'] = {
        status: history.length >= 1000 ? 'SYNCED' : 'PARTIAL',
        duplicateCount: 0,
        lastGapEpoch: null,
        lastGapReason: history.length >= 1000 ? null : `Only ${history.length} of 1000 historical ticks were available.`,
        resyncedAtEpoch: finalHistoryTick.epoch,
      };
      updateMarket(symbol, {
        connectionState: 'connected', ticks: [...history], currentTick: null,
        currentQuote: finalHistoryTick.quote, lastDigit: finalHistoryTick.digit,
        pipSize: finalHistoryTick.pipSize, sessionKey, continuity,
        isLoading: false, error: null,
      });

      const stream = await socket.subscribe({ ticks: symbol }, (raw) => {
        const tick = (raw as { tick?: Tick }).tick;
        if (!tick || entry.disposed) return;
        if (!Number.isFinite(tick.quote) || !Number.isFinite(tick.epoch)) {
          updateMarket(symbol, { connectionState: 'error', error: 'Invalid live quote; resynchronization required.' });
          return;
        }
        const pipSize = normalizePrecision(tick.pip_size, fallbackPipSize);
        const incoming = createMarketTick(tick.epoch, tick.quote, pipSize, 'live');
        const appended = appendRollingTick(tickBuffers.current.get(symbol) ?? [], incoming);
        if (appended.duplicate) {
          setMarkets((current) => {
            const market = current[symbol];
            if (!market) return current;
            return {
              ...current,
              [symbol]: {
                ...market,
                continuity: { ...market.continuity, duplicateCount: market.continuity.duplicateCount + 1 },
              },
            };
          });
          return;
        }
        tickBuffers.current.set(symbol, appended.ticks);
        const nextContinuity: MarketTickState['continuity'] = appended.gap
          ? {
            status: 'GAP',
            duplicateCount: 0,
            lastGapEpoch: incoming.epoch,
            lastGapReason: appended.gapReason,
            resyncedAtEpoch: null,
          }
          : {
            status: appended.ticks.length >= 1000 ? 'SYNCED' : 'PARTIAL',
            duplicateCount: 0,
            lastGapEpoch: null,
            lastGapReason: null,
            resyncedAtEpoch: finalHistoryTick.epoch,
          };
        updateMarket(symbol, {
          connectionState: appended.gap ? 'error' : 'connected',
          ticks: [...appended.ticks],
          currentTick: tick,
          currentQuote: tick.quote,
          lastDigit: incoming.digit,
          pipSize,
          continuity: nextContinuity,
          isLoading: false,
          error: appended.gap ? `${appended.gapReason} Reloading a safe 1000-tick window.` : null,
        });
        if (appended.gap && !entry.resyncTimer) {
          entry.resyncTimer = setTimeout(() => restartMarket(symbol), 0);
        }
      });
      if (entry.disposed) stream.unsubscribe();
      else entry.unsubscribe = stream.unsubscribe;
    } catch (reason) {
      if (entry.disposed) return;
      subscriptions.current.delete(symbol);
      tickBuffers.current.delete(symbol);
      updateMarket(symbol, {
        connectionState: 'error', ticks: [], currentTick: null, currentQuote: null,
        lastDigit: null, isLoading: false,
        continuity: { ...initialContinuity(), status: 'RESYNCING' },
        error: reason instanceof Error ? reason.message : 'Unable to initialize public market data.',
      });
    }
  }, [restartMarket, updateMarket]);

  useEffect(() => {
    if (!ws || !isConnected) return;
    let disposed = false;
    setIsLoadingSymbols(true);
    void ws.send<{ active_symbols?: ActiveSymbol[] }>({ active_symbols: 'full' })
      .then((response) => {
        if (disposed) return;
        const supported = filterSupportedMarkets(response.active_symbols ?? []);
        if (supported.length === 0) throw new Error('None of the five supported non-1s Volatility indices are currently available.');
        setSymbols(supported);
        setSymbolsError(null);
      })
      .catch((reason: unknown) => {
        if (!disposed) setSymbolsError(reason instanceof Error ? reason.message : 'Unable to validate Deriv active symbols.');
      })
      .finally(() => { if (!disposed) setIsLoadingSymbols(false); });
    return () => { disposed = true; };
  }, [isConnected, ws]);

  useEffect(() => {
    if (wsRef.current !== ws || !isConnected) {
      for (const symbol of [...subscriptions.current.keys()]) disposeSymbol(symbol);
      wsRef.current = ws;
      setMarkets((current) => Object.fromEntries(Object.entries(current).map(([symbol, market]) => [
        symbol,
        {
          ...market,
          connectionState: isConnected ? 'connecting' : 'offline',
          currentTick: null,
          continuity: { ...market.continuity, status: 'RESYNCING' },
          isLoading: true,
        },
      ])));
    }
    if (!ws || !isConnected) return;
    const selected = new Set(enabledMarkets);
    for (const symbol of [...subscriptions.current.keys()]) {
      if (!selected.has(symbol)) disposeSymbol(symbol);
    }
    for (const symbol of enabledMarkets) {
      const info = symbols.find((candidate) => candidate.underlying_symbol === symbol);
      if (!info) continue;
      setMarkets((current) => current[symbol] ? current : {
        ...current,
        [symbol]: {
          symbol: info,
          connectionState: 'connecting',
          ticks: [],
          currentTick: null,
          currentQuote: null,
          lastDigit: null,
          pipSize: pipSizeFromPip(info.pip_size),
          sessionKey: `${symbol}:0`,
          continuity: initialContinuity(),
          isLoading: true,
          error: null,
        },
      });
      void startSymbol(info, ws);
    }
    setMarkets((current) => Object.fromEntries(Object.entries(current).filter(([symbol]) => selected.has(symbol))));
  }, [disposeSymbol, enabledMarkets, isConnected, restartVersions, startSymbol, symbols, ws]);

  useEffect(() => () => {
    for (const symbol of [...subscriptions.current.keys()]) disposeSymbol(symbol);
  }, [disposeSymbol]);

  return useMemo(() => ({
    symbols,
    markets,
    isLoadingSymbols,
    symbolsError,
    restartMarket,
  }), [isLoadingSymbols, markets, restartMarket, symbols, symbolsError]);
}
