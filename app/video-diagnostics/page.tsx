import {notFound} from 'next/navigation';
import VideoDiagnostics from '@/components/shared/VideoDiagnostics';
import {pipelineEnvironment} from '@/lib/video-pipeline-config';

export const dynamic='force-dynamic';
export default function VideoDiagnosticsPage() {
  if(process.env.VERCEL || (process.env.NODE_ENV==='production' && pipelineEnvironment()!=='development')) notFound();
  return <VideoDiagnostics/>;
}
