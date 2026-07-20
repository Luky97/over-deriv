import type { MarketResearchView, ResearchSettings } from '@/lib/types';
import type {
  PersistedMarketEngine,
  ProcessMarketTickInput,
  ProcessMarketTickOutput,
} from './market-engine';

export type WorkerRequest =
  | { type: 'INIT_MARKET'; payload: { market: string; settings: ResearchSettings; restored?: PersistedMarketEngine } }
  | { type: 'PROCESS_TICK'; payload: { market: string; input: ProcessMarketTickInput } }
  | { type: 'UPDATE_SETTINGS'; payload: { settings: ResearchSettings } }
  | { type: 'RESET_MARKET'; payload: { market: string } }
  | { type: 'RESET_ALL' };

export type WorkerResponse =
  | { type: 'MARKET_READY'; payload: { market: string; view: MarketResearchView } }
  | { type: 'MARKET_OUTPUT'; payload: ProcessMarketTickOutput }
  | { type: 'MARKET_RESET'; payload: { market: string } }
  | { type: 'ALL_RESET' }
  | { type: 'WORKER_ERROR'; payload: { market?: string; message: string } };
