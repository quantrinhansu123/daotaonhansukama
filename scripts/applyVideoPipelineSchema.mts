import {readFile} from 'node:fs/promises';
import postgres from 'postgres';

const raw=process.env.SUPABASE_DB_URL;
if(!raw) throw new Error('Missing SUPABASE_DB_URL; no database changes made');
const url=new URL(raw),ref=new URL(process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://invalid.example').hostname.split('.')[0];
if(!['postgres:','postgresql:'].includes(url.protocol) || !url.password || url.password.includes('YOUR-PASSWORD')
  || !(url.hostname.includes(ref) || decodeURIComponent(url.username).includes(ref))) throw new Error('Database URL does not match the configured Supabase project');
const sql=postgres(raw,{ssl:'require',max:1,prepare:false,connect_timeout:10});
try {
  const [current]=await sql`select to_regclass('public.video_assets')::text as assets,to_regclass('public.app_documents')::text as documents`;
  if(!current.documents) throw new Error('Existing application database not found');
  console.log('video_assets:',current.assets?'present':'absent');
  if(process.argv.includes('--apply')) {
    await sql.begin(async tx=>{await tx.unsafe(await readFile(new URL('../supabase/migrations/20261001_0005_video_pipeline.sql',import.meta.url),'utf8'));});
    console.log('Video pipeline migration applied; existing application documents unchanged');
  }
}finally{await sql.end();}
