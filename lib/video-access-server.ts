import 'server-only';
import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabase-admin';
import { authorizeRequest, type AuthorizedUser } from '@/lib/server-auth';
import { isCloudFlyVideoKey } from '@/lib/cloudfly-s3';

type CourseAccess = { teacherId?: string; students?: string[] };

export async function authorizeVideoSource(
  request: NextRequest,
  key: string,
): Promise<AuthorizedUser | NextResponse> {
  if (!isCloudFlyVideoKey(key)) {
    return NextResponse.json({ error: 'Mã video không hợp lệ.' }, { status: 400 });
  }
  const actor = await authorizeRequest(request, ['admin', 'teacher', 'staff', 'student']);
  if (actor instanceof NextResponse) return actor;
  const client = getSupabaseAdmin();
  const { data: intro, error: introError } = await client.from('app_documents')
    .select('id,data').eq('collection', 'courses').contains('data', { demoVideoKey: key }).limit(1);
  if (introError) throw introError;

  let course = intro?.[0]?.data as CourseAccess | undefined;
  if (!course) {
    const { data: lessons, error: lessonError } = await client.from('app_documents')
      .select('data').eq('collection', 'lessons').contains('data', { videoKey: key }).limit(1);
    if (lessonError) throw lessonError;
    const lesson = lessons?.[0]?.data as { courseId?: string } | undefined;
    if (lesson?.courseId) {
      const { data: row, error: courseError } = await client.from('app_documents')
        .select('data').eq('collection', 'courses').eq('id', lesson.courseId).maybeSingle();
      if (courseError) throw courseError;
      course = row?.data as CourseAccess | undefined;
    }
  }
  if (!course) return NextResponse.json({ error: 'Không tìm thấy video trong khóa học.' }, { status: 404 });
  if (actor.role === 'admin' || actor.role === 'staff'
    || (actor.role === 'teacher' && course.teacherId === actor.uid)
    || (actor.role === 'student' && course.students?.includes(actor.uid))) return actor;
  return NextResponse.json({ error: 'Bạn không có quyền xem video này.' }, { status: 403 });
}
