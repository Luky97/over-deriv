import type { SyncError } from '@/lib/types';

export function createSyncError(params: {
  stage: SyncError['stage'];
  symbol?: string | null;
  message: string;
  code?: string;
  details?: string | null;
  hint?: string | null;
  status?: number | null;
  statusText?: string | null;
  payloadSizeKb?: number | null;
}): SyncError {
  return {
    name: 'SyncError',
    code: params.code ?? 'UNKNOWN',
    message: params.message,
    details: params.details ?? null,
    hint: params.hint ?? null,
    status: params.status ?? null,
    statusText: params.statusText ?? null,
    stage: params.stage,
    symbol: params.symbol ?? null,
    payloadSizeKb: params.payloadSizeKb ?? null,
  };
}

export function isTemporaryError(status: number | null): boolean {
  if (status === null) return false;
  return [502, 503, 504, 522].includes(status);
}

export function userFacingSyncMessage(error: SyncError | null): string {
  if (!error) return 'Synced';
  switch (error.stage) {
    case 'configuration': return 'Local only';
    case 'authentication': return 'Authentication required';
    case 'restore': return 'Restoring...';
    default:
      if (error.status === null || isTemporaryError(error.status)) return 'Cloud temporarily unavailable';
      if (error.code === 'PAYLOAD_TOO_LARGE') return 'Checkpoint needs compaction';
      if (error.code === 'CONFLICT') return 'Conflict detected';
      if (error.code === 'LEASE_CONFLICT') return 'Observer mode';
      return 'Cloud temporarily unavailable';
  }
}
