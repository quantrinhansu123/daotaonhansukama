import 'server-only';
import { createHash, createHmac, timingSafeEqual } from 'node:crypto';
import { isCloudFlyVideoKey } from '@/lib/cloudfly-s3';

const MAX_TOKEN_SECONDS = 4 * 60 * 60;

function tokenSecret(): Buffer {
  const configured = process.env.VIDEO_TOKEN_SECRET || process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!configured) throw new Error('Missing VIDEO_TOKEN_SECRET or server-side Supabase secret.');
  return createHash('sha256').update('kama-video-access-v1\0').update(configured).digest();
}

function signature(key: string, expiry: number): Buffer {
  return createHmac('sha256', tokenSecret()).update(`${key}\n${expiry}`).digest();
}

export function issueVideoToken(key: string, seconds = MAX_TOKEN_SECONDS): { token: string; expiresAt: number } {
  if (!isCloudFlyVideoKey(key)) throw new Error('Invalid video key.');
  const expiry = Math.floor(Date.now() / 1000) + Math.min(Math.max(seconds, 60), MAX_TOKEN_SECONDS);
  return { token: `${expiry}.${signature(key, expiry).toString('base64url')}`, expiresAt: expiry * 1000 };
}

export function verifyVideoToken(key: string, token: string): boolean {
  if (!isCloudFlyVideoKey(key)) return false;
  const match = /^(\d{10})\.([A-Za-z0-9_-]{43})$/.exec(token);
  if (!match) return false;
  const expiry = Number(match[1]);
  if (expiry < Math.floor(Date.now() / 1000) || expiry > Math.floor(Date.now() / 1000) + MAX_TOKEN_SECONDS) return false;
  const expected = signature(key, expiry);
  const supplied = Buffer.from(match[2], 'base64url');
  return supplied.length === expected.length && timingSafeEqual(supplied, expected);
}
