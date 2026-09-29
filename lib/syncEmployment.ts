'use client';

import { authenticatedJson } from '@/lib/authenticated-fetch';

export async function syncEmploymentToUsers() {
  return authenticatedJson('/api/admin/sync-employment', 'POST');
}
