import 'server-only';
import { randomUUID } from 'node:crypto';
import { AbortMultipartUploadCommand,CompleteMultipartUploadCommand,CreateMultipartUploadCommand,HeadObjectCommand,UploadPartCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { NextRequest,NextResponse } from 'next/server';
import { getCloudFlyStorage } from './cloudfly-s3';
import { parseVideoTarget,pipelineTargetAccess } from './video-pipeline-access';
import { completeVideoUpload,getPipelineAsset,pipelineRpc,reserveVideo } from './video-pipeline-db';
import { bunnyVideoConfig } from './bunny-video-delivery';

const MAX=2*1024**3,PART=16*1024**2;
const EXT:Record<string,string>={'video/mp4':'mp4','application/mp4':'mp4','video/webm':'webm','video/quicktime':'mov','video/x-matroska':'mkv','video/x-msvideo':'avi','video/mpeg':'mpeg','video/3gpp':'3gp'};
const json=(value:unknown,status=200)=>NextResponse.json(value,{status,headers:{'Cache-Control':'private, no-store'}});
export async function pipelineMultipart(request:NextRequest) {
  let created:{key:string;uploadId:string;assetId:string}|undefined;
  try {
    const body=await request.json().catch(()=>null);
    const target=parseVideoTarget(body);
    if(!target) return json({error:'Cần chỉ định bài học hoặc video giới thiệu.'},400);
    const access=await pipelineTargetAccess(request,target,true);
    if(access instanceof NextResponse) return access;
    const {client,bucket}=getCloudFlyStorage();
    if(request.method==='POST') {
      bunnyVideoConfig(); // Fail before accepting a file if delivery is not configured.
      const mime=typeof body.mime==='string'?body.mime.toLowerCase().trim():'';
      const size=Number(body.size),ext=EXT[mime];
      if(!ext || !Number.isSafeInteger(size) || size<1 || size>MAX) return json({error:'Video phải có định dạng hỗ trợ và tối đa 2 GB.'},400);
      const id=randomUUID(),key=`videos/${randomUUID()}.${ext}`;
      const started=await client.send(new CreateMultipartUploadCommand({Bucket:bucket,Key:key,ContentType:mime,ContentDisposition:'inline'}));
      if(!started.UploadId) throw new Error('multipart_id_missing');
      created={key,uploadId:started.UploadId,assetId:id};
      await reserveVideo({...target,id,ownerId:access.ownerId,provider:'cloudfly',key,uploadId:started.UploadId,size});
      const urls=await Promise.all(Array.from({length:Math.ceil(size/PART)},(_,i)=>getSignedUrl(client,new UploadPartCommand({Bucket:bucket,Key:key,UploadId:started.UploadId,PartNumber:i+1}),{expiresIn:21600})));
      return json({key,assetId:id,uploadId:started.UploadId,partSize:PART,urls,pipeline:true,status:'uploading'});
    }
    if(typeof body.assetId!=='string' || !/^[a-f0-9-]{36}$/i.test(body.assetId)) return json({error:'Mã video không hợp lệ.'},400);
    const asset=await getPipelineAsset(body.assetId);
    if(!asset || asset.target_type!==target.targetType || asset.target_id!==target.targetId
      || (asset.owner_id!==access.ownerId && access.role!=='admin') || asset.source_key!==body.key || asset.upload_id!==body.uploadId) return json({error:'Phiên upload không thuộc đối tượng này.'},403);
    if(request.method==='DELETE') {
      // Once assembly succeeded, never cancel a durable processing job on a lost response.
      const object=await client.send(new HeadObjectCommand({Bucket:bucket,Key:asset.source_key})).catch(()=>null);
      if(object?.ContentLength===asset.expected_bytes) {
        const queued=await completeVideoUpload(asset.id);
        return json({key:asset.source_key,assetId:asset.id,pipeline:true,status:queued.status});
      }
      if(asset.status==='uploading') {
        await client.send(new AbortMultipartUploadCommand({Bucket:bucket,Key:asset.source_key,UploadId:asset.upload_id!})).catch(()=>{});
        await pipelineRpc('video_cancel_upload',{p_asset_id:asset.id});
      }
      return json({ok:true,pipeline:true});
    }
    if(asset.status==='cancelled') return json({error:'Phiên upload đã bị hủy.'},409);
    if(body.size!==asset.expected_bytes || !Array.isArray(body.parts) || body.parts.length!==Math.ceil(Number(asset.expected_bytes)/PART)
      || body.parts.some((p:{partNumber?:number;etag?:string},i:number)=>p?.partNumber!==i+1 || typeof p.etag!=='string' || !/^"?[0-9a-f]{32}(?:-[0-9]+)?"?$/i.test(p.etag))) return json({error:'Danh sách phần video không hợp lệ.'},400);
    let object=await client.send(new HeadObjectCommand({Bucket:bucket,Key:asset.source_key})).catch(()=>null);
    if(!object && asset.status==='uploading') {
      await client.send(new CompleteMultipartUploadCommand({Bucket:bucket,Key:asset.source_key,UploadId:asset.upload_id!,MultipartUpload:{Parts:body.parts.map((p:{partNumber:number;etag:string})=>({PartNumber:p.partNumber,ETag:p.etag}))}})).catch(()=>{});
      object=await client.send(new HeadObjectCommand({Bucket:bucket,Key:asset.source_key})).catch(()=>null);
    }
    if(object?.ContentLength!==asset.expected_bytes) return json({error:'CloudFly chưa xác nhận đủ dung lượng video. Có thể thử hoàn tất lại.'},502);
    const queued=await completeVideoUpload(asset.id);
    return json({key:asset.source_key,assetId:asset.id,status:queued.status,pipeline:true,processingQueued:true});
  } catch(error) {
    if(created) {
      const {client,bucket}=getCloudFlyStorage();
      await client.send(new AbortMultipartUploadCommand({Bucket:bucket,Key:created.key,UploadId:created.uploadId})).catch(()=>{});
      await pipelineRpc('video_cancel_upload',{p_asset_id:created.assetId}).catch(()=>{});
    }
    // Do not log signed URLs, API keys, ffmpeg arguments or remote error bodies.
    console.error('[video-upload] failed',error instanceof Error?error.message.split(':')[0]:'unknown');
    return json({error:'Chưa hoàn tất pipeline video. Kiểm tra cấu hình database/CDN hoặc thử lại.'},503);
  }
}
