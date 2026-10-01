/* eslint-disable @typescript-eslint/no-explicit-any */
// Document-shaped compatibility API backed by Supabase `app_documents`.
import { getSupabaseClient } from '@/lib/supabase-client';

type StoreRef = { kind: 'collection' | 'document' | 'query'; collection: string; id?: string; clauses?: Clause[] };
type Clause = { kind: 'where' | 'order'; field: string; operator?: string; value?: any; direction?: string };
type Row = { id: string; data: Record<string, any>; version: number };
export type DocumentSnapshot = { id: string; ref: any; version: number; exists: () => boolean; data: () => any };
export type QuerySnapshot = { docs: DocumentSnapshot[]; empty: boolean; size: number };

export const db: any = { kind: 'supabase' };

class CompatTimestamp extends Date {
  toDate() { return new Date(this.getTime()); }
}

function revive(value: any): any {
  if (typeof value === 'string' && /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d+)?Z$/.test(value)) {
    return new CompatTimestamp(value);
  }
  if (Array.isArray(value)) return value.map(revive);
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, revive(item)]));
  return value;
}

function snapshot(ref: StoreRef, row?: Row): DocumentSnapshot {
  return {
    id: row?.id || ref.id || '',
    ref,
    version: row?.version || 0,
    exists: () => Boolean(row),
    data: (): any => row ? revive(row.data) : undefined,
  };
}

function fail(error: { message: string } | null) {
  if (error) throw new Error(error.message);
}

export function collection(_db: any, name: string): any {
  return { kind: 'collection', collection: name } as StoreRef;
}

export function doc(_db: any, name: string, id: string): any {
  return { kind: 'document', collection: name, id } as StoreRef;
}

export function where(field: string, operator: string, value: any): any {
  return { kind: 'where', field, operator, value } as Clause;
}

export function orderBy(field: string, direction: 'asc' | 'desc' = 'asc'): any {
  return { kind: 'order', field, direction } as Clause;
}

export function query(ref: any, ...clauses: any[]): any {
  return { kind: 'query', collection: ref.collection, clauses } as StoreRef;
}

const JSON_FIELD = /^[A-Za-z_][A-Za-z0-9_]*$/;

function comparable(value: any) {
  return value instanceof Date ? value.toISOString() : value;
}

function matchesWhere(row: Row, clause: Clause) {
  const item = clause.field === '__name__' ? row.id : row.data?.[clause.field];
  const actual = comparable(item);
  const expected = comparable(clause.value);
  if (clause.operator === '==') return actual === expected;
  if (clause.operator === '>=') return actual >= expected;
  if (clause.operator === '<=') return actual <= expected;
  if (clause.operator === 'array-contains') return Array.isArray(item) && item.includes(expected);
  throw new Error(`Bộ lọc Supabase chưa hỗ trợ: ${clause.operator}`);
}

function applyServerFilters(request: any, clauses: Clause[]) {
  const equals: Record<string, unknown> = {};
  for (const clause of clauses) {
    if (clause.kind !== 'where') continue;
    if (clause.field === '__name__') {
      if (clause.operator !== '==') throw new Error(`Bộ lọc Supabase chưa hỗ trợ: ${clause.operator}`);
      request = request.eq('id', String(clause.value ?? ''));
      continue;
    }
    if (!JSON_FIELD.test(clause.field)) throw new Error(`Bộ lọc không hợp lệ: ${clause.field}`);
    const expected = comparable(clause.value);
    if (clause.operator === '==') equals[clause.field] = expected;
    else if (clause.operator === 'array-contains') equals[clause.field] = [expected];
    else if ((clause.operator === '>=' || clause.operator === '<=') && typeof expected === 'string') {
      request = request.filter(`data->>${clause.field}`, clause.operator === '>=' ? 'gte' : 'lte', expected);
    } else if (clause.operator !== '>=' && clause.operator !== '<=') {
      throw new Error(`Bộ lọc Supabase chưa hỗ trợ: ${clause.operator}`);
    }
  }
  if (Object.keys(equals).length > 0) request = request.contains('data', equals);
  return request;
}

export async function getDocs(ref: any): Promise<QuerySnapshot> {
  const target = ref as StoreRef;
  const client = getSupabaseClient();
  const clauses = target.clauses || [];
  const rows: Row[] = [];
  for (let from = 0; ; from += 1000) {
    const request = applyServerFilters(
      client.from('app_documents').select('id,data,version').eq('collection', target.collection),
      clauses,
    );
    const result = await request.order('id').range(from, from + 999);
    fail(result.error);
    rows.push(...(result.data || []) as Row[]);
    if (!result.data || result.data.length < 1000) break;
  }
  let filtered = rows.filter(row => clauses.every(clause => clause.kind !== 'where' || matchesWhere(row, clause)));
  for (const clause of clauses.filter(item => item.kind === 'order').reverse()) {
    filtered = filtered.sort((a, b) => {
      const left = clause.field === '__name__' ? a.id : a.data[clause.field];
      const right = clause.field === '__name__' ? b.id : b.data[clause.field];
      return (left < right ? -1 : left > right ? 1 : 0) * (clause.direction === 'desc' ? -1 : 1);
    });
  }
  const docs = filtered.map(row => snapshot({ kind: 'document', collection: ref.collection, id: row.id }, row));
  return { docs, empty: docs.length === 0, size: docs.length };
}

export async function listJsonText(collectionName: string, field: string): Promise<string[]> {
  if (!JSON_FIELD.test(field)) throw new Error(`Bộ lọc không hợp lệ: ${field}`);
  const client = getSupabaseClient();
  const values: string[] = [];
  for (let from = 0; ; from += 1000) {
    const result = await client.from('app_documents')
      .select(`id, value:data->>${field}`)
      .eq('collection', collectionName)
      .order('id')
      .range(from, from + 999);
    if (result.error) {
      if (from > 0) fail(result.error);
      const snapshot = await getDocs(collection(db, collectionName));
      return snapshot.docs.map(item => String(item.data()?.[field] || '')).filter(Boolean);
    }
    for (const row of (result.data || []) as Array<{ value?: string | null }>) {
      if (row.value) values.push(row.value);
    }
    if (!result.data || result.data.length < 1000) break;
  }
  return values;
}

export async function getDoc(ref: any): Promise<DocumentSnapshot> {
  const target = ref as StoreRef;
  const result = await getSupabaseClient().from('app_documents')
    .select('id,data,version').eq('collection', target.collection).eq('id', target.id!).maybeSingle();
  fail(result.error);
  return snapshot(target, result.data as Row | undefined);
}

type Sentinel = { __operation: 'delete' | 'union' | 'remove'; values?: any[] };
const isSentinel = (value: any): value is Sentinel => value && typeof value === 'object' && '__operation' in value;

function applyPatch(current: Record<string, any>, patch: Record<string, any>): Record<string, any> {
  const result = { ...current };
  for (const [key, value] of Object.entries(patch)) {
    if (isSentinel(value)) {
      if (value.__operation === 'delete') delete result[key];
      else if (value.__operation === 'union') {
        const existing = Array.isArray(result[key]) ? result[key] : [];
        result[key] = [...existing];
        for (const item of value.values || []) {
          if (!result[key].some((old: any) => JSON.stringify(old) === JSON.stringify(item))) result[key].push(item);
        }
      } else if (value.__operation === 'remove') {
        result[key] = (Array.isArray(result[key]) ? result[key] : [])
          .filter((old: any) => !(value.values || []).some(item => JSON.stringify(old) === JSON.stringify(item)));
      }
    } else if (value !== undefined) result[key] = value;
  }
  return result;
}

async function saveWithRetry(ref: StoreRef, patch: Record<string, any>, merge: boolean, createIfMissing: boolean) {
  const client = getSupabaseClient();
  for (let attempt = 0; attempt < 5; attempt++) {
    const current = await getDoc(ref);
    if (!current.exists()) {
      if (!createIfMissing) throw new Error('Không tìm thấy hồ sơ để cập nhật.');
      const data = applyPatch({}, patch);
      const inserted = await client.from('app_documents').insert({ collection: ref.collection, id: ref.id!, data });
      if (!inserted.error) return;
      if (inserted.error.code === '23505') continue;
      fail(inserted.error);
    } else {
      const data = merge ? applyPatch(current.data(), patch) : applyPatch({}, patch);
      const updated = await client.from('app_documents').update({ data })
        .eq('collection', ref.collection).eq('id', ref.id!).eq('version', current.version).select('id');
      fail(updated.error);
      if (updated.data?.length) return;
    }
  }
  throw new Error('Dữ liệu thay đổi cùng lúc; vui lòng thử lại.');
}

export async function setDoc(ref: any, data: Record<string, any>, options?: { merge?: boolean }): Promise<void> {
  await saveWithRetry(ref, data, Boolean(options?.merge), true);
}

export async function updateDoc(ref: any, data: Record<string, any>): Promise<void> {
  await saveWithRetry(ref, data, true, false);
}

export async function deleteDoc(ref: any): Promise<void> {
  const target = ref as StoreRef;
  const result = await getSupabaseClient().from('app_documents').delete()
    .eq('collection', target.collection).eq('id', target.id!);
  fail(result.error);
}

export function arrayUnion(...values: any[]): any {
  return { __operation: 'union', values } as Sentinel;
}

export function arrayRemove(...values: any[]): any {
  return { __operation: 'remove', values } as Sentinel;
}

export function deleteField(): any {
  return { __operation: 'delete' } as Sentinel;
}

export function serverTimestamp(): any {
  return new Date();
}

export async function runTransaction<T>(_db: any, callback: (transaction: any) => Promise<T>): Promise<T> {
  for (let attempt = 0; attempt < 5; attempt++) {
    const writes: Array<{ ref: StoreRef; data: Record<string, any>; version: number }> = [];
    const reads = new Map<string, number>();
    const transaction = {
      get: async (ref: StoreRef) => {
        const item = await getDoc(ref);
        reads.set(`${ref.collection}/${ref.id}`, item.version);
        return item;
      },
      set: (ref: StoreRef, data: Record<string, any>) => writes.push({ ref, data, version: 0 }),
    };
    const result = await callback(transaction);
    if (writes.length > 1) throw new Error('Giao dịch Supabase chỉ hỗ trợ một hồ sơ trong lần chuyển đổi này.');
    if (!writes.length) return result;
    const write = writes[0];
    const current = await getDoc(write.ref);
    if (reads.get(`${write.ref.collection}/${write.ref.id}`) !== current.version) continue;
    write.version = current.version;
    const client = getSupabaseClient();
    if (!current.exists()) {
      const inserted = await client.from('app_documents').insert({
        collection: write.ref.collection, id: write.ref.id!, data: write.data,
      });
      if (!inserted.error) return result;
      if (inserted.error.code === '23505') continue;
      fail(inserted.error);
    } else {
      const updated = await client.from('app_documents').update({ data: write.data })
        .eq('collection', write.ref.collection).eq('id', write.ref.id!).eq('version', write.version).select('id');
      fail(updated.error);
      if (updated.data?.length) return result;
    }
  }
  throw new Error('Không lưu được tiến độ do dữ liệu thay đổi cùng lúc.');
}
