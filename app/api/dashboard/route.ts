import {sql,eq} from 'drizzle-orm';
import {getDb} from '../../../db';
import {sharedDashboard,savedDevices} from '../../../db/schema';
import {isDashboardOwner} from '../../../lib/dashboard-access';
import {normalizeSnapshot} from '../../../lib/shared-snapshot';
import {metricForPin} from '../../../lib/dashboard-metrics';
import {getSelection,getSavedDevice} from '../../../lib/saved-devices';
import {getDefrostSummary} from '../../../lib/defrost-store';
export const dynamic='force-dynamic';
const options={headers:{'Cache-Control':'no-store'}};
export async function GET(){
  try{
    const state=await getSelection();
    let snapshot=null;
    if(state){const selected=state.activeDeviceId?await getSavedDevice(state.activeDeviceId):null;snapshot=selected?.snapshot?{...JSON.parse(selected.snapshot),sourceId:state.selectionId}:null;}
    else {const [record]=await getDb().select().from(sharedDashboard).where(eq(sharedDashboard.id,1)).limit(1);snapshot=record?JSON.parse(record.snapshot):null;}
    // Apply display defaults to older snapshots without changing saved values or timestamps.
    if(snapshot)snapshot.metrics=Object.fromEntries(Object.keys(snapshot.values??{}).map(pin=>[pin,metricForPin(pin,snapshot.metrics?.[pin])]));
    const deviceKey=state?.activeDeviceId?'device:'+state.activeDeviceId:state?null:'legacy';
    const defrost=snapshot&&deviceKey?await getDefrostSummary(deviceKey,snapshot.fetchedAt):null;
    return Response.json({snapshot,defrost},options);
  }
  catch{return Response.json({error:'Shared readings are temporarily unavailable.'},{status:503,...options});}
}
export async function PUT(request:Request){
  if(!await isDashboardOwner())return Response.json({error:'Only the dashboard owner can change shared readings.'},{status:403,...options});
  if(request.headers.get('origin')!==new URL(request.url).origin)return Response.json({error:'Request origin is not allowed.'},{status:403,...options});
  if(!request.headers.get('content-type')?.startsWith('application/json'))return Response.json({error:'Send JSON.'},{status:415,...options});
  try{
    const raw=await request.text();if(raw.length>100000)return Response.json({error:'Snapshot is too large.'},{status:413,...options});
    let normalized,input;try{input=JSON.parse(raw);normalized=normalizeSnapshot(input);}catch{return Response.json({error:'Invalid shared reading. Refresh your device and try again.'},{status:400,...options});}
    const state=await getSelection();
    if(state||input.savedDeviceId){
      if(!state?.autoResume||typeof input.savedDeviceId!=='string'||input.savedDeviceId!==state.activeDeviceId||input.selectionId!==state.selectionId)return Response.json({error:'The selected device changed or disconnected. Select a device from the Devices tab.',code:'DEVICE_SELECTION_CHANGED'},{status:409,...options});
      const snapshot={...normalized,sourceId:state.selectionId,publishedAt:Date.now()};
      const encoded=JSON.stringify(snapshot);
      const rows=await getDb().update(savedDevices).set({snapshot:encoded,metrics:JSON.stringify(snapshot.metrics)}).where(sql`${savedDevices.id} = ${input.savedDeviceId} AND EXISTS (SELECT 1 FROM device_selection WHERE id = 1 AND active_device_id = ${input.savedDeviceId} AND selection_id = ${input.selectionId} AND auto_resume = 1) AND (${savedDevices.snapshot} IS NULL OR coalesce(json_extract(${savedDevices.snapshot}, '$.fetchedAt'),0) < ${snapshot.fetchedAt} OR (coalesce(json_extract(${savedDevices.snapshot}, '$.fetchedAt'),0) = ${snapshot.fetchedAt} AND coalesce(json_extract(${savedDevices.snapshot}, '$.publicationVersion'),-1) < ${snapshot.publicationVersion}))`).returning({id:savedDevices.id});
      return Response.json({saved:rows.length>0,...rows.length?{publishedAt:snapshot.publishedAt,defrost:await getDefrostSummary('device:'+input.savedDeviceId,snapshot.fetchedAt)}:{reason:'outdated_snapshot'}},options);
    }
    const snapshot={...normalized,publishedAt:Date.now()};
    const encoded=JSON.stringify(snapshot);
    const rows=await getDb().insert(sharedDashboard).values({id:1,snapshot:encoded}).onConflictDoUpdate({target:sharedDashboard.id,set:{snapshot:encoded},setWhere:sql`coalesce(json_extract(${sharedDashboard.snapshot}, '$.fetchedAt'), 0) < ${snapshot.fetchedAt} OR (coalesce(json_extract(${sharedDashboard.snapshot}, '$.fetchedAt'), 0) = ${snapshot.fetchedAt} AND coalesce(json_extract(${sharedDashboard.snapshot}, '$.publicationVersion'), -1) < ${snapshot.publicationVersion})`}).returning({id:sharedDashboard.id});
    return Response.json({saved:rows.length>0,...(rows.length?{publishedAt:snapshot.publishedAt,defrost:await getDefrostSummary('legacy',snapshot.fetchedAt)}:{reason:'outdated_snapshot'})},options);
  }catch{return Response.json({error:'Could not save shared readings. Please try again.'},{status:503,...options});}
}
