import { ListMultipartUploadsCommand, ListPartsCommand } from '@aws-sdk/client-s3';
import { getCloudFlyStorage } from '../lib/cloudfly-s3';

async function main() {
  const { client, bucket } = getCloudFlyStorage();
  const uploads = await client.send(new ListMultipartUploadsCommand({ Bucket: bucket, Prefix: 'videos/' }));
  for (const item of uploads.Uploads || []) {
    if (!item.Key || !item.UploadId) continue;
    const parts = await client.send(new ListPartsCommand({ Bucket: bucket, Key: item.Key, UploadId: item.UploadId }));
    const bytes = (parts.Parts || []).reduce((sum, part) => sum + (part.Size || 0), 0);
    process.stdout.write(`active video upload: ${(bytes / 1048576).toFixed(1)} MiB in ${parts.Parts?.length || 0} complete parts\n`);
  }
  if (!uploads.Uploads?.length) process.stdout.write('No active video multipart uploads.\n');
}
main().catch(error => {
  process.stderr.write(`Multipart inspection failed: ${(error as { name?: string }).name || 'unknown'}\n`);
  process.exitCode = 1;
});
