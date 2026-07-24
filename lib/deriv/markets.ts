import { DerivClient } from '@/lib/deriv/client';
import { createMarketTick, normalizeHistory, appendRollingTick, isSupportedSymbol } from '@/lib/deriv/ticks';
import type { MarketTick, MarketContinuity, ConnectionState } from '@/lib/types';

export type TickUpdateCallback = (symbol: string, ticks: MarketTick[], continuity: MarketContinuity) => void;
export type ConnectionCallback = (symbol: string, state: ConnectionState) => void;

export class MarketDataManager {
  private client: DerivClient | null = null;
  private onUpdate: TickUpdateCallback | null = null;
  private onConnection: ConnectionCallback | null = null;
  private ticks = new Map<string, MarketTick[]>();
  private continuity = new Map<string, MarketContinuity>();
  private pipSizes = new Map<string, number>();
  private symbols = new Map<string, string>();

  initialize(onUpdate: TickUpdateCallback, onConnection: ConnectionCallback): void {
    this.onUpdate = onUpdate;
    this.onConnection = onConnection;
    this.client = new DerivClient(
      (data) => this.handleMessage(data),
      (connected) => {
        if (!connected) {
          for (const symbol of this.ticks.keys()) {
            this.onConnection?.(symbol, 'reconnecting');
          }
        }
      },
    );
    this.client.connect();
  }

  destroy(): void {
    this.client?.destroy();
    this.client = null;
    this.ticks.clear();
    this.continuity.clear();
  }

  private handleMessage(data: unknown): void {
    const msg = data as Record<string, unknown>;
    if (msg?.msg_type === 'active_symbols') {
      this.handleActiveSymbols(msg.active_symbols as Record<string, unknown>[]);
      return;
    }
    if (msg?.msg_type === 'history') {
      this.handleHistory(msg);
      return;
    }
    if (msg?.msg_type === 'tick') {
      this.handleTick(msg.tick as Record<string, unknown>);
      return;
    }
    if (Array.isArray(msg?.tick)) {
      for (const t of msg.tick as Record<string, unknown>[]) this.handleTick(t);
    }
  }

  private handleActiveSymbols(symbols: Record<string, unknown>[]): void {
    if (!Array.isArray(symbols)) return;
    for (const sym of symbols) {
      const id = sym?.underlying_symbol as string;
      const name = sym?.underlying_symbol_name as string || id;
      if (isSupportedSymbol(id)) {
        this.symbols.set(id, name);
      }
    }
    for (const symbol of this.symbols.keys()) {
      if (!this.ticks.has(symbol)) {
        this.ticks.set(symbol, []);
        this.continuity.set(symbol, { status: 'SYNCED', duplicateCount: 0, lastGapEpoch: null, lastGapReason: null, resyncedAtEpoch: null });
        this.pipSizes.set(symbol, 5);
        this.onConnection?.(symbol, 'connecting');
        this.client?.tickHistory(symbol);
      }
    }
  }

  private handleHistory(msg: Record<string, unknown>): void {
    const history = msg?.history as Record<string, unknown> | undefined;
    if (!history) return;
    const echoReq = (msg?.echo_req ?? {}) as Record<string, unknown>;
    const symbol = echoReq?.ticks_history as string | undefined;
    if (!symbol || !isSupportedSymbol(symbol)) return;
    const prices = history.prices as number[] | undefined;
    const times = history.times as number[] | undefined;
    if (!prices || !times) return;
    const pipSize = (history.pip_size as number) ?? 5;
    const ticks = normalizeHistory(prices, times, pipSize);
    this.ticks.set(symbol, ticks);
    this.pipSizes.set(symbol, pipSize);
    this.continuity.set(symbol, { status: 'SYNCED', duplicateCount: 0, lastGapEpoch: null, lastGapReason: null, resyncedAtEpoch: ticks.length > 0 ? ticks[ticks.length - 1].epoch : null });
    this.onConnection?.(symbol, 'connected');
    this.onUpdate?.(symbol, ticks, this.continuity.get(symbol)!);
    this.client?.subscribeTicks(symbol);
  }

  private handleTick(tick: Record<string, unknown>): void {
    const symbol = tick?.symbol as string;
    const epoch = tick?.epoch as number;
    const quote = tick?.quote as number;
    if (!symbol || !isSupportedSymbol(symbol) || !Number.isFinite(epoch) || !Number.isFinite(quote)) return;
    const current = this.ticks.get(symbol);
    const pipSize = this.pipSizes.get(symbol) ?? 5;
    if (!current) return;
    const incoming = createMarketTick(epoch, quote, pipSize, 'live');
    const result = appendRollingTick(current, incoming);
    if (result.duplicate) return;
    this.ticks.set(symbol, result.ticks);
    const cont = this.continuity.get(symbol)!;
    if (result.gap) {
      cont.status = 'GAP';
      cont.lastGapEpoch = incoming.epoch;
      cont.lastGapReason = result.gapReason;
    } else {
      cont.status = 'SYNCED';
    }
    this.onUpdate?.(symbol, result.ticks, cont);
  }
}
