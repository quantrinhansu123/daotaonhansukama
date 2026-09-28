import postgres from 'postgres';
const sql = postgres(process.env.SUPABASE_DB_URL, { max: 1, ssl: 'require', prepare: false });
try {
  const rows = await sql.unsafe('select collection, jsonb_typeof(data) as kind, count(*)::int as count from public.app_documents group by collection, jsonb_typeof(data) order by collection');
  for (const row of rows) process.stdout.write(`${row.collection}: ${row.kind} ${row.count}\n`);
} finally { await sql.end(); }
