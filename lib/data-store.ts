/* eslint-disable @typescript-eslint/no-explicit-any */
// Compatibility layer for the current document-shaped UI during the Postgres
// migration. The Supabase branch preserves legacy document IDs and field names.
import * as firebase from 'firebase/firestore';
import { db as firebaseDb } from '@/lib/firebase';
import { getSupabaseClient } from '@/lib/supabase-client';

const useSupabase = process.env.NEXT_PUBLIC_SUPABASE_ENABLED === 'true';
type StoreRef = { kind: 'collection' | 'document' | 'query'; collection: string; id?: string; clauses?: Clause[] };
type Clause = { kind: 'where' | 'order'; field: string; operator?: string; value?: any; direction?: string };
type Row = { id: string; data: Record<string, any>; version: number };
export type DocumentSnapshot = { id: string; ref: any; version: number; exists: () => boolean; data: () => any };
export type QuerySnapshot = { docs: DocumentSnapshot[]; empty: boolean; size: number };

export const db: any = useSupabase ? { kind: 'supabase' } : firebaseDb;

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
  return useSupabase ? { kind: 'collection', collection: name } as StoreRef : firebase.collection(firebaseDb, name);
}

export function doc(_db: any, name: string, id: string): any {
  return useSupabase ? { kind: 'document', collection: name, id } as StoreRef : firebase.doc(firebaseDb, name, id);
}

export function where(field: string, operator: string, value: any): any {
  return useSupabase ? { kind: 'where', field, operator, value } as Clause : firebase.where(field, operator as firebase.WhereFilterOp, value);
}

export function orderBy(field: string, direction: 'asc' | 'desc' = 'asc'): any {
  return useSupabase ? { kind: 'order', field, direction } as Clause : firebase.orderBy(field, direction);
}

export function query(ref: any, ...clauses: any[]): any {
  return useSupabase ? { kind: 'query', collection: ref.collection, clauses } as StoreRef : firebase.query(ref, ...clauses);
}

export async function getDocs(ref: any): Promise<QuerySnapshot> {
  if (!useSupabase) return firebase.getDocs(ref) as unknown as Promise<QuerySnapshot>;
  const client = getSupabaseClient();
  const rows: Row[] = [];
  for (let from = 0; ; from += 1000) {
    const result = await client.from('app_documents')
      .select('id,data,version').eq('collection', (ref as StoreRef).collection)
      .order('id').range(from, from + 999);
    fail(result.error);
    rows.push(...(result.data || []) as Row[]);
    if (!result.data || result.data.length < 1000) break;
  }
  const clauses = (ref as StoreRef).clauses || [];
  let filtered = rows.filter(row => clauses.every(clause => {
    if (clause.kind !== 'where') return true;
    const item = clause.field === '__name__' ? row.id : row.data[clause.field];
    const actual = item instanceof Date ? item.toISOString() : item;
    const expected = clause.value instanceof Date ? clause.value.toISOString() : clause.value;
    if (clause.operator === '==') return actual === expected;
    if (clause.operator === '>=') return actual >= expected;
    if (clause.operator === '<=') return actual <= expected;
    throw new Error(`Bộ lọc Supabase chưa hỗ trợ: ${clause.operator}`);
  }));
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

export async function getDoc(ref: any): Promise<DocumentSnapshot> {
  if (!useSupabase) return firebase.getDoc(ref) as unknown as Promise<DocumentSnapshot>;
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
  if (!useSupabase) {
    if (options) return firebase.setDoc(ref, data, options);
    return firebase.setDoc(ref, data);
  }
  await saveWithRetry(ref, data, Boolean(options?.merge), true);
}

export async function updateDoc(ref: any, data: Record<string, any>): Promise<void> {
  if (!useSupabase) return firebase.updateDoc(ref, data);
  await saveWithRetry(ref, data, true, false);
}

export async function deleteDoc(ref: any): Promise<void> {
  if (!useSupabase) return firebase.deleteDoc(ref);
  const target = ref as StoreRef;
  const result = await getSupabaseClient().from('app_documents').delete()
    .eq('collection', target.collection).eq('id', target.id!);
  fail(result.error);
}

export function arrayUnion(...values: any[]): any {
  return useSupabase ? { __operation: 'union', values } as Sentinel : firebase.arrayUnion(...values);
}

export function arrayRemove(...values: any[]): any {
  return useSupabase ? { __operation: 'remove', values } as Sentinel : firebase.arrayRemove(...values);
}

export function deleteField(): any {
  return useSupabase ? { __operation: 'delete' } as Sentinel : firebase.deleteField();
}

export function serverTimestamp(): any {
  return useSupabase ? new Date() : firebase.serverTimestamp();
}

export async function runTransaction<T>(_db: any, callback: (transaction: any) => Promise<T>): Promise<T> {
  if (!useSupabase) return firebase.runTransaction(firebaseDb, callback);
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
