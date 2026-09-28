import { GetBucketCorsCommand } from '@aws-sdk/client-s3';
import { getCloudFlyStorage } from '../lib/cloudfly-s3';

const { client, bucket } = getCloudFlyStorage();
async function main() { try {
  const result = await client.send(new GetBucketCorsCommand({ Bucket: bucket }));
  for (const rule of result.CORSRules || []) {
    process.stdout.write(`origins=${(rule.AllowedOrigins || []).join(',')} methods=${(rule.AllowedMethods || []).join(',')} headers=${(rule.AllowedHeaders || []).join(',')} expose=${(rule.ExposeHeaders || []).join(',')}\n`);
  }
  if (!result.CORSRules?.length) process.stdout.write('No CORS rules configured.\n');
} catch (error) {
  process.stdout.write(`CORS read failed: ${(error as { name?: string }).name || 'unknown'}\n`);
  process.exitCode = 1;
} }
void main();
