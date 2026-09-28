import { randomUUID } from 'node:crypto';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DeleteObjectCommand, PutObjectCommand } from '@aws-sdk/client-s3';
import { deleteApp, initializeApp } from 'firebase/app';
import { collection, getDocs, getFirestore } from 'firebase/firestore';
import { createClient } from '@supabase/supabase-js';
import ffmpeg from 'ffmpeg-static';
import { CLOUDFLY_VIDEO_PREFIX, getCloudFlyStorage } from '../lib/cloudfly-s3';

const folder = mkdtempSync(join(tmpdir(), 'staff-playback-'));
const videoPath = join(folder, 'staff-720p.mp4');
const firebaseApp = initializeApp({
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
});

async function main() {
  if (!ffmpeg) throw new Error('ffmpeg-static not available');
  execFileSync(ffmpeg, ['-hide_banner', '-loglevel', 'error', '-f', 'lavfi', '-i', 'testsrc2=s=1280x720:r=24',
    '-t', '12', '-an', '-c:v', 'libx264', '-preset', 'ultrafast', '-b:v', '5M',
    '-pix_fmt', 'yuv420p', '-movflags', '+faststart', videoPath]);
  const source = await getDocs(collection(getFirestore(firebaseApp), 'users'));
  const admin = source.docs.find(item => item.data().role === 'admin')?.data();
  const staff = source.docs.find(item => item.data().role === 'staff')?.data();
  if (!admin || !staff) throw new Error('Missing admin or staff source user');
  const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const login = await supabase.auth.signInWithPassword({ email: admin.email, password: admin.password });
  if (login.error) throw new Error('Admin Supabase login failed');
  const courses = await supabase.from('app_documents').select('id,data').eq('collection', 'courses');
  if (courses.error) throw courses.error;
  const course = courses.data.find(item => String(item.data.title || '').toLowerCase().includes('warehouse'));
  if (!course) throw new Error('Warehouse KAMA course not found');
  const { client: storage, bucket } = getCloudFlyStorage();
  const key = `${CLOUDFLY_VIDEO_PREFIX}${randomUUID()}.mp4`;
  const lessonId = `staff_playback_smoke_${randomUUID()}`;
  const title = `Kiểm thử xem bài học ${lessonId.slice(-8)}`;
  let uploaded = false;
  let inserted = false;
  try {
    await storage.send(new PutObjectCommand({ Bucket: bucket, Key: key, Body: readFileSync(videoPath),
      ContentType: 'video/mp4', ContentDisposition: 'inline' }));
    uploaded = true;
    const lesson = { id: lessonId, courseId: course.id, title, description: 'Temporary staff playback test',
      order: -1, tags: [], videoKey: key, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() };
    const result = await supabase.from('app_documents').insert({ collection: 'lessons', id: lessonId, data: lesson });
    if (result.error) throw result.error;
    inserted = true;
    const browser = spawnSync('python', ['scripts/browser_staff_playback.py'], {
      cwd: process.cwd(), stdio: 'inherit', timeout: 120000,
      env: { ...process.env, TEST_APP_URL: process.env.TEST_APP_URL || 'http://localhost:3210',
        TEST_STAFF_EMAIL: staff.email, TEST_STAFF_PASSWORD: staff.password,
        TEST_COURSE_ID: course.id, TEST_LESSON_TITLE: title },
    });
    if (browser.status !== 0) throw new Error(`Staff browser playback failed (${browser.status ?? browser.error?.message ?? 'unknown'})`);
  } finally {
    if (inserted) {
      const removed = await supabase.from('app_documents').delete().eq('collection', 'lessons').eq('id', lessonId);
      if (removed.error) throw removed.error;
      process.stdout.write('Staff test lesson removed.\n');
    }
    if (uploaded) {
      await storage.send(new DeleteObjectCommand({ Bucket: bucket, Key: key }));
      process.stdout.write('Staff test video removed.\n');
    }
    await supabase.auth.signOut();
  }
}

main().catch(error => {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
}).finally(async () => {
  rmSync(folder, { recursive: true, force: true });
  await deleteApp(firebaseApp);
});
