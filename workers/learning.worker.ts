import { AdaptiveMarketEngine } from '@/lib/research/market-engine';
import type { WorkerRequest, WorkerResponse } from '@/lib/research/worker-protocol';

const context = globalThis as unknown as {
  postMessage: (message: WorkerResponse) => void;
  addEventListener: (type: 'message', listener: (event: MessageEvent<WorkerRequest>) => void) => void;
};
const engines = new Map<string, AdaptiveMarketEngine>();

function respond(message: WorkerResponse): void {
  context.postMessage(message);
}

context.addEventListener('message', (event: MessageEvent<WorkerRequest>) => {
  const message = event.data;
  try {
    if (message.type === 'INIT_MARKET') {
      const engine = new AdaptiveMarketEngine(
        message.payload.market,
        message.payload.settings,
        message.payload.restored,
      );
      engines.set(message.payload.market, engine);
      respond({
        type: 'MARKET_READY',
        payload: { market: message.payload.market, view: engine.view(Boolean(message.payload.restored)) },
      });
      return;
    }
    if (message.type === 'PROCESS_TICK') {
      const engine = engines.get(message.payload.market);
      if (!engine) throw new Error(`Market ${message.payload.market} was not initialized.`);
      respond({ type: 'MARKET_OUTPUT', payload: engine.process(message.payload.input) });
      return;
    }
    if (message.type === 'UPDATE_SETTINGS') {
      for (const engine of engines.values()) engine.updateSettings(message.payload.settings);
      return;
    }
    if (message.type === 'RESET_MARKET') {
      engines.delete(message.payload.market);
      respond({ type: 'MARKET_RESET', payload: { market: message.payload.market } });
      return;
    }
    if (message.type === 'RESET_ALL') {
      engines.clear();
      respond({ type: 'ALL_RESET' });
    }
  } catch (reason) {
    const market = 'payload' in message && message.payload && 'market' in message.payload
      ? String(message.payload.market)
      : undefined;
    respond({
      type: 'WORKER_ERROR',
      payload: { market, message: reason instanceof Error ? reason.message : 'Learning worker failed.' },
    });
  }
});

export {};
