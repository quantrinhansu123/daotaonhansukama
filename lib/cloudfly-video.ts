import { auth } from '@/lib/firebase';
import { getSupabaseClient } from '@/lib/supabase-client';
import { authenticatedJson } from '@/lib/authenticated-fetch';

export function cloudflyVideoUrl(key: string): string {
  return `/api/cloudfly/video/play?key=${encodeURIComponent(key)}`;
}

const VIDEO_BY_EXTENSION: Record<string, string> = {
  mp4: 'video/mp4',
  m4v: 'video/mp4',
  webm: 'video/webm',
  mov: 'video/quicktime',
  qt: 'video/quicktime',
  mkv: 'video/x-matroska',
  avi: 'video/x-msvideo',
  mpeg: 'video/mpeg',
  mpg: 'video/mpeg',
  '3gp': 'video/3gpp',
};

export function videoUploadMime(file: File): string | null {
  const type = file.type.toLowerCase().split(';')[0].trim();
  const extension = file.name.toLowerCase().trim().split('.').pop() || '';
  if (VIDEO_BY_EXTENSION[extension]) return VIDEO_BY_EXTENSION[extension];
  if (type.startsWith('video/')) return type === 'video/mp4' || type === 'application/mp4' ? 'video/mp4' : type;
  return null;
}

type MultipartStart = { key: string; uploadId: string; partSize: number; urls: string[] };

function uploadPart(
  url: string,
  body: Blob,
  progress: (loaded: number) => void,
  active: Set<XMLHttpRequest>,
): Promise<string> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    active.add(xhr);
    xhr.open('PUT', url);
    xhr.upload.onprogress = event => progress(event.loaded);
    xhr.onerror = () => reject(new Error('Mất kết nối tới CloudFly.'));
    xhr.onabort = () => reject(new Error('Tải video đã bị hủy.'));
    xhr.onload = () => {
      if (xhr.status < 200 || xhr.status >= 300) {
        reject(new Error(`CloudFly từ chối một phần video (HTTP ${xhr.status}).`));
        return;
      }
      const etag = xhr.getResponseHeader('ETag');
      if (!etag) {
        reject(new Error('CloudFly chưa cho phép trình duyệt đọc ETag. Kiểm tra CORS của bucket.'));
        return;
      }
      resolve(etag);
    };
    xhr.onloadend = () => active.delete(xhr);
    xhr.send(body);
  });
}

async function uploadMultipart(
  file: File,
  mime: string,
  onProgress?: (percent: number) => void,
  onTransferComplete?: () => void,
): Promise<string> {
  const session = await authenticatedJson('/api/cloudfly/video/multipart', 'POST', {
    mime, size: file.size,
  }) as MultipartStart;
  if (!session.key || !session.uploadId || !Number.isInteger(session.partSize)
      || !Array.isArray(session.urls) || session.urls.length !== Math.ceil(file.size / session.partSize)) {
    throw new Error('CloudFly trả về phiên tải video không hợp lệ.');
  }
  const active = new Set<XMLHttpRequest>();
  const loaded = new Array<number>(session.urls.length).fill(0);
  const etags = new Array<string>(session.urls.length);
  let next = 0;
  let lastPercent = 0;
  const report = () => {
    const percent = Math.min(99, Math.floor(loaded.reduce((sum, value) => sum + value, 0) / file.size * 99));
    if (percent > lastPercent) { lastPercent = percent; onProgress?.(percent); }
  };
  const worker = async () => {
    while (next < session.urls.length) {
      const index = next++;
      const start = index * session.partSize;
      const end = Math.min(file.size, start + session.partSize);
      const part = file.slice(start, end);
      for (let attempt = 0; ; attempt++) {
        try {
          etags[index] = await uploadPart(session.urls[index], part, bytes => {
            loaded[index] = Math.min(part.size, bytes);
            report();
          }, active);
          loaded[index] = part.size;
          report();
          break;
        } catch (error) {
          if (attempt >= 2) throw error;
          loaded[index] = 0;
          await new Promise(resolve => setTimeout(resolve, 1000 * 2 ** attempt));
        }
      }
    }
  };
  const workers = Array.from({ length: Math.min(3, session.urls.length) }, worker);
  try {
    await Promise.all(workers);
    onTransferComplete?.();
    const result = await authenticatedJson('/api/cloudfly/video/multipart', 'PATCH', {
      key: session.key,
      uploadId: session.uploadId,
      size: file.size,
      parts: etags.map((etag, index) => ({ partNumber: index + 1, etag })),
    }) as { key: string };
    if (result.key !== session.key) throw new Error('CloudFly trả về sai mã video.');
    onProgress?.(100);
    return result.key;
  } catch (error) {
    for (const xhr of active) xhr.abort();
    await Promise.allSettled(workers);
    await authenticatedJson('/api/cloudfly/video/multipart', 'DELETE', {
      key: session.key, uploadId: session.uploadId,
    }).catch(() => {});
    throw error;
  }
}

export async function uploadVideoToCloudFly(
  file: File,
  onProgress?: (percent: number) => void,
  onTransferComplete?: () => void,
): Promise<string> {
  const mime = videoUploadMime(file);
  if (!mime || !file.size) {
    throw new Error('Không nhận được file video. Hãy chọn MP4, MOV, MKV, AVI hoặc WebM.');
  }
  if (file.size > 2 * 1024 * 1024 * 1024) {
    throw new Error('Video vượt quá giới hạn 2 GB.');
  }
  if (process.env.NEXT_PUBLIC_SUPABASE_ENABLED === 'true') {
    return uploadMultipart(file, mime, onProgress, onTransferComplete);
  }
  const authenticated = process.env.NEXT_PUBLIC_SUPABASE_ENABLED === 'true'
    || process.env.NEXT_PUBLIC_FIREBASE_AUTH_ENABLED === 'true';
  const idToken = process.env.NEXT_PUBLIC_SUPABASE_ENABLED === 'true'
    ? (await getSupabaseClient().auth.getSession()).data.session?.access_token
    : process.env.NEXT_PUBLIC_FIREBASE_AUTH_ENABLED === 'true' ? await auth.currentUser?.getIdToken() : undefined;
  if (authenticated && !idToken) {
    throw new Error('Bạn cần đăng nhập lại trước khi tải video.');
  }
  return new Promise<string>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('POST', '/api/cloudfly/video/upload');
    xhr.setRequestHeader('Content-Type', mime);
    if (idToken) xhr.setRequestHeader('Authorization', `Bearer ${idToken}`);
    xhr.upload.onprogress = event => {
      if (event.lengthComputable) onProgress?.(Math.min(99, Math.round(event.loaded / event.total * 99)));
    };
    xhr.upload.onload = () => onTransferComplete?.();
    xhr.onerror = () => reject(new Error('Mất kết nối khi tải video lên CloudFly.'));
    xhr.onload = () => {
      let result: { key?: string; error?: string } = {};
      try { result = JSON.parse(xhr.responseText); } catch { /* handled below */ }
      if (xhr.status >= 200 && xhr.status < 300 && result.key) {
        onProgress?.(100);
        resolve(result.key);
      } else {
        reject(new Error(result.error || 'Không tải được video lên CloudFly.'));
      }
    };
    xhr.send(file);
  });
}
