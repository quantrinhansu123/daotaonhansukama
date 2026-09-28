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
  const uploadRule = rules.find(rule => rule.ID === 'biokama-signed-video-upload');
  if (uploadRule) {
    process.stdout.write('CloudFly signed-video CORS rule already exists.\n');
    return;
  }
  const next: CORSRule[] = [...rules, {
    ID: 'biokama-signed-video-upload',
    AllowedOrigins: ['*'],
    AllowedMethods: ['PUT'],
    AllowedHeaders: ['*'],
    ExposeHeaders: ['ETag'],
    MaxAgeSeconds: 300,
  }];
  if (!process.argv.includes('--apply')) {
    process.stdout.write(`Would preserve ${rules.length} existing CORS rule(s) and append one signed PUT rule.\n`);
    return;
  }
  await client.send(new PutBucketCorsCommand({ Bucket: bucket, CORSConfiguration: { CORSRules: next } }));
  const after = (await client.send(new GetBucketCorsCommand({ Bucket: bucket }))).CORSRules || [];
  if (!after.some(rule => rule.ID === 'biokama-signed-video-upload')) throw new Error('CloudFly did not save the CORS rule.');
  process.stdout.write(`CloudFly CORS configured; preserved ${rules.length} existing rule(s).\n`);
}

main().catch(error => {
  process.stderr.write(`CloudFly CORS setup failed: ${(error as { name?: string }).name || 'unknown'}\n`);
  process.exitCode = 1;
});
