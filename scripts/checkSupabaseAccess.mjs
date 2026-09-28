const base = process.env.NEXT_PUBLIC_SUPABASE_URL;
const publishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
const secretKey = process.env.SUPABASE_SECRET_KEY;

if (!base || !publishableKey || !secretKey) {
  throw new Error('Thiếu biến Supabase trong .env.local.');
}

for (const [name, path, key] of [
  ['public_auth', '/auth/v1/settings', publishableKey],
  ['admin_auth', '/auth/v1/admin/users?page=1&per_page=1', secretKey],
]) {
  const response = await fetch(new URL(path, base), { headers: { apikey: key } });
  process.stdout.write(`${name}: HTTP ${response.status}\n`);
  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    process.stdout.write(`${name}_error_code: ${String(body.code || 'unknown')}\n`);
    process.exitCode = 1;
  } else if (name === 'admin_auth') {
    const body = await response.json();
    process.stdout.write(`admin_auth_users_first_page: ${Array.isArray(body.users) ? body.users.length : 'unknown'}\n`);
  }
}
