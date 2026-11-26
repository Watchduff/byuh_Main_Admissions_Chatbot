import { readFileSync } from 'fs';
import { resolve } from 'path';
import { pool } from '../db/index';

type CountryRecord = {
  region: string | null;
  country: string | null;
  currentAcademicCriteria: string | null;
  englishTestRequired: string | null;
  optionalToSubmit: string | null;
  expiredCountryCriteria: string | null;
  notAccepted: string | null;
};

type CountryCriteriaFile = {
  records: CountryRecord[];
};

async function seed() {
  const jsonPath = resolve(process.cwd(), 'data', 'country-criteria.json');
  const raw = readFileSync(jsonPath, 'utf-8');
  const data = JSON.parse(raw) as CountryCriteriaFile;

  if (!Array.isArray(data.records)) {
    throw new Error('data/country-criteria.json missing `records` array');
  }

  const client = await pool.connect();
  let upserts = 0;
  let skipped = 0;
  try {
    for (const r of data.records) {
      // A handful of spreadsheet rows are blank or section dividers; skip
      // anything without a country key since `country` is the unique lookup.
      if (!r.country || !r.country.trim()) {
        skipped++;
        continue;
      }
      await client.query(
        `INSERT INTO country_criteria (
           region, country, current_academic_criteria, english_test_required,
           optional_to_submit, expired_country_criteria, not_accepted, updated_at
         ) VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())
         ON CONFLICT (country) DO UPDATE SET
           region = EXCLUDED.region,
           current_academic_criteria = EXCLUDED.current_academic_criteria,
           english_test_required = EXCLUDED.english_test_required,
           optional_to_submit = EXCLUDED.optional_to_submit,
           expired_country_criteria = EXCLUDED.expired_country_criteria,
           not_accepted = EXCLUDED.not_accepted,
           updated_at = NOW()`,
        [
          r.region,
          r.country.trim(),
          r.currentAcademicCriteria,
          r.englishTestRequired,
          r.optionalToSubmit,
          r.expiredCountryCriteria,
          r.notAccepted,
        ]
      );
      upserts++;
    }
    console.log(`✓ Upserted ${upserts} country_criteria rows (skipped ${skipped} blank).`);
  } finally {
    client.release();
  }
}

seed()
  .then(async () => {
    await pool.end();
  })
  .catch(async (err) => {
    console.error('Seed failed:', err);
    await pool.end().catch(() => {});
    process.exit(1);
  });
