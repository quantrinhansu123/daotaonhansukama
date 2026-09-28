# Supabase cutover

Local migration was verified on 2026-09-28: 4 Auth users, 185 application documents, no plaintext passwords in `app_documents`. CloudFly and Bunny remain separate media services.

## Before deploying

1. Stop writes to the old Firestore application, then run `node --env-file=.env.local --import tsx scripts/migrateToSupabase.ts --apply` once more. The script checks every copied document and refuses to overwrite Supabase edits.
2. Run `node --env-file=.env.local --import tsx scripts/testSupabaseAccess.ts` and `node --env-file=.env.local scripts/checkSupabaseShape.mjs`.
3. Set `NEXT_PUBLIC_SUPABASE_ENABLED=true`, `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, and `SUPABASE_SECRET_KEY` in the deployment environment. Keep `CLOUDFLY_S3_BUCKET`, `CLOUDFLY_S3_ACCESS_KEY_ID`, `CLOUDFLY_S3_SECRET_ACCESS_KEY`, and the existing Bunny variables. `SUPABASE_DB_URL` is for local migration scripts only. Never expose the Supabase secret or CloudFly keys as `NEXT_PUBLIC_` variables.
4. In Supabase Auth URL Configuration, allow the deployed `/reset-password` URL as a redirect for password reset emails.
5. The CloudFly bucket must allow browser `PUT` requests and expose the `ETag` header for the deployed origin. Local bucket CORS was configured and verified on 2026-09-28; check it again if the bucket changes (`node --env-file=.env.local --import tsx scripts/checkCloudFlyCors.ts`). The browser uploads 16 MiB parts directly to CloudFly with short-lived signed URLs; application servers only create and complete the session.
6. Deploy and test admin login, course reads, a short video upload/playback, and a student progress save. Keep the Firestore source until production use is confirmed. After cutover, close the old Firestore rules and remove its plaintext password fields; its current rules still allow public read/write.

`.env.local` is ignored by Git and does not populate deployment environment variables automatically. The current repository retains Firebase fallback code for rollback; Supabase is selected by `NEXT_PUBLIC_SUPABASE_ENABLED`.

Video uploads preserve the MP4 bytes; the app does not improve low resolution footage or adapt bitrates. For browser playback, supply MP4 H.264/AAC with `faststart` metadata. Uploads continue while navigating within the app, but closing the browser tab or losing connectivity can interrupt them; the browser warns before leaving.
