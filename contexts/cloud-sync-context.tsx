'use client';

import React, { createContext, useContext, useEffect, useRef, useState, useCallback } from 'react';
import { CloudSyncCoordinator, type PreparedCheckpoint } from '@/lib/cloud-sync/coordinator';
import type { CloudSyncStatus } from '@/lib/types';
import { useAuth } from '@/contexts/auth-context';
import { isSupabaseConfigured } from '@/lib/supabase/client';

interface CloudSyncValue { status: CloudSyncStatus; markDirty: (s: string, cp: PreparedCheckpoint) => void; forceSync: () => Promise<{ ok: boolean; errors: string[] }>; }

const defaultStatus: CloudSyncStatus = { configured: false, connected: false, signedIn: false, email: null, deviceId: '', lastLocalSave: null, lastCloudSave: null, nextScheduledSave: null, dirtyMarkets: [], pendingEvents: 0, checkpointSizes: {}, revisions: {}, leaseStatus: {}, observerMarkets: [], offline: false, circuitOpen: false, error: null };

const CloudSyncCtx = createContext<CloudSyncValue>({ status: defaultStatus, markDirty: () => {}, forceSync: async () => ({ ok: true, errors: [] }) });

export function CloudSyncProvider({ children }: { children: React.ReactNode }) {
  const [status, setStatus] = useState<CloudSyncStatus>(defaultStatus);
  const coord = useRef<CloudSyncCoordinator | null>(null);
  const { user } = useAuth();

  useEffect(() => {
    const c = new CloudSyncCoordinator();
    coord.current = c;
    c.init((s) => setStatus(s));
    c.setConfigured(isSupabaseConfigured());
    c.setAuthenticated(user?.email ?? null);
    return () => c.destroy();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => { coord.current?.setConfigured(isSupabaseConfigured()); coord.current?.setAuthenticated(user?.email ?? null); }, [user]);

  const markDirty = useCallback((symbol: string, cp: PreparedCheckpoint) => coord.current?.markDirty(symbol, cp), []);
  const forceSync = useCallback(async () => coord.current?.forceSync() ?? { ok: false, errors: ['Not initialized'] }, []);

  return React.createElement(CloudSyncCtx.Provider, { value: { status, markDirty, forceSync } }, children);
}

export function useCloudSync(): CloudSyncValue { return useContext(CloudSyncCtx); }
