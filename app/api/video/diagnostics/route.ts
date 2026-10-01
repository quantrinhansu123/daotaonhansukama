import {NextRequest,NextResponse} from 'next/server';
import {pipelineDb} from '@/lib/video-pipeline-db';
import {verifiedVideoUser} from '@/lib/video-pipeline-access';
import {inventoryTargets} from '@/lib/video-pipeline-inventory';
import {pipelineEnvironment} from '@/lib/video-pipeline-config';

export const runtime='nodejs';
export async function GET(request:NextRequest) {
  if(process.env.VERCEL || pipelineEnvironment()!=='development') return NextResponse.json({error:'Chỉ mở sau khi bật pipeline development trên local.'},{status:404});
  try {
    const uid=await verifiedVideoUser(request);if(uid instanceof NextResponse) return uid;
    const {data:user,error}=await pipelineDb().from('app_documents').select('data').eq('collection','users').eq('auth_uid',uid).maybeSingle();
    if(error || user?.data?.role!=='admin') return NextResponse.json({error:'Cần tài khoản quản trị viên.'},{status:403});
    const videos=await inventoryTargets();
    const {data:bindings,error:bindingError}=await pipelineDb().from('video_bindings').select('target_type,target_id,active_asset_id,pending_asset_id,removed').eq('environment','development');
    if(bindingError) return NextResponse.json({error:'Chưa áp dụng migration pipeline.'},{status:503});
    return NextResponse.json({videos:videos.map(v=>({targetType:v.targetType,targetId:v.targetId,title:v.title,
      published:Boolean(bindings?.find(b=>b.target_type===v.targetType && b.target_id===v.targetId && b.active_asset_id && !b.removed))}))},{headers:{'Cache-Control':'private, no-store'}});
  }catch{return NextResponse.json({error:'Chưa tải được danh sách đo video.'},{status:503});}
}
