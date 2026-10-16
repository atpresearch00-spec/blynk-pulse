export type Values=Record<string,unknown>;
export type Sample={time:number;observedAt?:number;values:Values};
export function numeric(value:unknown):number|null{
  if(typeof value==='number')return Number.isFinite(value)?value:null;
  if(typeof value==='string'&&/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?$/i.test(value.trim())){
    const n=Number(value);return Number.isFinite(n)?n:null;
  }
  return null;
}
export function display(value:unknown,pin?:string){
  const n=numeric(value);
  if(pin==='v6'||pin==='v7'||pin==='v8'){
    if(n===0)return 'ON';
    if(n===1)return 'OFF';
  }
  if(n!==null)return n.toLocaleString(undefined,{maximumSignificantDigits:15});
  if(value===null||value===undefined)return '—';
  return typeof value==='object'?JSON.stringify(value):String(value);
}
export function samplesInWindow(samples:Sample[],minutes:number,now:number){return samples.filter(s=>s.time>=now-minutes*60000&&s.time<=now);}
export function appendSample(samples:Sample[],sample:Sample){
  if(samples.some(s=>s.time===sample.time)||samples.length&&sample.time<samples[samples.length-1].time)return samples;
  return [...samples,sample].slice(-1440);
}
function csvCell(value:unknown){
  let s=typeof value==='object'&&value!==null?JSON.stringify(value):String(value??'');
  // Preserve actual numbers, including negatives. Escape formula-like text even after whitespace.
  if(typeof value!=='number'&&numeric(value)===null&&/^[\s]*[=+@-]/.test(s))s="'"+s;
  return '"'+s.replace(/"/g,'""')+'"';
}
export function buildCSV(samples:Sample[],pins:string[],label:(pin:string)=>string,unit?:(pin:string)=>string){
  const rows:unknown[][]=[['Blynk fetched at (UTC)','Observed by this dashboard at (UTC)',...pins.map(p=>`${label(p)} (${p.toUpperCase()})${unit?.(p)?` [${unit(p)}]`:''}`)]];
  for(const sample of samples)rows.push([new Date(sample.time).toISOString(),sample.observedAt===undefined?'':new Date(sample.observedAt).toISOString(),...pins.map(p=>sample.values[p])]);
  return rows.map(row=>row.map(csvCell).join(',')).join('\r\n');
}
