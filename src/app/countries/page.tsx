'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Image from 'next/image';
import { Plus, RefreshCw, Save, Trash2, Search, Globe2 } from 'lucide-react';
import AdminMenu from '@/components/AdminMenu';

interface Country {
  id: number;
  region: string | null;
  country: string;
  currentAcademicCriteria: string | null;
  englishTestRequired: string | null;
  optionalToSubmit: string | null;
  expiredCountryCriteria: string | null;
  notAccepted: string | null;
  updatedAt: string;
}

type Draft = Omit<Country, 'id' | 'updatedAt'>;

const EMPTY_DRAFT: Draft = {
  region: '',
  country: '',
  currentAcademicCriteria: '',
  englishTestRequired: '',
  optionalToSubmit: '',
  expiredCountryCriteria: '',
  notAccepted: '',
};

function countryToDraft(c: Country): Draft {
  return {
    region: c.region ?? '',
    country: c.country,
    currentAcademicCriteria: c.currentAcademicCriteria ?? '',
    englishTestRequired: c.englishTestRequired ?? '',
    optionalToSubmit: c.optionalToSubmit ?? '',
    expiredCountryCriteria: c.expiredCountryCriteria ?? '',
    notAccepted: c.notAccepted ?? '',
  };
}

// Empty strings from the form become NULL in the database. Trim whitespace so
// " " doesn't masquerade as a value.
function draftToPayload(d: Draft) {
  const clean = (v: string) => {
    const t = v.trim();
    return t === '' ? null : v;
  };
  return {
    region: clean(d.region ?? ''),
    country: d.country.trim(),
    currentAcademicCriteria: clean(d.currentAcademicCriteria ?? ''),
    englishTestRequired: clean(d.englishTestRequired ?? ''),
    optionalToSubmit: clean(d.optionalToSubmit ?? ''),
    expiredCountryCriteria: clean(d.expiredCountryCriteria ?? ''),
    notAccepted: clean(d.notAccepted ?? ''),
  };
}

function formatTimestamp(iso: string): string {
  try {
    return new Date(iso).toLocaleString();
  } catch {
    return iso;
  }
}

export default function CountriesPage() {
  const [countries, setCountries] = useState<Country[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState('');
  const [selectedId, setSelectedId] = useState<number | 'new' | null>(null);
  const [draft, setDraft] = useState<Draft>(EMPTY_DRAFT);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const loadCountries = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/countries');
      if (!res.ok) throw new Error(`Failed: ${res.status}`);
      const data: Country[] = await res.json();
      setCountries(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load countries');
      setCountries([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadCountries();
  }, [loadCountries]);

  const selected = useMemo(() => {
    if (selectedId === null || selectedId === 'new') return null;
    return countries?.find((c) => c.id === selectedId) ?? null;
  }, [countries, selectedId]);

  useEffect(() => {
    if (selectedId === 'new') {
      setDraft(EMPTY_DRAFT);
    } else if (selected) {
      setDraft(countryToDraft(selected));
    }
  }, [selectedId, selected]);

  const filtered = useMemo(() => {
    if (!countries) return [];
    const q = search.trim().toLowerCase();
    if (!q) return countries;
    return countries.filter(
      (c) =>
        c.country.toLowerCase().includes(q) ||
        (c.region ?? '').toLowerCase().includes(q)
    );
  }, [countries, search]);

  async function save() {
    if (!draft.country.trim()) {
      alert('Country name is required.');
      return;
    }
    setSaving(true);
    try {
      const payload = draftToPayload(draft);
      const isNew = selectedId === 'new';
      const res = await fetch(
        isNew ? '/api/countries' : `/api/countries/${selectedId}`,
        {
          method: isNew ? 'POST' : 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        }
      );
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || `Failed: ${res.status}`);
      }
      const saved: Country = await res.json();
      await loadCountries();
      setSelectedId(saved.id);
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Failed to save');
    } finally {
      setSaving(false);
    }
  }

  async function remove() {
    if (typeof selectedId !== 'number') return;
    const name = selected?.country ?? 'this row';
    if (!confirm(`Delete "${name}"? This cannot be undone.`)) return;
    setDeleting(true);
    try {
      const res = await fetch(`/api/countries/${selectedId}`, { method: 'DELETE' });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || `Failed: ${res.status}`);
      }
      setSelectedId(null);
      await loadCountries();
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Failed to delete');
    } finally {
      setDeleting(false);
    }
  }

  const isNew = selectedId === 'new';
  const isEditing = isNew || selected !== null;

  return (
    <div className="min-h-dvh" style={{ background: '#f6f6f8' }}>
      <header
        className="px-4 sm:px-6 py-4 shadow-sm"
        style={{ background: '#ba0c2f' }}
      >
        <div className="max-w-7xl mx-auto flex items-center gap-3">
          <Image
            src="/logo.png"
            alt="BYU–Hawaii"
            width={140}
            height={36}
            className="h-8 w-auto brightness-0 invert"
            priority
          />
          <div className="flex-1 min-w-0">
            <h1 className="text-[17px] sm:text-lg font-semibold text-white tracking-wide leading-tight">
              Country Criteria Editor
            </h1>
            <p className="text-[11px] sm:text-xs text-white/70 mt-0.5">
              Create, edit, and remove the country-specific admission rules the chatbot looks up
            </p>
          </div>
          <button
            onClick={loadCountries}
            className="shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-md text-[13px] font-medium text-white/90 hover:text-white border border-white/20 hover:bg-white/10 transition-colors cursor-pointer"
            title="Refresh"
          >
            <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
            <span className="hidden sm:inline">Refresh</span>
          </button>
          <AdminMenu />
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 py-6">
        {error && (
          <div className="mb-4 bg-red-50 border border-red-200 text-red-800 rounded-lg px-4 py-3 text-sm">
            {error}
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-[320px_1fr] gap-4">
          {/* List pane */}
          <aside className="bg-white rounded-xl border shadow-sm flex flex-col overflow-hidden" style={{ borderColor: '#e6e6e6' }}>
            <div className="p-3 border-b space-y-2" style={{ borderColor: '#f0f0f0' }}>
              <button
                onClick={() => setSelectedId('new')}
                className="w-full flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-white text-[13px] font-medium transition-colors cursor-pointer"
                style={{ background: '#ba0c2f' }}
                onMouseEnter={(e) => { e.currentTarget.style.background = '#9e1b34'; }}
                onMouseLeave={(e) => { e.currentTarget.style.background = '#ba0c2f'; }}
              >
                <Plus size={14} />
                New country
              </button>
              <div className="relative">
                <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
                <input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search countries or regions"
                  className="w-full rounded-lg border pl-8 pr-3 py-2 text-[13px] outline-none transition-colors"
                  style={{ borderColor: '#e6e6e6', color: '#141414' }}
                  onFocus={(e) => { e.currentTarget.style.borderColor = '#ba0c2f'; e.currentTarget.style.boxShadow = '0 0 0 1px #ba0c2f'; }}
                  onBlur={(e) => { e.currentTarget.style.borderColor = '#e6e6e6'; e.currentTarget.style.boxShadow = 'none'; }}
                />
              </div>
            </div>
            <div className="flex-1 overflow-y-auto max-h-[70vh]">
              {countries && filtered.length === 0 && (
                <div className="p-6 text-center text-[13px]" style={{ color: '#666' }}>
                  <Globe2 size={24} className="mx-auto mb-2 text-gray-300" />
                  No matches
                </div>
              )}
              {filtered.map((c) => {
                const isSelected = selectedId === c.id;
                return (
                  <button
                    key={c.id}
                    onClick={() => setSelectedId(c.id)}
                    className="w-full text-left px-3 py-2 border-b transition-colors cursor-pointer block"
                    style={{
                      borderColor: '#f3f3f5',
                      background: isSelected ? 'rgba(186, 12, 47, 0.06)' : 'white',
                      borderLeft: `3px solid ${isSelected ? '#ba0c2f' : 'transparent'}`,
                    }}
                    onMouseEnter={(e) => { if (!isSelected) e.currentTarget.style.background = '#fafafb'; }}
                    onMouseLeave={(e) => { if (!isSelected) e.currentTarget.style.background = 'white'; }}
                  >
                    <div className="text-[13px] font-medium truncate" style={{ color: '#141414' }}>
                      {c.country}
                    </div>
                    {c.region && (
                      <div className="text-[11px] truncate mt-0.5" style={{ color: '#888' }}>
                        {c.region}
                      </div>
                    )}
                  </button>
                );
              })}
            </div>
            <div className="p-2 text-[11px] text-center border-t" style={{ borderColor: '#f0f0f0', color: '#888' }}>
              {countries ? `${countries.length} countries` : 'Loading…'}
            </div>
          </aside>

          {/* Edit pane */}
          <section className="bg-white rounded-xl border shadow-sm" style={{ borderColor: '#e6e6e6' }}>
            {!isEditing && (
              <div className="p-10 text-center" style={{ color: '#666' }}>
                <Globe2 size={32} className="mx-auto mb-3 text-gray-300" />
                <p className="text-sm font-medium" style={{ color: '#141414' }}>
                  Select a country to edit
                </p>
                <p className="text-xs mt-1">
                  Or click <strong>New country</strong> to add a row.
                </p>
              </div>
            )}

            {isEditing && (
              <div className="flex flex-col">
                <div className="px-5 py-4 border-b flex items-start gap-3" style={{ borderColor: '#f0f0f0' }}>
                  <div className="flex-1 min-w-0">
                    <div className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: '#888' }}>
                      {isNew ? 'New country' : `Editing #${selected?.id}`}
                    </div>
                    <div className="text-[17px] font-semibold mt-0.5 leading-tight" style={{ color: '#141414' }}>
                      {draft.country || (isNew ? 'Untitled' : selected?.country)}
                    </div>
                    {!isNew && selected?.updatedAt && (
                      <div className="text-[11px] mt-1" style={{ color: '#888' }}>
                        Last updated {formatTimestamp(selected.updatedAt)}
                      </div>
                    )}
                  </div>
                  {!isNew && (
                    <button
                      onClick={remove}
                      disabled={deleting}
                      className="shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-md text-[13px] font-medium border transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
                      style={{ borderColor: '#e6e6e6', color: '#ba0c2f' }}
                      onMouseEnter={(e) => { if (!e.currentTarget.disabled) e.currentTarget.style.background = 'rgba(186, 12, 47, 0.06)'; }}
                      onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}
                    >
                      <Trash2 size={14} />
                      {deleting ? 'Deleting…' : 'Delete'}
                    </button>
                  )}
                </div>

                <div className="p-5 space-y-4">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <Field
                      label="Country"
                      required
                      value={draft.country}
                      onChange={(v) => setDraft((d) => ({ ...d, country: v }))}
                    />
                    <Field
                      label="Region"
                      value={draft.region ?? ''}
                      onChange={(v) => setDraft((d) => ({ ...d, region: v }))}
                    />
                  </div>

                  <TextAreaField
                    label="Current academic criteria"
                    value={draft.currentAcademicCriteria ?? ''}
                    onChange={(v) => setDraft((d) => ({ ...d, currentAcademicCriteria: v }))}
                  />
                  <TextAreaField
                    label="English test required"
                    value={draft.englishTestRequired ?? ''}
                    onChange={(v) => setDraft((d) => ({ ...d, englishTestRequired: v }))}
                  />
                  <TextAreaField
                    label="Optional to submit"
                    value={draft.optionalToSubmit ?? ''}
                    onChange={(v) => setDraft((d) => ({ ...d, optionalToSubmit: v }))}
                  />
                  <TextAreaField
                    label="Expired country criteria"
                    value={draft.expiredCountryCriteria ?? ''}
                    onChange={(v) => setDraft((d) => ({ ...d, expiredCountryCriteria: v }))}
                  />
                  <TextAreaField
                    label="Not accepted"
                    value={draft.notAccepted ?? ''}
                    onChange={(v) => setDraft((d) => ({ ...d, notAccepted: v }))}
                  />
                </div>

                <div className="px-5 py-4 border-t flex justify-end gap-2" style={{ borderColor: '#f0f0f0' }}>
                  <button
                    onClick={() => {
                      if (isNew) setSelectedId(null);
                      else if (selected) setDraft(countryToDraft(selected));
                    }}
                    className="px-4 py-2 rounded-lg text-[13px] font-medium border transition-colors cursor-pointer"
                    style={{ borderColor: '#e6e6e6', color: '#141414', background: 'white' }}
                    onMouseEnter={(e) => { e.currentTarget.style.background = '#fafafb'; }}
                    onMouseLeave={(e) => { e.currentTarget.style.background = 'white'; }}
                  >
                    {isNew ? 'Cancel' : 'Reset'}
                  </button>
                  <button
                    onClick={save}
                    disabled={saving || !draft.country.trim()}
                    className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-white text-[13px] font-medium transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
                    style={{ background: '#ba0c2f' }}
                    onMouseEnter={(e) => { if (!e.currentTarget.disabled) e.currentTarget.style.background = '#9e1b34'; }}
                    onMouseLeave={(e) => { e.currentTarget.style.background = '#ba0c2f'; }}
                  >
                    <Save size={14} />
                    {saving ? 'Saving…' : isNew ? 'Create' : 'Save changes'}
                  </button>
                </div>
              </div>
            )}
          </section>
        </div>
      </main>
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
  required,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  required?: boolean;
}) {
  return (
    <div>
      <label className="block text-[11px] font-semibold uppercase tracking-wider mb-1" style={{ color: '#666' }}>
        {label}
        {required && <span style={{ color: '#ba0c2f' }}> *</span>}
      </label>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full rounded-lg border px-3 py-2 text-[14px] outline-none transition-colors"
        style={{ borderColor: '#e6e6e6', color: '#141414' }}
        onFocus={(e) => { e.currentTarget.style.borderColor = '#ba0c2f'; e.currentTarget.style.boxShadow = '0 0 0 1px #ba0c2f'; }}
        onBlur={(e) => { e.currentTarget.style.borderColor = '#e6e6e6'; e.currentTarget.style.boxShadow = 'none'; }}
      />
    </div>
  );
}

function TextAreaField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div>
      <label className="block text-[11px] font-semibold uppercase tracking-wider mb-1" style={{ color: '#666' }}>
        {label}
      </label>
      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        rows={5}
        className="w-full rounded-lg border px-3 py-2 text-[14px] outline-none transition-colors resize-y font-mono"
        style={{ borderColor: '#e6e6e6', color: '#141414' }}
        onFocus={(e) => { e.currentTarget.style.borderColor = '#ba0c2f'; e.currentTarget.style.boxShadow = '0 0 0 1px #ba0c2f'; }}
        onBlur={(e) => { e.currentTarget.style.borderColor = '#e6e6e6'; e.currentTarget.style.boxShadow = 'none'; }}
      />
    </div>
  );
}
