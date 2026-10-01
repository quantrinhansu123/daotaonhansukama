import {randomUUID} from 'node:crypto';
import {readFile,writeFile} from 'node:fs/promises';

type Zone={Id:number;Name:string;Region?:string;ZoneTier?:number|string;Password?:string;StorageZoneId?:number;ZoneSecurityEnabled?:boolean;ZoneSecurityKey?:string;Hostnames?:Array<{Value:string}>};
const accountKey=process.env.BUNNY_ACCOUNT_API_KEY;
const ref=new URL(process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://invalid.example').hostname.split('.')[0];
const name=process.env.BUNNY_VIDEO_ZONE_NAME || `upcare-video-dev-${ref.slice(0,8)}`;
if(!/^[a-z0-9-]{8,60}$/.test(name) || ref==='invalid') throw new Error('Configure Supabase URL and a valid dedicated video zone name');
if(!process.argv.includes('--create')) {
  console.log(JSON.stringify({action:'preview',name,storageRegion:'SG',storageTier:'Standard',cdnNetwork:'Standard',tokenAuthentication:true,requiresAccountKey:!accountKey}));
  process.exit(0);
}
if(!accountKey) throw new Error('Missing BUNNY_ACCOUNT_API_KEY; no Bunny changes made');
async function api<T>(endpoint:string,body?:unknown):Promise<T> {
  const response=await fetch(`https://api.bunny.net${endpoint}`,{method:body===undefined?'GET':'POST',headers:{AccessKey:accountKey!,'Content-Type':'application/json'},body:body===undefined?undefined:JSON.stringify(body),signal:AbortSignal.timeout(30_000)});
  if(!response.ok) {await response.body?.cancel();throw new Error(`Bunny configuration HTTP ${response.status} at ${endpoint.replace(/\d+/g,':id')}`);}
  return response.status===204?undefined as T:await response.json() as T;
}
function items<T>(value:T[]|{Items:T[]}):T[]{return Array.isArray(value)?value:value.Items || [];}
async function save(values:Record<string,string>) {
  let content=await readFile('.env.local','utf8').catch(()=> '');
  for(const [key,value] of Object.entries(values)) {
    if(/[\r\n"]/.test(value)) throw new Error('Unexpected credential characters');
    const line=`${key}="${value}"`,pattern=new RegExp(`^${key}=.*$`,'m');
    content=pattern.test(content)?content.replace(pattern,()=>line):content.trimEnd()+'\n'+line+'\n';
    process.env[key]=value;
  }
  await writeFile('.env.local',content);
}
const storageZones=items(await api<Zone[]|{Items:Zone[]}>('/storagezone?perPage=1000'));
let storage=storageZones.find(z=>z.Name===name);
if(name===process.env.NEXT_PUBLIC_BUNNY_STORAGE_ZONE) throw new Error('Video zone must be separate from existing public storage');
if(!storage) storage=await api<Zone>('/storagezone',{Name:name,Region:'SG',ReplicationRegions:[],ZoneTier:0});
storage=await api<Zone>(`/storagezone/${storage.Id}`);
if(storage.Region!=='SG' || ![0,'Standard'].includes(storage.ZoneTier!)) throw new Error('Dedicated storage must be Standard with SG primary region');
if(!storage.Password) throw new Error('Storage API did not return its private password');
await save({BUNNY_VIDEO_STORAGE_ZONE:name,BUNNY_VIDEO_STORAGE_KEY:storage.Password,BUNNY_VIDEO_STORAGE_HOSTNAME:'sg.storage.bunnycdn.com',BUNNY_VIDEO_STORAGE_ZONE_ID:String(storage.Id)});
const pullZones=items(await api<Zone[]|{Items:Zone[]}>('/pullzone?perPage=1000'));
let pull=pullZones.find(z=>z.Name===name);
if(pull && pull.StorageZoneId!==storage.Id) throw new Error('Existing pull zone is linked to another origin; refusing to alter it');
if(!pull) pull=await api<Zone>('/pullzone',{Name:name,StorageZoneId:storage.Id,OriginType:2,Type:0,ZoneSecurityEnabled:true,PreloadingScreenShowOnFirstVisit:false});
pull=await api<Zone>(`/pullzone/${pull.Id}`,{
  Type:0,ZoneSecurityEnabled:true,ZoneSecurityIncludeHashRemoteIP:false,
  BlockNoneReferrer:false,AllowedReferrers:[],BlockedReferrers:[],
  EnableAccessControlOriginHeader:true,AccessControlOriginHeaderExtensions:['m3u8','m4s','mp4','jpg'],
  IgnoreQueryStrings:true,CacheControlMaxAgeOverride:31536000,CacheControlPublicMaxAgeOverride:0,
  EnableRequestCoalescing:true,RequestCoalescingTimeout:15,EnableCacheSlice:true,
  CacheErrorResponses:false,DisableCookies:true,EnableGeoZoneASIA:true,
});
const rules=[
  {description:'Video resource timings',header:'Timing-Allow-Origin',value:'*',type:0,patterns:['*']},
  {description:'Video CORS visible cache headers',header:'Access-Control-Expose-Headers',value:'CDN-Cache,CDN-RequestId,Content-Length,Content-Range',type:0,patterns:['*']},
  {description:'HLS playlist MIME',header:'Content-Type',value:'application/vnd.apple.mpegurl',type:3,patterns:['m3u8']},
  {description:'HLS fragment MIME',header:'Content-Type',value:'video/iso.segment',type:3,patterns:['m4s']},
];
const savedRules=(await api<{EdgeRules:Array<{Guid:string;Description:string}>}>(`/pullzone/${pull.Id}`)).EdgeRules || [];
for(const rule of rules) await api(`/pullzone/${pull.Id}/edgerules/addOrUpdate`,{
  Guid:savedRules.find(r=>r.Description===rule.description)?.Guid || randomUUID(),ActionType:5,ActionParameter1:rule.header,ActionParameter2:rule.value,
  Triggers:[{Type:rule.type,PatternMatchingType:0,PatternMatches:rule.patterns}],TriggerMatchingType:0,Description:rule.description,Enabled:true,
});
const verified=await api<Zone>(`/pullzone/${pull.Id}`);
if(!verified.ZoneSecurityEnabled || !verified.ZoneSecurityKey) throw new Error('Token authentication was not enabled; pipeline stays disabled');
const hostname=verified.Hostnames?.find(h=>h.Value.endsWith('.b-cdn.net'))?.Value;
if(!hostname) throw new Error('No default CDN hostname returned');
await save({BUNNY_VIDEO_CDN_HOSTNAME:hostname,BUNNY_VIDEO_TOKEN_KEY:verified.ZoneSecurityKey,BUNNY_VIDEO_PULL_ZONE_ID:String(pull.Id)});
console.log('Dedicated SG storage and private Standard CDN configured. Credentials saved server-side in .env.local; pipeline remains disabled until doctor passes.');
