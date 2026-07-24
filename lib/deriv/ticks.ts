import type { MarketTick } from '@/lib/types';
import { ROLLING_TICK_LIMIT } from '@/lib/utilities/constants';

export interface AppendTickResult {
  ticks: MarketTick[];
  duplicate: boolean;
  gap: boolean;
  gapReason: string | null;
}

export function tickKey(epoch: number, quote: number, pipSize: number): string {
  return `${epoch}:${quote.toFixed(Math.min(20, Math.max(0, pipSize)))}`;
}

export function createMarketTick(epoch: number, quote: number, pipSize: number, source: MarketTick['source']): MarketTick {
  if (!Number.isFinite(epoch) || !Number.isFinite(quote)) throw new Error('Invalid tick');
  const safeEpoch = Math.trunc(epoch);
  const factor = Math.pow(10, pipSize);
  const scaled = Math.round(quote * factor);
  const digit = Math.abs(scaled % 10);
  return { epoch: safeEpoch, quote, digit, pipSize, key: tickKey(safeEpoch, quote, pipSize), source };
}

export function pipSizeFromPip(pipValue: number): number {
  return Math.max(0, Math.round(-Math.log10(pipValue)));
}

export function normalizeHistory(prices: readonly number[], times: readonly number[], pipValue: number): MarketTick[] {
  const pipSize = pipSizeFromPip(pipValue);
  const length = Math.min(prices.length, times.length);
  const deduplicated = new Map<string, MarketTick>();
  const start = Math.max(0, length - ROLLING_TICK_LIMIT - 50);
  for (let i = start; i < length; i++) {
    const q = prices[i], t = times[i];
    if (!Number.isFinite(q) || !Number.isFinite(t)) continue;
    const tick = createMarketTick(t, q, pipSize, 'history');
    deduplicated.set(tick.key, tick);
  }
  return [...deduplicated.values()].sort((a, b) => a.epoch - b.epoch).slice(-ROLLING_TICK_LIMIT);
}

export function appendRollingTick(current: readonly MarketTick[], incoming: MarketTick, limit = ROLLING_TICK_LIMIT): AppendTickResult {
  const recentKeys = new Set(current.slice(-limit).map((t) => t.key));
  if (recentKeys.has(incoming.key)) return { ticks: [...current], duplicate: true, gap: false, gapReason: null };
  const last = current.at(-1);
  let gap = false, gapReason: string | null = null;
  if (last) {
    const delta = incoming.epoch - last.epoch;
    if (delta <= 0) {
      gap = true;
      gapReason = `Non-monotonic epoch (${incoming.epoch} after ${last.epoch})`;
    } else if (delta > 10) {
      gap = true;
      gapReason = `Tick gap of ${delta}s`;
    }
  }
  return { ticks: [...current, incoming].sort((a, b) => a.epoch - b.epoch).slice(-limit), duplicate: false, gap, gapReason };
}

export function isSupportedSymbol(symbol: string): boolean {
  return ['R_10', 'R_25', 'R_50', 'R_75', 'R_100'].includes(symbol);
}
