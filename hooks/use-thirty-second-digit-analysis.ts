'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  computeDigitMovements,
  computeDigitStats,
  computeGroupMovement,
  computeGroupSnapshot,
  computeRankings,
  createSnapshot,
  DIGIT_WINDOW_SIZE,
} from '@/lib/digit-stats';
import { HIGH_DIGITS, LOW_DIGITS } from '@/lib/types';
import type {
  DigitSnapshot,
  MarketAnalyzerState,
  MarketTickState,
  MultiScanState,
} from '@/lib/types';

export const ANALYSIS_INTERVAL_MS = 30_000;

interface TimerSet {
  comparison: ReturnType<typeof setInterval>;
  countdown: ReturnType<typeof setInterval>;
}

interface CurrentSample {
  counts: number[];
  totalTicks: number;
  valid: boolean;
}

function emptyAnalysis(): MarketAnalyzerState {
  return {
    analyzerState: 'collecting', tickCount: 0,
    digitCounts: Array<number>(10).fill(0),
    digitPercentages: Array<number>(10).fill(0), rankings: [],
    lowGroup: { groupCount: 0, groupPercentage: 0 },
    highGroup: { groupCount: 0, groupPercentage: 0 },
    digitMovements: null, lowGroupMovement: null, highGroupMovement: null,
    countdownSeconds: 0, lastComparisonTime: null, baselineTime: null,
  };
}

function emptyIntervalAnalysis(): Partial<MarketAnalyzerState> {
  return {
    analyzerState: 'collecting', digitMovements: null,
    lowGroupMovement: null, highGroupMovement: null,
    countdownSeconds: 0, lastComparisonTime: null, baselineTime: null,
  };
}

export function useThirtySecondDigitAnalysis(
  markets: Record<string, MarketTickState>,
  selectedSymbols: readonly string[]
): MultiScanState {
  const [intervalState, setIntervalState] = useState<Record<string, Partial<MarketAnalyzerState>>>({});
  const samplesRef = useRef(new Map<string, CurrentSample>());
  const snapshotsRef = useRef(new Map<string, DigitSnapshot>());
  const timersRef = useRef(new Map<string, TimerSet>());
  const deadlinesRef = useRef(new Map<string, number>());
  const sessionsRef = useRef(new Map<string, string>());
  const selectionRef = useRef<string[] | null>(null);

  const liveState = useMemo(() => {
    const next: MultiScanState = {};
    for (const symbol of selectedSymbols) {
      const market = markets[symbol];
      if (!market) {
        next[symbol] = emptyAnalysis();
        continue;
      }
      const stats = computeDigitStats(market.prices, market.pipSize);
      const valid = market.prices.length === DIGIT_WINDOW_SIZE && stats.totalTicks === DIGIT_WINDOW_SIZE;
      next[symbol] = {
        ...emptyAnalysis(),
        tickCount: stats.totalTicks,
        digitCounts: stats.counts,
        digitPercentages: stats.percentages,
        rankings: valid ? computeRankings(stats.counts, stats.totalTicks) : [],
        lowGroup: computeGroupSnapshot(stats.counts, LOW_DIGITS, DIGIT_WINDOW_SIZE),
        highGroup: computeGroupSnapshot(stats.counts, HIGH_DIGITS, DIGIT_WINDOW_SIZE),
        ...(intervalState[symbol] ?? {}),
      };
      samplesRef.current.set(symbol, { counts: stats.counts, totalTicks: stats.totalTicks, valid });
    }
    return next;
  }, [intervalState, markets, selectedSymbols]);

  const clearSymbol = useCallback((symbol: string, removeState = false) => {
    const timers = timersRef.current.get(symbol);
    if (timers) {
      clearInterval(timers.comparison);
      clearInterval(timers.countdown);
      timersRef.current.delete(symbol);
    }
    deadlinesRef.current.delete(symbol);
    snapshotsRef.current.delete(symbol);
    if (removeState) {
      sessionsRef.current.delete(symbol);
      samplesRef.current.delete(symbol);
      setIntervalState((current) => {
        const { [symbol]: _removed, ...rest } = current;
        return rest;
      });
    } else {
      setIntervalState((current) => ({ ...current, [symbol]: emptyIntervalAnalysis() }));
    }
  }, []);

  const compare = useCallback((symbol: string) => {
    const previous = snapshotsRef.current.get(symbol);
    const sample = samplesRef.current.get(symbol);
    if (!previous || !sample?.valid) {
      clearSymbol(symbol);
      return;
    }
    const now = Date.now();
    const current = createSnapshot(sample.counts, sample.totalTicks, now);
    const movements = computeDigitMovements(current, previous);
    snapshotsRef.current.set(symbol, current);
    deadlinesRef.current.set(symbol, now + ANALYSIS_INTERVAL_MS);
    setIntervalState((state) => ({
      ...state,
      [symbol]: {
        ...(state[symbol] ?? {}), analyzerState: 'active',
        digitMovements: movements,
        lowGroupMovement: computeGroupMovement(current, previous, LOW_DIGITS, 'low', movements),
        highGroupMovement: computeGroupMovement(current, previous, HIGH_DIGITS, 'high', movements),
        countdownSeconds: ANALYSIS_INTERVAL_MS / 1_000,
        lastComparisonTime: now,
      },
    }));
  }, [clearSymbol]);

  const captureBaseline = useCallback((symbol: string, sample: CurrentSample) => {
    if (timersRef.current.has(symbol)) return;
    const now = Date.now();
    snapshotsRef.current.set(symbol, createSnapshot(sample.counts, sample.totalTicks, now));
    deadlinesRef.current.set(symbol, now + ANALYSIS_INTERVAL_MS);
    setIntervalState((state) => ({
      ...state,
      [symbol]: {
        analyzerState: 'baseline', digitMovements: null,
        lowGroupMovement: null, highGroupMovement: null,
        countdownSeconds: ANALYSIS_INTERVAL_MS / 1_000,
        lastComparisonTime: null, baselineTime: now,
      },
    }));
    const comparison = setInterval(() => compare(symbol), ANALYSIS_INTERVAL_MS);
    const countdown = setInterval(() => {
      const deadline = deadlinesRef.current.get(symbol);
      setIntervalState((state) => ({
        ...state,
        [symbol]: {
          ...(state[symbol] ?? {}),
          countdownSeconds: deadline ? Math.max(0, Math.ceil((deadline - Date.now()) / 1_000)) : 0,
        },
      }));
    }, 1_000);
    timersRef.current.set(symbol, { comparison, countdown });
  }, [compare]);

  useEffect(() => {
    const selected = new Set(selectedSymbols);
    const previousSelection = selectionRef.current;
    const selectionChanged = previousSelection !== null && (
      previousSelection.length !== selectedSymbols.length
      || previousSelection.some((symbol, index) => symbol !== selectedSymbols[index])
    );
    if (selectionChanged) {
      for (const symbol of new Set([...(previousSelection ?? []), ...selectedSymbols])) {
        clearSymbol(symbol, !selected.has(symbol));
      }
    }
    selectionRef.current = [...selectedSymbols];

    for (const symbol of [...timersRef.current.keys()]) {
      if (!selected.has(symbol)) clearSymbol(symbol, true);
    }

    for (const symbol of selectedSymbols) {
      const market = markets[symbol];
      if (!market) continue;
      const priorSession = sessionsRef.current.get(symbol);
      if (priorSession !== market.sessionKey) {
        if (priorSession !== undefined) clearSymbol(symbol);
        sessionsRef.current.set(symbol, market.sessionKey);
      }
      const sample = samplesRef.current.get(symbol);
      if (!sample?.valid) {
        if (timersRef.current.has(symbol) || snapshotsRef.current.has(symbol)) clearSymbol(symbol);
        continue;
      }
      if (!timersRef.current.has(symbol)) captureBaseline(symbol, sample);
    }
  }, [captureBaseline, clearSymbol, markets, selectedSymbols]);

  useEffect(() => () => {
    for (const timers of timersRef.current.values()) {
      clearInterval(timers.comparison);
      clearInterval(timers.countdown);
    }
    timersRef.current.clear();
  }, []);

  return liveState;
}
