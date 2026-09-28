import { randomUUID } from 'node:crypto';
import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { AbortMultipartUploadCommand, DeleteObjectCommand, HeadObjectCommand } from '@aws-sdk/client-s3';
import { deleteApp, initializeApp } from 'firebase/app';
import { collection, getDocs, getFirestore } from 'firebase/firestore';
import { createClient } from '@supabase/supabase-js';
import ffmpeg from 'ffmpeg-static';
import { getCloudFlyStorage } from '../lib/cloudfly-s3';

const folder = mkdtempSync(join(tmpdir(), 'browser-upload-'));
const videoPath = join(folder, 'preview-720p.mp4');
const sessionPath = join(folder, 'session.json');
const firebaseApp = initializeApp({
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
});

async function main() {
  if (!ffmpeg) throw new Error('ffmpeg-static not available');
  execFileSync(ffmpeg, ['-hide_banner', '-loglevel', 'error', '-f', 'lavfi',
    '-i', 'testsrc2=s=1280x720:r=24', '-t', '12', '-an', '-c:v', 'libx264',
    '-preset', 'ultrafast', '-b:v', '5M', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', videoPath]);
  const source = await getDocs(collection(getFirestore(firebaseApp), 'users'));
  const admin = source.docs.find(item => item.data().role === 'admin')?.data();
  if (!admin) throw new Error('Missing admin account');
  const client = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const login = await client.auth.signInWithPassword({ email: admin.email, password: admin.password });
  if (login.error) throw new Error('Supabase admin login failed');
  const courses = await client.from('app_documents').select('id,data').eq('collection', 'courses');
  if (courses.error) throw courses.error;
  const course = courses.data.find(item => String(item.data.title || '').toLowerCase().includes('warehouse'));
  if (!course) throw new Error('Warehouse KAMA course not found');
  const lessonId = `browser_video_smoke_${randomUUID()}`;
  const title = `Kiểm thử tải nền ${lessonId.slice(-8)}`;
  const lesson = { id: lessonId, courseId: course.id, title,
    description: 'Temporary browser upload test', order: 9999, tags: [],
    createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() };
  const inserted = await client.from('app_documents').insert({ collection: 'lessons', id: lessonId, data: lesson });
  if (inserted.error) throw inserted.error;
  try {
    const result = spawnSync('python', ['scripts/browser_video_upload.py'], {
      cwd: process.cwd(), stdio: 'inherit', timeout: 300000,
      env: { ...process.env, TEST_APP_URL: process.env.TEST_APP_URL || 'http://localhost:3210',
        TEST_ADMIN_EMAIL: admin.email, TEST_ADMIN_PASSWORD: admin.password,
        TEST_COURSE_TITLE: course.data.title, TEST_LESSON_TITLE: title,
        TEST_VIDEO_PATH: videoPath, TEST_SESSION_PATH: sessionPath },
    });
    if (result.status !== 0) throw new Error(`Browser upload failed (${result.status ?? result.error?.message ?? 'unknown'})`);
    const saved = await client.from('app_documents').select('data').eq('collection', 'lessons').eq('id', lessonId).single();
    if (saved.error || !saved.data.data.videoKey) throw new Error('Browser upload did not save videoKey in the lesson');
    process.stdout.write('Supabase lesson saved browser-uploaded CloudFly video: PASS\n');
  } finally {
    const removed = await client.from('app_documents').delete().eq('collection', 'lessons').eq('id', lessonId);
    if (removed.error) throw removed.error;
    process.stdout.write('Browser test lesson removed.\n');
    if (existsSync(sessionPath)) {
      const session = JSON.parse(readFileSync(sessionPath, 'utf8')) as { key: string; uploadId: string };
      const { client: storage, bucket } = getCloudFlyStorage();
      try {
        await storage.send(new HeadObjectCommand({ Bucket: bucket, Key: session.key }));
        await storage.send(new DeleteObjectCommand({ Bucket: bucket, Key: session.key }));
        process.stdout.write('Browser test video removed.\n');
      } catch {
        await storage.send(new AbortMultipartUploadCommand({ Bucket: bucket, Key: session.key, UploadId: session.uploadId })).catch(() => {});
        process.stdout.write('Browser test multipart session aborted.\n');
      }
    }
    await client.auth.signOut();
  }
}

main().catch(error => {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
}).finally(async () => {
  rmSync(folder, { recursive: true, force: true });
  await deleteApp(firebaseApp);
});
