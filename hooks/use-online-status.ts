'use client';
import { useState, useEffect } from 'react';

export function useOnlineStatus(): boolean {
  const [online, setOnline] = useState(typeof navigator !== 'undefined' ? navigator.onLine : true);
  useEffect(() => {
    const h = () => setOnline(true);
    const l = () => setOnline(false);
    window.addEventListener('online', h);
    window.addEventListener('offline', l);
    return () => { window.removeEventListener('online', h); window.removeEventListener('offline', l); };
  }, []);
  return online;
}
