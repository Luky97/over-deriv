import type { ActiveSymbol, MarketTick, ResearchSettings, SupportedMarketId } from '../lib/types';
import { createDefaultSettings } from '../lib/types';
import { appendRollingTick, createMarketTick } from '../lib/deriv/market-data';
import { AdaptiveMarketEngine } from '../lib/research/market-engine';

export function makeSymbol(id: string, name: string): ActiveSymbol {
  return {
    exchange_is_open: 1,
    is_trading_suspended: 0,
    market: 'synthetic_index',
    market_display_name: 'Derived',
    pip_size: 0.01,
    subgroup: 'synthetics',
    subgroup_display_name: 'Synthetic indices',
    submarket: 'random_index',
    submarket_display_name: name,
    trade_count: 0,
    underlying_symbol: id,
    underlying_symbol_name: name,
    underlying_symbol_type: 'synthetic_index',
  };
}

export function makeTick(epoch: number, digit: number, source: MarketTick['source'] = 'history'): MarketTick {
  return createMarketTick(epoch, 100 + digit / 100, 2, source);
}

export function makeHistory(count = 1000, offset = 0): MarketTick[] {
  return Array.from({ length: count }, (_, index) => makeTick(1_000 + index * 2, (index + offset) % 10));
}

export function appendDigit(ticks: MarketTick[], digit: number, epochDelta = 2): MarketTick[] {
  const epoch = (ticks[ticks.length - 1]?.epoch ?? 998) + epochDelta;
  return appendRollingTick(ticks, makeTick(epoch, digit, 'live')).ticks;
}

export function testSettings(overrides: Partial<ResearchSettings> = {}): ResearchSettings {
  return { ...createDefaultSettings(), ...overrides };
}

export function makeEngine(market: SupportedMarketId = 'R_10', settings = testSettings()): AdaptiveMarketEngine {
  const seed = new AdaptiveMarketEngine(market, settings).serialize();
  seed.historicalBootstrapComplete = true;
  return new AdaptiveMarketEngine(market, settings, seed);
}

export function losingDigit(target: string): number {
  if (target === 'EVEN') return 1;
  if (target === 'ODD') return 2;
  if (target === 'OVER_3') return 0;
  return 9;
}

export function winningDigit(target: string): number {
  if (target === 'EVEN') return 2;
  if (target === 'ODD') return 1;
  if (target === 'OVER_3') return 8;
  return 2;
}
