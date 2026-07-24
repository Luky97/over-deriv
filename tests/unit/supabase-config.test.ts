import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { getSupabaseConfig, isSupabaseConfigured, saveLocalConfig, clearLocalConfig } from '@/lib/supabase/client';

const origEnv = process.env;

describe('Supabase config', () => {
  beforeEach(() => { process.env = { ...origEnv }; localStorage.clear(); });
  afterEach(() => { process.env = origEnv; });

  it('returns null when no config', () => {
    delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    delete process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
    expect(getSupabaseConfig()).toBeNull();
  });

  it('reads env config', () => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://test.supabase.co';
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY = 'test-key';
    const c = getSupabaseConfig();
    expect(c?.url).toBe('https://test.supabase.co');
  });

  it('reads local config', () => {
    delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    delete process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
    saveLocalConfig('https://local.supabase.co', 'local-key');
    expect(getSupabaseConfig()?.url).toBe('https://local.supabase.co');
  });

  it('env takes priority over local', () => {
    saveLocalConfig('https://local.supabase.co', 'local-key');
    process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://env.supabase.co';
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY = 'env-key';
    expect(getSupabaseConfig()?.url).toBe('https://env.supabase.co');
  });

  it('clearLocalConfig works', () => {
    saveLocalConfig('https://test.supabase.co', 'test-key');
    clearLocalConfig();
    delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    delete process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
    expect(isSupabaseConfigured()).toBe(false);
  });
});
