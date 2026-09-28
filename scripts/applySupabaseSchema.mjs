import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import postgres from 'postgres';

const raw = process.env.SUPABASE_DB_URL;
const projectRef = new URL(process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://invalid.example').hostname.split('.')[0];
if (!raw) throw new Error('Thiếu SUPABASE_DB_URL.');
const databaseUrl = new URL(raw);
if (!['postgres:', 'postgresql:'].includes(databaseUrl.protocol)
    || !databaseUrl.password
    || databaseUrl.password.includes('YOUR-PASSWORD')
    || !databaseUrl.hostname.endsWith('.supabase.com')
    || !(databaseUrl.hostname.includes(projectRef) || decodeURIComponent(databaseUrl.username).includes(projectRef))) {
  throw new Error('SUPABASE_DB_URL không thuộc dự án Supabase đang cấu hình.');
}

const migrationPath = fileURLToPath(new URL('../supabase/migrations/20260928_0001_app_documents.sql', import.meta.url));
const accessPath = fileURLToPath(new URL('../supabase/migrations/20260928_0002_app_access.sql', import.meta.url));
const sourceStatePath = fileURLToPath(new URL('../supabase/migrations/20260928_0003_source_state.sql', import.meta.url));
const sql = postgres(raw, { max: 1, prepare: false, ssl: 'require', connect_timeout: 10 });
try {
  const [before] = await sql`select to_regclass('public.app_documents')::text as name`;
  process.stdout.write(`app_documents: ${before.name ? 'EXISTS' : 'ABSENT'}\n`);
  if (process.argv.includes('--apply')) {
    if (!before.name) await sql.unsafe(readFileSync(migrationPath, 'utf8'));
    await sql.unsafe(readFileSync(sourceStatePath, 'utf8'));
    const [policy] = await sql`
      select count(*)::int as count from pg_policies
      where schemaname = 'public' and tablename = 'app_documents'
    `;
    if (policy.count) {
      await sql.unsafe('grant select, insert, update, delete on public.app_documents to authenticated');
    }
    const [after] = await sql`select to_regclass('public.app_documents')::text as name`;
    if (!after.name) throw new Error('Migration chưa tạo được bảng.');
    process.stdout.write('app_documents: SCHEMA_APPLIED\n');
  }
  if (process.argv.includes('--apply-access')) {
    const [counts] = await sql`
      select count(*)::int as total,
        count(*) filter (where collection = 'users' and auth_uid is not null)::int as users,
        count(*) filter (where collection = 'users'
          and (data ? 'password' or data->'employment' ? 'password'))::int as exposed_passwords
      from public.app_documents
    `;
    if (!counts.total || !counts.users || counts.exposed_passwords) {
      throw new Error('Dữ liệu chưa được chép hoặc hồ sơ còn mật khẩu; không mở quyền trình duyệt.');
    }
    const [policy] = await sql`
      select count(*)::int as count from pg_policies
      where schemaname = 'public' and tablename = 'app_documents'
    `;
    if (policy.count) throw new Error('RLS policy đã tồn tại; kiểm tra thủ công trước khi chạy lại.');
    await sql.unsafe(readFileSync(accessPath, 'utf8'));
    process.stdout.write('app_documents: ACCESS_POLICIES_APPLIED\n');
  }
} catch (error) {
  process.stderr.write(`schema: FAILED ${error?.code || error?.message || 'unknown'}\n`);
  process.exitCode = 1;
} finally {
  await sql.end();
}
