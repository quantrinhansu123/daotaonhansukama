import { readFileSync } from 'node:fs';
import postgres from 'postgres';

const url = process.env.SUPABASE_DB_URL;
if (!url) {
  console.error('NO_DB_URL');
  process.exit(1);
}

const sql = postgres(url, { max: 1, prepare: false, ssl: 'require', connect_timeout: 15 });
try {
  const mig = readFileSync('supabase/migrations/20260929_0004_library_documents.sql', 'utf8');
  await sql.unsafe(mig);
  const rows = await sql`
    select pg_get_constraintdef(oid) as def
    from pg_constraint
    where conname = 'app_documents_collection_check'
  `;
  console.log('OK', rows[0]?.def);
} catch (error) {
  console.error('FAIL', error instanceof Error ? error.message : error);
  process.exitCode = 1;
} finally {
  await sql.end();
}
