import Dexie, { type Table } from 'dexie';

export interface EngineStateRecord { market: string; state: string; updatedAt: number; }
export interface AppSettingsRecord { key: string; value: string; updatedAt: number; }
export interface ResearchEventRecord { id: string; market: string; category: string; epoch: number; message: string; createdAt: number; }
export interface PendingCloudOperationRecord { id: string; type: string; data: string; createdAt: number; }

class ResearchDB extends Dexie {
  engineStates!: Table<EngineStateRecord, string>;
  appSettings!: Table<AppSettingsRecord, string>;
  researchEvents!: Table<ResearchEventRecord, string>;
  pendingCloudOps!: Table<PendingCloudOperationRecord, string>;

  constructor() {
    super('AdaptiveDigitResearch');
    this.version(1).stores({
      engineStates: 'market, updatedAt',
      appSettings: 'key',
      researchEvents: 'id, market, category, epoch, createdAt',
      pendingCloudOps: 'id, type, createdAt',
    });
  }
}

let db: ResearchDB | null = null;
export function getDB(): ResearchDB { if (!db) db = new ResearchDB(); return db; }

export async function saveEngineState(market: string, state: string): Promise<void> {
  await getDB().engineStates.put({ market, state, updatedAt: Date.now() });
}

export async function loadEngineState(market: string): Promise<string | undefined> {
  const r = await getDB().engineStates.get(market);
  return r?.state;
}

export async function saveAppSetting(key: string, value: string): Promise<void> {
  await getDB().appSettings.put({ key, value, updatedAt: Date.now() });
}

export async function getAppSetting(key: string): Promise<string | undefined> {
  const r = await getDB().appSettings.get(key);
  return r?.value;
}

export async function saveResearchEvent(e: ResearchEventRecord): Promise<void> {
  await getDB().researchEvents.put(e);
}

export async function getPendingCloudOperations(): Promise<PendingCloudOperationRecord[]> {
  return getDB().pendingCloudOps.toArray();
}

export async function savePendingCloudOp(op: PendingCloudOperationRecord): Promise<void> {
  await getDB().pendingCloudOps.put(op);
}

export async function removePendingCloudOp(id: string): Promise<void> {
  await getDB().pendingCloudOps.delete(id);
}

export async function clearAllData(): Promise<void> {
  const d = getDB();
  await d.transaction('rw', d.engineStates, d.appSettings, d.researchEvents, d.pendingCloudOps, async () => {
    await d.engineStates.clear();
    await d.appSettings.clear();
    await d.researchEvents.clear();
    await d.pendingCloudOps.clear();
  });
}
