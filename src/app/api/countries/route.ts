import { pool } from '@/db/index';
import { NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/auth';

export const runtime = 'nodejs';

// Row shape returned to the country-admin UI. Snake_case columns are
// mapped to camelCase so the client TypeScript types line up with
// the rest of the app.
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

export async function GET() {
  const auth = await requireAdmin();
  if (auth instanceof NextResponse) return auth;

  const client = await pool.connect();
  try {
    const result = await client.query<CountryRow>(
      `SELECT id, region, country, current_academic_criteria, english_test_required,
              optional_to_submit, expired_country_criteria, not_accepted, updated_at
         FROM country_criteria
         ORDER BY country ASC`
    );
    return NextResponse.json(result.rows.map(toClient));
  } finally {
    client.release();
  }
}

export async function POST(req: Request) {
  const auth = await requireAdmin();
  if (auth instanceof NextResponse) return auth;

  const body = (await req.json()) as {
    region?: string | null;
    country?: string;
    currentAcademicCriteria?: string | null;
    englishTestRequired?: string | null;
    optionalToSubmit?: string | null;
    expiredCountryCriteria?: string | null;
    notAccepted?: string | null;
  };

  const country = body.country?.trim();
  if (!country) {
    return NextResponse.json({ error: 'country is required' }, { status: 400 });
  }

  const client = await pool.connect();
  try {
    const result = await client.query<CountryRow>(
      `INSERT INTO country_criteria (
         region, country, current_academic_criteria, english_test_required,
         optional_to_submit, expired_country_criteria, not_accepted, updated_at
       ) VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())
       RETURNING id, region, country, current_academic_criteria, english_test_required,
                 optional_to_submit, expired_country_criteria, not_accepted, updated_at`,
      [
        body.region ?? null,
        country,
        body.currentAcademicCriteria ?? null,
        body.englishTestRequired ?? null,
        body.optionalToSubmit ?? null,
        body.expiredCountryCriteria ?? null,
        body.notAccepted ?? null,
      ]
    );
    return NextResponse.json(toClient(result.rows[0]), { status: 201 });
  } catch (err) {
    // 23505 = unique_violation on the `country` column.
    if (err && typeof err === 'object' && 'code' in err && (err as { code: string }).code === '23505') {
      return NextResponse.json(
        { error: `A row for "${country}" already exists.` },
        { status: 409 }
      );
    }
    throw err;
  } finally {
    client.release();
  }
}
