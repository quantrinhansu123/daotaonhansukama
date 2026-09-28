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

export async function uploadVideoToCloudFly(
  file: File,
  onProgress?: (percent: number) => void,
): Promise<string> {
  const mime = videoUploadMime(file);
  if (!mime || !file.size) {
    throw new Error('Không nhận được file video. Hãy chọn MP4, MOV, MKV, AVI hoặc WebM.');
  }
  if (file.size > 2 * 1024 * 1024 * 1024) {
    throw new Error('Video vượt quá giới hạn 2 GB.');
  }
  return new Promise<string>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('POST', '/api/cloudfly/video/upload');
    xhr.setRequestHeader('Content-Type', mime);
    xhr.upload.onprogress = event => {
      if (event.lengthComputable) onProgress?.(Math.min(99, Math.round(event.loaded / event.total * 99)));
    };
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
