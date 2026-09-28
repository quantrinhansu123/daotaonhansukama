import postgres from 'postgres';

const sql = postgres(process.env.SUPABASE_DB_URL, { max: 1, ssl: 'require', prepare: false });
try {
  const [before] = await sql.unsafe(`
    select count(*)::int as total,
      count(*) filter (where jsonb_typeof(data) = 'string')::int as encoded,
      count(*) filter (where jsonb_typeof(data) = 'string'
        and jsonb_typeof((data #>> '{}')::jsonb) = 'object')::int as recoverable
    from public.app_documents
  `);
  if (before.total !== 185 || before.encoded !== before.total || before.recoverable !== before.total) {
    throw new Error('Unexpected document shape; refuse automatic repair.');
  }
  await sql.begin(async tx => {
    await tx.unsafe(`update public.app_documents set data = (data #>> '{}')::jsonb where jsonb_typeof(data) = 'string'`);
  });
  const [after] = await sql.unsafe(`
    select count(*)::int as total,
      count(*) filter (where jsonb_typeof(data) = 'object')::int as objects,
      count(*) filter (where collection = 'users' and data ? 'password')::int as passwords
    from public.app_documents
  `);
  if (after.objects !== before.total || after.passwords) throw new Error('Repair verification failed.');
  process.stdout.write(`Repaired ${after.objects} JSON documents; no user passwords in data.\n`);
} finally { await sql.end(); }
