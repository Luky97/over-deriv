import { getSupabaseBrowserClient } from '@/lib/supabase/client';
import type { SupabaseClient } from '@supabase/supabase-js';

let client: SupabaseClient | null = null;

function getClient(): SupabaseClient {
  if (!client) client = getSupabaseBrowserClient();
  return client;
}

export interface CheckpointSaveResult {
  symbol: string; ok: boolean; new_revision: number | null;
  error_code: string | null; error_message: string | null;
}

export interface CloudCheckpointRow {
  symbol: string; state_version: number; revision: number;
  checkpoint: Record<string, unknown>; state_checksum: string; payload_size_bytes: number;
}

export async function checkHealth(): Promise<boolean> {
  try {
    const { data, error } = await getClient().rpc('app_health');
    if (error) return false;
    const r = data as { ok?: boolean } | null;
    return r?.ok === true;
  } catch { return false; }
}

export async function loadUserSettings(userId: string): Promise<Record<string, unknown> | null> {
  const { data, error } = await getClient().from('user_settings').select('settings').eq('user_id', userId).maybeSingle();
  if (error) throw error;
  return (data?.settings as Record<string, unknown>) ?? null;
}

export async function saveUserSettings(userId: string, settings: Record<string, unknown>): Promise<void> {
  const { error } = await getClient().from('user_settings').upsert(
    { user_id: userId, settings, updated_at: new Date().toISOString() },
    { onConflict: 'user_id' },
  );
  if (error) throw error;
}

export async function saveCheckpointsBatch(checkpoints: unknown[]): Promise<CheckpointSaveResult[]> {
  const { data, error } = await getClient().rpc('save_market_checkpoints_batch', { checkpoints });
  if (error) throw error;
  return (data ?? []) as CheckpointSaveResult[];
}

export async function loadUserCheckpoints(userId: string): Promise<CloudCheckpointRow[]> {
  const { data, error } = await getClient().from('market_checkpoints').select('*').eq('user_id', userId);
  if (error) throw error;
  return (data ?? []) as CloudCheckpointRow[];
}

export interface LeaseResult { ok: boolean; message: string; expires_at: string | null; }

export async function saveVirtualRoundsBatch(rounds: unknown[]): Promise<void> {
  const { error } = await getClient().rpc('insert_virtual_rounds_batch', { rounds });
  if (error) throw error;
}

export async function saveVirtualContractsBatch(contracts: unknown[]): Promise<void> {
  const { error } = await getClient().rpc('insert_virtual_contracts_batch', { contracts });
  if (error) throw error;
}

export async function saveResearchEventsBatch(events: unknown[]): Promise<void> {
  const { error } = await getClient().rpc('insert_research_events_batch', { events });
  if (error) throw error;
}

export async function acquireLease(symbol: string, deviceId: string): Promise<LeaseResult> {
  const { data, error } = await getClient().rpc('acquire_market_lease', { p_symbol: symbol, p_device_id: deviceId });
  if (error) return { ok: false, message: error.message, expires_at: null };
  return (data ?? { ok: false, message: 'Unknown', expires_at: null }) as LeaseResult;
}

export async function renewLease(symbol: string, deviceId: string): Promise<LeaseResult> {
  const { data, error } = await getClient().rpc('renew_market_lease', { p_symbol: symbol, p_device_id: deviceId });
  if (error) return { ok: false, message: error.message, expires_at: null };
  return (data ?? { ok: false, message: 'Unknown', expires_at: null }) as LeaseResult;
}
