import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import test from 'node:test';
import { NextRequest } from 'next/server';
import { POST } from '../app/api/bunny/upload/route';

test('creates a Bunny video and returns a signed TUS upload without exposing the API key', async () => {
  const originalFetch = globalThis.fetch;
  const originalKey = process.env.BUNNY_STREAM_API_KEY;
  const originalLibraryId = process.env.BUNNY_STREAM_LIBRARY_ID;
  process.env.BUNNY_STREAM_API_KEY = 'test-private-key';
  process.env.BUNNY_STREAM_LIBRARY_ID = '1234';

  globalThis.fetch = async (input, init) => {
    assert.equal(input, 'https://video.bunnycdn.com/library/1234/videos');
    assert.equal(init?.method, 'POST');
    assert.equal((init?.headers as Record<string, string>).AccessKey, 'test-private-key');
    assert.deepEqual(JSON.parse(init?.body as string), { title: 'Demo video' });
    return new Response(JSON.stringify({ guid: 'video-123' }), { status: 200 });
  };

  try {
    const request = new NextRequest('http://localhost/api/bunny/upload', {
      method: 'POST',
      body: JSON.stringify({ title: ' Demo video ' }),
    });
    const response = await POST(request);
    assert.equal(response.status, 200);
    const data = await response.json();
    assert.equal(data.videoId, 'video-123');
    assert.equal(data.libraryId, '1234');
    assert.equal(typeof data.expirationTime, 'number');
    assert.equal(
      data.signature,
      createHash('sha256').update(`1234test-private-key${data.expirationTime}video-123`).digest('hex'),
    );
    assert.equal(JSON.stringify(data).includes('test-private-key'), false);
  } finally {
    globalThis.fetch = originalFetch;
    if (originalKey === undefined) delete process.env.BUNNY_STREAM_API_KEY;
    else process.env.BUNNY_STREAM_API_KEY = originalKey;
    if (originalLibraryId === undefined) delete process.env.BUNNY_STREAM_LIBRARY_ID;
    else process.env.BUNNY_STREAM_LIBRARY_ID = originalLibraryId;
  }
});

test('rejects an empty title before creating a Bunny video', async () => {
  const originalKey = process.env.BUNNY_STREAM_API_KEY;
  const originalLibraryId = process.env.BUNNY_STREAM_LIBRARY_ID;
  process.env.BUNNY_STREAM_API_KEY = 'test-private-key';
  process.env.BUNNY_STREAM_LIBRARY_ID = '1234';
  try {
    const response = await POST(new NextRequest('http://localhost/api/bunny/upload', {
      method: 'POST',
      body: JSON.stringify({ title: ' ' }),
    }));
    assert.equal(response.status, 400);
  } finally {
    if (originalKey === undefined) delete process.env.BUNNY_STREAM_API_KEY;
    else process.env.BUNNY_STREAM_API_KEY = originalKey;
    if (originalLibraryId === undefined) delete process.env.BUNNY_STREAM_LIBRARY_ID;
    else process.env.BUNNY_STREAM_LIBRARY_ID = originalLibraryId;
  }
});
