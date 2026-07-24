'use client';
import { useState, useCallback } from 'react';
import { useAuth } from '@/contexts/auth-context';

export function AuthPanel({ onClose }: { onClose: () => void }) {
  const auth = useAuth();
  const [mode, setMode] = useState<'signin' | 'signup' | 'reset'>('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const handleSubmit = useCallback(async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setAuthError(null); setSuccess(null);
    try {
      if (mode === 'signin') { const r = await auth.signIn(email, password); if (r.ok) onClose(); else setAuthError(r.error ?? 'Unknown'); }
      else if (mode === 'signup') { const r = await auth.signUp(email, password); if (r.ok) setSuccess('Account created! Check your email for confirmation.'); else setAuthError(r.error ?? 'Unknown'); }
      else { const r = await auth.resetPassword(email); if (r.ok) setSuccess('Reset email sent.'); else setAuthError(r.error ?? 'Unknown'); }
    } finally { setSubmitting(false); }
  }, [auth, mode, email, password, onClose]);

  if (!auth.configured) {
    return (
      <div className="modal-backdrop">
        <div className="settings-modal"><header><h3>Authentication</h3><button className="icon-button" onClick={onClose}>✕</button></header>
          <div className="settings-body" style={{ padding: '2rem', textAlign: 'center' }}>
            <p>Supabase not configured. Go to Settings → Supabase to configure.</p>
            <button className="primary-button" style={{ marginTop: '1rem' }} onClick={onClose}>Close</button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="modal-backdrop">
      <div className="settings-modal" style={{ maxWidth: '400px' }}>
        <header><h3>{mode === 'signin' ? 'Sign In' : mode === 'signup' ? 'Create Account' : 'Reset Password'}</h3><button className="icon-button" onClick={onClose}>✕</button></header>
        <form onSubmit={handleSubmit}>
          <div className="settings-body" style={{ padding: '1.5rem' }}>
            {authError && <div className="error-banner" style={{ margin: '0 0 1rem' }}>{authError}</div>}
            {success && <div className="error-banner" style={{ borderColor: 'rgba(52,211,153,.3)', background: 'rgba(52,211,153,.08)', color: '#6ee7b7', margin: '0 0 1rem' }}>{success}</div>}
            <div className="field-label" style={{ marginBottom: '1rem' }}><label>Email</label><input className="control-input" type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="your@email.com" required style={{ width: '100%' }} /></div>
            {mode !== 'reset' && <div className="field-label" style={{ marginBottom: '1rem' }}><label>Password</label><input className="control-input" type="password" value={password} onChange={e => setPassword(e.target.value)} placeholder="••••••••" required minLength={6} style={{ width: '100%' }} /></div>}
            <button className="primary-button" type="submit" disabled={submitting} style={{ width: '100%', marginTop: '.5rem' }}>{submitting ? 'Please wait...' : mode === 'signin' ? 'Sign In' : mode === 'signup' ? 'Create Account' : 'Send Reset Email'}</button>
            <div style={{ marginTop: '1rem', display: 'flex', flexDirection: 'column', gap: '.5rem', alignItems: 'center' }}>
              {mode === 'signin' && <><button type="button" className="secondary-button" onClick={() => setMode('signup')}>Create new account</button><button type="button" className="secondary-button" onClick={() => setMode('reset')}>Forgot password?</button></>}
              {mode === 'signup' && <button type="button" className="secondary-button" onClick={() => setMode('signin')}>Already have an account?</button>}
              {mode === 'reset' && <button type="button" className="secondary-button" onClick={() => setMode('signin')}>Back to sign in</button>}
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}
