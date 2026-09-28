'use client';

import { authenticatedJson } from '@/lib/authenticated-fetch';
import { syncEmploymentToUsers as legacySyncEmployment } from '@/lib/legacy-sync-employment';

export async function syncEmploymentToUsers() {
  return process.env.NEXT_PUBLIC_SUPABASE_ENABLED === 'true' || process.env.NEXT_PUBLIC_FIREBASE_AUTH_ENABLED === 'true'
    ? authenticatedJson('/api/admin/sync-employment', 'POST')
    : legacySyncEmployment();
}
