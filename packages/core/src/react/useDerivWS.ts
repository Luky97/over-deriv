'use client';

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { DerivWS } from '../ws';

export interface UseDerivWSReturn {
  ws: DerivWS | null;
  isConnected: boolean;
  isExhausted: boolean;
  error: string | null;
}

/** Owns one public, market-data-only Deriv WebSocket with automatic reconnect. */
export function useDerivWS(): UseDerivWSReturn {
  const wsRef = useRef<DerivWS | null>(null);
  const listenersRef = useRef(new Set<() => void>());
  const [isConnected, setIsConnected] = useState(false);
  const [isExhausted, setIsExhausted] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const subscribe = useCallback((listener: () => void) => {
    listenersRef.current.add(listener);
    return () => { listenersRef.current.delete(listener); };
  }, []);
  const getSnapshot = useCallback(() => wsRef.current, []);

  useEffect(() => {
    let disposed = false;
    const instance = new DerivWS();
    wsRef.current = instance;
    listenersRef.current.forEach((listener) => listener());
    const offConnection = instance.onConnectionStateChange((connected) => {
      if (disposed) return;
      setIsConnected(connected);
      if (connected) {
        setError(null);
        setIsExhausted(false);
      }
    });
    const offExhausted = instance.onReconnectExhausted(() => {
      if (!disposed) {
        setIsExhausted(true);
        setError('Public market-data connection exhausted its reconnect attempts.');
      }
    });
    void instance.connect().catch((reason: unknown) => {
      if (!disposed) setError(reason instanceof Error ? reason.message : 'Public WebSocket connection failed.');
    });
    const listeners = listenersRef.current;
    return () => {
      disposed = true;
      offConnection();
      offExhausted();
      instance.disconnect();
      wsRef.current = null;
      listeners.forEach((listener) => listener());
    };
  }, []);

  const ws = useSyncExternalStore(subscribe, getSnapshot, () => null);
  return { ws, isConnected, isExhausted, error };
}
