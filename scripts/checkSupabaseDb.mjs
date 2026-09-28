import postgres from 'postgres';

const raw = process.env.SUPABASE_DB_URL;
const appUrl = new URL(process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://invalid.example');
if (!raw) throw new Error('Thiếu SUPABASE_DB_URL.');

const databaseUrl = new URL(raw);
const projectRef = appUrl.hostname.split('.')[0];
if (!['postgres:', 'postgresql:'].includes(databaseUrl.protocol)
    || !databaseUrl.password
    || databaseUrl.password.includes('YOUR-PASSWORD')
    || !databaseUrl.hostname.endsWith('.supabase.com')
    || !(databaseUrl.hostname.includes(projectRef) || decodeURIComponent(databaseUrl.username).includes(projectRef))) {
  throw new Error('SUPABASE_DB_URL không hợp lệ hoặc không thuộc dự án Supabase đang cấu hình.');
}

const sql = postgres(raw, { max: 1, prepare: false, ssl: 'require', connect_timeout: 10 });
try {
  await sql`select 1 as ok`;
  process.stdout.write('supabase_db: CONNECTED\n');
} catch (error) {
  process.stderr.write(`supabase_db: CONNECTION_FAILED ${error?.code || 'unknown'}\n`);
  process.exitCode = 1;
} finally {
  await sql.end();
}
