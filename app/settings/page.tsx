'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useResearch } from '@/contexts/research-context';
import { SettingsDialog } from '@/components/settings/settings-dialog';

function SettingsContent() {
  const { settings, updateSettings } = useResearch();
  const router = useRouter();
  return <SettingsDialog settings={settings} onUpdate={s => { updateSettings(s); router.push('/over-deriv/'); }} onClose={() => router.push('/over-deriv/')} />;
}

export default function SettingsPage() {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  if (!mounted) return <div style={{ minHeight: '100vh', display: 'grid', placeItems: 'center' }}><p>Loading...</p></div>;
  return <SettingsContent />;
}
