export function cloudflyVideoUrl(key: string): string {
  return `/api/cloudfly/video/play?key=${encodeURIComponent(key)}`;
}

export async function uploadVideoToCloudFly(
  file: File,
  onProgress?: (percent: number) => void,
): Promise<string> {
  if (!['video/mp4', 'video/webm'].includes(file.type) || !file.size) {
    throw new Error('Vui lòng chọn video MP4 hoặc WebM.');
  }
  if (file.size > 2 * 1024 * 1024 * 1024) {
    throw new Error('Video vượt quá giới hạn 2 GB.');
  }
  return new Promise<string>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('POST', '/api/cloudfly/video/upload');
    xhr.setRequestHeader('Content-Type', file.type);
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
