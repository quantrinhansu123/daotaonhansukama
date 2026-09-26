import assert from 'node:assert/strict';
import test from 'node:test';
import { NextRequest } from 'next/server';
import { DELETE } from '../app/api/bunny/video/[videoId]/route';

test('delete distinguishes missing videos and Bunny failures from successful deletion', async () => {
  const originalFetch = globalThis.fetch;
  const originalKey = process.env.BUNNY_STREAM_API_KEY;
  const originalLibraryId = process.env.BUNNY_STREAM_LIBRARY_ID;
  process.env.BUNNY_STREAM_API_KEY = 'test-private-key';
  process.env.BUNNY_STREAM_LIBRARY_ID = '1234';

  try {
    for (const [bunnyStatus, expectedStatus] of [[404, 404], [403, 502], [204, 200]]) {
      globalThis.fetch = async (input, init) => {
        assert.equal(input, 'https://video.bunnycdn.com/library/1234/videos/legacy-id');
        assert.equal(init?.method, 'DELETE');
        assert.equal((init?.headers as Record<string, string>).AccessKey, 'test-private-key');
        return new Response(null, { status: bunnyStatus });
      };

      const response = await DELETE(
        new NextRequest('http://localhost/api/bunny/video/legacy-id', { method: 'DELETE' }),
        { params: Promise.resolve({ videoId: 'legacy-id' }) },
      );
      assert.equal(response.status, expectedStatus);
      const data = await response.json();
      assert.equal(data.success === true, bunnyStatus === 204);
      if (bunnyStatus === 404) assert.equal(data.notFound, true);
    }
  } finally {
    globalThis.fetch = originalFetch;
    if (originalKey === undefined) delete process.env.BUNNY_STREAM_API_KEY;
    else process.env.BUNNY_STREAM_API_KEY = originalKey;
    if (originalLibraryId === undefined) delete process.env.BUNNY_STREAM_LIBRARY_ID;
    else process.env.BUNNY_STREAM_LIBRARY_ID = originalLibraryId;
  }
});
