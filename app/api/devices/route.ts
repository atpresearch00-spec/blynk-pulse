import {eq,sql} from 'drizzle-orm';
import {getDb} from '../../../db';
import {savedDevices,deviceSelection} from '../../../db/schema';
import {isDashboardOwner} from '../../../lib/dashboard-access';
import {validateConnection} from '../../../lib/blynk';
import {BLYNK_SERVER_ADDRESS} from '../../../lib/blynk-server';
import {sealToken,tokenFingerprint,VaultError} from '../../../lib/blynk-vault';
import {getSelection,getSavedDevice,deviceMetadata} from '../../../lib/saved-devices';
import {metricForPin} from '../../../lib/dashboard-metrics';
export const dynamic='force-dynamic';
const options={headers:{'Cache-Control':'no-store'}};
function reply(data:unknown,status=200){return Response.json(data,{status,...options});}
async function authorize(request?:Request){
  if(!await isDashboardOwner())return reply({error:'Only the dashboard owner can manage saved devices.'},403);
  if(request&&request.headers.get('origin')!==new URL(request.url).origin)return reply({error:'Request origin is not allowed.'},403);
  if(request&&!request.headers.get('content-type')?.startsWith('application/json'))return reply({error:'Send JSON.'},415);
}
async function body(request:Request){const raw=await request.text();if(raw.length>50000)throw Error('Request is too large.');const data=JSON.parse(raw);if(!data||typeof data!=='object'||Array.isArray(data))throw Error('Invalid request.');return data;}
function failure(error:unknown){return reply({error:error instanceof VaultError?error.message:'The saved-device request could not be completed. Try again.'},error instanceof VaultError?503:400);}
export async function GET(){
  const denied=await authorize();if(denied)return denied;
  try{
    const records=await getDb().select().from(savedDevices).orderBy(savedDevices.createdAt).limit(20);
    const state=await getSelection(),active=state?.activeDeviceId?records.find(d=>d.id===state.activeDeviceId):null;
    return reply({devices:records.map(d=>deviceMetadata(d)),active:active&&state?.autoResume?{device:deviceMetadata(active,true),selectionId:state.selectionId}:null});
  }catch{return reply({error:'Saved devices are temporarily unavailable.'},503);}
}
export async function POST(request:Request){
  const denied=await authorize(request);if(denied)return denied;
  try{
    const data=await body(request);const connection=validateConnection({token:data.token,host:BLYNK_SERVER_ADDRESS});
    if(typeof data.name!=='string'||!data.name.trim()||data.name.length>60)return reply({error:'Enter a device name, up to 60 characters.'},400);
    const tokenHash=await tokenFingerprint(connection.token);
    const [existing]=await getDb().select().from(savedDevices).where(eq(savedDevices.tokenHash,tokenHash)).limit(1);
    if(existing)return reply({device:deviceMetadata(existing),alreadySaved:true});
    const records=await getDb().select({id:savedDevices.id}).from(savedDevices).limit(20);
    if(records.length>=20)return reply({error:'You can save up to 20 devices. Remove a device before adding another.'},409);
    const id=crypto.randomUUID();const source=records.length===0&&data.metrics&&typeof data.metrics==='object'?data.metrics:{};
    const metrics=Object.fromEntries(Object.keys(source).filter(p=>/^[vad]\d{1,4}$/.test(p)).slice(0,256).map(p=>[p,metricForPin(p,source[p])]));
    const device={id,name:data.name.trim(),tokenCiphertext:await sealToken(connection.token,id),tokenHash,metrics:JSON.stringify(metrics),snapshot:null,createdAt:Date.now()};
    // Keep the cap and duplicate-token handling atomic across owner tabs.
    await getDb().run(sql`INSERT INTO ${savedDevices} (id,name,token_ciphertext,token_hash,metrics,snapshot,created_at) SELECT ${device.id},${device.name},${device.tokenCiphertext},${device.tokenHash},${device.metrics},NULL,${device.createdAt} WHERE (SELECT count(*) FROM ${savedDevices}) < 20 ON CONFLICT (token_hash) DO NOTHING`);
    const [stored]=await getDb().select().from(savedDevices).where(eq(savedDevices.tokenHash,tokenHash)).limit(1);
    if(!stored)return reply({error:'You can save up to 20 devices. Remove a device before adding another.'},409);
    return reply({device:deviceMetadata(stored),alreadySaved:stored.id!==id},stored.id===id?201:200);
  }catch(error){return failure(error);}
}
export async function PATCH(request:Request){
  const denied=await authorize(request);if(denied)return denied;
  try{
    const data=await body(request);let device=null;
    if(data.action==='activate'){
      if(typeof data.id!=='string'||data.id.length>80)return reply({error:'Select a saved device.'},400);
      device=await getSavedDevice(data.id);if(!device)return reply({error:'Saved device not found.'},404);
    }else if(data.action!=='disconnect')return reply({error:'Invalid device action.'},400);
    const selectionId=crypto.randomUUID();const activeDeviceId=device?.id??(await getSelection())?.activeDeviceId??null;
    const autoResume=!!device;
    await getDb().insert(deviceSelection).values({id:1,activeDeviceId,selectionId,autoResume}).onConflictDoUpdate({target:deviceSelection.id,set:{activeDeviceId,selectionId,autoResume}});
    return reply({active:device?{device:deviceMetadata(device,true),selectionId}:null});
  }catch(error){return failure(error);}
}
export async function DELETE(request:Request){
  const denied=await authorize(request);if(denied)return denied;
  try{
    const data=await body(request);if(typeof data.id!=='string'||data.id.length>80)return reply({error:'Select a saved device.'},400);
    await getDb().delete(savedDevices).where(eq(savedDevices.id,data.id));
    return reply({removed:true});
  }catch(error){return failure(error);}
}
