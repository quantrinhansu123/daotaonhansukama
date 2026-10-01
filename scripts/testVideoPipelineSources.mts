import assert from 'node:assert/strict';
import {GetObjectCommand} from '@aws-sdk/client-s3';
import {createWriteStream} from 'node:fs';
import {createRequire} from 'node:module';
import {mkdtemp,readFile,rm,writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {pipeline} from 'node:stream/promises';
import {getCloudFlyStorage} from '../lib/cloudfly-s3';
import {encodeRendition,probeMedia,playlistReferences,runMedia,checkWorkerDisk} from '../worker/pipeline-transcode';
import type {InventoryVideo} from '../lib/video-pipeline-inventory';

const report=JSON.parse(await readFile('.local-backups/video-pipeline-inventory.json','utf8')) as {videos:InventoryVideo[]};
const {client,bucket}=getCloudFlyStorage(),requireHere=createRequire(import.meta.url),ffmpeg=requireHere('ffmpeg-static') as string;
const results:Array<{targetId:string;title:string;success:boolean;seconds:number;width?:number;height?:number;duration?:number;error?:string}>=[];
for(const video of report.videos.filter(v=>v.provider==='cloudfly' && v.reachable)) {
  await checkWorkerDisk();
  const root=await mkdtemp(path.join(tmpdir(),'upcare-video-source-test-')),started=Date.now();
  try {
    console.log('PROCESSING',video.title);
    const source=await client.send(new GetObjectCommand({Bucket:bucket,Key:video.source}));
    if(!source.Body || !source.ContentLength || source.ContentLength>2*1024**3) throw new Error('source_invalid');
    const file=path.join(root,'source');await pipeline(source.Body as NodeJS.ReadableStream,createWriteStream(file));
    const info=await probeMedia(file),folder=path.join(root,'480'),output=await encodeRendition(file,folder,480,1200000,info);
    const playlist=await readFile(path.join(folder,'index.m3u8'),'utf8'),references=playlistReferences(playlist);
    const init=await readFile(path.join(folder,'init.mp4')),segments=references.filter(r=>r.endsWith('.m4s'));
    for(const ref of references) await readFile(path.join(folder,ref));
    for(const segment of new Set([segments[0],segments[segments.length-1]])) {
      const part=path.join(root,'decode.mp4');await writeFile(part,Buffer.concat([init,await readFile(path.join(folder,segment))]));
      const decoded=await runMedia(ffmpeg,['-hide_banner','-loglevel','error','-threads','2','-i',part,'-an','-f','framemd5','-']);
      assert.ok(decoded.split(/\r?\n/).some(l=>l.trim() && !l.startsWith('#')),'first/last segment must decode');
    }
    results.push({targetId:video.targetId,title:video.title,success:true,seconds:(Date.now()-started)/1000,width:output.width,height:output.height,duration:info.duration});
    console.log('PASS',video.title,`${output.width}x${output.height}`);
  }catch(e){results.push({targetId:video.targetId,title:video.title,success:false,seconds:(Date.now()-started)/1000,error:e instanceof Error?e.message.split(':')[0]:'failed'});console.log('FAIL',video.title);}
  finally {
    const resolved=path.resolve(root);assert.equal(path.dirname(resolved),path.resolve(tmpdir()));assert.ok(path.basename(resolved).startsWith('upcare-video-source-test-'));
    await rm(resolved,{recursive:true,force:true});
  }
  await writeFile('.local-backups/video-pipeline-source-tests.json',JSON.stringify({generatedAt:new Date().toISOString(),scope:'local transcode only; no database, CDN or production changes',results},null,2));
}
process.exitCode=results.some(r=>!r.success)?1:0;
