'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { ActiveSymbol, DerivWS, Tick, TicksHistoryResponse } from '@deriv/core';
import { DIGIT_WINDOW_SIZE, getLastDigit, pipSizeFromPip } from '@/lib/digit-stats';
import type { MarketTickState } from '@/lib/types';

const DEFAULT_SYMBOLS = ['R_10', 'R_25', 'R_50', 'R_75', 'R_100'];
const SYMBOLS_PARAM = 'symbols';
const LEGACY_SYMBOL_PARAM = 'symbol';

interface SubscriptionEntry {
  disposed: boolean;
  unsubscribe: (() => void) | null;
}

export interface MultiSymbolTicksResult {
  symbols: ActiveSymbol[];
  selectedSymbols: string[];
  focusedSymbol: string | null;
  markets: Record<string, MarketTickState>;
  isLoadingSymbols: boolean;
  symbolsError: string | null;
  setSelectedSymbols: (symbols: string[]) => void;
  toggleSymbol: (symbol: string) => void;
  focusSymbol: (symbol: string) => void;
  restartMarket: (symbol: string) => void;
}

function readRequestedSymbols(): string[] {
  if (typeof window === 'undefined') return [];
  const params = new URLSearchParams(window.location.search);
  const multi = params.get(SYMBOLS_PARAM)?.split(',').filter(Boolean) ?? [];
  const legacy = params.get(LEGACY_SYMBOL_PARAM);
  return multi.length > 0 ? multi : legacy ? [legacy] : [];
}

function writeSymbolsToUrl(symbols: readonly string[], focused: string | null): void {
  if (typeof window === 'undefined') return;
  const params = new URLSearchParams(window.location.search);
  if (symbols.length > 0) params.set(SYMBOLS_PARAM, symbols.join(','));
  else params.delete(SYMBOLS_PARAM);
  params.delete(LEGACY_SYMBOL_PARAM);
  if (focused) params.set('focus', focused);
  else params.delete('focus');
  const query = params.toString();
  window.history.replaceState(null, '', `${window.location.pathname}${query ? `?${query}` : ''}${window.location.hash}`);
}

function validPrice(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function normalizePrecision(value: number | undefined, fallback: number): number {
  return value !== undefined && Number.isInteger(value) && value >= 0 && value <= 20
    ? value
    : fallback;
}

export function useMultiSymbolTicks(
  ws: DerivWS | null,
  isConnected: boolean
): MultiSymbolTicksResult {
  const [symbols, setSymbols] = useState<ActiveSymbol[]>([]);
  const [selectedSymbols, setSelectedSymbolsState] = useState<string[]>([]);
  const [focusedSymbol, setFocusedSymbol] = useState<string | null>(null);
  const [markets, setMarkets] = useState<Record<string, MarketTickState>>({});
  const [isLoadingSymbols, setIsLoadingSymbols] = useState(true);
  const [symbolsError, setSymbolsError] = useState<string | null>(null);
  const [restartVersions, setRestartVersions] = useState<Record<string, number>>({});

  const selectedRef = useRef<string[]>([]);
  const focusedRef = useRef<string | null>(null);
  const pricesRef = useRef(new Map<string, number[]>());
  const subscriptionsRef = useRef(new Map<string, SubscriptionEntry>());
  const sessionsRef = useRef(new Map<string, number>());
  const wsRef = useRef<DerivWS | null>(null);
  const selectionInitializedRef = useRef(false);
  selectedRef.current = selectedSymbols;
  focusedRef.current = focusedSymbol;

  const updateMarket = useCallback((symbol: string, update: Partial<MarketTickState>) => {
    setMarkets((current) => {
      const existing = current[symbol];
      return existing ? { ...current, [symbol]: { ...existing, ...update } } : current;
    });
  }, []);

  const disposeSymbol = useCallback((symbol: string) => {
    const entry = subscriptionsRef.current.get(symbol);
    if (entry) {
      entry.disposed = true;
      entry.unsubscribe?.();
      subscriptionsRef.current.delete(symbol);
    }
    pricesRef.current.delete(symbol);
  }, []);

  const startSymbol = useCallback(async (symbolInfo: ActiveSymbol, wsInstance: DerivWS) => {
    const symbol = symbolInfo.underlying_symbol;
    if (subscriptionsRef.current.has(symbol)) return;

    const entry: SubscriptionEntry = { disposed: false, unsubscribe: null };
    subscriptionsRef.current.set(symbol, entry);
    const pipSize = pipSizeFromPip(symbolInfo.pip_size);
    const session = (sessionsRef.current.get(symbol) ?? 0) + 1;
    sessionsRef.current.set(symbol, session);
    pricesRef.current.set(symbol, []);
    updateMarket(symbol, {
      connectionState: 'connecting', prices: [], currentTick: null,
      currentQuote: null, lastDigit: null, pipSize,
      sessionKey: `${symbol}:${session}`, isLoading: true, error: null,
    });

    try {
      const historyResponse = await wsInstance.send<TicksHistoryResponse>({
        ticks_history: symbol, end: 'latest', start: 1,
        count: DIGIT_WINDOW_SIZE, style: 'ticks',
      });
      if (entry.disposed) return;
      const historyPrices = historyResponse.history?.prices ?? [];
      if (!historyPrices.every(validPrice)) throw new Error('Invalid quote data in tick history.');

      const rolling = historyPrices.slice(-DIGIT_WINDOW_SIZE);
      const times = historyResponse.history?.times ?? [];
      const finalEpoch = times[times.length - 1];
      const finalPrice = rolling[rolling.length - 1];
      let firstStreamTick = true;
      pricesRef.current.set(symbol, rolling);
      updateMarket(symbol, {
        connectionState: 'connected', prices: [...rolling],
        currentQuote: finalPrice ?? null,
        lastDigit: finalPrice === undefined ? null : getLastDigit(finalPrice, pipSize),
        isLoading: false, error: null,
      });

      const subscription = await wsInstance.subscribe({ ticks: symbol }, (response) => {
        const tick = (response as { tick?: Tick }).tick;
        if (!tick || entry.disposed) return;
        if (!validPrice(tick.quote) || !Number.isFinite(tick.epoch)) {
          updateMarket(symbol, { connectionState: 'error', error: 'Invalid live tick. Restart this market.' });
          return;
        }

        const precision = normalizePrecision(tick.pip_size, pipSize);
        if (firstStreamTick && tick.epoch === finalEpoch && tick.quote === finalPrice) {
          firstStreamTick = false;
          updateMarket(symbol, {
            currentTick: tick, currentQuote: tick.quote,
            lastDigit: getLastDigit(tick.quote, precision), pipSize: precision,
          });
          return;
        }
        firstStreamTick = false;
        const nextPrices = [...(pricesRef.current.get(symbol) ?? []), tick.quote]
          .slice(-DIGIT_WINDOW_SIZE);
        pricesRef.current.set(symbol, nextPrices);
        updateMarket(symbol, {
          connectionState: 'connected', prices: nextPrices, currentTick: tick,
          currentQuote: tick.quote, lastDigit: getLastDigit(tick.quote, precision),
          pipSize: precision, isLoading: false, error: null,
        });
      });

      if (entry.disposed) subscription.unsubscribe();
      else entry.unsubscribe = subscription.unsubscribe;
    } catch (error) {
      if (!entry.disposed) {
        subscriptionsRef.current.delete(symbol);
        pricesRef.current.delete(symbol);
        updateMarket(symbol, {
          connectionState: 'error', prices: [], currentTick: null,
          currentQuote: null, lastDigit: null, isLoading: false,
          error: error instanceof Error ? error.message : 'Unable to load this market.',
        });
      }
    }
  }, [updateMarket]);

  useEffect(() => {
    if (!ws || !isConnected) return;
    let disposed = false;
    setIsLoadingSymbols(true);
    void ws.send<{ active_symbols?: ActiveSymbol[] }>({ active_symbols: 'full' })
      .then((response) => {
        if (disposed) return;
        const available = response.active_symbols ?? [];
        if (available.length === 0) throw new Error('Deriv returned no active symbols.');
        setSymbols(available);
        const availableIds = new Set(available.map((item) => item.underlying_symbol));
        const requested = readRequestedSymbols().filter((id) => availableIds.has(id));
        const defaults = DEFAULT_SYMBOLS.filter((id) => availableIds.has(id)).slice(0, 4);
        const initial = requested.length > 0 ? requested : defaults.length > 0 ? defaults : [available[0].underlying_symbol];
        const isInitialSelection = !selectionInitializedRef.current;
        selectionInitializedRef.current = true;
        setSelectedSymbolsState((current) => {
          return isInitialSelection ? initial : current.filter((id) => availableIds.has(id));
        });
        setFocusedSymbol((current) => {
          if (current && availableIds.has(current)) return current;
          return isInitialSelection ? initial[0] : null;
        });
        setSymbolsError(null);
      })
      .catch((error: unknown) => {
        if (!disposed) setSymbolsError(error instanceof Error ? error.message : 'Unable to load Deriv symbols.');
      })
      .finally(() => { if (!disposed) setIsLoadingSymbols(false); });
    return () => { disposed = true; };
  }, [ws, isConnected]);

  useEffect(() => {
    if (wsRef.current !== ws || !isConnected) {
      for (const symbol of [...subscriptionsRef.current.keys()]) disposeSymbol(symbol);
      wsRef.current = ws;
      setMarkets((current) => Object.fromEntries(Object.entries(current).map(([id, market]) => [id, {
        ...market, connectionState: isConnected ? 'connecting' : 'offline', prices: [],
        currentTick: null, currentQuote: null, lastDigit: null, isLoading: true,
      }])));
    }
    if (!ws || !isConnected) return;

    const selectedSet = new Set(selectedSymbols);
    for (const symbol of [...subscriptionsRef.current.keys()]) {
      if (!selectedSet.has(symbol)) disposeSymbol(symbol);
    }
    for (const symbol of selectedSymbols) {
      const info = symbols.find((item) => item.underlying_symbol === symbol);
      if (!info) continue;
      setMarkets((current) => current[symbol] ? current : { ...current, [symbol]: {
        symbol: info, connectionState: 'connecting', prices: [], currentTick: null,
        currentQuote: null, lastDigit: null, pipSize: pipSizeFromPip(info.pip_size),
        sessionKey: `${symbol}:0`, isLoading: true, error: null,
      }});
      void startSymbol(info, ws);
    }
    setMarkets((current) => Object.fromEntries(Object.entries(current).filter(([id]) => selectedSet.has(id))));
  }, [disposeSymbol, isConnected, restartVersions, selectedSymbols, startSymbol, symbols, ws]);

  useEffect(() => () => {
    for (const symbol of [...subscriptionsRef.current.keys()]) disposeSymbol(symbol);
  }, [disposeSymbol]);

  useEffect(() => {
    writeSymbolsToUrl(selectedSymbols, focusedSymbol);
  }, [focusedSymbol, selectedSymbols]);

  const setSelectedSymbols = useCallback((next: string[]) => {
    const valid = new Set(symbols.map((item) => item.underlying_symbol));
    const unique = [...new Set(next)].filter((id) => valid.has(id));
    setSelectedSymbolsState(unique);
    setFocusedSymbol((current) => current && unique.includes(current) ? current : unique[0] ?? null);
  }, [symbols]);

  const toggleSymbol = useCallback((symbol: string) => {
    setSelectedSymbols(selectedRef.current.includes(symbol)
      ? selectedRef.current.filter((id) => id !== symbol)
      : [...selectedRef.current, symbol]);
  }, [setSelectedSymbols]);

  const focusSymbol = useCallback((symbol: string) => {
    if (selectedRef.current.includes(symbol)) setFocusedSymbol(symbol);
  }, []);

  const restartMarket = useCallback((symbol: string) => {
    disposeSymbol(symbol);
    setRestartVersions((current) => ({ ...current, [symbol]: (current[symbol] ?? 0) + 1 }));
  }, [disposeSymbol]);

  return useMemo(() => ({
    symbols, selectedSymbols, focusedSymbol, markets, isLoadingSymbols,
    symbolsError, setSelectedSymbols, toggleSymbol, focusSymbol, restartMarket,
  }), [focusSymbol, focusedSymbol, isLoadingSymbols, markets, restartMarket,
    selectedSymbols, setSelectedSymbols, symbols, symbolsError, toggleSymbol]);
}
