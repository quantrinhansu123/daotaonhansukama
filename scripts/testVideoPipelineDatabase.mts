import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import {PGlite} from '@electric-sql/pglite';

const db=new PGlite();
await db.exec(`create role anon;create role authenticated;create role service_role;
create table public.app_documents(collection text,id text,data jsonb,auth_uid uuid,primary key(collection,id));`);
await db.exec(await readFile(new URL('../supabase/migrations/20261001_0005_video_pipeline.sql',import.meta.url),'utf8'));
const admin=randomUUID(),teacher=randomUUID(),student=randomUUID();
await db.query(`insert into app_documents values
('users','admin','{"role":"admin"}',$1),('users','teacher','{"role":"teacher"}',$2),('users','student','{"role":"student"}',$3),
('courses','course','{"teacherId":"teacher","students":["student"]}',null),
('courses','foreign','{}',null),
('lessons','lesson','{"courseId":"course","videoKey":"videos/legacy.mp4"}',null),
('lessons','other','{"courseId":"foreign"}',null)`,[admin,teacher,student]);
async function scalar(sql:string,args:unknown[]=[]){return (await db.query<Record<string,unknown>>(sql,args)).rows[0]?.value;}
async function reserve(env='development',id=randomUUID()) {
  await db.query(`select public.video_reserve($1,$2,'teacher','lesson','lesson','cloudfly',$3,null,1024)`,[env,id,`videos/${id}.mp4`]);
  await db.query(`select public.video_complete_upload($1,$2)`,[env,id]);
  return id;
}
async function claim(env='development',id?:string){return await scalar('select public.video_claim($1,$2) as value',[env,id || null]) as {job:{id:string;lease_token:string;attempts:number;stage:string};asset:{id:string}}|null;}
function output(c:NonNullable<Awaited<ReturnType<typeof claim>>>,env='development') {
  const prefix=`video-pipeline/${env}/v3/${c.asset.id}/${c.job.lease_token}`;
  return {master_key:`${prefix}/master.m3u8`,mp4_key:`${prefix}/480/fallback.mp4`,poster_key:`${prefix}/480/poster.jpg`,variants:[{width:854,height:480,bandwidth:1500000,playlistKey:`${prefix}/480/index.m3u8`,codecs:'avc1.4d401f,mp4a.40.2'}],duration_sec:12,width:1280,height:720};
}
async function finish(c:NonNullable<Awaited<ReturnType<typeof claim>>>,env='development') {await db.query('select public.video_finish($1,$2,$3,$4)',[env,c.job.id,c.job.lease_token,output(c,env)]);}
const a=await reserve();
await db.query(`select public.video_complete_upload('development',$1)`,[a]);
assert.equal(await scalar('select count(*)::integer as value from video_jobs where asset_id=$1',[a]),1,'complete must be idempotent');
const ca=(await claim('development',a))!;
await assert.rejects(()=>db.query(`select public.video_finish('development',$1,$2,$3)`,[ca.job.id,ca.job.lease_token,output(ca,'production')]),/video_output_invalid/,'cannot publish outputs from another environment');
assert.equal(await claim('production',a),null,'worker cannot claim another environment');
assert.equal(await claim('development',a),null,'leased job cannot be claimed twice');
await finish(ca);
assert.equal(await scalar(`select active_asset_id::text as value from video_bindings where environment='development'`),a);
const b=await reserve(),c=await reserve();
const cb=(await claim('development',b))!,cc=(await claim('development',c))!;
await finish(cc);await finish(cb);
assert.equal(await scalar('select published_at is not null as value from video_assets where id=$1',[c]),true);
assert.equal(await scalar('select published_at is not null as value from video_assets where id=$1',[b]),false,'superseded upload was never published');
assert.equal(await scalar(`select active_asset_id::text as value from video_bindings where environment='development'`),c,'late older upload must not replace newest');
await assert.rejects(()=>finish(cb),/video_lease_lost/,'finished lease cannot publish twice');
const enhance=(await claim('development',c))!;
assert.equal(enhance.job.stage,'enhance');
await db.query(`select public.video_fail('development',$1,$2,'encoder_failed')`,[enhance.job.id,enhance.job.lease_token]);
assert.equal(await scalar('select status as value from video_assets where id=$1',[c]),'playable','HD failure must preserve playable base');
const crashed=await reserve(),first=(await claim('development',crashed))!;
await db.query(`update video_jobs set lease_until=now()-interval '1 second' where id=$1`,[first.job.id]);
const second=(await claim('development',crashed))!;
assert.equal(second.job.attempts,2);
await assert.rejects(()=>finish(first),/video_lease_lost/,'stale worker must be fenced');
await db.query(`update video_jobs set lease_until=now()-interval '1 second',attempts=3 where id=$1`,[second.job.id]);
assert.equal(await claim('development',crashed),null);
assert.equal(await scalar('select status as value from video_assets where id=$1',[crashed]),'failed','third crash must not stay processing');
const pending=await reserve(),cp=(await claim('development',pending))!;
await db.query(`select public.video_remove('development','lesson','lesson')`);
await assert.rejects(()=>finish(cp),/video_lease_lost/,'removed video cannot republish');
assert.equal(await scalar(`select removed as value from video_bindings where environment='development'`),true);
const production=await reserve('production');
const prod=(await claim('production',production))!;await finish(prod,'production');
assert.equal(await scalar(`select removed as value from video_bindings where environment='development'`),true,'production binding independent from development');
for(const [uid,target,manage,expected] of [[teacher,'other',false,403],[teacher,'other',true,403],[student,'lesson',false,200],[student,'lesson',true,403],[admin,'other',true,200]] as const){
  const access=await scalar(`select public.video_target_state('development',$1,'lesson',$2,$3) as value`,[uid,target,manage]) as {httpStatus:number};
  assert.equal(access.httpStatus,expected,'role and membership validation');
}
await db.exec('set role authenticated');
await assert.rejects(()=>db.query(`select public.video_claim('development')`),/permission denied/);
await assert.rejects(()=>db.query('select * from video_assets'),/permission denied/);
await db.exec('reset role');
await db.close();
console.log('PASS: migration, isolated environments, idempotent upload, lease recovery/fencing, publication ordering, HD failure, removal, access controls');
