import * as tus from 'tus-js-client';

interface UploadCredentials {
  videoId: string;
  libraryId: string;
  expirationTime: number;
  signature: string;
}

export async function uploadVideoToBunny(
  file: File,
  title: string,
  onProgress?: (percent: number) => void,
): Promise<string> {
  if (!file.size || !file.type.startsWith('video/')) {
    throw new Error('Vui lòng chọn một tệp video hợp lệ.');
  }

  const response = await fetch('/api/bunny/upload', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ title }),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(data.error || 'Không tạo được video trên Bunny Stream.');
  }

  const { videoId, libraryId, expirationTime, signature } = data as UploadCredentials;
  if (!videoId || !libraryId || !expirationTime || !signature) {
    throw new Error('Bunny Stream không trả về thông tin upload hợp lệ.');
  }

  await new Promise<void>((resolve, reject) => {
    const upload = new tus.Upload(file, {
      endpoint: 'https://video.bunnycdn.com/tusupload',
      retryDelays: [0, 3000, 5000, 10000, 20000, 60000],
      chunkSize: 5 * 1024 * 1024,
      headers: {
        AuthorizationSignature: signature,
        AuthorizationExpire: String(expirationTime),
        VideoId: videoId,
        LibraryId: libraryId,
      },
      metadata: { filetype: file.type, title },
      onProgress: (uploaded, total) => onProgress?.(Math.round((uploaded / total) * 100)),
      onError: reject,
      onSuccess: () => resolve(),
    });
    upload.start();
  });

  return videoId;
}
