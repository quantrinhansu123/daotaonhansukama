import {requirePipelineEnvironment} from '../lib/video-pipeline-config';
import {bunnyVideoConfig} from '../lib/bunny-video-delivery';
import {runPipelineWorker} from './pipeline-worker';

async function main() {
  const environment=requirePipelineEnvironment();
  if(environment!=='development' && !process.argv.includes('--production-worker')) throw new Error('Local worker only accepts development. Production worker requires an explicit opt-in later.');
  bunnyVideoConfig();
  await runPipelineWorker();
}
main().catch(e=>{console.error('[video-worker]',e instanceof Error?e.message.split(':')[0]:'failed');process.exitCode=1;});
