'use client';
import {useEffect,useState,type CSSProperties} from 'react';
import {cycleSeconds,defrostSignal,timerText,type DefrostSummary} from '../lib/defrost-data';
import type {Values} from '../lib/dashboard-data';

export default function DefrostCard({summary,values,online,refreshSeconds,paused=false,selected=false,onSelect,color}:{summary:DefrostSummary|null;values:Values;online:boolean;refreshSeconds:number;paused?:boolean;selected?:boolean;onSelect?:()=>void;color?:string}){
  const [now,setNow]=useState(Date.now());
  const active=summary?.cycles.find(c=>c.endObservedAt===null);
  const cycle=active??summary?.cycles[0];
  useEffect(()=>{setNow(Date.now());if(!active)return;const id=setInterval(()=>setNow(Date.now()),1000);return ()=>clearInterval(id);},[active?.id,summary?.lastFetchedAt]);
  const signal=defrostSignal(values,online);
  const confirmed=!!active&&summary?.lastSignal===0&&signal===0&&!paused&&now-summary.lastFetchedAt<=Math.max(refreshSeconds*3,45)*1000;
  const elapsed=cycle?cycleSeconds(cycle,now,confirmed):0;
  const status=active&&!confirmed?'Unconfirmed':signal===0?'ON':signal===1?'OFF':'—';
  const start=cycle?new Date(cycle.startObservedAt).toLocaleTimeString([],{hour:'numeric',minute:'2-digit',second:'2-digit'}):null;
  const detail=active&&!confirmed?'Elapsed time ends at the last confirmed ON reading. ':'';
  const timing=cycle?.partialStart?'V8 was already ON when first observed; its actual start is unknown. ':'ON time is when the dashboard fetched the reading, not the exact hardware transition. ';
  return <button className={`metric-card defrost-timer ${selected?'selected':''}`} onClick={onSelect} style={{'--metric-color':color} as CSSProperties} title={detail+timing+(cycle?.hasGaps?'Readings were interrupted during this cycle.':'')}>
    <div className="metric-header"><span>Defrost timer</span><span className="pin">V8</span></div>
    <div className="metric-value"><strong aria-label="Defrost elapsed time">{timerText(elapsed)}</strong><span>{status}</span></div>
    <div className="card-bottom"><span className="metric-note">{start?`${cycle?.partialStart?'First ON seen':'ON observed'} at ${start}`:'Waiting for ON'}</span></div>
  </button>;
}
