import { NextRequest,NextResponse } from 'next/server';
import { pipelineEnvironment } from '@/lib/video-pipeline-config';
import { parseVideoTarget,pipelineTargetAccess,publicBinding,verifiedVideoUser } from '@/lib/video-pipeline-access';
import { pipelineRpc } from '@/lib/video-pipeline-db';
import type { VideoBindingState } from '@/lib/video-pipeline-types';

export const runtime='nodejs';
const json=(v:unknown,status=200)=>NextResponse.json(v,{status,headers:{'Cache-Control':'private, no-store'}});
export async function GET(request:NextRequest) {
  if(!pipelineEnvironment()) return json({enabled:false,bindings:[]});
  try {
    const courseId=request.nextUrl.searchParams.get('courseId');
    if(!courseId || !/^[a-zA-Z0-9_-]{1,160}$/.test(courseId)) return json({error:'Mã khóa học không hợp lệ.'},400);
    const uid=await verifiedVideoUser(request);
    if(uid instanceof NextResponse) return uid;
    const result=await pipelineRpc<{httpStatus:number;bindings?:VideoBindingState[]}>('video_course_state',{p_auth_uid:uid,p_course_id:courseId});
    if(result.httpStatus!==200) return json({error:'Không có quyền truy cập khóa học.'},result.httpStatus);
    return json({enabled:true,bindings:(result.bindings || []).map(publicBinding)});
  }catch {return json({error:'Chưa đọc được trạng thái xử lý video.'},503);}
}
export async function DELETE(request:NextRequest) {
  if(!pipelineEnvironment()) return json({enabled:false},409);
  try {
    const target=parseVideoTarget(await request.json().catch(()=>null));
    if(!target) return json({error:'Đối tượng video không hợp lệ.'},400);
    const access=await pipelineTargetAccess(request,target,true);
    if(access instanceof NextResponse) return access;
    await pipelineRpc('video_remove',{p_target_type:target.targetType,p_target_id:target.targetId});
    return json({ok:true});
  }catch{return json({error:'Không gỡ được video.'},503);}
}
