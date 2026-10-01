'use client';
import { useCallback,useEffect,useState } from 'react';
import { authenticatedFetch,authenticatedJson } from './authenticated-fetch';
import type { PublicVideoBinding,VideoTarget } from './video-pipeline-types';
import type { Lesson } from '@/types/lesson';
import type { Course } from '@/types/course';

export const notifyVideoBindings=()=>window.dispatchEvent(new Event('video-pipeline-changed'));
export function useVideoBindings(courseId:string) {
  const [state,setState]=useState<{courseId:string;enabled:boolean;bindings:PublicVideoBinding[];error:string}>({courseId,enabled:false,bindings:[],error:''});
  const [refreshKey,setRefreshKey]=useState(0);
  const refresh=useCallback(()=>setRefreshKey(n=>n+1),[]);
  useEffect(()=>{
    if(process.env.NEXT_PUBLIC_VIDEO_PIPELINE_ENABLED!=='true') return;
    const controller=new AbortController();
    let timer:ReturnType<typeof setTimeout>;
    const load=async()=>{
      try {
        const response=await authenticatedFetch(`/api/video/bindings?courseId=${encodeURIComponent(courseId)}`,{signal:controller.signal});
        const body=await response.json();
        if(!response.ok) throw new Error(body.error || 'Chưa đọc được trạng thái video.');
        if(controller.signal.aborted) return;
        setState({courseId,enabled:body.enabled,bindings:body.bindings || [],error:''});
        if(body.enabled) timer=setTimeout(()=>void load(),body.bindings?.some((b:PublicVideoBinding)=>b.pending || b.active?.status==='playable')?3000:30_000);
      }catch(e){if(!controller.signal.aborted){setState(s=>({...s,error:e instanceof Error?e.message:'Chưa đọc được trạng thái video.'}));timer=setTimeout(()=>void load(),10_000);}}
    };
    void load();
    window.addEventListener('video-pipeline-changed',refresh);
    return ()=>{controller.abort();clearTimeout(timer);window.removeEventListener('video-pipeline-changed',refresh);};
  },[courseId,refreshKey,refresh]);
  const bindings=state.courseId===courseId?state.bindings:[];
  return {...state,bindings,refresh};
}
export function lessonWithBinding(lesson:Lesson,bindings:PublicVideoBinding[]):Lesson {
  const b=bindings.find(x=>x.targetType==='lesson' && x.targetId===lesson.id);
  if(!b) return lesson;
  const media=(b.removed || (!b.active && b.pending?.status==='source_unavailable'))?{videoKey:undefined,videoId:undefined,videoUrl:undefined}:b.active
    ?b.active.source_provider==='cloudfly'?{videoKey:b.active.source_key,videoId:undefined,videoUrl:undefined}
      :{videoKey:undefined,videoId:b.active.source_key,videoUrl:undefined}:{};
  return {...lesson,...media,videoAssetId:b.active?.id,videoPendingAssetId:b.pending?.id,videoStatus:b.pending?.status || b.active?.status,
    duration:b.active?.duration_sec || lesson.duration};
}
export function courseWithBinding(course:Course,bindings:PublicVideoBinding[]):Course {
  const b=bindings.find(x=>x.targetType==='course_intro' && x.targetId===course.id);
  if(!b) return course;
  const media=(b.removed || (!b.active && b.pending?.status==='source_unavailable'))?{demoVideoKey:undefined,demoVideoId:undefined}:b.active
    ?b.active.source_provider==='cloudfly'?{demoVideoKey:b.active.source_key,demoVideoId:undefined}:{demoVideoKey:undefined,demoVideoId:b.active.source_key}:{};
  return {...course,...media};
}
export async function removeBoundVideo(target:VideoTarget) {
  await authenticatedJson('/api/video/bindings','DELETE',target);
  notifyVideoBindings();
}
