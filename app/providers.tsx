'use client';
import { AuthProvider } from '@/contexts/auth-context';
import { ResearchProvider } from '@/contexts/research-context';
import { CloudSyncProvider } from '@/contexts/cloud-sync-context';

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <AuthProvider>
      <ResearchProvider>
        <CloudSyncProvider>
          {children}
        </CloudSyncProvider>
      </ResearchProvider>
    </AuthProvider>
  );
}
