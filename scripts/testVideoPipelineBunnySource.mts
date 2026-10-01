import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {mkdtemp,readFile,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import type {InventoryVideo} from '../lib/video-pipeline-inventory';
import {downloadLegacyBunnyVideo,encodeRendition,probeMedia,runMedia,playlistReferences} from '../worker/pipeline-transcode';

const videos=(JSON.parse(await readFile('.local-backups/video-pipeline-inventory.json','utf8')) as {videos:InventoryVideo[]}).videos.filter(v=>v.provider==='bunny' && v.reachable);
const ffmpeg=createRequire(import.meta.url)('ffmpeg-static') as string;
const results=[];
for(const video of videos) {
  const root=await mkdtemp(path.join(tmpdir(),'upcare-video-bunny-test-'));
  try {
    const file=path.join(root,'source');
    await downloadLegacyBunnyVideo(video.source,video.recoveredCdn,file,AbortSignal.timeout(180_000));
    const info=await probeMedia(file),folder=path.join(root,'480');
    assert.ok(info.audio,'existing Bunny video audio must be retained');
    const variant=await encodeRendition(file,folder,480,1200000,info);
    const init=await readFile(path.join(folder,'init.mp4')),refs=playlistReferences(await readFile(path.join(folder,'index.m3u8'),'utf8')).filter(r=>r.endsWith('.m4s'));
    for(const ref of new Set([refs[0],refs[refs.length-1]])) {
      const part=path.join(root,'check.mp4');await writeFile(part,Buffer.concat([init,await readFile(path.join(folder,ref))]));
      const decoded=await runMedia(ffmpeg,['-hide_banner','-loglevel','error','-threads','2','-i',part,'-an','-f','framemd5','-']);
      assert.ok(decoded.split(/\r?\n/).some(l=>l.trim() && !l.startsWith('#')));
    }
    results.push({title:video.title,success:true,inputWidth:info.width,inputHeight:info.height,audioRetained:info.audio,output:`${variant.width}x${variant.height}`,duration:info.duration});
    console.log('PASS',video.title,`${info.width}x${info.height} -> ${variant.width}x${variant.height}`, 'audio retained');
  }finally{
    const resolved=path.resolve(root);assert.equal(path.dirname(resolved),path.resolve(tmpdir()));assert.ok(path.basename(resolved).startsWith('upcare-video-bunny-test-'));
    await rm(resolved,{recursive:true,force:true});
  }
}
await writeFile('.local-backups/video-pipeline-bunny-source-tests.json',JSON.stringify({generatedAt:new Date().toISOString(),scope:'local only, no database/storage changes',results},null,2));
