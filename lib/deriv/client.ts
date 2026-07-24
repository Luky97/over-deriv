import { DERIV_WS_URL } from '@/lib/utilities/constants';

export type WsMessageHandler = (data: unknown) => void;
export type WsStatusHandler = (connected: boolean) => void;

export class DerivClient {
  private ws: WebSocket | null = null;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private pendingSubs = new Set<string>();
  private activeSubs = new Set<string>();
  private destroyed = false;
  private attempt = 0;

  constructor(
    private onMessage: WsMessageHandler,
    private onStatus: WsStatusHandler,
  ) {}

  connect(): void {
    if (this.destroyed) return;
    this.disconnect();
    try {
      this.ws = new WebSocket(DERIV_WS_URL);
      this.ws.onopen = () => {
        this.attempt = 0;
        this.onStatus(true);
        for (const s of this.pendingSubs) this.subscribeTick(s);
      };
      this.ws.onclose = () => { this.onStatus(false); this.scheduleReconnect(); };
      this.ws.onerror = () => { if (this.ws?.readyState !== WebSocket.OPEN) this.scheduleReconnect(); };
      this.ws.onmessage = (e) => {
        try { this.onMessage(JSON.parse(e.data)); } catch { /* ignore */ }
      };
    } catch { this.scheduleReconnect(); }
  }

  disconnect(): void {
    if (this.reconnectTimer) { clearTimeout(this.reconnectTimer); this.reconnectTimer = null; }
    if (this.ws) {
      this.ws.onopen = null; this.ws.onclose = null; this.ws.onerror = null; this.ws.onmessage = null;
      if (this.ws.readyState === WebSocket.OPEN || this.ws.readyState === WebSocket.CONNECTING) this.ws.close();
      this.ws = null;
    }
    this.activeSubs.clear();
  }

  destroy(): void { this.destroyed = true; this.disconnect(); }

  tickHistory(symbol: string, count = 1000): void {
    this.send({ ticks_history: symbol, adjust_start_time: 1, count, end: 'latest', start: 1, style: 'ticks' });
  }

  subscribeTicks(symbol: string): void {
    this.pendingSubs.add(symbol);
    this.subscribeTick(symbol);
  }

  unsubscribeTicks(symbol: string): void {
    this.pendingSubs.delete(symbol);
    this.activeSubs.delete(symbol);
    this.send({ forget: symbol });
  }

  private subscribeTick(symbol: string): void {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.send({ ticks: symbol, subscribe: 1 });
      this.activeSubs.add(symbol);
    }
  }

  private send(data: Record<string, unknown>): void {
    if (this.ws?.readyState === WebSocket.OPEN) this.ws.send(JSON.stringify(data));
  }

  private scheduleReconnect(): void {
    if (this.destroyed) return;
    const delay = Math.min(1000 * Math.pow(1.5, this.attempt), 30_000) + Math.random() * 1000;
    this.attempt++;
    this.reconnectTimer = setTimeout(() => this.connect(), delay);
  }
}
