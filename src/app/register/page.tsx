'use client';

import { useState } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { UserPlus } from 'lucide-react';

export default function RegisterPage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [registrationKey, setRegistrationKey] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (password !== confirmPassword) {
      setError('Passwords do not match.');
      return;
    }
    setError(null);
    setSubmitting(true);
    try {
      const res = await fetch('/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password, confirmPassword, registrationKey }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data.error || `Failed: ${res.status}`);
      }
      router.replace('/support');
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to register.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div
      className="min-h-dvh flex flex-col items-center justify-center px-4 py-10"
      style={{ background: '#f6f6f8' }}
    >
      <div className="mb-6 flex items-center gap-3">
        <Image
          src="/logo.png"
          alt="BYU–Hawaii"
          width={160}
          height={40}
          className="h-9 w-auto"
          priority
        />
      </div>

      <form
        onSubmit={handleSubmit}
        className="w-full max-w-md bg-white rounded-2xl shadow-sm border p-7 space-y-5"
        style={{ borderColor: '#e6e6e6' }}
      >
        <div>
          <h1 className="text-[20px] font-semibold leading-tight" style={{ color: '#141414' }}>
            Create an admin account
          </h1>
          <p className="text-[13px] mt-1" style={{ color: '#666' }}>
            You&apos;ll need a registration key from an existing administrator.
          </p>
        </div>

        {error && (
          <div className="bg-red-50 border border-red-200 text-red-800 rounded-lg px-3 py-2 text-[13px]">
            {error}
          </div>
        )}

        <div>
          <label htmlFor="register-field-1" className="block text-[11px] font-semibold uppercase tracking-wider mb-1" style={{ color: '#666' }}>
            Email
          </label>
          <input
          id="register-field-1"
            type="email"
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="w-full rounded-lg border px-3 py-2 text-[14px] outline-none transition-colors"
            style={{ borderColor: '#e6e6e6', color: '#141414' }}
            onFocus={(e) => { e.currentTarget.style.borderColor = '#ba0c2f'; e.currentTarget.style.boxShadow = '0 0 0 1px #ba0c2f'; }}
            onBlur={(e) => { e.currentTarget.style.borderColor = '#e6e6e6'; e.currentTarget.style.boxShadow = 'none'; }}
            required
          />
        </div>

        <div>
          <label htmlFor="register-field-2" className="block text-[11px] font-semibold uppercase tracking-wider mb-1" style={{ color: '#666' }}>
            Password
          </label>
          <input
          id="register-field-2"
            type="password"
            autoComplete="new-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            minLength={8}
            className="w-full rounded-lg border px-3 py-2 text-[14px] outline-none transition-colors"
            style={{ borderColor: '#e6e6e6', color: '#141414' }}
            onFocus={(e) => { e.currentTarget.style.borderColor = '#ba0c2f'; e.currentTarget.style.boxShadow = '0 0 0 1px #ba0c2f'; }}
            onBlur={(e) => { e.currentTarget.style.borderColor = '#e6e6e6'; e.currentTarget.style.boxShadow = 'none'; }}
            required
          />
          <p className="text-[11px] mt-1" style={{ color: '#888' }}>
            At least 8 characters.
          </p>
        </div>

        <div>
          <label htmlFor="register-field-3" className="block text-[11px] font-semibold uppercase tracking-wider mb-1" style={{ color: '#666' }}>
            Confirm password
          </label>
          <input
          id="register-field-3"
            type="password"
            autoComplete="new-password"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            minLength={8}
            className="w-full rounded-lg border px-3 py-2 text-[14px] outline-none transition-colors"
            style={{ borderColor: '#e6e6e6', color: '#141414' }}
            onFocus={(e) => { e.currentTarget.style.borderColor = '#ba0c2f'; e.currentTarget.style.boxShadow = '0 0 0 1px #ba0c2f'; }}
            onBlur={(e) => { e.currentTarget.style.borderColor = '#e6e6e6'; e.currentTarget.style.boxShadow = 'none'; }}
            required
          />
        </div>

        <div>
          <label htmlFor="register-field-4" className="block text-[11px] font-semibold uppercase tracking-wider mb-1" style={{ color: '#666' }}>
            Registration key
          </label>
          <input
          id="register-field-4"
            type="password"
            autoComplete="off"
            value={registrationKey}
            onChange={(e) => setRegistrationKey(e.target.value)}
            className="w-full rounded-lg border px-3 py-2 text-[14px] outline-none transition-colors"
            style={{ borderColor: '#e6e6e6', color: '#141414' }}
            onFocus={(e) => { e.currentTarget.style.borderColor = '#ba0c2f'; e.currentTarget.style.boxShadow = '0 0 0 1px #ba0c2f'; }}
            onBlur={(e) => { e.currentTarget.style.borderColor = '#e6e6e6'; e.currentTarget.style.boxShadow = 'none'; }}
            required
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
          <UserPlus size={15} />
          {submitting ? 'Creating account…' : 'Create account'}
        </button>

        <div className="text-center text-[13px]" style={{ color: '#666' }}>
          Already have an account?{' '}
          <Link
            href="/login"
            className="font-medium hover:underline"
            style={{ color: '#ba0c2f' }}
          >
            Sign in
          </Link>
        </div>
      </form>
    </div>
  );
}
