-- Browser access is enabled only after the imported accounts and documents
-- have been checked. Keep the secret key on the server.
create or replace function public.app_role()
returns text
language sql stable security definer
set search_path = ''
as $$
  select case
    when data->>'role' = 'admin' or coalesce((data->>'approved')::boolean, true)
      then data->>'role'
    else null
  end
  from public.app_documents
  where collection = 'users' and auth_uid = auth.uid()
  limit 1;
$$;

create or replace function public.app_legacy_uid()
returns text
language sql stable security definer
set search_path = ''
as $$
  select id from public.app_documents
  where collection = 'users' and auth_uid = auth.uid()
  limit 1;
$$;

revoke all on function public.app_role() from public;
revoke all on function public.app_legacy_uid() from public;
grant execute on function public.app_role() to authenticated;
grant execute on function public.app_legacy_uid() to authenticated;

create or replace function public.app_documents_guard_user_update()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if old.collection = 'users' and current_user = 'authenticated' then
    if old.auth_uid is distinct from auth.uid()
      or new.auth_uid is distinct from old.auth_uid
      or (new.data - array[
        'displayName', 'photoURL', 'dateOfBirth', 'address', 'country',
        'phoneNumber', 'workLocation', 'updatedAt'
      ]::text[]) is distinct from (old.data - array[
        'displayName', 'photoURL', 'dateOfBirth', 'address', 'country',
        'phoneNumber', 'workLocation', 'updatedAt'
      ]::text[]) then
      raise exception 'Only personal profile fields can be changed';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists app_documents_guard_user_update on public.app_documents;
create trigger app_documents_guard_user_update
  before update on public.app_documents
  for each row execute function public.app_documents_guard_user_update();

grant select, insert, update, delete on public.app_documents to authenticated;

create policy app_documents_read on public.app_documents
  for select to authenticated using (
    collection in ('courses', 'lessons', 'questions', 'departments', 'projects')
    or (collection = 'users' and (
      auth_uid = auth.uid() or public.app_role() in ('admin', 'staff', 'teacher')
    ))
    or (collection in ('progress', 'quizResults', 'attendanceRecords', 'enrollments') and (
      data->>'userId' = public.app_legacy_uid()
      or public.app_role() in ('admin', 'staff', 'teacher')
    ))
    or (collection in ('salaryRecords', 'monthlySalaries', 'companySettings')
      and public.app_role() in ('admin', 'staff'))
  );

create policy app_documents_insert on public.app_documents
  for insert to authenticated with check (
    (collection in ('progress', 'quizResults') and data->>'userId' = public.app_legacy_uid())
    or (collection = 'attendanceRecords' and public.app_role() = 'staff'
      and data->>'userId' = public.app_legacy_uid())
    or (collection <> 'users' and public.app_role() in ('admin', 'staff'))
    or (collection in ('courses', 'lessons', 'questions') and public.app_role() = 'teacher')
  );

create policy app_documents_update on public.app_documents
  for update to authenticated
  using (
    (collection = 'users' and auth_uid = auth.uid())
    or (collection in ('progress', 'quizResults') and data->>'userId' = public.app_legacy_uid())
    or (collection = 'attendanceRecords' and public.app_role() = 'staff'
      and data->>'userId' = public.app_legacy_uid())
    or (collection <> 'users' and public.app_role() in ('admin', 'staff'))
    or (collection in ('courses', 'lessons', 'questions') and public.app_role() = 'teacher')
  )
  with check (
    (collection = 'users' and auth_uid = auth.uid())
    or (collection in ('progress', 'quizResults') and data->>'userId' = public.app_legacy_uid())
    or (collection = 'attendanceRecords' and public.app_role() = 'staff'
      and data->>'userId' = public.app_legacy_uid())
    or (collection <> 'users' and public.app_role() in ('admin', 'staff'))
    or (collection in ('courses', 'lessons', 'questions') and public.app_role() = 'teacher')
  );

create policy app_documents_delete on public.app_documents
  for delete to authenticated using (
    (collection in ('progress', 'quizResults') and data->>'userId' = public.app_legacy_uid())
    or (collection = 'attendanceRecords' and public.app_role() = 'staff'
      and data->>'userId' = public.app_legacy_uid())
    or (collection <> 'users' and public.app_role() in ('admin', 'staff'))
    or (collection in ('courses', 'lessons', 'questions') and public.app_role() = 'teacher')
  );

notify pgrst, 'reload schema';
