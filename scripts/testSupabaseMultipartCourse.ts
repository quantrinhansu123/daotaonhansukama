import { randomUUID } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DeleteObjectCommand } from '@aws-sdk/client-s3';
import { deleteApp, initializeApp } from 'firebase/app';
import { collection, getDocs, getFirestore } from 'firebase/firestore';
import { createClient } from '@supabase/supabase-js';
import ffmpeg from 'ffmpeg-static';
import { getCloudFlyStorage } from '../lib/cloudfly-s3';

const base = process.env.TEST_APP_URL || 'http://localhost:3210';
const longVideo = process.argv.includes('--ten-minute');
const duration = longVideo ? 600 : 2;
const folder = mkdtempSync(join(tmpdir(), 'course-video-'));
const videoPath = join(folder, `${randomUUID()}.mp4`);
const firebaseApp = initializeApp({
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
});

async function main() {
  if (!ffmpeg) throw new Error('ffmpeg-static not available');
  const started = Date.now();
  execFileSync(ffmpeg, ['-hide_banner', '-loglevel', 'error', '-f', 'lavfi',
    '-i', longVideo ? 'testsrc2=s=640x360:r=15' : 'testsrc2=s=1280x720:r=24',
    '-t', String(duration), '-an', '-c:v', 'libx264', '-preset', 'ultrafast',
    ...(longVideo ? ['-b:v', '1200k', '-maxrate', '1200k', '-bufsize', '2400k'] : []),
    '-pix_fmt', 'yuv420p', '-movflags', '+faststart', videoPath]);
  const bytes = readFileSync(videoPath);
  process.stdout.write(`Generated ${duration}s MP4 (${(bytes.length / 1048576).toFixed(1)} MiB) in ${((Date.now() - started) / 1000).toFixed(1)}s.\n`);
  const source = await getDocs(collection(getFirestore(firebaseApp), 'users'));
  const admin = source.docs.find(item => item.data().role === 'admin')?.data();
  const student = source.docs.find(item => item.data().role === 'student')?.data();
  if (!admin || !student) throw new Error('Missing admin or student source user');
  const client = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const login = await client.auth.signInWithPassword({ email: admin.email, password: admin.password });
  if (login.error || !login.data.session) throw new Error('Admin Supabase login failed');
  const headers = { Authorization: `Bearer ${login.data.session.access_token}`, 'Content-Type': 'application/json' };
  const courses = await client.from('app_documents').select('id,data').eq('collection', 'courses');
  if (courses.error) throw courses.error;
  const course = courses.data.find(item => String(item.data.title || '').toLowerCase().includes('warehouse')) || courses.data[0];
  if (!course) throw new Error('No course available');
  let key: string | undefined;
  let uploadId: string | undefined;
  let completed = false;
  let lessonId: string | undefined;
  try {
    const init = await fetch(`${base}/api/cloudfly/video/multipart`, {
      method: 'POST', headers, body: JSON.stringify({ mime: 'video/mp4', size: bytes.length }),
    });
    const session = await init.json();
    if (init.status !== 200 || !session.key || !session.uploadId) throw new Error(`Multipart start failed (${init.status})`);
    key = session.key;
    uploadId = session.uploadId;
    if (session.urls.length !== Math.ceil(bytes.length / session.partSize)) throw new Error('Incorrect part count');
    const preflight = await fetch(session.urls[0], {
      method: 'OPTIONS', headers: { Origin: base, 'Access-Control-Request-Method': 'PUT' },
    });
    const allowOrigin = preflight.headers.get('access-control-allow-origin');
    if (!preflight.ok || (allowOrigin !== '*' && allowOrigin !== base)) {
      throw new Error(`CloudFly browser CORS failed (${preflight.status})`);
    }
    const transferStarted = Date.now();
    let next = 0;
    const parts: Array<{ partNumber: number; etag: string }> = new Array(session.urls.length);
    const worker = async () => {
      while (next < session.urls.length) {
        const index = next++;
        const part = bytes.subarray(index * session.partSize, Math.min(bytes.length, (index + 1) * session.partSize));
        let uploaded: Response | undefined;
        for (let attempt = 0; attempt < 3; attempt++) {
          uploaded = await fetch(session.urls[index], { method: 'PUT', body: part }).catch(() => undefined);
          if (uploaded?.ok) break;
        }
        const etag = uploaded?.headers.get('etag');
        if (!uploaded?.ok || !etag) throw new Error(`Part ${index + 1} failed (${uploaded?.status || 'network'})`);
        parts[index] = { partNumber: index + 1, etag };
      }
    };
    await Promise.all(Array.from({ length: Math.min(3, session.urls.length) }, worker));
    const finish = await fetch(`${base}/api/cloudfly/video/multipart`, {
      method: 'PATCH', headers, body: JSON.stringify({ key, uploadId, size: bytes.length, parts }),
    });
    const finished = await finish.json();
    if (finish.status !== 200 || finished.key !== key || finished.size !== bytes.length) {
      throw new Error(`Multipart complete failed (${finish.status}: ${finished.error || 'unexpected result'})`);
    }
    completed = true;
    process.stdout.write(`CloudFly transfer: ${(bytes.length / 1048576 / ((Date.now() - transferStarted) / 1000)).toFixed(2)} MiB/s, ${parts.length} part(s).\n`);

    lessonId = `supabase_video_smoke_${randomUUID()}`;
    const lesson = { id: lessonId, courseId: course.id, title: 'Kiểm thử video CloudFly',
      description: 'Temporary test; delete after verification', order: 9999, tags: [], videoKey: key,
      createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() };
    const inserted = await client.from('app_documents').insert({ collection: 'lessons', id: lessonId, data: lesson });
    if (inserted.error) throw inserted.error;
    const studentClient = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const studentLogin = await studentClient.auth.signInWithPassword({ email: student.email, password: student.password });
    if (studentLogin.error) throw new Error('Student Supabase login failed');
    const visible = await studentClient.from('app_documents').select('data').eq('collection', 'lessons').eq('id', lessonId).single();
    if (visible.error || visible.data.data.videoKey !== key) throw new Error('Student cannot see course lesson video');
    const redirect = await fetch(`${base}/api/cloudfly/video/play?key=${encodeURIComponent(key!)}`, { redirect: 'manual' });
    if (redirect.status !== 307) throw new Error(`Playback redirect failed (${redirect.status})`);
    const signedUrl = redirect.headers.get('location');
    if (!signedUrl) throw new Error('Missing playback URL');
    const range = await fetch(signedUrl, { headers: { Range: 'bytes=0-1023' } });
    const head = Buffer.from(await range.arrayBuffer());
    if (range.status !== 206 || !head.equals(bytes.subarray(0, 1024))) throw new Error('Playback bytes do not match original video');
    if (!longVideo) {
      const whole = Buffer.from(await (await fetch(signedUrl)).arrayBuffer());
      if (!whole.equals(bytes)) throw new Error('CloudFly changed the uploaded MP4 bytes');
    }
    process.stdout.write(`Course ${course.data.title}: lesson video visible to student; playback HTTP 206 and bytes match.\n`);
    await studentClient.auth.signOut();
  } finally {
    if (lessonId) {
      const removed = await client.from('app_documents').delete().eq('collection', 'lessons').eq('id', lessonId);
      if (removed.error) throw removed.error;
      process.stdout.write('Test lesson removed.\n');
    }
    if (key && completed) {
      const { client: storage, bucket } = getCloudFlyStorage();
      await storage.send(new DeleteObjectCommand({ Bucket: bucket, Key: key }));
      process.stdout.write('CloudFly test object removed.\n');
    } else if (key && uploadId) {
      await fetch(`${base}/api/cloudfly/video/multipart`, { method: 'DELETE', headers,
        body: JSON.stringify({ key, uploadId }) }).catch(() => {});
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
