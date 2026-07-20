import 'fake-indexeddb/auto';
import Dexie from 'dexie';
import { afterEach, describe, expect, it } from 'vitest';
import { DerivWS } from '../packages/core/src/ws/deriv-ws';
import { ResearchDatabase, loadMarketState, loadSettings, migrateLegacyState, saveSettings } from '../lib/storage/database';
import { makeEngine, testSettings } from './helpers';

const databases: ResearchDatabase[] = [];
afterEach(async () => {
  for (const database of databases.splice(0)) {
    database.close();
    await Dexie.delete(database.name);
  }
});

describe('market-data-only WebSocket safety boundary', () => {
  it('rejects authorization and every trading request before touching a socket', async () => {
    const socket = new DerivWS();
    await expect(socket.send({ authorize: 'token' })).rejects.toThrow('Blocked');
    await expect(socket.send({ proposal: 1 })).rejects.toThrow('Blocked');
    await expect(socket.send({ buy: 'proposal-id', price: 1 })).rejects.toThrow('Blocked');
    await expect(socket.send({ sell: 123, price: 0 })).rejects.toThrow('Blocked');
    await expect(socket.send({ transaction: 1 })).rejects.toThrow('Blocked');
  });

  it('allows only documented public market-data request shapes', async () => {
    const socket = new DerivWS();
    await expect(socket.send({ active_symbols: 'full' })).rejects.toThrow('not connected');
    await expect(socket.send({ balance: 1 })).rejects.toThrow('Only active_symbols');
    await expect(socket.subscribe({ ticks: 'R_10', token: 'forbidden' }, () => undefined)).rejects.toThrow('Unsupported');
  });
});

describe('IndexedDB persistence and migration', () => {
  it('round-trips a separately keyed market model snapshot and settings', async () => {
    const database = new ResearchDatabase(`research-test-${crypto.randomUUID()}`);
    databases.push(database);
    const settings = testSettings({ triggerDigit: 7 });
    await saveSettings(settings, database);
    const snapshot = makeEngine().serialize();
    await database.marketStates.put({ market: snapshot.market, savedAt: Date.now(), payload: snapshot });
    expect((await loadSettings(database)).triggerDigit).toBe(7);
    expect((await loadMarketState('R_10', database))?.ensemble.models.length).toBeGreaterThan(5);
  });

  it('upgrades the legacy version-one database without treating old rows as new evidence', async () => {
    const name = `legacy-test-${crypto.randomUUID()}`;
    const legacy = new Dexie(name);
    legacy.version(1).stores({
      rounds: 'id, market, status, startTime, regime',
      contracts: '++id, tickEpoch, [prediction.target+isWin]',
      modelWeights: '[market+modelId], market, modelId',
      confidenceHistory: '++id, market, target, timestamp',
      regimeHistory: '++id, market, detectedAt',
    });
    await legacy.open();
    await legacy.table('rounds').put({ id: 'legacy', market: 'R_10', status: 'WIN', startTime: 1, regime: 'MIXED' });
    legacy.close();
    const database = new ResearchDatabase(name);
    databases.push(database);
    await database.open();
    expect(database.verno).toBe(2);
    expect(await database.marketStates.count()).toBe(0);
    expect(migrateLegacyState({ market: 'R_10' })).toBeNull();
  });
});
