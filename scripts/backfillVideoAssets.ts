import { createClient } from '@supabase/supabase-js';
import { isCloudFlyVideoKey } from '../lib/cloudfly-s3';
import { queueVideoAsset } from '../lib/video-assets-server';

const courseId = process.argv.find(arg => arg.startsWith('--course-id='))?.slice('--course-id='.length);
const sourceKey = process.argv.find(arg => arg.startsWith('--key='))?.slice('--key='.length);
const introOnly = process.argv.includes('--intro-only');
let client: ReturnType<typeof createClient> | null = null;

function supabaseClient() {
  if (client) return client;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const secret = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !secret) throw new Error('Missing Supabase configuration for video backfill.');
  client = createClient(url, secret, { auth: { persistSession: false, autoRefreshToken: false } });
  return client;
}

async function rows(collection: 'courses' | 'lessons'): Promise<Array<{ id: string; data: Record<string, unknown> }>> {
  const result: Array<{ id: string; data: Record<string, unknown> }> = [];
  for (let from = 0; ; from += 500) {
    let query = supabaseClient().from('app_documents').select('id,data')
      .eq('collection', collection).order('id').range(from, from + 499);
    if (collection === 'courses' && courseId) query = query.eq('id', courseId);
    if (collection === 'lessons' && courseId) query = query.contains('data', { courseId });
    const { data, error } = await query;
    if (error) throw error;
    result.push(...(data || []) as Array<{ id: string; data: Record<string, unknown> }>);
    if (!data || data.length < 500) break;
  }
  return result;
}

async function main() {
  if (sourceKey) {
    if (!isCloudFlyVideoKey(sourceKey)) throw new Error('Invalid CloudFly video key.');
    await queueVideoAsset(sourceKey);
    console.info('[video-backfill] queued selected video');
    return;
  }
  const courses = await rows('courses');
  const lessons = introOnly ? [] : await rows('lessons');
  const keys = new Set<string>();
  for (const course of courses) {
    const key = course.data.demoVideoKey;
    if (typeof key === 'string' && isCloudFlyVideoKey(key)) keys.add(key);
  }
  for (const lesson of lessons) {
    const key = lesson.data.videoKey;
    if (typeof key === 'string' && isCloudFlyVideoKey(key)) keys.add(key);
  }
  let queued = 0;
  for (const key of keys) {
    await queueVideoAsset(key);
    queued++;
  }
  console.info('[video-backfill] queued', { courses: courses.length, lessons: lessons.length, uniqueVideos: queued });
}

main().catch(error => {
  console.error('[video-backfill] failed:', error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
