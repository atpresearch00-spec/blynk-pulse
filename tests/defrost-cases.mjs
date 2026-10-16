import assert from 'node:assert/strict';

export async function defrostRouteCases({check,routes,sqlDb,owner,request,snapshot}){
  const reset=()=>sqlDb.exec('DELETE FROM device_selection; DELETE FROM saved_devices; DELETE FROM shared_dashboard; DELETE FROM defrost_cycles; DELETE FROM defrost_state;');
  const start=Date.now()-1000000;
  const send=(time,signal,target=2,more={})=>routes.shared.PUT(request('/api/dashboard','PUT',snapshot(time,{v5:target,v8:signal},more)));
  const publish=async(...args)=>{const r=await send(...args);assert.equal(r.status,200);return r.json();};
  const read=async()=>{globalThis.auditHeaders={};const r=await routes.shared.GET();assert.equal(r.status,200);const result=await r.json();globalThis.auditHeaders=owner;return result;};
  const rows=()=>sqlDb.prepare('SELECT * FROM defrost_cycles ORDER BY start_observed_at').all();
  globalThis.auditHeaders=owner;
  await check('Defrost OFF to ON starts at zero, counts until OFF, repeats and survives API reloads','real API / SQLite triggers / independently timed sequence',async()=>{
    reset();await publish(start,1);const first=await publish(start+5000,0);
    assert.equal(first.defrost.cycles[0].startObservedAt,start+5000);assert.equal(first.defrost.cycles[0].lastObservedAt,start+5000);
    await publish(start+15000,'0',99);await publish(start+25000,'1',99);await publish(start+30000,0,3);await publish(start+40000,1,3);
    const cycles=rows();assert.equal(cycles.length,2);
    assert.deepEqual(cycles.map(c=>[c.end_observed_at-c.start_observed_at,c.target_seconds,c.partial_start,c.has_gaps]),[[20000,120,0,0],[10000,180,0,0]]);
    const a=await read(),b=await read();assert.deepEqual(a.defrost,b.defrost);assert.equal(a.defrost.cycles.length,2);assert.equal(a.snapshot.values.v8,1);assert.equal(a.snapshot.values.v5,3);
    assert.ok(!JSON.stringify(a.defrost).includes('deviceKey'));
  });
  await check('Defrost retries, metadata revisions, stale readings and unauthorized writes cannot duplicate or overwrite cycles','real API / monotonic snapshot and trigger guards',async()=>{
    reset();await publish(start,1);await publish(start+5000,0);
    assert.equal((await publish(start+5000,0)).saved,false);
    await publish(start+5000,0,99,{publicationVersion:2});
    assert.equal((await publish(start+4000,1)).saved,false);
    await publish(start+10000,0);assert.equal(rows().length,1);assert.equal(rows()[0].target_seconds,120);assert.equal(rows()[0].end_observed_at,null);
    for(const identity of [{},{'oai-authenticated-user-id':'other','oai-authenticated-user-email':'other@example.com'}]){globalThis.auditHeaders=identity;assert.equal((await send(start+15000,1)).status,403);}
    globalThis.auditHeaders=owner;
    assert.equal((await routes.shared.PUT(request('/api/dashboard','PUT',snapshot(start+15000,{v5:2,v8:1}),{Origin:'https://other.test'}))).status,403);
    assert.equal(rows()[0].end_observed_at,null);await publish(start+20000,1);assert.equal(rows().length,1);assert.equal(rows()[0].end_observed_at,start+20000);
  });
  await check('Defrost initial ON is partial; missing signals, offline values and long gaps never fabricate transitions','real API / incomplete observation cases',async()=>{
    reset();await publish(start,0,'bad');assert.equal(rows()[0].partial_start,1);assert.equal(rows()[0].target_seconds,null);
    await publish(start+5000,1,2,{online:false});assert.equal(rows()[0].end_observed_at,null);assert.equal(rows()[0].last_observed_at,start);
    await publish(start+10000,'bad');assert.equal(rows()[0].end_observed_at,null);
    await publish(start+15000,1);assert.equal(rows()[0].has_gaps,1);assert.equal(rows()[0].end_observed_at,start+15000);
    await publish(start+20000,0);await publish(start+90000,1);
    assert.equal(rows().length,2);assert.equal(rows()[1].has_gaps,1);assert.equal(rows()[1].end_observed_at-rows()[1].start_observed_at,70000);
    await publish(start+95000,false);assert.equal(rows().length,2);assert.equal((await read()).defrost.lastSignal,null);
  });
  await check('Defrost logs stay with their saved device across selection changes and owner reloads','real saved-device API / isolated SQLite histories',async()=>{
    reset();const call=(method,data)=>routes.devices[method](request('/api/devices',method,data));
    const a=(await(await call('POST',{name:'Defrost A',token:'synthetic_defrost_device_alpha'})).json()).device;
    const b=(await(await call('POST',{name:'Defrost B',token:'synthetic_defrost_device_beta'})).json()).device;
    const activate=async id=>(await(await call('PATCH',{action:'activate',id})).json()).active;
    const selectedA=await activate(a.id);
    await publish(start,1,2,{savedDeviceId:a.id,selectionId:selectedA.selectionId});await publish(start+5000,0,2,{savedDeviceId:a.id,selectionId:selectedA.selectionId});
    const selectedB=await activate(b.id);await publish(start+10000,0,3,{savedDeviceId:b.id,selectionId:selectedB.selectionId});
    assert.equal((await read()).defrost.cycles[0].targetSeconds,180);assert.equal((await read()).defrost.cycles[0].partialStart,true);
    const newA=await activate(a.id);assert.equal((await read()).defrost.cycles[0].targetSeconds,120);
    assert.equal((await send(start+15000,1,2,{savedDeviceId:a.id,selectionId:selectedA.selectionId})).status,409);
    await publish(start+20000,1,2,{savedDeviceId:a.id,selectionId:newA.selectionId});assert.equal((await read()).defrost.cycles.length,1);
    const stored=rows();assert.equal(stored.length,2);assert.equal(stored.filter(c=>c.end_observed_at!==null).length,1);
    assert.ok(!JSON.stringify(await read()).includes('synthetic_defrost_device'));
  });
  await check('Defrost snapshot and cycle log commit atomically, including failure and retry','real SQLite transaction / injected trigger failure',async()=>{
    reset();await publish(start,1);
    sqlDb.exec("CREATE TRIGGER fixture_defrost_failure BEFORE INSERT ON defrost_cycles BEGIN SELECT RAISE(ABORT,'controlled log failure'); END;");
    try{assert.equal((await send(start+5000,0)).status,503);assert.equal(rows().length,0);assert.equal((await read()).snapshot.fetchedAt,start);}finally{sqlDb.exec('DROP TRIGGER fixture_defrost_failure');}
    await publish(start+5000,0);assert.equal(rows().length,1);assert.equal(rows()[0].start_observed_at,start+5000);
  });
  await check('Defrost retains all cycles while public responses display only the latest 50','real API / durable log retention',async()=>{
    reset();await publish(start,1);
    for(let i=0;i<55;i++){await publish(start+i*10000+5000,0);await publish(start+i*10000+10000,1);}
    assert.equal(rows().length,55);const shown=(await read()).defrost.cycles;assert.equal(shown.length,50);assert.equal(shown[0].startObservedAt,start+545000);assert.equal(shown.at(-1).startObservedAt,start+55000);
  });
  reset();
}

export async function defrostDataCases({check,bundle,build,require,root}){
  const d=await bundle('export * from "./lib/defrost-data.ts"; export {display,buildCSV} from "./lib/dashboard-data.ts";');
  await check('V5 minutes, active-low V6/V7/V8, elapsed time, stopped time and stale freeze match independent expectations','pure data / fixed clocks',async()=>{
    for(const pin of ['v6','v7','v8']){for(const n of [0,'0'])assert.equal(d.display(n,pin),'ON');for(const n of [1,'1'])assert.equal(d.display(n,pin),'OFF');assert.equal(d.display(null,pin),'—');assert.equal(d.display(2,pin),'2');}
    assert.equal(d.defrostTargetSeconds({v5:'2.5'}),150);for(const n of [null,'',false,'bad',-1,0])assert.equal(d.defrostTargetSeconds({v5:n}),null);
    assert.equal(d.defrostSignal({v8:'0'},true),0);assert.equal(d.defrostSignal({v8:0},false),null);assert.equal(d.defrostSignal({v8:false},true),null);
    const cycle={id:'test',startObservedAt:10000,endObservedAt:null,lastObservedAt:15000,targetSeconds:60,partialStart:false,hasGaps:false};
    assert.equal(d.cycleSeconds(cycle,30000,true),20);assert.equal(d.cycleSeconds(cycle,30000,false),5);assert.equal(d.cycleSeconds({...cycle,endObservedAt:22000},999999,true),12);
    assert.equal(d.timerText(0),'00:00');assert.equal(d.timerText(125),'02:05');assert.equal(d.timerText(3605),'1:00:05');
    assert.ok(d.buildCSV([{time:0,values:{v8:0,v5:2}}],['v8','v5'],p=>p).endsWith('"0","2"'));
  });
  await check('Compact React defrost card counts past target, freezes stale readings, stops and restarts at zero','React server render / independently controlled clock',async()=>{
    const output=root+'/node_modules/.cache/defrost-panel-test.cjs';
    await build({stdin:{contents:"const React=require('react');const {renderToStaticMarkup}=require('react-dom/server');const Panel=require('./components/defrost-card').default;module.exports=p=>renderToStaticMarkup(React.createElement(Panel,p));",resolveDir:root},bundle:true,platform:'node',format:'cjs',outfile:output,jsx:'automatic'});
    const render=require(output),originalNow=Date.now;
    const cycle={id:'cycle',startObservedAt:10000,endObservedAt:null,lastObservedAt:15000,targetSeconds:60,partialStart:false,hasGaps:false};
    const props={summary:{lastSignal:0,lastFetchedAt:15000,cycles:[cycle]},values:{v8:0,v5:99},online:true,refreshSeconds:5};
    try{
      Date.now=()=>20000;let html=render(props);assert.ok(html.includes('aria-label="Defrost elapsed time">00:10'));assert.ok(html.includes('>ON</span>'));assert.ok(html.includes('metric-card defrost-timer'));assert.ok(html.includes('ON observed at'));assert.ok(!html.includes('<table'));assert.ok(!html.includes('progressbar'));
      html=render({...props,paused:true});assert.ok(html.includes('aria-label="Defrost elapsed time">00:05'));assert.ok(html.includes('Unconfirmed'));
      Date.now=()=>80000;html=render(props);assert.ok(html.includes('aria-label="Defrost elapsed time">00:05'));assert.ok(html.includes('last confirmed ON reading'));
      const running={...props,summary:{...props.summary,lastFetchedAt:80000,cycles:[{...cycle,lastObservedAt:80000}]}};
      html=render(running);assert.ok(html.includes('aria-label="Defrost elapsed time">01:10'));assert.ok(html.includes('>ON</span>'));
      html=render({...props,values:{v8:1,v5:99},summary:{lastSignal:1,lastFetchedAt:20000,cycles:[{...cycle,endObservedAt:20000,lastObservedAt:20000}]}});assert.ok(html.includes('aria-label="Defrost elapsed time">00:10'));assert.ok(html.includes('>OFF</span>'));assert.ok(html.includes('ON observed at'));
      html=render({...running,summary:{...running.summary,cycles:[{...cycle,id:'next',startObservedAt:80000,lastObservedAt:80000}]}});assert.ok(html.includes('aria-label="Defrost elapsed time">00:00'));
    }finally{Date.now=originalNow;}
  });
}
