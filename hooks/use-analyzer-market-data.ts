'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { pickDefaultSymbol } from '@deriv/core';
import type {
  ActiveSymbol,
  DerivWS,
  Tick,
  TicksHistoryResponse,
} from '@deriv/core';
import { DIGIT_WINDOW_SIZE, pipSizeFromPip } from '@/lib/digit-stats';

const SYMBOL_QUERY_PARAMETER = 'symbol';

function readSymbolFromUrl(): string | undefined {
  if (typeof window === 'undefined') return undefined;
  return new URLSearchParams(window.location.search).get(SYMBOL_QUERY_PARAMETER) ?? undefined;
}

function writeSymbolToUrl(symbol: string): void {
  if (typeof window === 'undefined') return;
  const params = new URLSearchParams(window.location.search);
  params.set(SYMBOL_QUERY_PARAMETER, symbol);
  const nextUrl = `${window.location.pathname}?${params.toString()}${window.location.hash}`;
  window.history.replaceState(null, '', nextUrl);
}

function validPrice(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function normalizeTickPrecision(value: number | undefined, fallback: number): number {
  if (value === undefined || !Number.isInteger(value) || value < 0 || value > 20) {
    return fallback;
  }
  return value;
}

export interface AnalyzerMarketData {
  symbols: ActiveSymbol[];
  activeSymbol: ActiveSymbol | null;
  selectSymbol: (symbol: string) => void;
  currentTick: Tick | null;
  prices: number[];
  pipSize: number;
  sessionKey: string;
  isLoading: boolean;
  error: string | null;
  restartHistory: () => void;
}

/**
 * Public-only market data for the analyzer.
 *
 * The only Deriv requests made here are active_symbols, ticks_history, ticks,
 * and the forget request produced when the tick subscription is cleaned up.
 */
export function useAnalyzerMarketData(
  ws: DerivWS | null,
  isConnected: boolean
): AnalyzerMarketData {
  const [symbols, setSymbols] = useState<ActiveSymbol[]>([]);
  const [activeSymbol, setActiveSymbol] = useState<ActiveSymbol | null>(null);
  const [currentTick, setCurrentTick] = useState<Tick | null>(null);
  const [prices, setPrices] = useState<number[]>([]);
  const [pipSize, setPipSize] = useState(2);
  const [sessionKey, setSessionKey] = useState('no-session');
  const [symbolsLoading, setSymbolsLoading] = useState(true);
  const [historyLoading, setHistoryLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [restartToken, setRestartToken] = useState(0);

  const activeSymbolRef = useRef<ActiveSymbol | null>(null);
  const pricesRef = useRef<number[]>([]);
  const sessionCounterRef = useRef(0);
  activeSymbolRef.current = activeSymbol;

  const restartHistory = useCallback(() => {
    setRestartToken((value) => value + 1);
  }, []);

  const selectSymbol = useCallback((underlyingSymbol: string) => {
    const nextSymbol = symbols.find(
      (symbol) => symbol.underlying_symbol === underlyingSymbol
    );
    if (!nextSymbol || nextSymbol.underlying_symbol === activeSymbolRef.current?.underlying_symbol) {
      return;
    }

    writeSymbolToUrl(underlyingSymbol);
    setActiveSymbol(nextSymbol);
  }, [symbols]);

  useEffect(() => {
    if (isConnected) return;
    sessionCounterRef.current += 1;
    pricesRef.current = [];
    setSessionKey(`disconnected:${sessionCounterRef.current}`);
    setCurrentTick(null);
    setPrices([]);
    setHistoryLoading(true);
  }, [isConnected]);

  useEffect(() => {
    if (!ws || !isConnected) return;
    let disposed = false;

    async function loadSymbols() {
      setSymbolsLoading(true);
      try {
        const response = await ws!.send<{ active_symbols?: ActiveSymbol[] }>({
          active_symbols: 'full',
        });
        if (disposed) return;

        const availableSymbols = response.active_symbols ?? [];
        if (availableSymbols.length === 0) {
          throw new Error('Deriv returned no active symbols.');
        }

        const currentKey = activeSymbolRef.current?.underlying_symbol;
        const retainedSymbol = availableSymbols.find(
          (symbol) => symbol.underlying_symbol === currentKey
        );
        const selectedSymbol = retainedSymbol ?? pickDefaultSymbol(
          availableSymbols,
          readSymbolFromUrl()
        );

        setSymbols(availableSymbols);
        setActiveSymbol(selectedSymbol);
        writeSymbolToUrl(selectedSymbol.underlying_symbol);
        setError(null);
      } catch (requestError) {
        if (!disposed) {
          setError(
            requestError instanceof Error
              ? requestError.message
              : 'Unable to load Deriv symbols.'
          );
        }
      } finally {
        if (!disposed) setSymbolsLoading(false);
      }
    }

    void loadSymbols();
    return () => {
      disposed = true;
    };
  }, [ws, isConnected, restartToken]);

  useEffect(() => {
    if (!ws || !isConnected || !activeSymbol) return;

    let disposed = false;
    let unsubscribe: (() => void) | null = null;
    const symbol = activeSymbol.underlying_symbol;
    const marketPipSize = pipSizeFromPip(activeSymbol.pip_size);

    sessionCounterRef.current += 1;
    const nextSessionKey = `${symbol}:${sessionCounterRef.current}`;
    pricesRef.current = [];
    setSessionKey(nextSessionKey);
    setCurrentTick(null);
    setPrices([]);
    setPipSize(marketPipSize);
    setHistoryLoading(true);

    async function loadHistoryAndSubscribe() {
      try {
        const historyResponse = await ws!.send<TicksHistoryResponse>({
          ticks_history: symbol,
          end: 'latest',
          start: 1,
          count: DIGIT_WINDOW_SIZE,
          style: 'ticks',
        });
        if (disposed) return;

        const historyPrices = historyResponse.history?.prices ?? [];
        if (!historyPrices.every(validPrice)) {
          throw new Error('The tick history contained invalid quote data.');
        }

        const rollingHistory = historyPrices.slice(-DIGIT_WINDOW_SIZE);
        const historyTimes = historyResponse.history?.times ?? [];
        const finalHistoryEpoch = historyTimes[historyTimes.length - 1];
        const finalHistoryPrice = rollingHistory[rollingHistory.length - 1];
        let isFirstStreamTick = true;

        pricesRef.current = rollingHistory;
        setPrices([...rollingHistory]);
        setHistoryLoading(false);
        setError(null);

        const subscription = await ws!.subscribe(
          { ticks: symbol },
          (response) => {
            const tick = (response as { tick?: Tick }).tick;
            if (!tick || disposed) return;

            if (!validPrice(tick.quote) || !Number.isFinite(tick.epoch)) {
              setError('Invalid live tick received. Reloading the sample.');
              setRestartToken((value) => value + 1);
              return;
            }

            if (
              isFirstStreamTick &&
              tick.epoch === finalHistoryEpoch &&
              tick.quote === finalHistoryPrice
            ) {
              isFirstStreamTick = false;
              setCurrentTick(tick);
              setPipSize(normalizeTickPrecision(tick.pip_size, marketPipSize));
              return;
            }
            isFirstStreamTick = false;

            const nextPrices = [...pricesRef.current, tick.quote].slice(-DIGIT_WINDOW_SIZE);
            pricesRef.current = nextPrices;
            setCurrentTick(tick);
            setPrices(nextPrices);
            setPipSize(normalizeTickPrecision(tick.pip_size, marketPipSize));
          }
        );

        if (disposed) {
          subscription.unsubscribe();
          return;
        }
        unsubscribe = subscription.unsubscribe;
      } catch (requestError) {
        if (!disposed) {
          pricesRef.current = [];
          setPrices([]);
          setCurrentTick(null);
          setHistoryLoading(false);
          setError(
            requestError instanceof Error
              ? requestError.message
              : 'Unable to load the live tick sample.'
          );
        }
      }
    }

    void loadHistoryAndSubscribe();

    return () => {
      disposed = true;
      unsubscribe?.();
      pricesRef.current = [];
    };
  }, [ws, isConnected, activeSymbol?.underlying_symbol, restartToken]);

  return {
    symbols,
    activeSymbol,
    selectSymbol,
    currentTick,
    prices,
    pipSize,
    sessionKey,
    isLoading: symbolsLoading || (historyLoading && prices.length === 0),
    error,
    restartHistory,
  };
}
