import {metricForPin} from './dashboard-metrics';
export function normalizeSnapshot(input:unknown){
  if(!input||typeof input!=='object')throw new Error('Invalid snapshot');
  const data=input as Record<string,unknown>;
  if(!data.values||typeof data.values!=='object'||Array.isArray(data.values)||typeof data.online!=='boolean'||typeof data.fetchedAt!=='number'||!Number.isFinite(data.fetchedAt)||data.fetchedAt<0||data.fetchedAt>Date.now()+60000)throw new Error('Invalid snapshot');
  const values=Object.fromEntries(Object.entries(data.values).filter(([key])=>/^[vad]\d{1,4}$/.test(key)).slice(0,256));
  const source=data.metrics&&typeof data.metrics==='object'?data.metrics as Record<string,unknown>:{};
  const metrics=Object.fromEntries(Object.keys(values).map(key=>[key,metricForPin(key,source[key])]));
  const sourceId=typeof data.sourceId==='string'&&/^[a-zA-Z0-9_-]{1,80}$/.test(data.sourceId)?data.sourceId:null;
  const publicationVersion=Number.isSafeInteger(data.publicationVersion)&&Number(data.publicationVersion)>=0?Number(data.publicationVersion):0;
  const refreshSeconds=[5,10,30,60].includes(Number(data.refreshSeconds))?Number(data.refreshSeconds):5;
  return {values,metrics,sourceId,publicationVersion,refreshSeconds,device:typeof data.device==='string'?data.device.slice(0,60):'Blynk device',online:data.online,fetchedAt:data.fetchedAt};
}
