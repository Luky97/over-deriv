'use client';

import React, { createContext, useContext, useEffect, useRef, useState, useCallback } from 'react';
import type { User, AuthError } from '@supabase/supabase-js';
import { getSupabaseBrowserClient, isSupabaseConfigured } from '@/lib/supabase/client';

interface AuthState { user: User | null; loading: boolean; error: string | null; configured: boolean; guest: boolean; }

interface AuthContextValue extends AuthState {
  signIn: (email: string, password: string) => Promise<{ ok: boolean; error?: string }>;
  signUp: (email: string, password: string) => Promise<{ ok: boolean; error?: string }>;
  signOut: () => Promise<void>;
  resetPassword: (email: string) => Promise<{ ok: boolean; error?: string }>;
  enterGuestMode: () => void;
}

const AuthCtx = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<AuthState>({ user: null, loading: true, error: null, configured: isSupabaseConfigured(), guest: false });
  const initRef = useRef(false);

  useEffect(() => {
    if (initRef.current) return;
    initRef.current = true;
    if (!state.configured) { setState(s => ({ ...s, loading: false, guest: true })); return; }
    let client = null;
    try { client = getSupabaseBrowserClient(); } catch { setState(s => ({ ...s, loading: false, guest: true })); return; }
    client.auth.getSession().then(({ data: { session } }) => { setState(s => ({ ...s, session, user: session?.user ?? null, loading: false, guest: !session })); }).catch(() => setState(s => ({ ...s, loading: false, guest: true })));
    const { data: { subscription } } = client.auth.onAuthStateChange((_e, session) => { setState(s => ({ ...s, session, user: session?.user ?? null, loading: false, guest: !session })); });
    return () => { subscription.unsubscribe(); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const getClient = useCallback(() => { try { return getSupabaseBrowserClient(); } catch { return null; } }, [state.configured]);

  const signIn = useCallback(async (email: string, password: string) => { const c = getClient(); if (!c) return { ok: false, error: 'Not configured' }; try { const { error } = await c.auth.signInWithPassword({ email, password }); if (error) return { ok: false, error: mapAuthError(error) }; return { ok: true }; } catch { return { ok: false, error: 'Network unavailable' }; } }, [getClient]);
  const signUp = useCallback(async (email: string, password: string) => { const c = getClient(); if (!c) return { ok: false, error: 'Not configured' }; try { const { error } = await c.auth.signUp({ email, password, options: { emailRedirectTo: `${window.location.origin}/over-deriv` } }); if (error) return { ok: false, error: mapAuthError(error) }; return { ok: true }; } catch { return { ok: false, error: 'Network unavailable' }; } }, [getClient]);
  const signOut = useCallback(async () => { const c = getClient(); if (!c) return; await c.auth.signOut(); setState(s => ({ ...s, user: null, guest: true })); }, [getClient]);
  const resetPassword = useCallback(async (email: string) => { const c = getClient(); if (!c) return { ok: false, error: 'Not configured' }; try { const { error } = await c.auth.resetPasswordForEmail(email, { redirectTo: `${window.location.origin}/over-deriv/recovery` }); if (error) return { ok: false, error: mapAuthError(error) }; return { ok: true }; } catch { return { ok: false, error: 'Network unavailable' }; } }, [getClient]);
  const enterGuestMode = useCallback(() => setState(s => ({ ...s, guest: true })), []);

  return React.createElement(AuthCtx.Provider, { value: { ...state, signIn, signUp, signOut, resetPassword, enterGuestMode } }, children);
}

export function useAuth(): AuthContextValue { const c = useContext(AuthCtx); if (!c) throw new Error('useAuth must be in AuthProvider'); return c; }

function mapAuthError(error: AuthError): string {
  const m = error.message.toLowerCase();
  if (m.includes('invalid login') || m.includes('invalid credentials')) return 'Invalid credentials';
  if (m.includes('email not confirmed')) return 'Email not confirmed';
  if (m.includes('rate limit')) return 'Rate limited. Please wait.';
  if (m.includes('network') || m.includes('fetch')) return 'Network unavailable';
  return `Authentication error`;
}
