'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';

function RecoveryContent() {
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const router = useRouter();

  const handleUpdate = useCallback(async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      setSuccess(true);
      setTimeout(() => router.push('/over-deriv/'), 3000);
    } catch {
      setError('Failed to update password');
    } finally {
      setSubmitting(false);
    }
  }, [router]);

  return (
    <div style={{ minHeight: '100vh', display: 'grid', placeItems: 'center', padding: '2rem' }}>
      <div className="settings-modal" style={{ maxWidth: '400px' }}>
        <header><h3>Password Recovery</h3></header>
        <form onSubmit={handleUpdate}>
          <div className="settings-body" style={{ padding: '1.5rem' }}>
            {success ? (
              <div className="error-banner" style={{ borderColor: 'rgba(52,211,153,.3)', background: 'rgba(52,211,153,.08)', color: '#6ee7b7' }}>Password updated! Redirecting...</div>
            ) : (
              <>
                {error && <div className="error-banner" style={{ margin: '0 0 1rem' }}>{error}</div>}
                <div className="field-label" style={{ marginBottom: '1rem' }}>
                  <label>New Password</label>
                  <input className="control-input" type="password" value={password} onChange={e => setPassword(e.target.value)} placeholder="New password" required minLength={6} style={{ width: '100%' }} />
                </div>
                <button className="primary-button" type="submit" disabled={submitting} style={{ width: '100%' }}>{submitting ? 'Updating...' : 'Update Password'}</button>
              </>
            )}
          </div>
        </form>
      </div>
    </div>
  );
}

export default function RecoveryPage() {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  if (!mounted) return <div style={{ minHeight: '100vh', display: 'grid', placeItems: 'center' }}><p>Loading...</p></div>;
  return <RecoveryContent />;
}
