import {isDashboardOwner} from '../../../lib/dashboard-access';
import {validateConnection,readDevice,BlynkReadError} from '../../../lib/blynk';
import {savedConnection,DeviceSelectionError} from '../../../lib/saved-devices';
import {VaultError} from '../../../lib/blynk-vault';
export const dynamic='force-dynamic';
export async function POST(request:Request) {
  const options={headers:{'Cache-Control':'no-store'}};
  if(!await isDashboardOwner()) return Response.json({error:'Only the dashboard owner can connect a Blynk device.'},{status:403,...options});
  if(request.headers.get('origin')!==new URL(request.url).origin) return Response.json({error:'Request origin is not allowed.'},{status:403,...options});
  if(!request.headers.get('content-type')?.startsWith('application/json')) return Response.json({error:'Send JSON.'},{status:415,...options});
  try {
    const body=await request.text();
    if(body.length>2048) return Response.json({error:'Request is too large.'},{status:413,...options});
    let connection;let savedRequest=false;
    try { const data=JSON.parse(body);savedRequest=!!(data&&typeof data==='object'&&'deviceId' in data);connection=savedRequest?await savedConnection(data.deviceId,data.selectionId):validateConnection(data); }
    catch(e) { return Response.json({error:e instanceof SyntaxError?'Invalid request.':e instanceof DeviceSelectionError||e instanceof VaultError?(e as Error).message:savedRequest?'Saved connections are temporarily unavailable.':(e as Error).message},{status:e instanceof DeviceSelectionError?409:e instanceof VaultError?503:400,...options}); }
    try { return Response.json(await readDevice(connection),options); }
    catch(e) {
      // Never log raw fetch exceptions: legacy URLs contain the device token.
      const known=e instanceof BlynkReadError;
      const code=known?e.code:'SERVER_RESPONSE_INVALID';
      console.warn('Independent Blynk read failed',{code,...known?{operation:e.operation,upstreamStatus:e.upstreamStatus}:{}});
      return Response.json({error:known?e.message:'Your independent server returned unexpected project or pin data. Check the project configuration.',code},{status:502,...options});
    }
  } catch {return Response.json({error:'Unable to read the request.'},{status:400,...options});}
}
