import { deleteApp, initializeApp } from 'firebase/app';
import { collection, getDocs, getFirestore } from 'firebase/firestore';

const names = [
  'users', 'courses', 'lessons', 'progress', 'questions', 'quizResults',
  'enrollments', 'departments', 'salaryRecords', 'companySettings',
  'attendanceRecords', 'monthlySalaries', 'projects',
];

const app = initializeApp({
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
});
const db = getFirestore(app);

async function main() {
  for (const name of names) {
    try {
      const snapshot = await getDocs(collection(db, name));
      process.stdout.write(`${name}: ${snapshot.size}\n`);
    } catch (error) {
      process.stdout.write(`${name}: READ_FAILED\n`);
      process.stderr.write(`${name}: ${error instanceof Error ? error.name : 'unknown error'}\n`);
      process.exitCode = 1;
    }
  }
  await deleteApp(app);
}

void main();
