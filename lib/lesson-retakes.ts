import { collection, doc, getDocs, query, setDoc, where } from '@/lib/data-store';
import { db } from '@/lib/data-store';
import { LessonRetake } from '@/types/lesson';

export const PASS_SCORE = 70;

export async function recordLessonRetake(input: {
  userId: string;
  userName: string;
  lessonId: string;
  lessonTitle: string;
  courseId: string;
  previousScore: number;
}): Promise<LessonRetake> {
  const existing = await getDocs(query(
    collection(db, 'lessonRetakes'),
    where('userId', '==', input.userId),
    where('lessonId', '==', input.lessonId),
  ));
  const row: LessonRetake = {
    id: `${input.userId}_${input.lessonId}_${Date.now()}`,
    ...input,
    attempt: existing.size + 1,
    startedAt: new Date(),
  };
  await setDoc(doc(db, 'lessonRetakes', row.id), {
    ...row,
    startedAt: row.startedAt.toISOString(),
  });
  return row;
}
