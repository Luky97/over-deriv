import { createClient, type SupabaseClient } from '@supabase/supabase-js';

let client: SupabaseClient | null = null;
let currentConfig: { url: string; key: string } | null = null;
const CONFIG_KEY = 'adaptiv_research_supabase_config';

function getEnvConfig(): { url: string; key: string } | null {
  const url = typeof process !== 'undefined' ? process.env.NEXT_PUBLIC_SUPABASE_URL : undefined;
  const key = typeof process !== 'undefined' ? process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY : undefined;
  if (url && key) return { url, key };
  return null;
}

function getLocalConfig(): { url: string; key: string } | null {
  try {
    const stored = localStorage.getItem(CONFIG_KEY);
    if (stored) {
      const p = JSON.parse(stored);
      if (p?.url && p?.publishableKey) return { url: p.url, key: p.publishableKey };
    }
  } catch { /* ignore */ }
  return null;
}

export function saveLocalConfig(url: string, publishableKey: string): void {
  try { localStorage.setItem(CONFIG_KEY, JSON.stringify({ url, publishableKey })); } catch { /* ignore */ }
}

export function clearLocalConfig(): void {
  try { localStorage.removeItem(CONFIG_KEY); } catch { /* ignore */ }
}

export function getSupabaseConfig(): { url: string; key: string } | null {
  return getEnvConfig() ?? getLocalConfig();
}

export function isSupabaseConfigured(): boolean {
  return getSupabaseConfig() !== null;
}

export function getSupabaseBrowserClient(): SupabaseClient {
  const config = getSupabaseConfig();
  if (!config) throw new Error('Supabase not configured');

  if (client && currentConfig?.url === config.url && currentConfig?.key === config.key) return client;

  client = createClient(config.url, config.key, {
    auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
  });
  currentConfig = config;
  return client;
}
