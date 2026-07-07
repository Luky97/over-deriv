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
  AnalyzerState,
  DigitMovement,
  DigitSnapshot,
  GroupMovement,
  GroupSnapshot,
  RankGroup,
} from '@/lib/types';

const COMPARISON_INTERVAL_MS = 300_000;

export interface FiveMinuteDigitAnalysis {
  analyzerState: AnalyzerState;
  tickCount: number;
  digitCounts: number[];
  digitPercentages: number[];
  rankings: RankGroup[];
  lowGroup: GroupSnapshot;
  highGroup: GroupSnapshot;
  digitMovements: DigitMovement[] | null;
  lowGroupMovement: GroupMovement | null;
  highGroupMovement: GroupMovement | null;
  countdownSeconds: number;
  lastComparisonTime: number | null;
  baselineTime: number | null;
}

interface UseFiveMinuteDigitAnalysisParams {
  prices: readonly number[];
  pipSize: number;
  sessionKey: string;
}

interface CurrentSampleRef {
  counts: readonly number[];
  totalTicks: number;
  isValid: boolean;
}

export function useFiveMinuteDigitAnalysis({
  prices,
  pipSize,
  sessionKey,
}: UseFiveMinuteDigitAnalysisParams): FiveMinuteDigitAnalysis {
  const comparisonIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const countdownIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const previousSnapshotRef = useRef<DigitSnapshot | null>(null);
  const baselineCapturedRef = useRef(false);
  const nextComparisonAtRef = useRef<number | null>(null);

  const [analyzerState, setAnalyzerState] = useState<AnalyzerState>('collecting');
  const [digitMovements, setDigitMovements] = useState<DigitMovement[] | null>(null);
  const [lowGroupMovement, setLowGroupMovement] = useState<GroupMovement | null>(null);
  const [highGroupMovement, setHighGroupMovement] = useState<GroupMovement | null>(null);
  const [countdownSeconds, setCountdownSeconds] = useState(0);
  const [lastComparisonTime, setLastComparisonTime] = useState<number | null>(null);
  const [baselineTime, setBaselineTime] = useState<number | null>(null);

  const pricesAreValid =
    prices.length <= DIGIT_WINDOW_SIZE && prices.every((price) => Number.isFinite(price));
  const currentStats = useMemo(
    () => computeDigitStats(prices, pipSize),
    [prices, pipSize]
  );
  const tickCount = currentStats.totalTicks;
  const digitCounts = currentStats.counts;
  const digitPercentages = currentStats.percentages;
  const isFullSample = pricesAreValid && tickCount === DIGIT_WINDOW_SIZE;

  const rankings = useMemo(
    () => isFullSample ? computeRankings(digitCounts, tickCount) : [],
    [digitCounts, isFullSample, tickCount]
  );
  const lowGroup = useMemo(
    () => computeGroupSnapshot(digitCounts, LOW_DIGITS, tickCount),
    [digitCounts, tickCount]
  );
  const highGroup = useMemo(
    () => computeGroupSnapshot(digitCounts, HIGH_DIGITS, tickCount),
    [digitCounts, tickCount]
  );

  const currentSampleRef = useRef<CurrentSampleRef>({
    counts: digitCounts,
    totalTicks: tickCount,
    isValid: isFullSample,
  });
  currentSampleRef.current = {
    counts: digitCounts,
    totalTicks: tickCount,
    isValid: isFullSample,
  };

  const clearTimers = useCallback(() => {
    if (comparisonIntervalRef.current !== null) {
      clearInterval(comparisonIntervalRef.current);
      comparisonIntervalRef.current = null;
    }
    if (countdownIntervalRef.current !== null) {
      clearInterval(countdownIntervalRef.current);
      countdownIntervalRef.current = null;
    }
    nextComparisonAtRef.current = null;
  }, []);

  const resetAnalysis = useCallback(() => {
    clearTimers();
    previousSnapshotRef.current = null;
    baselineCapturedRef.current = false;
    setAnalyzerState('collecting');
    setDigitMovements(null);
    setLowGroupMovement(null);
    setHighGroupMovement(null);
    setCountdownSeconds(0);
    setLastComparisonTime(null);
    setBaselineTime(null);
  }, [clearTimers]);

  const performComparison = useCallback(() => {
    const previousSnapshot = previousSnapshotRef.current;
    const currentSample = currentSampleRef.current;
    if (!previousSnapshot || !currentSample.isValid) {
      resetAnalysis();
      return;
    }

    const comparisonTime = Date.now();
    const currentSnapshot = createSnapshot(
      currentSample.counts,
      currentSample.totalTicks,
      comparisonTime
    );
    const movements = computeDigitMovements(currentSnapshot, previousSnapshot);

    setDigitMovements(movements);
    setLowGroupMovement(
      computeGroupMovement(
        currentSnapshot,
        previousSnapshot,
        LOW_DIGITS,
        'low',
        movements
      )
    );
    setHighGroupMovement(
      computeGroupMovement(
        currentSnapshot,
        previousSnapshot,
        HIGH_DIGITS,
        'high',
        movements
      )
    );
    previousSnapshotRef.current = currentSnapshot;
    nextComparisonAtRef.current = comparisonTime + COMPARISON_INTERVAL_MS;
    setCountdownSeconds(COMPARISON_INTERVAL_MS / 1_000);
    setLastComparisonTime(comparisonTime);
    setAnalyzerState('active');
  }, [resetAnalysis]);

  const startTimers = useCallback((nextComparisonAt: number) => {
    if (comparisonIntervalRef.current !== null) return;
    nextComparisonAtRef.current = nextComparisonAt;
    comparisonIntervalRef.current = setInterval(
      performComparison,
      COMPARISON_INTERVAL_MS
    );
    countdownIntervalRef.current = setInterval(() => {
      const deadline = nextComparisonAtRef.current;
      setCountdownSeconds(
        deadline === null
          ? 0
          : Math.max(0, Math.ceil((deadline - Date.now()) / 1_000))
      );
    }, 1_000);
  }, [performComparison]);

  // A new symbol/history/reconnect session must never reuse the prior baseline.
  useEffect(() => {
    resetAnalysis();
  }, [sessionKey, pipSize, resetAnalysis]);

  useEffect(() => {
    if (!isFullSample) {
      if (baselineCapturedRef.current) resetAnalysis();
      return;
    }
    if (baselineCapturedRef.current) {
      if (comparisonIntervalRef.current === null) {
        const previousTime = previousSnapshotRef.current?.timestamp ?? Date.now();
        startTimers(previousTime + COMPARISON_INTERVAL_MS);
      }
      return;
    }

    const capturedAt = Date.now();
    previousSnapshotRef.current = createSnapshot(
      digitCounts,
      tickCount,
      capturedAt
    );
    baselineCapturedRef.current = true;
    setBaselineTime(capturedAt);
    setAnalyzerState('baseline');
    setCountdownSeconds(COMPARISON_INTERVAL_MS / 1_000);

    clearTimers();
    startTimers(capturedAt + COMPARISON_INTERVAL_MS);
  }, [
    clearTimers,
    digitCounts,
    isFullSample,
    resetAnalysis,
    startTimers,
    tickCount,
  ]);

  useEffect(() => clearTimers, [clearTimers]);

  return {
    analyzerState,
    tickCount,
    digitCounts,
    digitPercentages,
    rankings,
    lowGroup,
    highGroup,
    digitMovements,
    lowGroupMovement,
    highGroupMovement,
    countdownSeconds,
    lastComparisonTime,
    baselineTime,
  };
}
