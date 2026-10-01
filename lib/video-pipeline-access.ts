import 'server-only';
import { NextRequest,NextResponse } from 'next/server';
import { pipelineDb,pipelineRpc } from './video-pipeline-db';
import type { VideoBindingState,VideoTarget } from './video-pipeline-types';

export function parseVideoTarget(body:unknown):VideoTarget|null {
  if(!body || typeof body!=='object') return null;
  const b=body as Record<string,unknown>;
  if(!['lesson','course_intro'].includes(String(b.targetType)) || typeof b.targetId!=='string' || !/^[a-zA-Z0-9_-]{1,160}$/.test(b.targetId)) return null;
  return {targetType:b.targetType as VideoTarget['targetType'],targetId:b.targetId};
}
export async function verifiedVideoUser(request:NextRequest):Promise<string|NextResponse> {
  const token=/^Bearer (\S+)$/i.exec(request.headers.get('authorization') || '')?.[1];
  if(!token) return NextResponse.json({error:'Bạn cần đăng nhập để xem video.'},{status:401});
  const {data,error}=await pipelineDb().auth.getClaims(token);
  if(error || !data?.claims.sub) return NextResponse.json({error:'Phiên đăng nhập không hợp lệ.'},{status:401});
  return data.claims.sub;
}
export type TargetAccess={httpStatus:number;ownerId:string;role:string;courseId:string;legacy:Record<string,unknown>;binding:VideoBindingState|null};
export async function pipelineTargetAccess(request:NextRequest,target:VideoTarget,manage=false):Promise<TargetAccess|NextResponse> {
  const uid=await verifiedVideoUser(request);
  if(uid instanceof NextResponse) return uid;
  const access=await pipelineRpc<TargetAccess>('video_target_state',{p_auth_uid:uid,p_target_type:target.targetType,p_target_id:target.targetId,p_manage:manage});
  if(access.httpStatus!==200) return NextResponse.json({error:access.httpStatus===404?'Không tìm thấy video trong khóa học.':'Bạn không có quyền truy cập video này.'},{status:access.httpStatus});
  return access;
}
// Processing details stay on the server; browser responses do not expose owner/upload IDs.
export function publicBinding(binding:VideoBindingState) {
  const safe=(a:VideoBindingState['active'])=>a?{
    id:a.id,status:a.status,source_provider:a.source_provider,source_key:a.source_key,
    duration_sec:a.duration_sec,width:a.width,height:a.height,error_code:a.error_code,
    enhancement_error:a.enhancement_error,updated_at:a.updated_at,
  }:null;
  return {...binding,active:safe(binding.active),pending:safe(binding.pending)};
}
