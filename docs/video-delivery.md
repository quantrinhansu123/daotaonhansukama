# Video optimization and local operation

## What changed

- Uploads to CloudFly queue a video for background processing. The upload request still finishes without waiting for encoding.
- The worker probes each source, preserves the uploaded object unchanged, and creates an optimized MP4, poster, and HLS renditions up to the source resolution. The ladder includes 360p, 480p, 720p, 1080p, 1440p where applicable, and a top rendition matching the uploaded pixel dimensions. It does not cap 1080p/4K sources or upscale smaller sources.
- HLS uses two-second fragmented MP4 segments. Playback starts conservatively and adapts to bandwidth; learners can also force any available rung, including `Gốc width×height`. A forced high resolution can buffer on a slow connection; Auto is the smooth-playback setting.
- The same quality control is used for course intros and lessons. Existing Bunny Stream IDs use Bunny's HLS playlist through the CDN proxy; direct HLS URLs use the same selector. A legacy single-file MP4 can expose only its original resolution until it is uploaded to CloudFly and processed into multiple rungs. Empty video slots show a disabled selector until a video is uploaded.
- The course intro and currently selected lesson preload a small buffer. Each paused video stops preloading after four seconds, then resumes when playback starts. Opening the selected lesson reuses its existing video element and buffer.
- Existing `v1` HLS assets continue playing while a `v2` asset is queued or processing. Once `v2` is ready, resolve switches to it automatically. If there is no earlier HLS asset, the player falls back to the original object while processing is pending.
- Queue and ready-state records live as JSON objects in the existing CloudFly bucket. No database schema change or migration is required.

## Process videos already in CloudFly

Use the same `.env.local` configuration already used by the app. Do not copy credentials into this document or commit them.

Queue one known source object without querying Supabase:

```powershell
npm run video:backfill -- --key=videos/<video-id>.<extension>
```

The worker converts queued objects and waits for more work:

```powershell
npm run video:worker
```

Run only one worker process for this bucket. The JSON queue uses an object-storage lease and is intended for one consumer; starting multiple workers can cause duplicate processing.

For a local demo, target a single source key so the worker does not claim a different item from the shared bucket queue:

```powershell
npm run video:worker -- --key=videos/<video-id>.<extension>
```

In production, run `npm run video:worker` on a separate background machine with the CloudFly environment variables. Running it as a separate process on the web server still lets transcodes compete with learner requests for CPU and memory. The repository has no production worker-service configuration, so deploying the Next.js site alone will not process queued uploads.

To queue all CloudFly videos from Supabase documents, use `npm run video:backfill`. To restrict the scan, use `--course-id=<course-id>`; `--intro-only` scans only course intro videos. This scan requires the Supabase server key to be configured locally. Queueing a specific `--key` does not require a database query.

To process only currently queued jobs and exit:

```powershell
npm run video:worker -- --once
```

## Local demo status

The previous `v1` demo assets were capped at 1080p and did not expose a quality selector. The updated worker publishes them under `v2`, leaving the originals and `v1` objects intact. Queue a specific demo source and run one worker to rebuild it:

```powershell
npm run video:backfill -- --key=videos/<video-id>.<extension>
npm run video:worker -- --once
```

Open `http://127.0.0.1:3000/student/courses/course_1` while the local Next.js server is running to inspect the updated asset and quality menu.

The previous local check confirmed that HLS playlists and segments were reachable, but it did not validate full source resolution or quality switching. Startup time still depends on the learner's network, device, and whether the video has been prewarmed; a universal one-second guarantee cannot be made from a local test.

## Delivery constraint to revisit before production

CloudFly's signed object responses did not provide the CORS headers needed for browser MSE playback during the local check. HLS media segments therefore pass through the app's `/api/cloudfly/video/hls` route. This makes the demo work with the current bucket configuration, but the application host carries the segment traffic. For production scale, configure a CDN/object endpoint that returns valid CORS headers and can serve signed HLS segments directly, then remove the segment proxy after verifying access controls and range/cache behavior.
