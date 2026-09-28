-- Records the last Firebase copy. A later sync may update a document only if
-- its Supabase value still equals this source copy.
create table if not exists public.migration_source_state (
  collection text not null,
  id text not null,
  data jsonb not null,
  primary key (collection, id)
);
alter table public.migration_source_state enable row level security;
revoke all on public.migration_source_state from anon, authenticated;
