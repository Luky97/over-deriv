import Dexie, { type Table } from 'dexie';
import type { 
  VirtualRound, 
  VirtualContractResult,
  ModelMetrics,
  RegimeLabel
} from '../ml-types';

export interface StoredModelWeight {
  market: string;
  modelId: string;
  weight: number;
  lastUpdated: number;
}

export interface StoredConfidence {
  market: string;
  target: string;
  confidence: number;
  sampleSize: number;
  timestamp: number;
}

export interface StoredRegime {
  market: string;
  regime: RegimeLabel;
  detectedAt: number;
}

export class ResearchDatabase extends Dexie {
  rounds!: Table<VirtualRound, string>;
  contracts!: Table<VirtualContractResult, number>;
  modelWeights!: Table<StoredModelWeight, string>; // compound key [market+modelId]
  confidenceHistory!: Table<StoredConfidence, number>; // auto-increment
  regimeHistory!: Table<StoredRegime, number>; // auto-increment

  constructor() {
    super('AdaptiveResearchDB');
    
    this.version(1).stores({
      rounds: 'id, market, status, startTime, regime',
      contracts: '++id, tickEpoch, [prediction.target+isWin]',
      modelWeights: '[market+modelId], market, modelId',
      confidenceHistory: '++id, market, target, timestamp',
      regimeHistory: '++id, market, detectedAt'
    });
  }
}

export const db = new ResearchDatabase();
