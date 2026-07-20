import type { ActiveSymbol, MarketTick } from '@/lib/types';
import { SUPPORTED_MARKET_IDS } from '@/lib/types';
import { DIGIT_WINDOW_SIZE, getLastDigit, pipSizeFromPip } from '@/lib/digit-stats';

export interface AppendTickResult {
  ticks: MarketTick[];
  duplicate: boolean;
  gap: boolean;
  gapReason: string | null;
}

export function tickKey(epoch: number, quote: number, pipSize: number): string {
  return `${epoch}:${quote.toFixed(Math.min(20, Math.max(0, pipSize)))}`;
}

export function isSupportedMarket(symbol: ActiveSymbol): boolean {
  const id = symbol.underlying_symbol;
  const names = [
    symbol.underlying_symbol_name,
    symbol.market_display_name,
    symbol.submarket_display_name,
    symbol.subgroup_display_name,
  ].filter(Boolean).join(' ');
  return SUPPORTED_MARKET_IDS.includes(id as (typeof SUPPORTED_MARKET_IDS)[number])
    && !id.startsWith('1HZ')
    && !/\(\s*1s\s*\)/i.test(names)
    && !/boom|crash|jump|step/i.test(names);
}

export function filterSupportedMarkets(symbols: readonly ActiveSymbol[]): ActiveSymbol[] {
  const byId = new Map(symbols.filter(isSupportedMarket).map((symbol) => [symbol.underlying_symbol, symbol]));
  return SUPPORTED_MARKET_IDS.flatMap((id) => {
    const symbol = byId.get(id);
    return symbol ? [symbol] : [];
  });
}

export function normalizePrecision(candidate: number | undefined, fallback: number): number {
  if (Number.isInteger(candidate) && (candidate as number) >= 0 && (candidate as number) <= 20) {
    return candidate as number;
  }
  return fallback;
}

export function createMarketTick(
  epoch: number,
  quote: number,
  pipSize: number,
  source: MarketTick['source'],
): MarketTick {
  if (!Number.isFinite(epoch) || !Number.isFinite(quote)) throw new Error('Invalid tick epoch or quote.');
  const safeEpoch = Math.trunc(epoch);
  return {
    epoch: safeEpoch,
    quote,
    digit: getLastDigit(quote, pipSize),
    pipSize,
    key: tickKey(safeEpoch, quote, pipSize),
    source,
  };
}

export function normalizeHistory(
  prices: readonly number[],
  times: readonly number[],
  pipValue: number,
): MarketTick[] {
  const pipSize = pipSizeFromPip(pipValue);
  const length = Math.min(prices.length, times.length);
  const deduplicated = new Map<string, MarketTick>();
  for (let index = Math.max(0, length - DIGIT_WINDOW_SIZE - 50); index < length; index += 1) {
    const quote = prices[index];
    const epoch = times[index];
    if (!Number.isFinite(quote) || !Number.isFinite(epoch)) continue;
    const tick = createMarketTick(epoch, quote, pipSize, 'history');
    deduplicated.set(tick.key, tick);
  }
  return [...deduplicated.values()]
    .sort((a, b) => a.epoch - b.epoch)
    .slice(-DIGIT_WINDOW_SIZE);
}

function medianRecentInterval(ticks: readonly MarketTick[]): number {
  const intervals: number[] = [];
  const start = Math.max(1, ticks.length - 30);
  for (let index = start; index < ticks.length; index += 1) {
    const delta = ticks[index].epoch - ticks[index - 1].epoch;
    if (delta > 0 && delta < 60) intervals.push(delta);
  }
  if (intervals.length === 0) return 2;
  intervals.sort((a, b) => a - b);
  return intervals[Math.floor(intervals.length / 2)];
}

export function appendRollingTick(
  current: readonly MarketTick[],
  incoming: MarketTick,
  limit = DIGIT_WINDOW_SIZE,
): AppendTickResult {
  const recentKeys = new Set(current.slice(-limit).map((tick) => tick.key));
  if (recentKeys.has(incoming.key)) {
    return { ticks: [...current], duplicate: true, gap: false, gapReason: null };
  }
  const last = current.at(-1);
  let gap = false;
  let gapReason: string | null = null;
  if (last) {
    const delta = incoming.epoch - last.epoch;
    const expected = medianRecentInterval(current);
    if (delta <= 0) {
      gap = true;
      gapReason = `Non-monotonic tick epoch (${incoming.epoch} after ${last.epoch}).`;
    } else if (delta > Math.max(10, expected * 4)) {
      gap = true;
      gapReason = `Tick gap of ${delta}s exceeded the ${Math.max(10, expected * 4)}s continuity limit.`;
    }
  }
  return {
    ticks: [...current, incoming].sort((a, b) => a.epoch - b.epoch).slice(-limit),
    duplicate: false,
    gap,
    gapReason,
  };
}
