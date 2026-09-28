import { randomUUID } from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';
import { adminAuth, adminDb } from '@/lib/firebase-admin';
import { authorizeRequest } from '@/lib/server-auth';
import type { EmploymentInfo } from '@/types/user';
import { getSupabaseAdmin } from '@/lib/supabase-admin';

export const runtime = 'nodejs';

const EMPLOYEE_API = 'https://checkin-ten-gamma.vercel.app/api/employees';

function employmentFields(employee: EmploymentInfo) {
  const safeEmployment = { ...employee };
  delete safeEmployment.password;
  return {
    employment: safeEmployment,
    displayName: employee.fullName || employee.email,
    ...(employee.phone ? { phoneNumber: employee.phone } : {}),
    ...(employee.address ? { address: employee.address } : {}),
    ...(employee.country ? { country: employee.country } : {}),
    ...(employee.avatarURL ? { photoURL: employee.avatarURL } : {}),
    ...(employee.birthday ? { dateOfBirth: employee.birthday } : {}),
    ...(employee.position ? { position: employee.position } : {}),
    ...(typeof employee.baseSalary === 'number' ? { monthlySalary: employee.baseSalary } : {}),
    ...(employee.employmentStatus ? { employmentStatus: employee.employmentStatus } : {}),
    ...(employee.startDate ? { employmentStartDate: employee.startDate } : {}),
    ...(employee.maritalStatus ? { employmentMaritalStatus: employee.maritalStatus } : {}),
    ...(employee.branch ? { employmentBranch: employee.branch } : {}),
    ...(employee.team ? { employmentTeam: employee.team } : {}),
    ...(typeof employee.salaryPercentage === 'number' ? { employmentSalaryPercentage: employee.salaryPercentage } : {}),
    ...(typeof employee.active === 'boolean' ? { employmentActive: employee.active } : {}),
    updatedAt: new Date(),
  };
}

export async function POST(request: NextRequest) {
  const actor = await authorizeRequest(request, ['admin']);
  if (actor instanceof NextResponse) return actor;

  try {
    const response = await fetch(EMPLOYEE_API, { cache: 'no-store' });
    if (!response.ok) throw new Error(`Employee API returned ${response.status}`);
    const employees = await response.json() as EmploymentInfo[];
    if (!Array.isArray(employees)) throw new Error('Employee API returned invalid data');
    let created = 0;
    let updated = 0;
    let skipped = 0;

    if (process.env.NEXT_PUBLIC_SUPABASE_ENABLED === 'true') {
      const client = getSupabaseAdmin();
      for (const employee of employees) {
        const email = employee.email?.trim().toLowerCase();
        if (!email) { skipped++; continue; }
        const found = await client.from('app_documents').select('id,data')
          .eq('collection', 'users').eq('data->>email', email).maybeSingle();
        if (found.error) throw found.error;
        if (found.data) {
          const result = await client.from('app_documents').update({
            data: { ...found.data.data, ...employmentFields(employee) },
          }).eq('collection', 'users').eq('id', found.data.id);
          if (result.error) throw result.error;
          updated++;
          continue;
        }
        if (!employee.password || employee.password.length < 6) { skipped++; continue; }
        const uid = `staff_${employee.id || randomUUID()}`;
        const createdUser = await client.auth.admin.createUser({
          email, password: employee.password, email_confirm: true, user_metadata: { legacy_uid: uid },
        });
        if (createdUser.error || !createdUser.data.user) throw createdUser.error || new Error('Cannot create Supabase user');
        const result = await client.from('app_documents').insert({
          collection: 'users', id: uid, auth_uid: createdUser.data.user.id,
          data: { ...employmentFields(employee), uid, email, role: 'staff', approved: true,
            totalLearningHours: 0, createdAt: new Date() },
        });
        if (result.error) {
          await client.auth.admin.deleteUser(createdUser.data.user.id);
          throw result.error;
        }
        created++;
      }
      return NextResponse.json({ created, updated, skipped });
    }

    const db = adminDb();
    for (const employee of employees) {
      const email = employee.email?.trim().toLowerCase();
      if (!email) { skipped++; continue; }
      const existing = await db.collection('users').where('email', '==', email).limit(1).get();
      if (!existing.empty) {
        await existing.docs[0].ref.update(employmentFields(employee));
        updated++;
        continue;
      }
      if (!employee.password || employee.password.length < 6) { skipped++; continue; }
      const uid = `staff_${employee.id || randomUUID()}`;
      await adminAuth().createUser({ uid, email, password: employee.password, displayName: employee.fullName || email });
      try {
        await db.collection('users').doc(uid).set({
          ...employmentFields(employee),
          uid,
          email,
          role: 'staff',
          approved: true,
          totalLearningHours: 0,
          createdAt: new Date(),
        });
      } catch (error) {
        await adminAuth().deleteUser(uid);
        throw error;
      }
      created++;
    }
    return NextResponse.json({ created, updated, skipped });
  } catch (error) {
    console.error('[Admin] Employment sync failed:', error);
    return NextResponse.json({ error: 'Không đồng bộ được dữ liệu nhân sự.' }, { status: 502 });
  }
}
