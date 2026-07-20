import Dexie, { type Table } from 'dexie';
import type {
  ResearchExport,
  ResearchLog,
  ResearchSettings,
  VirtualContractResult,
  VirtualRound,
} from '@/lib/types';
import { createDefaultSettings } from '@/lib/types';
import type { PersistedMarketEngine, ProcessMarketTickOutput } from '@/lib/research/market-engine';
import { isValidPersistedEngine } from '@/lib/research/market-engine';

export interface StoredMarketState {
  market: string;
  savedAt: number;
  payload: PersistedMarketEngine;
}

export interface StoredSetting {
  key: 'global';
  value: ResearchSettings;
  savedAt: number;
}

export function migrateLegacyState(value: unknown): PersistedMarketEngine | null {
  if (isValidPersistedEngine(value)) return value;
  return null;
}

export class ResearchDatabase extends Dexie {
  marketStates!: Table<StoredMarketState, string>;
  rounds!: Table<VirtualRound, string>;
  contractRecords!: Table<VirtualContractResult, string>;
  logs!: Table<ResearchLog, string>;
  settings!: Table<StoredSetting, string>;

  constructor(name = 'AdaptiveResearchDB') {
    super(name);
    // Keep the historical schema declaration so an existing experimental v1 database upgrades safely.
    this.version(1).stores({
      rounds: 'id, market, status, startTime, regime',
      contracts: '++id, tickEpoch, [prediction.target+isWin]',
      modelWeights: '[market+modelId], market, modelId',
      confidenceHistory: '++id, market, target, timestamp',
      regimeHistory: '++id, market, detectedAt',
    });
    this.version(2).stores({
      marketStates: 'market, savedAt',
      rounds: 'id, market, status, executionKind, triggerEpoch',
      contractRecords: 'id, market, roundId, executionKind, resultEpoch, outcome',
      logs: 'id, market, category, epoch',
      settings: 'key, savedAt',
      contracts: null,
      modelWeights: null,
      confidenceHistory: null,
      regimeHistory: null,
    }).upgrade(async (transaction) => {
      const legacyRounds = await transaction.table('rounds').toArray();
      for (const round of legacyRounds) {
        if (!round.status || !round.market) await transaction.table('rounds').delete(round.id);
      }
    });
  }
}

export const db = new ResearchDatabase();

export async function loadSettings(database = db): Promise<ResearchSettings> {
  const stored = await database.settings.get('global');
  return stored ? sanitizeSettings(stored.value) : createDefaultSettings();
}

export async function saveSettings(settings: ResearchSettings, database = db): Promise<void> {
  await database.settings.put({ key: 'global', value: sanitizeSettings(settings), savedAt: Date.now() });
}

export async function loadMarketState(market: string, database = db): Promise<PersistedMarketEngine | undefined> {
  const record = await database.marketStates.get(market);
  const migrated = migrateLegacyState(record?.payload);
  return migrated ?? undefined;
}

export async function persistEngineOutput(
  output: ProcessMarketTickOutput,
  settings: ResearchSettings,
  database = db,
): Promise<void> {
  await database.transaction('rw', database.marketStates, database.rounds, database.contractRecords, database.logs, async () => {
    await database.marketStates.put({
      market: output.persisted.market,
      savedAt: Date.now(),
      payload: output.persisted,
    });
    if (output.contract) await database.contractRecords.put(output.contract);
    if (output.completedRound) await database.rounds.put(output.completedRound);
    const recentLogs = output.persisted.logs.slice(-8);
    if (recentLogs.length) await database.logs.bulkPut(recentLogs);
    const market = output.persisted.market;
    const logs = await database.logs.where('market').equals(market).sortBy('epoch');
    if (logs.length > settings.maximumStoredLogs) {
      await database.logs.bulkDelete(logs.slice(0, logs.length - settings.maximumStoredLogs).map((entry) => entry.id));
    }
    const rounds = await database.rounds.where('market').equals(market).sortBy('triggerEpoch');
    if (rounds.length > settings.maximumStoredRounds) {
      const remove = rounds.slice(0, rounds.length - settings.maximumStoredRounds);
      await database.rounds.bulkDelete(remove.map((round) => round.id));
      await database.contractRecords.where('roundId').anyOf(remove.map((round) => round.id)).delete();
    }
  });
}

export async function exportResearchData(database = db): Promise<ResearchExport> {
  const settings = await loadSettings(database);
  return {
    format: 'adaptive-digit-research',
    schemaVersion: 2,
    exportedAt: new Date().toISOString(),
    settings,
    markets: (await database.marketStates.toArray()).map((record) => record.payload),
    rounds: await database.rounds.toArray(),
    contracts: await database.contractRecords.toArray(),
    logs: await database.logs.toArray(),
  };
}

export function validateResearchExport(value: unknown): value is ResearchExport {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as Partial<ResearchExport>;
  if (candidate.format !== 'adaptive-digit-research' || candidate.schemaVersion !== 2) return false;
  if (!Array.isArray(candidate.markets) || !Array.isArray(candidate.rounds)
    || !Array.isArray(candidate.contracts) || !Array.isArray(candidate.logs) || !candidate.settings) return false;
  return candidate.markets.every(isValidPersistedEngine)
    && candidate.rounds.every((round) => round && typeof round.id === 'string' && typeof round.market === 'string')
    && candidate.contracts.every((contract) => contract && typeof contract.id === 'string' && typeof contract.market === 'string');
}

export async function importResearchData(value: unknown, database = db): Promise<void> {
  if (!validateResearchExport(value)) throw new Error('Backup is invalid or uses an unsupported schema.');
  const settings = sanitizeSettings(value.settings);
  await database.transaction('rw', database.marketStates, database.rounds, database.contractRecords, database.logs, database.settings, async () => {
    await Promise.all([
      database.marketStates.clear(), database.rounds.clear(), database.contractRecords.clear(), database.logs.clear(),
    ]);
    await database.marketStates.bulkPut(value.markets.map((payload) => ({
      market: (payload as PersistedMarketEngine).market,
      savedAt: Date.now(),
      payload: payload as PersistedMarketEngine,
    })));
    await database.rounds.bulkPut(value.rounds.slice(-settings.maximumStoredRounds * settings.enabledMarkets.length));
    await database.contractRecords.bulkPut(value.contracts.slice(-settings.maximumStoredRounds * settings.enabledMarkets.length * 5));
    await database.logs.bulkPut(value.logs.slice(-settings.maximumStoredLogs * settings.enabledMarkets.length));
    await database.settings.put({ key: 'global', value: settings, savedAt: Date.now() });
  });
}

export async function resetMarket(market: string, preserveModels: boolean, database = db): Promise<void> {
  const record = await database.marketStates.get(market);
  await database.transaction('rw', database.marketStates, database.rounds, database.contractRecords, database.logs, async () => {
    await Promise.all([
      database.rounds.where('market').equals(market).delete(),
      database.contractRecords.where('market').equals(market).delete(),
      database.logs.where('market').equals(market).delete(),
    ]);
    if (preserveModels && record?.payload) {
      const payload = structuredClone(record.payload);
      payload.currentRound = null;
      payload.pendingPrediction = null;
      payload.recentRounds = [];
      payload.logs = [];
      payload.schedulerPhase = 'WAITING';
      await database.marketStates.put({ market, savedAt: Date.now(), payload });
    } else {
      await database.marketStates.delete(market);
    }
  });
}

export async function resetAllLearning(database = db): Promise<void> {
  await database.transaction('rw', database.marketStates, database.rounds, database.contractRecords, database.logs, async () => {
    await Promise.all([
      database.marketStates.clear(), database.rounds.clear(), database.contractRecords.clear(), database.logs.clear(),
    ]);
  });
}

export async function clearVirtualRoundHistory(database = db): Promise<void> {
  const states = await database.marketStates.toArray();
  await database.transaction('rw', database.marketStates, database.rounds, database.contractRecords, async () => {
    await Promise.all([database.rounds.clear(), database.contractRecords.clear()]);
    await database.marketStates.bulkPut(states.map((record) => ({
      ...record,
      payload: {
        ...record.payload,
        currentRound: null,
        pendingPrediction: null,
        recentRounds: [],
        schedulerPhase: 'WAITING' as const,
      },
      savedAt: Date.now(),
    })));
  });
}

export function contractsToCsv(contracts: readonly VirtualContractResult[]): string {
  const header = [
    'market', 'round_id', 'execution_kind', 'target', 'probability', 'confidence',
    'frozen_epoch', 'result_epoch', 'actual_digit', 'outcome', 'strategy', 'regime',
  ];
  const escape = (value: string | number) => `"${String(value).replaceAll('"', '""')}"`;
  const rows = contracts.map((contract) => [
    contract.market,
    contract.roundId,
    contract.executionKind,
    contract.prediction.target,
    contract.prediction.probability,
    contract.prediction.systemConfidence,
    contract.prediction.frozenAtEpoch,
    contract.resultEpoch,
    contract.actualDigit,
    contract.outcome,
    contract.prediction.strategyId,
    contract.prediction.regime,
  ].map(escape).join(','));
  return [header.join(','), ...rows].join('\n');
}

export async function exportContractsCsv(database = db): Promise<string> {
  return contractsToCsv(await database.contractRecords.orderBy('resultEpoch').toArray());
}

function sanitizeSettings(value: ResearchSettings): ResearchSettings {
  const defaults = createDefaultSettings();
  return {
    ...defaults,
    ...value,
    enabledMarkets: defaults.enabledMarkets.filter((market) => value.enabledMarkets?.includes(market)),
    triggerDigit: Number.isInteger(value.triggerDigit) ? Math.min(9, Math.max(0, value.triggerDigit)) : 1,
    activeConfidenceThreshold: Math.min(99, Math.max(50, value.activeConfidenceThreshold ?? 80)),
    minimumShadowSamples: Math.min(500, Math.max(50, value.minimumShadowSamples ?? 50)),
    maximumContractsPerRound: 5,
    requiredWins: 4,
    consecutiveLossStop: 3,
    enabledTargets: { ...defaults.enabledTargets, ...value.enabledTargets },
    maximumStoredLogs: Math.min(10_000, Math.max(250, value.maximumStoredLogs ?? 2_000)),
    maximumStoredRounds: Math.min(2_000, Math.max(50, value.maximumStoredRounds ?? 250)),
    maximumContextMemory: Math.min(1_000, Math.max(100, value.maximumContextMemory ?? 300)),
  };
}
