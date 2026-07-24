'use client';
import type { CloudSyncStatus } from '@/lib/types';

export function CloudSyncIndicator({ status, onSyncNow }: { status: CloudSyncStatus; onSyncNow: () => Promise<{ ok: boolean; errors: string[] }> }) {
  const getLabel = () => {
    if (!status.configured || !status.signedIn) return 'Local only';
    if (status.offline) return 'Offline changes pending';
    if (status.circuitOpen) return 'Cloud unavailable';
    if (status.dirtyMarkets.length > 0) return 'Syncing...';
    if (status.lastCloudSave) return 'Synced';
    return 'Connecting';
  };
  const getColor = () => {
    if (!status.configured || !status.signedIn) return '#718398';
    if (status.offline || status.circuitOpen) return '#fbbf24';
    if (status.dirtyMarkets.length > 0) return '#4d8dff';
    if (status.lastCloudSave) return '#34d399';
    return '#718398';
  };
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '.5rem' }}>
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: '.4rem', border: '1px solid rgba(148,180,212,.13)', borderRadius: '999px', padding: '.4rem .65rem', color: '#b7c6d8', fontSize: '.72rem' }}>
        <i style={{ display: 'inline-block', width: '7px', height: '7px', borderRadius: '50%', background: getColor(), boxShadow: `0 0 10px ${getColor()}` }} />
        {getLabel()}
      </span>
      {status.dirtyMarkets.length > 0 && <button className="secondary-button" style={{ padding: '.35rem .6rem', fontSize: '.68rem' }} onClick={onSyncNow}>Sync now</button>}
    </div>
  );
}
