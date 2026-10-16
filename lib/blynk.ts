import {BLYNK_SERVER_ADDRESS,LEGACY_SERVER} from './blynk-server';
export {LEGACY_SERVER} from './blynk-server';
export type Connection={token:string;host:string};
export class BlynkReadError extends Error{
  constructor(message:string,public code:string,public operation:string,public upstreamStatus?:number){super(message);this.name='BlynkReadError';}
}
export function validateConnection(value:unknown):Connection{
  if(!value||typeof value!=='object')throw new Error('Enter your project/device token and server address.');
  const {token,host}=value as Record<string,unknown>;
  if(typeof token!=='string'||!/^[A-Za-z0-9_-]{10,256}$/.test(token))throw new Error('Enter a valid Blynk project/device Auth Token.');
  if(typeof host!=='string')throw new Error('Enter your Blynk server address.');
  const text=host.trim().toLowerCase().replace(/\/$/,'');
  if(text===BLYNK_SERVER_ADDRESS||text===LEGACY_SERVER)return {token,host:LEGACY_SERVER};
  if(text===`https://${BLYNK_SERVER_ADDRESS}`)throw new Error(`Port 8080 on your server uses HTTP. Use ${LEGACY_SERVER}.`);
  throw new Error(`This dashboard uses ${BLYNK_SERVER_ADDRESS}. Reload this page to load the independent-server connection form.`);
}
export function legacyPins(project:unknown):string[]{
  if(!project||typeof project!=='object'||!Array.isArray((project as Record<string,unknown>).widgets))throw new Error('Blynk returned an unexpected project response.');
  const pins=new Set<string>();
  const types:Record<string,string>={VIRTUAL:'v',DIGITAL:'d',ANALOG:'a'};
  function visit(value:unknown,depth:number){
    if(!value||typeof value!=='object'||depth>8)return;
    if(Array.isArray(value)){for(const item of value)visit(item,depth+1);return;}
    const object=value as Record<string,unknown>;
    const prefix=typeof object.pinType==='string'?types[object.pinType.toUpperCase()]:undefined;
    if(prefix&&Number.isInteger(object.pin)&&Number(object.pin)>=0&&Number(object.pin)<=9999)pins.add(prefix+object.pin);
    // Only inspect widget pin definitions; never return or traverse device credentials/notification tokens.
    for(const key of ['pins','dataStreams','datastreams','widgets'])if(key in object)visit(object[key],depth+1);
  }
  visit((project as Record<string,unknown>).widgets,0);
  if(pins.size>256)throw new Error('Blynk project has more than 256 pin definitions. Limit this dashboard to one device project.');
  return [...pins].sort((a,b)=>a.localeCompare(b,undefined,{numeric:true}));
}
export async function readDevice(connection:Connection,fetcher:typeof fetch=fetch){
  // Revalidate here as well so callers cannot turn this adapter into an arbitrary outbound proxy.
  connection=validateConnection(connection);
  const deadline=AbortSignal.timeout(12000);
  async function read(path:string,optionalPin=false):Promise<unknown>{
    const url=new URL(`${LEGACY_SERVER}/${encodeURIComponent(connection.token)}/${path}`);
    let response:Response;
    try{response=await fetcher(url,{cache:'no-store',redirect:'manual',signal:deadline});}
    catch{
      throw new BlynkReadError(deadline.aborted?`The connection to ${BLYNK_SERVER_ADDRESS} timed out. Try again shortly.`:`The website could not reach ${BLYNK_SERVER_ADDRESS} over HTTP. Check that this server's HTTP API is reachable.`,deadline.aborted?'SERVER_TIMEOUT':'SERVER_UNREACHABLE',path);
    }
    if(response.status>=300&&response.status<400)throw new BlynkReadError('Your independent server redirected the API request. The redirect was blocked to protect your token. Check the server HTTP API configuration.','SERVER_REDIRECT_BLOCKED',path,response.status);
    if(!response.ok){
      if(optionalPin&&response.status===400){const detail=(await response.text()).trim();if(/^(?:Requested pin (?:not exists|doesn't exist) in (?:the )?app\.?|No data for pin\.?)$/i.test(detail))return undefined;}
      if([400,401,403].includes(response.status))throw new BlynkReadError(`Your independent server rejected the ${path==='project'?'project':path==='isHardwareConnected'?'connection status':'pin'} request (HTTP ${response.status}). Check the project/device token issued by ${BLYNK_SERVER_ADDRESS}.`,'SERVER_REJECTED_REQUEST',path,response.status);
      if(response.status===429)throw new BlynkReadError('Your independent server reached its request limit. Pause briefly and reconnect.','SERVER_RATE_LIMIT',path,response.status);
      throw new BlynkReadError(`Your independent server returned HTTP ${response.status}. Try again shortly.`,'SERVER_HTTP_ERROR',path,response.status);
    }
    let data:unknown;
    try{data=await response.json();}catch{throw new BlynkReadError('Your independent server returned a non-JSON response. Check the server HTTP API.','SERVER_RESPONSE_INVALID',path,response.status);}
    if(data&&typeof data==='object'&&'error' in data)throw new BlynkReadError('Your independent server could not read this project. Check the project/device token.','SERVER_RESPONSE_ERROR',path,response.status);
    return data;
  }
  const [project,online]=await Promise.all([read('project'),read('isHardwareConnected')]);
  if(typeof online!=='boolean')throw new Error('Blynk returned an unexpected connection status.');
  const pins=legacyPins(project),values:Record<string,unknown>={};let next=0;
  async function worker(){while(next<pins.length){const pin=pins[next++];const data=await read(`get/${pin.toUpperCase()}`,true);if(data===undefined)continue;if(!Array.isArray(data))throw new Error('Blynk returned an unexpected pin response.');if(data.length)values[pin]=data.length===1?data[0]:data;}}
  await Promise.all(Array.from({length:Math.min(6,pins.length)},()=>worker()));
  return {values,online,fetchedAt:Date.now()};
}
