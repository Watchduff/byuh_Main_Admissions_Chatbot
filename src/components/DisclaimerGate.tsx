'use client';

import { useCallback, useEffect, useState } from 'react';
import { Info, ShieldCheck, X } from 'lucide-react';
import {
  DISCLAIMER_ACCEPT_LABEL,
  DISCLAIMER_PARAGRAPHS,
  DISCLAIMER_SHORT,
  DISCLAIMER_TITLE,
  DISCLAIMER_VERSION,
} from '@/lib/disclaimer';

const STORAGE_KEY = 'byuhDisclaimerAcceptedVersion';
// Dispatched by DisclaimerNote's link so an already-accepted visitor can
// re-read the disclaimer without a full acceptance flow.
const OPEN_EVENT = 'byuh:open-disclaimer';

function hasAccepted(): boolean {
  try {
    return window.localStorage.getItem(STORAGE_KEY) === DISCLAIMER_VERSION;
  } catch {
    return false;
  }
}

/**
 * Persistent one-line disclaimer reminder for the chat footer, with a link that
 * re-opens the full disclaimer. Place this near the chat input; the modal itself
 * is rendered by <DisclaimerGate />.
 */
export function DisclaimerNote() {
  return (
    <p className="mt-2 text-center text-[11px] leading-snug px-2" style={{ color: '#999' }}>
      {DISCLAIMER_SHORT}{' '}
      <button
        type="button"
        onClick={() => window.dispatchEvent(new Event(OPEN_EVENT))}
        className="underline underline-offset-2 hover:no-underline cursor-pointer"
        style={{ color: '#946f0a' }}
      >
        Disclaimer
      </button>
    </p>
  );
}

/**
 * First-visit legal disclaimer gate (ROADMAP L2 / A1). Renders a blocking modal
 * until the visitor accepts the current disclaimer version, then records the
 * acceptance server-side (version + timestamp, per session). Returning visitors
 * who already accepted this version see nothing until they choose to re-read it
 * via <DisclaimerNote />.
 */
export default function DisclaimerGate() {
  // Assume accepted during SSR / first paint to avoid a flash of the modal
  // before we can read localStorage; the mount effect corrects this.
  const [accepted, setAccepted] = useState(true);
  // Read-only re-open of the disclaimer by an already-accepted visitor.
  const [reviewing, setReviewing] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setAccepted(hasAccepted());
    function onOpen() {
      setReviewing(true);
    }
    window.addEventListener(OPEN_EVENT, onOpen);
    return () => window.removeEventListener(OPEN_EVENT, onOpen);
  }, []);

  const open = !accepted || reviewing;

  const accept = useCallback(async () => {
    setSaving(true);
    try {
      window.localStorage.setItem(STORAGE_KEY, DISCLAIMER_VERSION);
    } catch {
      // Private-mode storage failure shouldn't block the visitor; the
      // server-side record below is the compliance source of truth.
    }
    setAccepted(true);
    setReviewing(false);
    // Best-effort audit write; the UI already reflects acceptance.
    try {
      await fetch('/api/disclaimer', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ version: DISCLAIMER_VERSION }),
      });
    } catch {
      /* ignore — recorded again on the next acceptance if it failed */
    } finally {
      setSaving(false);
    }
  }, []);

  // Escape closes the modal only when re-reading (an un-accepted visitor must
  // make a choice).
  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape' && reviewing) setReviewing(false);
    }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, reviewing]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center p-4"
      style={{ background: 'rgba(20,20,20,0.55)', backdropFilter: 'blur(2px)' }}
      role="dialog"
      aria-modal="true"
      aria-labelledby="byuh-disclaimer-title"
    >
      <div
        className="w-full max-w-md rounded-2xl bg-white shadow-xl overflow-hidden max-h-[90dvh] flex flex-col"
        style={{ border: '1px solid #e6e6e6' }}
      >
        <div className="flex items-center gap-2.5 px-5 py-4 border-b" style={{ borderColor: '#f0f0f0' }}>
          <span
            className="shrink-0 w-8 h-8 rounded-full flex items-center justify-center"
            style={{ background: 'rgba(186,12,47,0.08)' }}
          >
            <ShieldCheck size={17} style={{ color: '#ba0c2f' }} />
          </span>
          <h2
            id="byuh-disclaimer-title"
            className="flex-1 text-[16px] font-semibold tracking-tight"
            style={{ color: '#141414' }}
          >
            {DISCLAIMER_TITLE}
          </h2>
          {reviewing && (
            <button
              type="button"
              onClick={() => setReviewing(false)}
              className="shrink-0 p-1 rounded-md hover:bg-gray-100 cursor-pointer"
              style={{ color: '#666' }}
              title="Close"
              aria-label="Close disclaimer"
            >
              <X size={18} />
            </button>
          )}
        </div>

        <div className="px-5 py-4 overflow-y-auto space-y-3">
          {DISCLAIMER_PARAGRAPHS.map((p, i) => (
            <p key={i} className="text-[13.5px] leading-relaxed" style={{ color: '#444' }}>
              {p}
            </p>
          ))}
          <div
            className="flex gap-2.5 rounded-lg p-3 mt-1"
            style={{ background: 'rgba(148,111,10,0.06)' }}
          >
            <Info size={15} className="shrink-0 mt-0.5" style={{ color: '#946f0a' }} />
            <p className="text-[12px] leading-relaxed" style={{ color: '#666' }}>
              Need an official answer or help with your own records? Visit the{' '}
              <a
                href="https://www.byuh.edu"
                target="_blank"
                rel="noopener noreferrer"
                className="underline underline-offset-2"
                style={{ color: '#946f0a' }}
              >
                BYU–Hawaii website
              </a>
              .
            </p>
          </div>
        </div>

        <div className="px-5 py-4 border-t" style={{ borderColor: '#f0f0f0' }}>
          <button
            type="button"
            onClick={reviewing ? () => setReviewing(false) : accept}
            disabled={saving}
            className="w-full py-2.5 rounded-lg text-[14px] font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-60 cursor-pointer"
            style={{ background: '#ba0c2f' }}
          >
            {reviewing ? 'Close' : saving ? 'One moment…' : DISCLAIMER_ACCEPT_LABEL}
          </button>
        </div>
      </div>
    </div>
  );
}
