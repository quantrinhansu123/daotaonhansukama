import { NextRequest,NextResponse } from 'next/server';
import { pipelineEnvironment } from '@/lib/video-pipeline-config';
import { getPipelineAsset,pipelineRpc } from '@/lib/video-pipeline-db';
import { pipelineTargetAccess } from '@/lib/video-pipeline-access';

export const runtime='nodejs';
export async function GET(request:NextRequest,{params}:{params:Promise<{id:string}>}) {
  if(!pipelineEnvironment()) return NextResponse.json({error:'Pipeline chưa bật.'},{status:409});
  try {
    const {id}=await params;
    if(!/^[a-f0-9-]{36}$/i.test(id)) return NextResponse.json({error:'Mã video không hợp lệ.'},{status:400});
    const asset=await getPipelineAsset(id);
    if(!asset) return NextResponse.json({error:'Không tìm thấy video.'},{status:404});
    const access=await pipelineTargetAccess(request,{targetType:asset.target_type,targetId:asset.target_id},true);
    if(access instanceof NextResponse) return access;
    return NextResponse.json({id:asset.id,status:asset.status,error:asset.error_code,enhancementError:asset.enhancement_error,updatedAt:asset.updated_at},{headers:{'Cache-Control':'private, no-store'}});
  }catch{return NextResponse.json({error:'Chưa đọc được trạng thái video.'},{status:503});}
}
export async function POST(request:NextRequest,context:{params:Promise<{id:string}>}) {
  const check=await GET(request,context);
  if(!check.ok) return check;
  try {
    const {id}=await context.params;
    await pipelineRpc('video_retry',{p_asset_id:id});
    return NextResponse.json({ok:true},{headers:{'Cache-Control':'private, no-store'}});
  }catch{return NextResponse.json({error:'Video đã có job đang chạy hoặc đã được thay thế.'},{status:409});}
}
