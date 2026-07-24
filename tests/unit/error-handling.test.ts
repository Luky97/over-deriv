import { describe, it, expect } from 'vitest';
import { createSyncError, isTemporaryError, userFacingSyncMessage } from '@/lib/validation/errors';

describe('Error handling', () => {
  it('identifies temporary errors', () => {
    expect(isTemporaryError(502)).toBe(true);
    expect(isTemporaryError(503)).toBe(true);
    expect(isTemporaryError(400)).toBe(false);
    expect(isTemporaryError(401)).toBe(false);
  });

  it('maps to user-friendly messages', () => {
    expect(userFacingSyncMessage(createSyncError({ stage: 'configuration', message: '' }))).toBe('Local only');
    expect(userFacingSyncMessage(createSyncError({ stage: 'authentication', message: '' }))).toBe('Authentication required');
    expect(userFacingSyncMessage(createSyncError({ stage: 'request', message: '', status: 503 }))).toBe('Cloud temporarily unavailable');
    expect(userFacingSyncMessage(null)).toBe('Synced');
  });
});
