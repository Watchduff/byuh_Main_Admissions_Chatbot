import { pool } from '@/db/index';
import { NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/auth';

export const runtime = 'nodejs';

type CountryRow = {
  id: number;
  region: string | null;
  country: string;
  current_academic_criteria: string | null;
  english_test_required: string | null;
  optional_to_submit: string | null;
  expired_country_criteria: string | null;
  not_accepted: string | null;
  updated_at: string;
};

function toClient(r: CountryRow) {
  return {
    id: r.id,
    region: r.region,
    country: r.country,
    currentAcademicCriteria: r.current_academic_criteria,
    englishTestRequired: r.english_test_required,
    optionalToSubmit: r.optional_to_submit,
    expiredCountryCriteria: r.expired_country_criteria,
    notAccepted: r.not_accepted,
    updatedAt: r.updated_at,
  };
}

function parseId(raw: string): number | null {
  const n = Number.parseInt(raw, 10);
  return Number.isFinite(n) ? n : null;
}

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAdmin();
  if (auth instanceof NextResponse) return auth;

  const { id: idRaw } = await params;
  const id = parseId(idRaw);
  if (id === null) return NextResponse.json({ error: 'invalid id' }, { status: 400 });

  const client = await pool.connect();
  try {
    const result = await client.query<CountryRow>(
      `SELECT id, region, country, current_academic_criteria, english_test_required,
              optional_to_submit, expired_country_criteria, not_accepted, updated_at
         FROM country_criteria
        WHERE id = $1`,
      [id]
    );
    if (result.rows.length === 0) {
      return NextResponse.json({ error: 'not found' }, { status: 404 });
    }
    return NextResponse.json(toClient(result.rows[0]));
  } finally {
    client.release();
  }
}

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAdmin();
  if (auth instanceof NextResponse) return auth;

  const { id: idRaw } = await params;
  const id = parseId(idRaw);
  if (id === null) return NextResponse.json({ error: 'invalid id' }, { status: 400 });

  const body = (await req.json()) as Partial<{
    region: string | null;
    country: string;
    currentAcademicCriteria: string | null;
    englishTestRequired: string | null;
    optionalToSubmit: string | null;
    expiredCountryCriteria: string | null;
    notAccepted: string | null;
  }>;

  if ('country' in body && (!body.country || !body.country.trim())) {
    return NextResponse.json({ error: 'country cannot be empty' }, { status: 400 });
  }

  // Build the SET clause from whichever fields the client actually sent.
  // This lets the UI PATCH a single field without clobbering the others.
  const sets: string[] = [];
  const values: unknown[] = [];
  const push = (col: string, val: unknown) => {
    values.push(val);
    sets.push(`${col} = $${values.length}`);
  };
  if ('region' in body) push('region', body.region ?? null);
  if ('country' in body) push('country', body.country!.trim());
  if ('currentAcademicCriteria' in body) push('current_academic_criteria', body.currentAcademicCriteria ?? null);
  if ('englishTestRequired' in body) push('english_test_required', body.englishTestRequired ?? null);
  if ('optionalToSubmit' in body) push('optional_to_submit', body.optionalToSubmit ?? null);
  if ('expiredCountryCriteria' in body) push('expired_country_criteria', body.expiredCountryCriteria ?? null);
  if ('notAccepted' in body) push('not_accepted', body.notAccepted ?? null);

  if (sets.length === 0) {
    return NextResponse.json({ error: 'no fields to update' }, { status: 400 });
  }
  sets.push('updated_at = NOW()');
  values.push(id);

  const client = await pool.connect();
  try {
    const result = await client.query<CountryRow>(
      `UPDATE country_criteria
          SET ${sets.join(', ')}
        WHERE id = $${values.length}
      RETURNING id, region, country, current_academic_criteria, english_test_required,
                optional_to_submit, expired_country_criteria, not_accepted, updated_at`,
      values
    );
    if (result.rows.length === 0) {
      return NextResponse.json({ error: 'not found' }, { status: 404 });
    }
    return NextResponse.json(toClient(result.rows[0]));
  } catch (err) {
    if (err && typeof err === 'object' && 'code' in err && (err as { code: string }).code === '23505') {
      return NextResponse.json(
        { error: 'Another row with that country name already exists.' },
        { status: 409 }
      );
    }
    throw err;
  } finally {
    client.release();
  }
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAdmin();
  if (auth instanceof NextResponse) return auth;

  const { id: idRaw } = await params;
  const id = parseId(idRaw);
  if (id === null) return NextResponse.json({ error: 'invalid id' }, { status: 400 });

  const client = await pool.connect();
  try {
    const result = await client.query(
      'DELETE FROM country_criteria WHERE id = $1 RETURNING id',
      [id]
    );
    if (result.rows.length === 0) {
      return NextResponse.json({ error: 'not found' }, { status: 404 });
    }
    return NextResponse.json({ ok: true });
  } finally {
    client.release();
  }
}
