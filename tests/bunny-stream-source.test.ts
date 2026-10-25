import assert from 'node:assert/strict';
import test from 'node:test';
import { bunnyStreamPlaylistUrl, resolveDemoVideo } from '../lib/demo-video';
import { allowedBunnyStreamHost } from '../lib/bunny-stream-hosts';

test('a legacy lesson retains its actual Bunny CDN instead of the global CDN', () => {
  const id = '057c4f01-fdd4-4df8-94ed-3d1c197bf064';
  const host = 'vz-cfc10078-3eb.b-cdn.net';
  const source = resolveDemoVideo(undefined, `https://${host}/${id}/playlist.m3u8`);
  assert.deepEqual(source, { kind: 'bunny', id, cdnHost: host });
  if (source?.kind !== 'bunny') throw new Error('Expected Bunny source');
  assert.equal(bunnyStreamPlaylistUrl(source.id, source.cdnHost), `/api/bunny/cdn/${host}/${id}/playlist.m3u8`);
});

test('new CloudFly uploads take precedence over a legacy Bunny URL', () => {
  const key = 'videos/130954fa-3de8-4d02-93bd-af75681d0f50.mov';
  assert.deepEqual(resolveDemoVideo(key, 'https://vz-cfc10078-3eb.b-cdn.net/057c4f01-fdd4-4df8-94ed-3d1c197bf064/playlist.m3u8'), { kind: 'cloudfly', key });
});

test('the proxy rejects unrecognized hosts and host-encoding tricks', () => {
  for (const host of ['localhost', '169.254.169.254', 'other.b-cdn.net', 'vz-cfc10078-3eb.b-cdn.net.evil.test', 'vz-cfc10078-3eb.b-cdn.net@localhost', 'vz-cfc10078-3eb.b-cdn.net/path']) {
    assert.equal(allowedBunnyStreamHost(host), false, host);
    assert.equal(bunnyStreamPlaylistUrl('057c4f01-fdd4-4df8-94ed-3d1c197bf064', host), null);
  }
});
