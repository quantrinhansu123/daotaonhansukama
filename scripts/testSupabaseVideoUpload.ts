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
const folder = mkdtempSync(join(tmpdir(), 'supabase-video-'));
const videoPath = join(folder, `${randomUUID()}.mp4`);
const firebaseApp = initializeApp({
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
});

async function main() {
  if (!ffmpeg) throw new Error('ffmpeg-static not available');
  execFileSync(ffmpeg, ['-hide_banner', '-loglevel', 'error', '-f', 'lavfi', '-i', 'color=c=black:s=160x90:r=10',
    '-t', '2', '-an', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', videoPath]);
  const bytes = readFileSync(videoPath);
  const source = await getDocs(collection(getFirestore(firebaseApp), 'users'));
  const account = source.docs.find(item => item.data().role === 'admin')?.data();
  if (!account) throw new Error('Missing admin user');
  const client = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const login = await client.auth.signInWithPassword({ email: account.email, password: account.password });
  if (login.error || !login.data.session) throw new Error('Admin login failed');
  let key: string | undefined;
  try {
    const uploaded = await fetch(`${base}/api/cloudfly/video/upload`, {
      method: 'POST', headers: { Authorization: `Bearer ${login.data.session.access_token}`, 'Content-Type': 'video/mp4' },
      body: bytes,
    });
    const result = await uploaded.json();
    if (uploaded.status !== 200 || !result.key) throw new Error(`Upload failed (${uploaded.status})`);
    key = result.key;
    const playback = await fetch(`${base}/api/cloudfly/video/play?key=${encodeURIComponent(key!)}`, { redirect: 'manual' });
    if (playback.status !== 307) throw new Error(`Playback redirect failed (${playback.status})`);
    const range = await fetch(playback.headers.get('location')!, { headers: { Range: 'bytes=0-15' } });
    const firstBytes = Buffer.from(await range.arrayBuffer());
    if (range.status !== 206 || !firstBytes.equals(bytes.subarray(0, 16))) {
      throw new Error(`Playback range mismatch (${range.status})`);
    }
    process.stdout.write(`CloudFly upload/playback: PASS (${bytes.length} bytes, HTTP 206)\n`);
  } finally {
    if (key) {
      const { client: storage, bucket } = getCloudFlyStorage();
      await storage.send(new DeleteObjectCommand({ Bucket: bucket, Key: key }));
      process.stdout.write('CloudFly test object cleanup: PASS\n');
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
