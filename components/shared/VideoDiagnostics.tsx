'use client';
import {useEffect,useRef,useState} from 'react';
import {authenticatedFetch} from '@/lib/authenticated-fetch';
import {measureVideoStartup,startupSummary,type BenchmarkTarget,type StartupTrial} from '@/lib/video-startup-benchmark';

export default function VideoDiagnostics() {
  const [targets,setTargets]=useState<BenchmarkTarget[]>([]),[results,setResults]=useState<StartupTrial[]>([]),[error,setError]=useState(''),[busy,setBusy]=useState(false),[selected,setSelected]=useState(''),[conditions,setConditions]=useState(false);
  const players=useRef<HTMLDivElement>(null),controller=useRef<AbortController|null>(null);
  useEffect(()=>{void authenticatedFetch('/api/video/diagnostics').then(async r=>{const b=await r.json();if(!r.ok)throw new Error(b.error);setTargets(b.videos);}).catch(e=>setError(e.message));return()=>controller.current?.abort();},[]);
  const run=async(concurrency:1|10,different=false)=>{
    const ready=targets.filter(t=>t.published && (!selected || different || t.targetId===selected));
    if(!ready.length){setError('Chưa có video được xuất bản qua pipeline.');return;}
    const c=new AbortController();controller.current=c;setBusy(true);setError('');
    try {
      for(const target of different?[ready[0]]:ready) for(let trial=1;trial<=(different?Math.max(30,Math.ceil(ready.length*30/10)):30) && !c.signal.aborted;trial++) {
        const batch=Array.from({length:concurrency},(_,index)=>different?ready[((trial-1)*concurrency+index)%ready.length]:target);
        const elements=batch.map(()=>{const video=document.createElement('video');video.className='w-56 rounded bg-black';players.current?.appendChild(video);return video;});
        const samples=await Promise.all(batch.map((t,i)=>measureVideoStartup(t,trial,concurrency,elements[i],c.signal,different?'different_videos':concurrency===1?'single':'same_video')));
        setResults(previous=>[...previous,...samples.map(s=>s.result)]);
        // Concurrent trials continue playing together, rather than replacing
        // ten real streams with ten resolve requests or instant disposal.
        if(concurrency===10 && !c.signal.aborted) await new Promise<void>(resolve=>{const timer=setTimeout(resolve,10_000);c.signal.addEventListener('abort',()=>{clearTimeout(timer);resolve();},{once:true});});
        samples.forEach(s=>s.destroy());elements.forEach(e=>e.remove());
      }
    }catch(e){setError(e instanceof Error?e.message:'Đo lỗi.');}finally{setBusy(false);controller.current=null;}
  };
  const report=()=>{
    const byVideo=targets.map(target=>{
      const a=startupSummary(results.filter(r=>r.targetId===target.targetId && r.scenario==='single'));
      const b=startupSummary(results.filter(r=>r.targetId===target.targetId && r.scenario==='same_video'));
      const d=startupSummary(results.filter(r=>r.targetId===target.targetId && r.scenario==='different_videos'));
      return {...target,single:a,sameVideo:b,differentVideos:d,passed:[a,b,d].every(s=>s.trials>=30 && s.allBelow4s && s.p95Ms!==null) && a.p95Ms!==null && b.p95Ms!==null && d.p95Ms!==null && b.p95Ms<=a.p95Ms*1.2 && d.p95Ms<=a.p95Ms*1.2};
    });
    const data={generatedAt:new Date().toISOString(),conditionsDeclared:conditions,requiredConditions:{perViewerMbps:10,maxCdnRttMs:100,quality:'Auto'},environment:'development',browserCache:'distinct valid token URLs each trial',cdnCache:'see segmentCache on each trial; cold CDN test still requires a purge of the dedicated development zone',sessions:'real muted HTML video streams, same device and account; does not establish 10 separate users/devices',productionVerified:false,workerRunningDuringTest:'record manually',byVideo,results};
    const url=URL.createObjectURL(new Blob([JSON.stringify(data,null,2)],{type:'application/json'})),a=document.createElement('a');a.href=url;a.download='video-startup-report.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
  };
  return <main className="mx-auto max-w-6xl space-y-5 p-8">
    <h1 className="text-2xl font-bold">Đo tốc độ video trên local</h1>
    <p>Mỗi chế độ chạy 30 lượt cho từng video. Lượt lỗi và timeout được tính là không đạt. Mốc đo bắt đầu trước khi gọi API cấp quyền và kết thúc khi trình duyệt vẽ khung hình đầu.</p>
    <p>Chế độ 10 luồng mở 10 player thực và giữ phát đồng thời. Cần bổ sung kiểm thử trên 10 thiết bị/tài khoản và trên production để nghiệm thu đầy đủ.</p>
    <label className="block"><input type="checkbox" checked={conditions} onChange={e=>setConditions(e.target.checked)}/> Tôi đã kiểm tra mỗi người có 10 Mbps và RTT tới CDN ≤100 ms.</label>
    <select aria-label="Video cần đo" value={selected} disabled={busy} onChange={e=>setSelected(e.target.value)} className="rounded border p-2"><option value="">Tất cả video</option>{targets.map(t=><option key={`${t.targetType}:${t.targetId}`} value={t.targetId}>{t.title}{t.published?'':' · chưa xuất bản'}</option>)}</select>
    <div className="flex flex-wrap gap-3">
      <button disabled={busy} onClick={()=>void run(1)} className="rounded bg-green-700 px-4 py-2 text-white">Đo 1 luồng</button>
      <button disabled={busy} onClick={()=>void run(10)} className="rounded bg-green-700 px-4 py-2 text-white">Đo 10 luồng cùng video</button>
      <button disabled={busy} onClick={()=>void run(10,true)} className="rounded bg-green-700 px-4 py-2 text-white">Đo 10 luồng khác video</button>
      <button disabled={!busy} onClick={()=>controller.current?.abort()} className="rounded border px-4 py-2">Dừng</button>
      <button disabled={busy || !results.length} onClick={report} className="rounded border px-4 py-2">Tải báo cáo</button>
    </div>
    {error && <p role="alert" className="text-red-600">{error}</p>}
    <div ref={players} className="flex flex-wrap gap-2"/>
    <table className="w-full text-left text-sm"><thead><tr><th>Video</th><th>Lượt</th><th>P95 1 luồng</th><th>P95 10 luồng</th><th>Lượt không đạt</th></tr></thead><tbody>{targets.map(t=>{const a=startupSummary(results.filter(r=>r.targetId===t.targetId && r.concurrency===1)),b=startupSummary(results.filter(r=>r.targetId===t.targetId && r.concurrency===10));return <tr key={`${t.targetType}:${t.targetId}`}><td>{t.title}</td><td>{a.trials}/{b.trials}</td><td>{a.p95Ms===null?'—':`${Math.round(a.p95Ms)} ms`}</td><td>{b.p95Ms===null?'—':`${Math.round(b.p95Ms)} ms`}</td><td>{a.failures+b.failures}</td></tr>;})}</tbody></table>
  </main>;
}
