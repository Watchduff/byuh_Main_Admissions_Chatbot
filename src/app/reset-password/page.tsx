'use client';

import { Suspense, useState } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { KeyRound } from 'lucide-react';

function ResetForm() {
  const router = useRouter();
  const token = useSearchParams().get('token') ?? '';

  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!password || !confirmPassword) {
      setError('Both fields are required.');
      return;
    }
    if (password !== confirmPassword) {
      setError('Passwords do not match.');
      return;
    }
    setError(null);
    setSubmitting(true);
    try {
      const res = await fetch('/api/auth/reset-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, password, confirmPassword }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || `Failed: ${res.status}`);
      router.replace('/login?reset=1');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to reset password.');
    } finally {
      setSubmitting(false);
    }
  }

  const inputProps = {
    className: 'w-full rounded-lg border px-3 py-2 text-[14px] outline-none transition-colors',
    style: { borderColor: '#e6e6e6', color: '#141414' },
    onFocus: (e: React.FocusEvent<HTMLInputElement>) => {
      e.currentTarget.style.borderColor = '#ba0c2f';
      e.currentTarget.style.boxShadow = '0 0 0 1px #ba0c2f';
    },
    onBlur: (e: React.FocusEvent<HTMLInputElement>) => {
      e.currentTarget.style.borderColor = '#e6e6e6';
      e.currentTarget.style.boxShadow = 'none';
    },
  };

  return (
    <form
      onSubmit={handleSubmit}
      className="w-full max-w-md bg-white rounded-2xl shadow-sm border p-7 space-y-5"
      style={{ borderColor: '#e6e6e6' }}
    >
      <div>
        <h1 className="text-[20px] font-semibold leading-tight" style={{ color: '#141414' }}>
          Choose a new password
        </h1>
        <p className="text-[13px] mt-1" style={{ color: '#666' }}>
          At least 8 characters. You&apos;ll be signed out everywhere and can sign in with the new one.
        </p>
      </div>

      {!token ? (
        <div className="bg-red-50 border border-red-200 text-red-800 rounded-lg px-3 py-2 text-[13px]">
          This reset link is missing its token.{' '}
          <Link href="/forgot-password" className="font-medium underline">Request a new link</Link>.
        </div>
      ) : (
        <>
          {error && (
            <div className="bg-red-50 border border-red-200 text-red-800 rounded-lg px-3 py-2 text-[13px]">
              {error}
            </div>
          )}

          <div>
            <label htmlFor="reset-password-field-1" className="block text-[11px] font-semibold uppercase tracking-wider mb-1" style={{ color: '#666' }}>
              New password
            </label>
            <input
          id="reset-password-field-1"
              type="password"
              autoComplete="new-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              minLength={8}
              required
              {...inputProps}
            />
          </div>

          <div>
            <label htmlFor="reset-password-field-2" className="block text-[11px] font-semibold uppercase tracking-wider mb-1" style={{ color: '#666' }}>
              Confirm new password
            </label>
            <input
          id="reset-password-field-2"
              type="password"
              autoComplete="new-password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              minLength={8}
              required
              {...inputProps}
            />
          </div>

          <button
            type="submit"
            disabled={submitting}
            className="w-full flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-lg text-white text-[14px] font-medium transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
            style={{ background: '#ba0c2f' }}
            onMouseEnter={(e) => { if (!e.currentTarget.disabled) e.currentTarget.style.background = '#9e1b34'; }}
            onMouseLeave={(e) => { e.currentTarget.style.background = '#ba0c2f'; }}
          >
            <KeyRound size={15} />
            {submitting ? 'Saving…' : 'Set new password'}
          </button>
        </>
      )}

      <div className="text-center text-[13px]" style={{ color: '#666' }}>
        <Link href="/login" className="font-medium hover:underline" style={{ color: '#ba0c2f' }}>
          Back to sign in
        </Link>
      </div>
    </form>
  );
}

export default function ResetPasswordPage() {
  return (
    <div
      className="min-h-dvh flex flex-col items-center justify-center px-4 py-10"
      style={{ background: '#f6f6f8' }}
    >
      <div className="mb-6 flex items-center gap-3">
        <Image src="/logo.png" alt="BYU–Hawaii" width={160} height={40} className="h-9 w-auto" priority />
      </div>
      <Suspense fallback={null}>
        <ResetForm />
      </Suspense>
    </div>
  );
}
