import { safeJsonStringify, measureJsonBytes, detectCircular } from '@/lib/utilities/safe-json';
import { MAX_CHECKPOINT_SIZE_BYTES, WARN_CHECKPOINT_SIZE_BYTES } from '@/lib/utilities/constants';

export interface CheckpointResult { ok: boolean; json?: string; bytes?: number; error?: string; }

import { CompactCloudCheckpointSchema } from '@/lib/validation/schemas';

export function encodeCheckpoint(data: Record<string, unknown>): CheckpointResult {
  // Zod validation first
  const schemaResult = CompactCloudCheckpointSchema.safeParse(data);
  if (!schemaResult.success) {
    return { ok: false, error: `Schema validation failed: ${schemaResult.error.message}` };
  }
  const circ = detectCircular(data);
  if (circ) return { ok: false, error: `Circular at ${circ}` };
  const json = safeJsonStringify(data);
  const bytes = new TextEncoder().encode(json).length;
  if (bytes > MAX_CHECKPOINT_SIZE_BYTES) return { ok: false, error: `Checkpoint ${bytes}B exceeds ${MAX_CHECKPOINT_SIZE_BYTES}B limit`, bytes };
  return { ok: true, json, bytes };
}

export function encodeCheckpointBounded(data: Record<string, unknown>): CheckpointResult {
  const result = encodeCheckpoint(data);
  if (result.ok && result.bytes && result.bytes > WARN_CHECKPOINT_SIZE_BYTES) {
    return { ...result, error: `Checkpoint ${result.bytes}B exceeds ${WARN_CHECKPOINT_SIZE_BYTES}B warning` };
  }
  if (!result.ok) {
    // Prune and retry
    const pruned = { ...data, recentContextDigits: (data.recentContextDigits as number[])?.slice(-50) ?? [], modelParameters: {}, transitionState: {}, confidenceState: {}, regimeState: {}, strategyState: {}, formulaState: {}, aggregateMetrics: {}, schedulerState: {}, activeRound: null };
    return encodeCheckpoint(pruned);
  }
  return result;
}

export function computeChecksum(data: Record<string, unknown>): string {
  const json = safeJsonStringify(data);
  let hash = 0;
  for (let i = 0; i < json.length; i++) { hash = ((hash << 5) - hash) + json.charCodeAt(i); hash |= 0; }
  return Math.abs(hash).toString(16).padStart(8, '0');
}
