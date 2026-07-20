'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { ResearchSettings } from '@/lib/types';
import { createDefaultSettings } from '@/lib/types';
import { loadSettings, saveSettings } from '@/lib/storage/database';

export interface ResearchSettingsController {
  settings: ResearchSettings;
  setSettings: (next: ResearchSettings | ((current: ResearchSettings) => ResearchSettings)) => void;
  isReady: boolean;
  error: string | null;
}

export function useResearchSettings(): ResearchSettingsController {
  const [settings, setSettingsState] = useState<ResearchSettings>(createDefaultSettings);
  const [isReady, setIsReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const readyRef = useRef(false);

  useEffect(() => {
    let disposed = false;
    void loadSettings()
      .then((stored) => {
        if (!disposed) {
          setSettingsState(stored);
          readyRef.current = true;
          setIsReady(true);
        }
      })
      .catch((reason: unknown) => {
        if (!disposed) {
          readyRef.current = true;
          setIsReady(true);
          setError(reason instanceof Error ? reason.message : 'IndexedDB settings could not be loaded.');
        }
      });
    return () => { disposed = true; };
  }, []);

  const setSettings = useCallback((next: ResearchSettings | ((current: ResearchSettings) => ResearchSettings)) => {
    setSettingsState((current) => {
      const value = typeof next === 'function' ? next(current) : next;
      if (readyRef.current) {
        void saveSettings(value).catch((reason: unknown) => {
          setError(reason instanceof Error ? reason.message : 'IndexedDB settings could not be saved.');
        });
      }
      return value;
    });
  }, []);

  return { settings, setSettings, isReady, error };
}
