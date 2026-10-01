import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {mkdtemp,readFile,rm,mkdir} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {encodeRendition,probeMedia,runMedia,playlistReferences} from '../worker/pipeline-transcode';

const requireHere=createRequire(import.meta.url);
const ffmpeg=requireHere('ffmpeg-static') as string;
const root=await mkdtemp(path.join(tmpdir(),'upcare-video-test-'));
const base=['-hide_banner','-loglevel','error','-y','-filter_threads','1','-f','lavfi','-i','testsrc2=size=640x360:rate=30','-f','lavfi','-i','sine=frequency=440:sample_rate=48000','-t','5.2'];
const h264=['-c:v','libx264','-threads','2','-preset','ultrafast','-pix_fmt','yuv420p','-c:a','aac'];
try {
  const seed=path.join(root,'seed.mp4');
  await runMedia(ffmpeg,[...base,...h264,seed]);
  const fixtures:Array<{name:string;file:string;audio:boolean;width?:number;height?:number}>=[{name:'mp4-moov-tail',file:seed,audio:true}];
  for(const [name,extension,args] of [
    ['mp4-faststart','mp4',['-c','copy','-movflags','+faststart']],
    ['mov','mov',['-c','copy']],
    ['webm','webm',['-c:v','libvpx-vp9','-threads','2','-deadline','realtime','-cpu-used','8','-c:a','libopus']],
    ['hevc','mp4',['-c:v','libx265','-threads','2','-x265-params','pools=1:frame-threads=1:log-level=error','-preset','ultrafast','-c:a','copy']],
    ['hevc-hdr','mp4',['-c:v','libx265','-threads','2','-x265-params','pools=1:frame-threads=1:log-level=error','-preset','ultrafast','-pix_fmt','yuv420p10le','-color_primaries','bt2020','-colorspace','bt2020nc','-color_trc','smpte2084','-c:a','copy']],
    ['no-audio','mp4',['-an','-c:v','copy']],
    ['portrait','mp4',['-vf','transpose=1',...h264]],
    ['anamorphic','mp4',['-vf','setsar=4/3',...h264]],
    ['rotation-metadata','mov',['-c','copy','-metadata:s:v:0','rotate=90']],
  ] as Array<[string,string,string[]]>) {
    const file=path.join(root,`${name}.${extension}`);
    await runMedia(ffmpeg,['-hide_banner','-loglevel','error','-y','-filter_threads','1',...(name==='rotation-metadata'?['-display_rotation','90']:[]),'-i',seed,...args,file]);
    fixtures.push({name,file,audio:name!=='no-audio',...(name==='portrait'||name==='rotation-metadata'?{width:360,height:640}:{width:name==='anamorphic'?853:640,height:360})});
  }
  for(const fixture of fixtures) {
    const info=await probeMedia(fixture.file);
    if(fixture.width) assert.equal(info.width,fixture.width,fixture.name+' source displayed width');
    if(fixture.height) assert.equal(info.height,fixture.height,fixture.name+' source displayed height');
    const folder=path.join(root,'output',fixture.name);await mkdir(folder,{recursive:true});
    const output=await encodeRendition(fixture.file,folder,480,1200000,info);
    const measured=await probeMedia(path.join(folder,'fallback.mp4'));
    if(fixture.name==='hevc-hdr'){assert.ok(info.hdr);assert.equal(measured.hdr,false,'HDR is normalized to SDR');}
    assert.equal(measured.audio,fixture.audio,fixture.name+' audio');
    assert.ok(measured.height<=480 && measured.width<=info.width && measured.height<=info.height,'no upscale');
    assert.ok(Math.abs(measured.width/measured.height-info.width/info.height)<.01,'preserve displayed ratio/rotation');
    assert.equal(output.height,measured.height);
    const mp4=await readFile(path.join(folder,'fallback.mp4'));
    assert.ok(mp4.indexOf(Buffer.from('moov'))<mp4.indexOf(Buffer.from('mdat')),'faststart metadata');
    const text=await readFile(path.join(folder,'index.m3u8'),'utf8');
    assert.ok(text.includes('#EXT-X-ENDLIST') && text.includes('#EXT-X-INDEPENDENT-SEGMENTS'));
    const lengths=[...text.matchAll(/#EXTINF:([\d.]+)/g)].map(m=>Number(m[1]));
    assert.ok(lengths.length>=3 && lengths.every(n=>n<=2.1),'two-second segments');
    for(const reference of playlistReferences(text)) await readFile(path.join(folder,reference));
    for(const at of [0,Math.max(0,measured.duration-1)]) {
      const decoded=await runMedia(ffmpeg,['-hide_banner','-loglevel','error','-threads','2','-i',path.join(folder,'index.m3u8'),'-ss',String(at),'-t','0.5','-an','-f','framemd5','-']);
      assert.ok(decoded.split(/\r?\n/).some(l=>l.trim() && !l.startsWith('#')),fixture.name+' decode at '+at+': '+decoded);
    }
    console.log('PASS',fixture.name,`${measured.width}x${measured.height}`,fixture.audio?'AAC':'silent');
  }
} finally {
  const resolved=path.resolve(root);
  assert.equal(path.dirname(resolved),path.resolve(tmpdir()));
  assert.ok(path.basename(resolved).startsWith('upcare-video-test-'));
  await rm(resolved,{recursive:true,force:true});
}
