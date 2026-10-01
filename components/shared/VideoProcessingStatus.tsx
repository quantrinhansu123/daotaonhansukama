'use client';
import { useState } from 'react';
import type { PublicVideoBinding } from '@/lib/video-pipeline-types';
import { authenticatedJson } from '@/lib/authenticated-fetch';
import { notifyVideoBindings } from '@/lib/video-bindings-client';

export function VideoProcessingStatus({binding,canRetry=false}:{binding?:PublicVideoBinding;canRetry?:boolean}) {
  const [error,setError]=useState(''),[busy,setBusy]=useState(false);
  if(!binding) return null;
  const pending=binding.pending,active=binding.active;
  const labels={uploading:'Đang tải video lên',queued:'Đang chờ xử lý',processing:'Đang xử lý video',playable:'Đã có thể xem · đang bổ sung chất lượng cao',complete:'Video đã sẵn sàng',failed:'Xử lý video lỗi',cancelled:'Đã hủy',source_unavailable:'Không tìm thấy nguồn video · cần tải lại'};
  const asset=pending || active;
  const retryAsset=pending?.status==='failed'?pending:active?.enhancement_error?active:undefined;
  const retry=Boolean(retryAsset);
  return <div className="my-2 space-y-1 text-xs text-slate-400" aria-live="polite">
    <p>{binding.removed?'Đã gỡ video':asset?labels[asset.status]:''}</p>
    {pending && active && <p>Bản hiện tại vẫn đang phục vụ cho đến khi bản mới sẵn sàng.</p>}
    {active?.enhancement_error && <p>Bản phát nhanh vẫn xem được; bổ sung chất lượng cao chưa hoàn tất.</p>}
    {retry && canRetry && <button disabled={busy} className="font-semibold text-amber-500 hover:underline" onClick={async()=>{
      setBusy(true);setError('');try{await authenticatedJson(`/api/video/assets/${retryAsset!.id}`,'POST',{});notifyVideoBindings();}catch(e){setError(e instanceof Error?e.message:'Chưa thử lại được.');}finally{setBusy(false);}
    }}>{busy?'Đang tạo lại job…':'Thử xử lý lại'}</button>}
    {error && <p role="alert" className="text-rose-500">{error}</p>}
  </div>;
}
