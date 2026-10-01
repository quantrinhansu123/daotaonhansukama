import { createClient } from '@supabase/supabase-js';
import { mkdir, writeFile } from 'node:fs/promises';

function decode(value) {
  if ('stringValue' in value) return value.stringValue;
  if ('integerValue' in value) return Number(value.integerValue);
  if ('doubleValue' in value) return value.doubleValue;
  if ('booleanValue' in value) return value.booleanValue;
  if ('timestampValue' in value) return new Date(value.timestampValue).toISOString();
  if ('nullValue' in value) return null;
  if ('arrayValue' in value) return (value.arrayValue.values || []).map(decode);
  if ('mapValue' in value) return decodeFields(value.mapValue.fields || {});
  throw new Error('Unsupported legacy field type');
}
function decodeFields(fields) {
  return Object.fromEntries(Object.entries(fields).map(([key, value]) => [key, decode(value)]));
}
const client = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY);
const project = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || 'classroom-257dc';
const legacy = [];
let token;
do {
  const url = new URL(`https://firestore.googleapis.com/v1/projects/${project}/databases/(default)/documents/courses`);
  url.searchParams.set('pageSize', '100');
  if (token) url.searchParams.set('pageToken', token);
  const response = await fetch(url);
  const result = await response.json();
  if (!response.ok) throw new Error(result.error?.message || 'Cannot read legacy courses');
  for (const document of result.documents || []) {
    const id = document.name.split('/').pop();
    legacy.push({ collection: 'courses', id, data: { ...decodeFields(document.fields || {}), id } });
  }
  token = result.nextPageToken;
} while (token);
const existing = await client.from('app_documents').select('id,data,version').eq('collection', 'courses');
if (existing.error) throw existing.error;
const ids = new Set(existing.data.map(row => row.id));
const missing = legacy.filter(row => !ids.has(row.id));
console.log(JSON.stringify(missing.map(row => ({ id: row.id, title: row.data.title, category: row.data.category })), null, 2));
if (process.argv.includes('--apply') && missing.length) {
  await mkdir('.local-backups', { recursive: true });
  await writeFile(`.local-backups/courses-before-restore-${Date.now()}.json`, JSON.stringify({ existing: existing.data, restoring: missing }, null, 2));
  const result = await client.from('app_documents').upsert(missing, { onConflict: 'collection,id', ignoreDuplicates: true });
  if (result.error) throw result.error;
  const check = await client.from('app_documents').select('id').eq('collection', 'courses');
  if (check.error) throw check.error;
  if (missing.some(row => !check.data.some(item => item.id === row.id))) throw new Error('Restoration verification failed');
  console.log(`Restored ${missing.length} courses; total ${check.data.length}.`);
}
