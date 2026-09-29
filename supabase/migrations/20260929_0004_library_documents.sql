-- Allow document library rows in app_documents.
alter table public.app_documents drop constraint if exists app_documents_collection_check;
alter table public.app_documents add constraint app_documents_collection_check check (collection in (
  'users', 'courses', 'lessons', 'progress', 'questions', 'quizResults',
  'enrollments', 'departments', 'salaryRecords', 'companySettings',
  'attendanceRecords', 'monthlySalaries', 'projects', 'libraryDocuments'
));

drop policy if exists app_documents_read on public.app_documents;
create policy app_documents_read on public.app_documents
  for select to authenticated using (
    collection in ('courses', 'lessons', 'questions', 'departments', 'projects', 'libraryDocuments')
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

notify pgrst, 'reload schema';
