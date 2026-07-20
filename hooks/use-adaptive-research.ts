'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { MarketResearchView, MarketTickState, ResearchSettings } from '@/lib/types';
import type { WorkerRequest, WorkerResponse } from '@/lib/research/worker-protocol';
import {
  clearVirtualRoundHistory,
  exportContractsCsv,
  exportResearchData,
  importResearchData,
  loadMarketState,
  persistEngineOutput,
  resetAllLearning,
  resetMarket as resetStoredMarket,
} from '@/lib/storage/database';

export interface AdaptiveResearchController {
  markets: Record<string, MarketResearchView>;
  workerError: string | null;
  storageError: string | null;
  exportJson: () => Promise<void>;
  exportCsv: () => Promise<void>;
  importJson: (file: File) => Promise<void>;
  resetMarket: (market: string, preserveModels: boolean) => Promise<void>;
  resetAll: () => Promise<void>;
  clearRoundHistory: () => Promise<void>;
}

function download(name: string, contents: string, type: string): void {
  const blob = new Blob([contents], { type });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = name;
  anchor.click();
  URL.revokeObjectURL(url);
}

export function useAdaptiveResearch(
  tickMarkets: Record<string, MarketTickState>,
  settings: ResearchSettings,
  settingsReady: boolean,
): AdaptiveResearchController {
  const [markets, setMarkets] = useState<Record<string, MarketResearchView>>({});
  const [workerError, setWorkerError] = useState<string | null>(null);
  const [storageError, setStorageError] = useState<string | null>(null);
  const worker = useRef<Worker | null>(null);
  const initialized = useRef(new Set<string>());
  const initializing = useRef(new Set<string>());
  const lastSentTick = useRef(new Map<string, string>());
  const latestTickMarkets = useRef(tickMarkets);
  const settingsRef = useRef(settings);
  latestTickMarkets.current = tickMarkets;
  settingsRef.current = settings;

  const send = useCallback((message: WorkerRequest) => worker.current?.postMessage(message), []);

  useEffect(() => {
    const instance = new Worker(new URL('../workers/learning.worker.ts', import.meta.url), { type: 'module' });
    worker.current = instance;
    instance.onmessage = (event: MessageEvent<WorkerResponse>) => {
      const message = event.data;
      if (message.type === 'MARKET_READY') {
        initialized.current.add(message.payload.market);
        initializing.current.delete(message.payload.market);
        setMarkets((current) => ({ ...current, [message.payload.market]: message.payload.view }));
        const live = latestTickMarkets.current[message.payload.market];
        if (live?.currentTick) {
          const current = live.ticks[live.ticks.length - 1];
          if (current && lastSentTick.current.get(message.payload.market) !== current.key) {
            lastSentTick.current.set(message.payload.market, current.key);
            send({
              type: 'PROCESS_TICK',
              payload: {
                market: message.payload.market,
                input: {
                  tick: current,
                  ticks: live.ticks,
                  sessionKey: live.sessionKey,
                  continuityGap: live.continuity.status === 'GAP',
                  gapReason: live.continuity.lastGapReason,
                },
              },
            });
          }
        }
        return;
      }
      if (message.type === 'MARKET_OUTPUT') {
        const output = message.payload;
        setMarkets((current) => ({ ...current, [output.view.market]: output.view }));
        void persistEngineOutput(output, settingsRef.current).catch((reason: unknown) => {
          const error = reason instanceof Error ? reason.message : 'Research state could not be persisted.';
          setStorageError(error);
          setMarkets((current) => current[output.view.market] ? {
            ...current,
            [output.view.market]: { ...current[output.view.market], persistenceError: error },
          } : current);
        });
        return;
      }
      if (message.type === 'WORKER_ERROR') setWorkerError(message.payload.message);
      if (message.type === 'MARKET_RESET') {
        initialized.current.delete(message.payload.market);
        initializing.current.delete(message.payload.market);
        lastSentTick.current.delete(message.payload.market);
      }
      if (message.type === 'ALL_RESET') {
        initialized.current.clear();
        initializing.current.clear();
        lastSentTick.current.clear();
        setMarkets({});
      }
    };
    instance.onerror = (event) => setWorkerError(event.message || 'Learning worker crashed.');
    return () => {
      instance.terminate();
      worker.current = null;
    };
  }, [send]);

  useEffect(() => {
    if (!settingsReady || !worker.current) return;
    send({ type: 'UPDATE_SETTINGS', payload: { settings } });
    for (const market of Object.keys(tickMarkets)) {
      if (initialized.current.has(market) || initializing.current.has(market)) continue;
      initializing.current.add(market);
      void loadMarketState(market)
        .then((restored) => send({ type: 'INIT_MARKET', payload: { market, settings, restored } }))
        .catch((reason: unknown) => {
          initializing.current.delete(market);
          setStorageError(reason instanceof Error ? reason.message : `Could not restore ${market}.`);
          send({ type: 'INIT_MARKET', payload: { market, settings } });
        });
    }
    setMarkets((current) => Object.fromEntries(Object.entries(current).filter(([market]) => market in tickMarkets)));
  }, [send, settings, settingsReady, tickMarkets]);

  useEffect(() => {
    if (!settingsReady) return;
    for (const [market, state] of Object.entries(tickMarkets)) {
      if (!initialized.current.has(market) || !state.currentTick) continue;
      const tick = state.ticks[state.ticks.length - 1];
      if (!tick || lastSentTick.current.get(market) === tick.key) continue;
      lastSentTick.current.set(market, tick.key);
      send({
        type: 'PROCESS_TICK',
        payload: {
          market,
          input: {
            tick,
            ticks: state.ticks,
            sessionKey: state.sessionKey,
            continuityGap: state.continuity.status === 'GAP',
            gapReason: state.continuity.lastGapReason,
          },
        },
      });
    }
  }, [send, settingsReady, tickMarkets]);

  const exportJson = useCallback(async () => {
    const data = await exportResearchData();
    download(`adaptive-research-${new Date().toISOString().slice(0, 10)}.json`, JSON.stringify(data, null, 2), 'application/json');
  }, []);
  const exportCsv = useCallback(async () => {
    download(`virtual-contracts-${new Date().toISOString().slice(0, 10)}.csv`, await exportContractsCsv(), 'text/csv');
  }, []);
  const importJson = useCallback(async (file: File) => {
    const parsed = JSON.parse(await file.text()) as unknown;
    await importResearchData(parsed);
    window.location.reload();
  }, []);
  const resetMarket = useCallback(async (market: string, preserveModels: boolean) => {
    await resetStoredMarket(market, preserveModels);
    send({ type: 'RESET_MARKET', payload: { market } });
    setMarkets((current) => Object.fromEntries(Object.entries(current).filter(([key]) => key !== market)));
  }, [send]);
  const resetAll = useCallback(async () => {
    await resetAllLearning();
    send({ type: 'RESET_ALL' });
  }, [send]);
  const clearRoundHistory = useCallback(async () => {
    await clearVirtualRoundHistory();
    window.location.reload();
  }, []);

  return {
    markets,
    workerError,
    storageError,
    exportJson,
    exportCsv,
    importJson,
    resetMarket,
    resetAll,
    clearRoundHistory,
  };
}
