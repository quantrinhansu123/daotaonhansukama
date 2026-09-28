import { deleteApp, initializeApp } from 'firebase/app';
import { collection, getDocs, getFirestore, Timestamp } from 'firebase/firestore';
import postgres from 'postgres';
import { createClient } from '@supabase/supabase-js';

const collections = [
  'users', 'courses', 'lessons', 'progress', 'questions', 'quizResults',
  'enrollments', 'departments', 'salaryRecords', 'companySettings',
  'attendanceRecords', 'monthlySalaries', 'projects',
] as const;

type SourceDocument = { collection: string; id: string; data: Record<string, unknown> };
type LegacyUser = { id: string; email: string; password: string; displayName: string };

function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.entries(value).sort(([a], [b]) => a.localeCompare(b))
      .map(([key, item]) => `${JSON.stringify(key)}:${canonical(item)}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

function serialize(value: unknown): unknown {
  if (value instanceof Timestamp) return value.toDate().toISOString();
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value)) return value.map(serialize);
  if (value && typeof value === 'object') {
    const result: Record<string, unknown> = {};
    for (const [key, item] of Object.entries(value)) {
      if (item !== undefined) result[key] = serialize(item);
    }
    return result;
  }
  return value;
}

function dbConnectionString(): string {
  const raw = process.env.SUPABASE_DB_URL;
  const projectRef = new URL(process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://invalid.example').hostname.split('.')[0];
  if (!raw) throw new Error('Thiếu SUPABASE_DB_URL.');
  const parsed = new URL(raw);
  if (!['postgres:', 'postgresql:'].includes(parsed.protocol)
      || !parsed.password
      || parsed.password.includes('YOUR-PASSWORD')
      || !parsed.hostname.endsWith('.supabase.com')
      || !(parsed.hostname.includes(projectRef) || decodeURIComponent(parsed.username).includes(projectRef))) {
    throw new Error('SUPABASE_DB_URL không thuộc dự án Supabase đang cấu hình.');
  }
  return raw;
}

async function main() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const secret = process.env.SUPABASE_SECRET_KEY;
  if (!url || !secret) throw new Error('Thiếu Supabase URL hoặc server secret key.');
  const sql = postgres(dbConnectionString(), { max: 1, prepare: false, ssl: 'require', connect_timeout: 10 });
  const firebaseApp = initializeApp({
    apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
    authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
    projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  });
  const firebaseDb = getFirestore(firebaseApp);
  const supabase = createClient(url, secret, {
    auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false },
  });

  try {
    const [table] = await sql`select to_regclass('public.app_documents')::text as name`;
    if (!table.name) throw new Error('Chưa tạo bảng app_documents; chạy applySupabaseSchema.mjs --apply.');

    const documents: SourceDocument[] = [];
    const legacyUsers: LegacyUser[] = [];
    const emails = new Set<string>();
    for (const name of collections) {
      const snapshot = await getDocs(collection(firebaseDb, name));
      process.stdout.write(`${name}: ${snapshot.size}\n`);
      for (const item of snapshot.docs) {
        const raw = item.data();
        if (name === 'users') {
          const email = String(raw.email || '').trim().toLowerCase();
          const password = typeof raw.password === 'string' ? raw.password.trim() : '';
          if (raw.uid !== item.id || !email || password.length < 6 || emails.has(email)) {
            throw new Error(`Hồ sơ ${item.id} thiếu UID/email/mật khẩu hợp lệ hoặc bị trùng email.`);
          }
          emails.add(email);
          legacyUsers.push({ id: item.id, email, password, displayName: String(raw.displayName || '') });
        }
        const data = serialize(raw) as Record<string, unknown>;
        if (name === 'users') {
          delete data.password;
          if (data.employment && typeof data.employment === 'object') {
            const employment = { ...(data.employment as Record<string, unknown>) };
            delete employment.password;
            data.employment = employment;
          }
        }
        documents.push({ collection: name, id: item.id, data });
      }
    }

    const existingAuth = new Map<string, { id: string; legacyUid?: string }>();
    for (let page = 1; ; page++) {
      const { data, error } = await supabase.auth.admin.listUsers({ page, perPage: 1000 });
      if (error) throw error;
      for (const user of data.users) {
        if (user.email) existingAuth.set(user.email.toLowerCase(), {
          id: user.id,
          legacyUid: typeof user.user_metadata?.legacy_uid === 'string' ? user.user_metadata.legacy_uid : undefined,
        });
      }
      if (data.users.length < 1000) break;
    }
    for (const user of legacyUsers) {
      const existing = existingAuth.get(user.email);
      if (existing && existing.legacyUid !== user.id) {
        throw new Error(`Email của hồ sơ ${user.id} đã có tài khoản Supabase Auth khác.`);
      }
    }
    process.stdout.write(`Supabase Auth: ${legacyUsers.filter(user => existingAuth.has(user.email)).length}/${legacyUsers.length} tài khoản đã có.\n`);

    const [existingCount] = await sql`select count(*)::int as count from public.app_documents`;
    process.stdout.write(`Supabase documents hiện có: ${existingCount.count}\n`);
    if (!process.argv.includes('--apply')) {
      process.stdout.write('Kiểm tra xong. Dùng --apply để tạo tài khoản và chép dữ liệu.\n');
      return;
    }

    // Auth creation is outside the SQL transaction. The legacy_uid marker lets
    // an interrupted run resume without claiming an unrelated account.
    for (const user of legacyUsers) {
      if (existingAuth.has(user.email)) continue;
      const { data, error } = await supabase.auth.admin.createUser({
        email: user.email,
        password: user.password,
        email_confirm: true,
        user_metadata: { legacy_uid: user.id, display_name: user.displayName },
      });
      if (error || !data.user) throw error || new Error(`Không tạo được Auth UID cho ${user.id}.`);
      existingAuth.set(user.email, { id: data.user.id, legacyUid: user.id });
      process.stdout.write(`Đã tạo Supabase Auth cho hồ sơ ${user.id}.\n`);
    }

    const authUidByLegacy = new Map(legacyUsers.map(user => [user.id, existingAuth.get(user.email)!.id]));
    const currentRows = await sql`select collection, id, data from public.app_documents`;
    const baselineRows = await sql`select collection, id, data from public.migration_source_state`;
    const keyOf = (collection: string, id: string) => `${collection}/${id}`;
    const sourceKeys = new Set(documents.map(item => keyOf(item.collection, item.id)));
    const currentByKey = new Map(currentRows.map(row => [keyOf(row.collection, row.id), row.data]));
    const baselineByKey = new Map(baselineRows.map(row => [keyOf(row.collection, row.id), row.data]));
    for (const key of currentByKey.keys()) {
      if (!sourceKeys.has(key)) throw new Error(`${key}: chỉ có trên Supabase; cần kiểm tra trước khi đồng bộ nguồn Firebase.`);
    }
    await sql.begin(async tx => {
      for (const item of documents) {
        const key = keyOf(item.collection, item.id);
        const current = currentByKey.get(key);
        const baseline = baselineByKey.get(key);
        const authUid = item.collection === 'users' ? (authUidByLegacy.get(item.id) || null) : null;
        const serialized = sql.json(item.data as Parameters<typeof sql.json>[0]);
        if (current === undefined) {
          await tx`insert into public.app_documents (collection, id, data, auth_uid)
            values (${item.collection}, ${item.id}, ${serialized}, ${authUid})`;
        } else if (canonical(current) !== canonical(item.data)) {
          if (baseline === undefined || canonical(current) !== canonical(baseline)) {
            throw new Error(`${key}: dữ liệu Supabase đã được sửa; không ghi đè bằng Firebase.`);
          }
          const updated = await tx`update public.app_documents set data = ${serialized}
            where collection = ${item.collection} and id = ${item.id}
              and data = ${sql.json(baseline as Parameters<typeof sql.json>[0])}
            returning id`;
          if (updated.length !== 1) throw new Error(`${key}: dữ liệu thay đổi trong khi đồng bộ.`);
        }
        await tx`insert into public.migration_source_state (collection, id, data)
          values (${item.collection}, ${item.id}, ${serialized})
          on conflict (collection, id) do update set data = excluded.data`;
      }
    });

    const counts = await sql`select collection, count(*)::int as count from public.app_documents group by collection`;
    for (const name of collections) {
      const expected = documents.filter(item => item.collection === name).length;
      const actual = counts.find(row => row.collection === name)?.count || 0;
      if (expected !== actual) throw new Error(`${name}: Supabase có ${actual}/${expected} hồ sơ.`);
    }
    const copied = await sql`select collection, id, data from public.app_documents`;
    const byId = new Map(copied.map(row => [`${row.collection}/${row.id}`, canonical(row.data)]));
    for (const item of documents) {
      if (byId.get(`${item.collection}/${item.id}`) !== canonical(item.data)) {
        throw new Error(`${item.collection}/${item.id}: nguồn Firebase và bản Supabase khác nhau; không ghi đè thay đổi trên Supabase.`);
      }
    }
    const [passwords] = await sql`
      select count(*)::int as count from public.app_documents
      where collection = 'users' and (data ? 'password' or data->'employment' ? 'password')
    `;
    if (passwords.count) throw new Error('Bản Supabase vẫn có trường mật khẩu trong hồ sơ.');
    process.stdout.write(`Đã chép và kiểm tra ${documents.length} hồ sơ; mật khẩu không nằm trong app_documents.\n`);
  } finally {
    await Promise.all([sql.end(), deleteApp(firebaseApp)]);
  }
}

main().catch(error => {
  process.stderr.write(`Migration failed: ${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
});
