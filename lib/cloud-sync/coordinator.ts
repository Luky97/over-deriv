import { getSupabaseBrowserClient } from '@/lib/supabase/client';
import { saveCheckpointsBatch, checkHealth } from '@/lib/supabase/repositories';
import { encodeCheckpointBounded, computeChecksum } from '@/lib/cloud-sync/checkpoint-codec';
import { isOnline } from '@/lib/utilities/online-status';
import { getDeviceId } from '@/lib/utilities/device';
import { DEFAULT_CLOUD_SAVE_INTERVAL_MS, MINIMUM_CLOUD_SAVE_INTERVAL_MS, RETRY_BACKOFFS, CIRCUIT_BREAKER_RESET_MS, MAX_CONSECUTIVE_TEMPORARY_FAILURES } from '@/lib/utilities/constants';
import { createSyncError, isTemporaryError } from '@/lib/validation/errors';
import type { CloudSyncStatus, SyncError } from '@/lib/types';
import type { SupabaseClient } from '@supabase/supabase-js';

export type PreparedCheckpoint = { symbol: string; checkpoint: Record<string, unknown>; checksum: string; payloadBytes: number; };
export type SyncEventListener = (status: CloudSyncStatus) => void;

export class CloudSyncCoordinator {
  private dirty = new Map<string, PreparedCheckpoint>();
  private intervalMs = DEFAULT_CLOUD_SAVE_INTERVAL_MS;
  private timer: ReturnType<typeof setInterval> | null = null;
  private active = false;
  private failures = 0;
  private circuitOpen = false;
  private circuitTimer: ReturnType<typeof setTimeout> | null = null;
  private lastSave: number | null = null;
  private onStatus: SyncEventListener | null = null;
  private configured = false;
  private authenticated = false;
  private email: string | null = null;
  private deviceId = '';
  private revisions = new Map<string, number>();
  private checkpointSizes = new Map<string, number>();

  init(onStatus: SyncEventListener): void {
    this.onStatus = onStatus;
    this.deviceId = getDeviceId();
    this.startTimer();
    this.emit();
  }

  destroy(): void {
    this.stopTimer();
    if (this.circuitTimer) clearTimeout(this.circuitTimer);
    this.dirty.clear();
  }

  setConfigured(v: boolean): void { this.configured = v; this.emit(); }
  setAuthenticated(email: string | null): void { this.authenticated = email !== null; this.email = email; this.emit(); }
  setInterval(ms: number): void { this.intervalMs = Math.max(MINIMUM_CLOUD_SAVE_INTERVAL_MS, ms); this.restartTimer(); }

  markDirty(symbol: string, cp: PreparedCheckpoint): void {
    this.dirty.set(symbol, cp);
    this.revisions.set(symbol, (this.revisions.get(symbol) ?? 0) + 1);
    this.checkpointSizes.set(symbol, cp.payloadBytes);
    this.emit();
  }

  getStatus(): CloudSyncStatus {
    return { configured: this.configured, connected: this.authenticated && !this.circuitOpen, signedIn: this.authenticated, email: this.email, deviceId: this.deviceId, lastLocalSave: null, lastCloudSave: this.lastSave, nextScheduledSave: this.timer ? Date.now() + this.intervalMs : null, dirtyMarkets: Array.from(this.dirty.keys()), pendingEvents: 0, checkpointSizes: Object.fromEntries(this.checkpointSizes), revisions: Object.fromEntries(this.revisions), leaseStatus: {}, observerMarkets: [], offline: !isOnline(), circuitOpen: this.circuitOpen, error: null };
  }

  async forceSync(): Promise<{ ok: boolean; errors: string[] }> { return this.sync(); }

  private async sync(): Promise<{ ok: boolean; errors: string[] }> {
    if (!this.configured || !this.authenticated || this.active || this.circuitOpen || !isOnline() || this.dirty.size === 0) return { ok: true, errors: [] };
    this.active = true;
    const errors: string[] = [];
    try {
      const payload = Array.from(this.dirty.values()).map(cp => ({ symbol: cp.symbol, checkpoint: cp.checkpoint, state_checksum: cp.checksum, payload_size_bytes: cp.payloadBytes, device_id: this.deviceId }));
      const results = await saveCheckpointsBatch(payload);
      for (const r of results) { if (r.ok) { this.dirty.delete(r.symbol); if (r.new_revision !== null) this.revisions.set(r.symbol, r.new_revision); this.lastSave = Date.now(); } else errors.push(`${r.symbol}: ${r.error_message}`); }
      this.failures = 0;
      if (this.circuitOpen) this.circuitOpen = false;
    } catch (err) {
      const e = err as { status?: number; message?: string };
      this.failures++;
      if (isTemporaryError(e.status ?? null) && this.failures >= MAX_CONSECUTIVE_TEMPORARY_FAILURES) this.openCircuit();
      errors.push(e.message ?? 'Unknown');
    } finally { this.active = false; this.emit(); }
    return { ok: errors.length === 0, errors };
  }

  private startTimer(): void { if (this.timer) return; this.timer = setInterval(() => this.sync(), this.intervalMs); }
  private stopTimer(): void { if (this.timer) { clearInterval(this.timer); this.timer = null; } }
  private restartTimer(): void { this.stopTimer(); this.startTimer(); }

  private openCircuit(): void {
    this.circuitOpen = true;
    this.circuitTimer = setTimeout(() => { this.circuitOpen = false; this.failures = 0; this.emit(); }, CIRCUIT_BREAKER_RESET_MS);
    this.emit();
  }

  private emit(): void { this.onStatus?.(this.getStatus()); }
}
