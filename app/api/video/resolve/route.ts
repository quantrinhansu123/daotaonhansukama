import { NextRequest,NextResponse } from 'next/server';
import { pipelineEnvironment } from '@/lib/video-pipeline-config';
import { parseVideoTarget,pipelineTargetAccess } from '@/lib/video-pipeline-access';
import { assetScope,signedVideoUrl } from '@/lib/bunny-video-delivery';
import {getPipelineAsset} from '@/lib/video-pipeline-db';

export const runtime='nodejs';
const json=(v:unknown,status=200)=>NextResponse.json(v,{status,headers:{'Cache-Control':'private, no-store'}});
let lastBenchmarkExpiry=0;
export async function GET(request:NextRequest) {
  if(!pipelineEnvironment()) return json({status:'disabled'});
  try {
    const target=parseVideoTarget(Object.fromEntries(request.nextUrl.searchParams));
    if(!target) return json({error:'Đối tượng video không hợp lệ.'},400);
    const access=await pipelineTargetAccess(request,target);
    if(access instanceof NextResponse) return access;
    const binding=access.binding;
    let asset=binding?.active;
    if(binding?.removed) return json({error:'Video đã được gỡ khỏi bài học.'},404);
    const pinned=request.nextUrl.searchParams.get('assetId');
    if(pinned) {
      if(!/^[a-f0-9-]{36}$/i.test(pinned)) return json({error:'Phiên bản video không hợp lệ.'},400);
      const previous=await getPipelineAsset(pinned);
      if(!previous?.published_at || previous.target_id!==target.targetId || previous.target_type!==target.targetType) return json({error:'Phiên bản chưa từng được xuất bản cho video này.'},404);
      asset=previous;
    }
    if(!asset) {
      if(binding?.pending?.status==='source_unavailable') return json({error:'Không tìm thấy nguồn video cũ. Giáo viên cần tải lại.'},404);
      // Only an existing published legacy reference can use the old path during migration.
      const d=access.legacy;
      const existing=target.targetType==='lesson'?(d.videoKey || d.videoId || d.videoUrl):(d.demoVideoKey || d.demoVideoId);
      if(existing) return json({status:'legacy',processing:Boolean(binding?.pending)});
      return json({error:binding?.pending?.status==='failed'?'Video xử lý lỗi. Giáo viên cần thử lại.':'Video đang được chuẩn bị, chưa xuất bản.',status:'processing'},409);
    }
    if(!asset.master_key || !asset.mp4_key || !['playable','complete'].includes(asset.status)) return json({error:'Bản video chưa đạt điều kiện phát.'},409);
    let expires=Math.floor(Date.now()/1000)+7200;
    if(request.nextUrl.searchParams.get('benchmark')==='true') {
      if(process.env.VERCEL || pipelineEnvironment()!=='development' || access.role!=='admin') return json({error:'Đo video chỉ mở cho quản trị viên trong môi trường local.'},403);
      // A distinct, valid token prefix gives every HLS object a fresh browser
      // cache key while Bunny can reuse the same authenticated CDN object.
      lastBenchmarkExpiry=Math.max(Math.floor(Date.now()/1000)+3600,lastBenchmarkExpiry+1);
      if(lastBenchmarkExpiry>Math.floor(Date.now()/1000)+7200) return json({error:'Đã đạt giới hạn lượt đo. Vui lòng chờ.'},429);
      expires=lastBenchmarkExpiry;
    }
    const scope=assetScope(asset.master_key);
    const pinnedVersion=request.nextUrl.searchParams.get('version');
    const master=pinnedVersion || asset.master_key;
    if(!master.startsWith(scope) || !/\/[a-f0-9-]{36}\/master\.m3u8$/i.test(master) || master.split('/').includes('..')) return json({error:'Manifest không thuộc phiên bản này.'},400);
    return json({status:'ready',assetId:asset.id,version:master,url:signedVideoUrl(asset.mp4_key,expires,scope),
      hlsUrl:signedVideoUrl(master,expires,scope),posterUrl:asset.poster_key?signedVideoUrl(asset.poster_key,expires,scope):undefined,
      expiresAt:expires*1000,processing:asset.status==='playable',sourceQualityAvailable:asset.status==='complete' && master===asset.master_key,variants:asset.variants});
  }catch{return json({error:'Chưa cấp được đường phát video. Kiểm tra cấu hình pipeline.'},503);}
}
