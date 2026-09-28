-- Bridge the existing document IDs and JSON fields into Supabase Postgres.
-- RLS is enabled with no browser policies until the application cutover is ready.
create table if not exists public.app_documents (
  collection text not null,
  id text not null,
  data jsonb not null default '{}'::jsonb,
  auth_uid uuid,
  version bigint not null default 1,
  updated_at timestamptz not null default now(),
  primary key (collection, id),
  constraint app_documents_collection_check check (collection in (
    'users', 'courses', 'lessons', 'progress', 'questions', 'quizResults',
    'enrollments', 'departments', 'salaryRecords', 'companySettings',
    'attendanceRecords', 'monthlySalaries', 'projects'
  )),
  constraint app_documents_auth_uid_check check (auth_uid is null or collection = 'users')
);

create unique index if not exists app_documents_auth_uid_unique
  on public.app_documents (auth_uid) where auth_uid is not null;
create index if not exists app_documents_data_gin
  on public.app_documents using gin (data jsonb_path_ops);

create or replace function public.app_documents_set_version()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.collection <> old.collection or new.id <> old.id then
    raise exception 'Document identity cannot be changed';
  end if;
  new.version := old.version + 1;
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists app_documents_set_version on public.app_documents;
create trigger app_documents_set_version
  before update on public.app_documents
  for each row execute function public.app_documents_set_version();

alter table public.app_documents enable row level security;
revoke all on public.app_documents from anon, authenticated;
grant select, insert, update, delete on public.app_documents to service_role;
