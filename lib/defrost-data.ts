import {numeric,type Values} from './dashboard-data';

export type DefrostCycle={id:string;startObservedAt:number;endObservedAt:number|null;lastObservedAt:number;targetSeconds:number|null;partialStart:boolean;hasGaps:boolean};
export type DefrostSummary={lastSignal:0|1|null;lastFetchedAt:number;cycles:DefrostCycle[]};

export function defrostSignal(values:Values,online:boolean):0|1|null{
  const n=numeric(values.v8);
  return online&&(n===0||n===1)?n:null;
}
// V5 is a duration in minutes. Capture this target when a cycle starts.
export function defrostTargetSeconds(values:Values):number|null{
  const n=numeric(values.v5);
  if(n===null||n<=0)return null;
  const seconds=Math.round(n*60);
  return Number.isSafeInteger(seconds)&&seconds>0?seconds:null;
}
export function timerText(seconds:number){
  const value=Math.max(0,Math.floor(seconds));
  const hours=Math.floor(value/3600),minutes=Math.floor(value%3600/60),rest=value%60;
  return [hours||null,String(minutes).padStart(2,'0'),String(rest).padStart(2,'0')].filter(v=>v!==null).join(':');
}
export function cycleSeconds(cycle:DefrostCycle,now:number,confirmed:boolean){
  const end=cycle.endObservedAt??(confirmed?now:cycle.lastObservedAt);
  return Math.max(0,(end-cycle.startObservedAt)/1000);
}
