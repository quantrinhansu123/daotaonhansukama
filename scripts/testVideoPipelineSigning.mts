import assert from 'node:assert/strict';
import {createHmac} from 'node:crypto';
import {signedVideoUrl,assetScope} from '../lib/bunny-video-delivery';
import {selectLegacyRendition} from '../worker/pipeline-transcode';

Object.assign(process.env,{BUNNY_VIDEO_STORAGE_ZONE:'test',BUNNY_VIDEO_STORAGE_KEY:'test',BUNNY_VIDEO_CDN_HOSTNAME:'test.b-cdn.net',BUNNY_VIDEO_TOKEN_KEY:'test-key'});
const key='video-pipeline/development/v3/00000000-0000-0000-0000-000000000001/00000000-0000-0000-0000-000000000002/master.m3u8';
const scope=assetScope(key),expires=2000000000;
const expected=createHmac('sha256','test-key').update('/'+scope+expires+'token_path=/'+scope).digest('base64url');
assert.equal(signedVideoUrl(key,expires,scope),`https://test.b-cdn.net/bcdn_token=HS256-${expected}&expires=${expires}&token_path=${encodeURIComponent('/'+scope)}/${key}`);
const master=new URL(signedVideoUrl(key,expires,scope)),nested=new URL('480/index.m3u8',master),segment=new URL('seg_00001.m4s',nested);
assert.equal(master.pathname.split('/')[1],segment.pathname.split('/')[1],'HLS child keeps directory token');
assert.throws(()=>signedVideoUrl(key,expires,'other/'));
assert.throws(()=>signedVideoUrl('video-pipeline/../secret',expires));
const original=selectLegacyRendition(`#EXTM3U\n#EXT-X-MEDIA:TYPE=AUDIO,GROUP-ID="aac",DEFAULT=YES,URI="audio/playlist.m3u8"\n#EXT-X-STREAM-INF:BANDWIDTH=500000,RESOLUTION=640x360,AUDIO="aac"\n360/playlist.m3u8\n#EXT-X-STREAM-INF:BANDWIDTH=3000000,RESOLUTION=1920x1080,AUDIO="aac"\n1080/playlist.m3u8\n`,'https://vz-test.b-cdn.net/id/playlist.m3u8');
assert.equal(original.videoUrl,'https://vz-test.b-cdn.net/id/1080/playlist.m3u8');
assert.equal(original.audioUrl,'https://vz-test.b-cdn.net/id/audio/playlist.m3u8');
assert.throws(()=>selectLegacyRendition('#EXTM3U\n#EXT-X-STREAM-INF:RESOLUTION=1920x1080\nhttps://other.example/file.m3u8','https://vz-test.b-cdn.net/id/playlist.m3u8'));
console.log('PASS: HMAC directory tokens, inherited HLS authentication, highest legacy rendition and separate audio, origin scope validation');
