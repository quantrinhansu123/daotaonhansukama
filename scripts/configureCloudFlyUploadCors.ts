import { GetBucketCorsCommand, PutBucketCorsCommand, type CORSRule } from '@aws-sdk/client-s3';
import { getCloudFlyStorage } from '../lib/cloudfly-s3';

async function main() {
  const { client, bucket } = getCloudFlyStorage();
  let rules: CORSRule[] = [];
  try {
    rules = (await client.send(new GetBucketCorsCommand({ Bucket: bucket }))).CORSRules || [];
  } catch (error) {
    if ((error as { name?: string }).name !== 'NoSuchCORSConfiguration') throw error;
  }
  const required: CORSRule[] = [
    {
      ID: 'biokama-signed-video-upload',
      AllowedOrigins: ['*'],
      AllowedMethods: ['PUT'],
      AllowedHeaders: ['*'],
      ExposeHeaders: ['ETag'],
      MaxAgeSeconds: 300,
    },
    {
      ID: 'biokama-signed-video-playback',
      AllowedOrigins: ['*'],
      AllowedMethods: ['GET', 'HEAD'],
      AllowedHeaders: ['*'],
      ExposeHeaders: ['ETag', 'Content-Length', 'Content-Range', 'Accept-Ranges'],
      MaxAgeSeconds: 3600,
    },
  ];
  const missing = required.filter(rule => !rules.some(existing => existing.ID === rule.ID));
  if (missing.length === 0) {
    process.stdout.write('CloudFly signed-video CORS rules already exist.\n');
    return;
  }
  const next: CORSRule[] = [...rules, ...missing];
  if (!process.argv.includes('--apply')) {
    process.stdout.write(`Would preserve ${rules.length} existing CORS rule(s) and append: ${missing.map(rule => rule.ID).join(', ')}.\n`);
    return;
  }
  await client.send(new PutBucketCorsCommand({ Bucket: bucket, CORSConfiguration: { CORSRules: next } }));
  const after = (await client.send(new GetBucketCorsCommand({ Bucket: bucket }))).CORSRules || [];
  const saved = missing.filter(rule => after.some(existing => existing.ID === rule.ID));
  if (saved.length !== missing.length) throw new Error('CloudFly did not save the CORS rule.');
  process.stdout.write(`CloudFly CORS configured; preserved ${rules.length} existing rule(s).\n`);
}

main().catch(error => {
  process.stderr.write(`CloudFly CORS setup failed: ${(error as { name?: string }).name || 'unknown'}\n`);
  process.exitCode = 1;
});
