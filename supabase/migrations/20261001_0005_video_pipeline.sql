-- Additive: legacy app_documents and CloudFly assets remain untouched.
create table if not exists public.video_assets (
  id uuid primary key,
  environment text not null check (environment in ('development','production')),
  owner_id text not null,
  target_type text not null check (target_type in ('lesson','course_intro')), target_id text not null,
  source_provider text not null check (source_provider in ('cloudfly','bunny')),
  source_key text not null,
  source_origin jsonb,
  upload_id text,
  expected_bytes bigint check (expected_bytes > 0 and expected_bytes <= 2147483648),
  status text not null default 'uploading' check (status in ('uploading','queued','processing','playable','complete','failed','cancelled','source_unavailable')),
  error_code text, enhancement_error text,
  mp4_key text, master_key text, poster_key text,
  variants jsonb not null default '[]',
  published_at timestamptz,
  duration_sec double precision, width integer, height integer,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  unique (environment,id)
);
create table if not exists public.video_bindings (
  environment text not null check (environment in ('development','production')),
  target_type text not null check (target_type in ('lesson','course_intro')),
  target_id text not null, course_id text not null,
  active_asset_id uuid, pending_asset_id uuid,
  revision bigint not null default 0, removed boolean not null default false,
  updated_at timestamptz not null default now(),
  primary key (environment,target_type,target_id),
  foreign key (environment,active_asset_id) references public.video_assets(environment,id),
  foreign key (environment,pending_asset_id) references public.video_assets(environment,id)
);
create table if not exists public.video_jobs (
  id uuid primary key default gen_random_uuid(),
  environment text not null,
  asset_id uuid not null,
  stage text not null check (stage in ('base','enhance')),
  status text not null default 'queued' check (status in ('queued','processing','done','failed','cancelled')),
  attempts integer not null default 0 check (attempts between 0 and 3),
  available_at timestamptz not null default now(), lease_token uuid, lease_until timestamptz,
  error_code text,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  foreign key (environment,asset_id) references public.video_assets(environment,id),
  unique (asset_id,stage)
);
create index if not exists video_jobs_claim on public.video_jobs(environment,stage,available_at,created_at) where status in ('queued','processing');
create index if not exists video_bindings_course on public.video_bindings(environment,course_id);
create index if not exists video_assets_reconcile on public.video_assets(environment,updated_at) where status = 'uploading';
alter table public.video_assets enable row level security;
alter table public.video_jobs enable row level security;
alter table public.video_bindings enable row level security;
revoke all on public.video_assets, public.video_jobs, public.video_bindings from anon, authenticated;
grant select, insert, update, delete on public.video_assets, public.video_jobs, public.video_bindings to service_role;

create or replace function public.video_reserve(p_environment text, p_asset_id uuid, p_owner_id text,
  p_target_type text, p_target_id text, p_source_provider text, p_source_key text,
  p_upload_id text default null, p_expected_bytes bigint default null)
returns public.video_assets language plpgsql set search_path = '' as $$
declare v_course_id text; v_asset public.video_assets;
begin
  if p_target_type = 'lesson' then
    select data->>'courseId' into v_course_id from public.app_documents where collection='lessons' and id=p_target_id;
  elsif p_target_type = 'course_intro' then
    select id into v_course_id from public.app_documents where collection='courses' and id=p_target_id;
  end if;
  if v_course_id is null then raise exception 'video_target_missing'; end if;
  insert into public.video_bindings(environment,target_type,target_id,course_id)
    values(p_environment,p_target_type,p_target_id,v_course_id) on conflict do nothing;
  perform 1 from public.video_bindings where environment=p_environment and target_type=p_target_type and target_id=p_target_id for update;
  insert into public.video_assets(id,environment,owner_id,target_type,target_id,source_provider,source_key,upload_id,expected_bytes)
    values(p_asset_id,p_environment,p_owner_id,p_target_type,p_target_id,p_source_provider,p_source_key,p_upload_id,p_expected_bytes) returning * into v_asset;
  update public.video_bindings set pending_asset_id=p_asset_id,revision=revision+1,updated_at=now()
    where environment=p_environment and target_type=p_target_type and target_id=p_target_id;
  return v_asset;
end $$;

create or replace function public.video_complete_upload(p_environment text,p_asset_id uuid)
returns public.video_assets language plpgsql set search_path = '' as $$
declare v_asset public.video_assets;
begin
  select * into v_asset from public.video_assets where environment=p_environment and id=p_asset_id for update;
  if not found then raise exception 'video_asset_missing'; end if;
  if v_asset.status in ('cancelled','source_unavailable') then raise exception 'video_asset_cancelled'; end if;
  if v_asset.status='uploading' then
    update public.video_assets set status='queued',error_code=null,updated_at=now() where id=p_asset_id returning * into v_asset;
    insert into public.video_jobs(environment,asset_id,stage) values(p_environment,p_asset_id,'base') on conflict do nothing;
  end if;
  return v_asset;
end $$;

create or replace function public.video_claim(p_environment text,p_asset_id uuid default null)
returns jsonb language plpgsql set search_path = '' as $$
declare v_job public.video_jobs; v_asset public.video_assets;
begin
  -- A third crashed attempt must not remain processing forever.
  with exhausted as (
    update public.video_jobs set status='failed',error_code='lease_exhausted',lease_token=null,lease_until=null,updated_at=now()
    where environment=p_environment and status='processing' and lease_until<=now() and attempts>=3 returning asset_id,stage
  ) update public.video_assets a set status=case when e.stage='base' then 'failed' else a.status end,
    error_code=case when e.stage='base' then 'lease_exhausted' else a.error_code end,
    enhancement_error=case when e.stage='enhance' then 'lease_exhausted' else a.enhancement_error end,updated_at=now()
    from exhausted e where a.id=e.asset_id;
  select j.* into v_job from public.video_jobs j join public.video_assets a on a.id=j.asset_id
    where j.environment=p_environment and (p_asset_id is null or j.asset_id=p_asset_id) and j.attempts<3
      and a.status not in ('cancelled','source_unavailable')
      and ((j.status='queued' and j.available_at<=now()) or (j.status='processing' and j.lease_until<=now()))
    order by case j.stage when 'base' then 0 else 1 end,j.created_at
    for update of j skip locked limit 1;
  if not found then return null; end if;
  update public.video_jobs set status='processing',attempts=attempts+1,lease_token=gen_random_uuid(),
    lease_until=now()+interval '5 minutes',updated_at=now() where id=v_job.id returning * into v_job;
  update public.video_assets set status=case when v_job.stage='base' then 'processing' else status end,
    updated_at=now() where id=v_job.asset_id returning * into v_asset;
  return jsonb_build_object('job',to_jsonb(v_job),'asset',to_jsonb(v_asset));
end $$;

create or replace function public.video_heartbeat(p_environment text,p_job_id uuid,p_lease_token uuid)
returns boolean language plpgsql set search_path = '' as $$
begin
  update public.video_jobs set lease_until=now()+interval '5 minutes',updated_at=now()
    where environment=p_environment and id=p_job_id and status='processing' and lease_token=p_lease_token and lease_until>now();
  return found;
end $$;

create or replace function public.video_finish(p_environment text,p_job_id uuid,p_lease_token uuid,p_result jsonb)
returns boolean language plpgsql set search_path = '' as $$
declare v_job public.video_jobs; v_prefix text;
begin
  perform 1 from public.video_bindings b where b.environment=p_environment and
    (b.pending_asset_id=(select asset_id from public.video_jobs where id=p_job_id) or b.active_asset_id=(select asset_id from public.video_jobs where id=p_job_id)) for update;
  select * into v_job from public.video_jobs where environment=p_environment and id=p_job_id
    and status='processing' and lease_token=p_lease_token and lease_until>now() for update;
  if not found then raise exception 'video_lease_lost'; end if;
  v_prefix:='video-pipeline/'||p_environment||'/v3/'||v_job.asset_id::text||'/';
  if not coalesce((p_result->>'master_key') like v_prefix||'%',false)
    or jsonb_typeof(p_result->'variants') is distinct from 'array'
    or jsonb_array_length(p_result->'variants')<1
    or not coalesce((p_result->>'duration_sec')::double precision>0,false)
    or not coalesce((p_result->>'width')::integer>=2 and (p_result->>'height')::integer>=2,false)
    or exists(select 1 from jsonb_array_elements(p_result->'variants') v where not coalesce((v->>'playlistKey') like v_prefix||'%',false))
    or (v_job.stage='base' and not coalesce((p_result->>'mp4_key') like v_prefix||'%',false)) then
    raise exception 'video_output_invalid';
  end if;
  update public.video_assets set status=case v_job.stage when 'base' then 'playable' else 'complete' end,
    mp4_key=coalesce(p_result->>'mp4_key',mp4_key),master_key=p_result->>'master_key',
    poster_key=coalesce(p_result->>'poster_key',poster_key),variants=p_result->'variants',
    duration_sec=(p_result->>'duration_sec')::double precision,width=(p_result->>'width')::integer,height=(p_result->>'height')::integer,
    error_code=null,enhancement_error=null,updated_at=now() where id=v_job.asset_id and status<>'cancelled';
  if not found then raise exception 'video_asset_cancelled'; end if;
  if v_job.stage='base' then
    update public.video_bindings b set active_asset_id=v_job.asset_id,pending_asset_id=null,removed=false,revision=revision+1,updated_at=now()
      where b.environment=p_environment and b.pending_asset_id=v_job.asset_id
      and exists(select 1 from public.app_documents d where d.id=b.target_id and d.collection=case b.target_type when 'lesson' then 'lessons' else 'courses' end);
    if found then update public.video_assets set published_at=now() where id=v_job.asset_id; end if;
    insert into public.video_jobs(environment,asset_id,stage) values(p_environment,v_job.asset_id,'enhance') on conflict do nothing;
  end if;
  update public.video_jobs set status='done',lease_token=null,lease_until=null,error_code=null,updated_at=now() where id=v_job.id;
  return true;
end $$;

create or replace function public.video_fail(p_environment text,p_job_id uuid,p_lease_token uuid,p_error_code text)
returns boolean language plpgsql set search_path = '' as $$
declare v_job public.video_jobs; v_code text;
begin
  select * into v_job from public.video_jobs where environment=p_environment and id=p_job_id
    and status='processing' and lease_token=p_lease_token and lease_until>now() for update;
  if not found then return false; end if;
  v_code:=left(regexp_replace(p_error_code,'[^a-zA-Z0-9_]','_','g'),80);
  update public.video_jobs set status=case when attempts<3 then 'queued' else 'failed' end,
    available_at=now()+make_interval(secs=>60*power(2,attempts-1)::integer),error_code=v_code,
    lease_token=null,lease_until=null,updated_at=now() where id=v_job.id;
  update public.video_assets set status=case when v_job.stage='base' then case when v_job.attempts<3 then 'queued' else 'failed' end else status end,
    error_code=case when v_job.stage='base' then v_code else error_code end,
    enhancement_error=case when v_job.stage='enhance' then case when v_job.attempts>=3 then v_code else null end else enhancement_error end,updated_at=now()
    where id=v_job.asset_id;
  return true;
end $$;

create or replace function public.video_cancel_upload(p_environment text,p_asset_id uuid)
returns void language plpgsql set search_path = '' as $$
begin
  perform 1 from public.video_bindings where environment=p_environment and pending_asset_id=p_asset_id for update;
  update public.video_assets set status='cancelled',updated_at=now() where environment=p_environment and id=p_asset_id and status='uploading';
  if found then
    update public.video_bindings set pending_asset_id=null,revision=revision+1,updated_at=now()
      where environment=p_environment and pending_asset_id=p_asset_id;
  end if;
end $$;

create or replace function public.video_remove(p_environment text,p_target_type text,p_target_id text)
returns void language plpgsql set search_path = '' as $$
declare v_pending uuid; v_active uuid; v_course text;
begin
  select case when p_target_type='lesson' then data->>'courseId' else id end into v_course
    from public.app_documents where id=p_target_id and collection=case p_target_type when 'lesson' then 'lessons' else 'courses' end;
  if v_course is null then raise exception 'video_target_missing'; end if;
  insert into public.video_bindings(environment,target_type,target_id,course_id) values(p_environment,p_target_type,p_target_id,v_course) on conflict do nothing;
  select pending_asset_id,active_asset_id into v_pending,v_active from public.video_bindings where environment=p_environment and target_type=p_target_type and target_id=p_target_id for update;
  update public.video_bindings set active_asset_id=null,pending_asset_id=null,removed=true,revision=revision+1,updated_at=now()
    where environment=p_environment and target_type=p_target_type and target_id=p_target_id;
  update public.video_jobs set status='cancelled',lease_token=null,lease_until=null,updated_at=now()
    where asset_id in (v_pending,v_active) and status in ('queued','processing');
  update public.video_assets set status='cancelled',updated_at=now() where id=v_pending;
end $$;

-- A recovered legacy source becomes a retained CloudFly original before encoding.
create or replace function public.video_import_source(p_environment text,p_job_id uuid,p_lease_token uuid,p_source_key text,p_bytes bigint)
returns void language plpgsql set search_path = '' as $$
declare v_job public.video_jobs;
begin
  if p_source_key !~ '^videos/[a-f0-9-]{36}\.mp4$' or p_bytes<1 or p_bytes>2147483648 then raise exception 'video_source_invalid'; end if;
  select * into v_job from public.video_jobs where environment=p_environment and id=p_job_id
    and status='processing' and lease_token=p_lease_token and lease_until>now() for update;
  if not found then raise exception 'video_lease_lost'; end if;
  update public.video_assets set source_origin=coalesce(source_origin,jsonb_build_object('provider',source_provider,'key',source_key)),
    source_provider='cloudfly',source_key=p_source_key,expected_bytes=p_bytes,updated_at=now()
    where environment=p_environment and id=v_job.asset_id and status<>'cancelled';
  if not found then raise exception 'video_asset_cancelled'; end if;
end $$;

create or replace function public.video_retry(p_environment text,p_asset_id uuid)
returns void language plpgsql set search_path = '' as $$
begin
  perform 1 from public.video_bindings where environment=p_environment and not removed and (pending_asset_id=p_asset_id or active_asset_id=p_asset_id) for update;
  if not found then
    raise exception 'video_asset_superseded';
  end if;
  update public.video_jobs set status='queued',attempts=0,available_at=now(),error_code=null,lease_token=null,lease_until=null,updated_at=now()
    where environment=p_environment and asset_id=p_asset_id and status='failed';
  if not found then raise exception 'video_retry_not_needed'; end if;
  update public.video_assets set status=case when status='failed' then 'queued' else status end,error_code=null,enhancement_error=null,updated_at=now()
    where environment=p_environment and id=p_asset_id;
end $$;

-- One control-plane query checks the current profile, membership, binding and asset.
create or replace function public.video_target_state(p_environment text,p_auth_uid uuid,p_target_type text,p_target_id text,p_manage boolean default false)
returns jsonb language plpgsql set search_path = '' as $$
declare v_user public.app_documents; v_target public.app_documents; v_course public.app_documents;
  v_binding public.video_bindings; v_active public.video_assets; v_pending public.video_assets; v_role text;
begin
  select * into v_user from public.app_documents where collection='users' and auth_uid=p_auth_uid;
  v_role:=v_user.data->>'role';
  if v_user.id is null or (v_role<>'admin' and coalesce((v_user.data->>'approved')::boolean,true)=false) then return jsonb_build_object('httpStatus',403); end if;
  select * into v_target from public.app_documents where id=p_target_id and collection=case p_target_type when 'lesson' then 'lessons' when 'course_intro' then 'courses' else '' end;
  if v_target.id is null then return jsonb_build_object('httpStatus',404); end if;
  if p_target_type='course_intro' then v_course:=v_target; else
    select * into v_course from public.app_documents where collection='courses' and id=v_target.data->>'courseId';
  end if;
  if v_course.id is null then return jsonb_build_object('httpStatus',404); end if;
  if not coalesce((v_role='admin' or (v_role='teacher' and v_course.data->>'teacherId'=v_user.id)
    or (not p_manage and (v_role='staff' or (v_role='student' and coalesce(v_course.data->'students','[]'::jsonb) ? v_user.id)))),false) then
    return jsonb_build_object('httpStatus',403);
  end if;
  select * into v_binding from public.video_bindings where environment=p_environment and target_type=p_target_type and target_id=p_target_id;
  select * into v_active from public.video_assets where id=v_binding.active_asset_id;
  select * into v_pending from public.video_assets where id=v_binding.pending_asset_id;
  return jsonb_build_object('httpStatus',200,'ownerId',v_user.id,'role',v_role,'courseId',v_course.id,
    'legacy',jsonb_build_object('videoKey',v_target.data->'videoKey','videoId',v_target.data->'videoId','videoUrl',v_target.data->'videoUrl',
      'demoVideoKey',v_target.data->'demoVideoKey','demoVideoId',v_target.data->'demoVideoId'),
    'binding',case when v_binding.target_id is null then null else jsonb_build_object('targetType',p_target_type,'targetId',p_target_id,
      'revision',v_binding.revision,'removed',v_binding.removed,'active',case when v_active.id is null then null else to_jsonb(v_active) end,
      'pending',case when v_pending.id is null then null else to_jsonb(v_pending) end) end);
end $$;

create or replace function public.video_course_state(p_environment text,p_auth_uid uuid,p_course_id text)
returns jsonb language plpgsql set search_path = '' as $$
declare v_access jsonb; v_bindings jsonb;
begin
  v_access:=public.video_target_state(p_environment,p_auth_uid,'course_intro',p_course_id,false);
  if (v_access->>'httpStatus')::integer<>200 then return v_access; end if;
  select coalesce(jsonb_agg(jsonb_build_object('targetType',b.target_type,'targetId',b.target_id,'revision',b.revision,'removed',b.removed,
    'active',case when a.id is null then null else to_jsonb(a) end,'pending',case when p.id is null then null else to_jsonb(p) end)),'[]'::jsonb)
    into v_bindings from public.video_bindings b left join public.video_assets a on a.id=b.active_asset_id
    left join public.video_assets p on p.id=b.pending_asset_id where b.environment=p_environment and b.course_id=p_course_id;
  return jsonb_build_object('httpStatus',200,'bindings',v_bindings);
end $$;

-- No browser can claim jobs, bind files or bypass the server's verified identity.
do $$ declare f record; begin
  for f in select p.oid::regprocedure as signature from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='public' and p.proname in ('video_reserve','video_complete_upload','video_claim','video_heartbeat','video_finish','video_fail','video_cancel_upload','video_remove','video_retry','video_import_source','video_target_state','video_course_state') loop
    execute format('revoke all on function %s from public, anon, authenticated',f.signature);
    execute format('grant execute on function %s to service_role',f.signature);
  end loop;
end $$;
notify pgrst,'reload schema';
