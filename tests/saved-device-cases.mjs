import assert from 'node:assert/strict';

// Uses the real route modules, Web Crypto and SQLite adapter. Upstream Blynk
// responses and platform identity remain controlled test fixtures.
export async function savedDeviceRouteCases({check,routes,sqlDb,owner,request,snapshot,realFetch}){
  const tokens=['synthetic_saved_token_alpha','synthetic_saved_token_beta'];
  let a,b,firstSelection;
  const call=(method,data)=>routes.devices[method](request('/api/devices',method,data));
  const activate=async id=>(await(await call('PATCH',{action:'activate',id})).json()).active;
  const publicSnapshot=async()=>{globalThis.auditHeaders={};const data=await(await routes.shared.GET()).json();globalThis.auditHeaders=owner;return data.snapshot;};
  await check('Saved-device operations reject anonymous, non-owner and cross-origin access','real route integration / simulated identity',async()=>{
    for(const identity of [{},{'oai-authenticated-user-id':'viewer','oai-authenticated-user-email':'viewer@example.com'},{'oai-authenticated-user-email':owner['oai-authenticated-user-email']}]){
      globalThis.auditHeaders=identity;
      assert.equal((await routes.devices.GET()).status,403);
      for(const method of ['POST','PATCH','DELETE'])assert.equal((await call(method,{token:tokens[0],name:'Fixture',id:'fake',action:'activate'})).status,403);
    }
    globalThis.auditHeaders=owner;
    for(const method of ['POST','PATCH','DELETE'])assert.equal((await routes.devices[method](request('/api/devices',method,{}, {Origin:'https://other.example'}))).status,403);
  });
  await check('Two named tokens persist as authenticated ciphertext; lists and reload metadata exclude secrets','real routes / Web Crypto / SQLite',async()=>{
    globalThis.auditHeaders=owner;
    const resultA=await call('POST',{name:'Fridge A',token:tokens[0],metrics:{v0:{label:'Fridge A temperature',unit:'°F',visible:true}}});assert.equal(resultA.status,201);a=(await resultA.json()).device;
    const resultB=await call('POST',{name:'Freezer B',token:tokens[1]});assert.equal(resultB.status,201);b=(await resultB.json()).device;
    const duplicate=await(await call('POST',{name:'Duplicate',token:tokens[0]})).json();assert.equal(duplicate.device.id,a.id);
    const records=sqlDb.prepare('SELECT * FROM saved_devices').all();assert.equal(records.length,2);
    for(const record of records){for(const token of tokens)assert.ok(!JSON.stringify(record).includes(token));assert.ok(record.token_ciphertext.startsWith('v1.'));}
    const storedA=records.find(d=>d.id===a.id);
    assert.equal(await routes.openToken(storedA.token_ciphertext,a.id),tokens[0]);
    await assert.rejects(routes.openToken(storedA.token_ciphertext,b.id));
    const pieces=storedA.token_ciphertext.split('.'),tampered=Buffer.from(pieces[2],'base64');tampered[0]^=1;pieces[2]=tampered.toString('base64');await assert.rejects(routes.openToken(pieces.join('.'),a.id));
    firstSelection=await activate(a.id);
    const reloaded=await(await routes.devices.GET()).json();assert.equal(reloaded.active.device.id,a.id);assert.equal(reloaded.active.selectionId,firstSelection.selectionId);assert.equal(reloaded.devices.length,2);
    for(const token of tokens)assert.ok(!JSON.stringify(reloaded).includes(token));assert.ok(!JSON.stringify(reloaded).includes('tokenCiphertext'));assert.ok(!JSON.stringify(reloaded).includes('tokenHash'));
    globalThis.fetch=async url=>{const u=new URL(url);assert.equal(u.origin,'http://blynk.allmixedupocean.net:8080');if(u.pathname.endsWith('/project'))return Response.json({widgets:[{pinType:'VIRTUAL',pin:0}]});if(u.pathname.endsWith('/isHardwareConnected'))return Response.json(true);return Response.json([u.pathname.includes(tokens[0])?'46.963':'9.125']);};
    try{const read=await routes.blynk.POST(request('/api/blynk','POST',{deviceId:a.id,selectionId:firstSelection.selectionId}));assert.equal(read.status,200);const data=await read.json();assert.equal(data.values.v0,'46.963');assert.ok(!JSON.stringify(data).includes(tokens[0]));}finally{globalThis.fetch=realFetch;}
  });
  await check('Switching isolates values and settings and rejects delayed writes from the previous device','real routes / SQLite conditional writes',async()=>{
    globalThis.auditHeaders=owner;const time=Date.now()-10000;
    const publishA={...snapshot(time,{v0:'46.963'},{metrics:{v0:{label:'Fridge A temperature',unit:'°F',visible:true}},device:'Fridge A'}),savedDeviceId:a.id,selectionId:firstSelection.selectionId};
    assert.equal((await routes.shared.PUT(request('/api/dashboard','PUT',publishA))).status,200);assert.equal((await publicSnapshot()).values.v0,'46.963');
    const selectedB=await activate(b.id);assert.equal(await publicSnapshot(),null);
    assert.equal((await routes.shared.PUT(request('/api/dashboard','PUT',{...publishA,fetchedAt:time+9000}))).status,409);
    assert.equal((await routes.blynk.POST(request('/api/blynk','POST',{deviceId:a.id,selectionId:firstSelection.selectionId}))).status,409);
    const publishB={...snapshot(time+5000,{v0:'9.125'},{metrics:{v0:{label:'Freezer B temperature',unit:'°F',visible:true}},device:'Freezer B'}),savedDeviceId:b.id,selectionId:selectedB.selectionId};
    assert.equal((await routes.shared.PUT(request('/api/dashboard','PUT',publishB))).status,200);const shownB=await publicSnapshot();assert.equal(shownB.values.v0,'9.125');assert.equal(shownB.metrics.v0.label,'Freezer B temperature');
    const selectedA=await activate(a.id),shownA=await publicSnapshot();assert.equal(shownA.values.v0,'46.963');assert.equal(shownA.metrics.v0.label,'Fridge A temperature');assert.equal(shownA.fetchedAt,time);assert.equal(shownA.sourceId,selectedA.selectionId);
    for(const token of tokens)assert.ok(!JSON.stringify(shownA).includes(token));
  });
  await check('Disconnect preserves saved tokens; removing the selected device blocks stale reads and leaves legacy data intact','real routes / SQLite foreign keys',async()=>{
    globalThis.auditHeaders=owner;const legacyBefore=sqlDb.prepare('SELECT snapshot FROM shared_dashboard WHERE id=1').get().snapshot;
    const active=(await(await routes.devices.GET()).json()).active;
    assert.equal((await call('PATCH',{action:'disconnect'})).status,200);assert.equal((await(await routes.devices.GET()).json()).active,null);assert.equal(sqlDb.prepare('SELECT count(*) AS n FROM saved_devices').get().n,2);
    assert.equal((await routes.blynk.POST(request('/api/blynk','POST',{deviceId:a.id,selectionId:active.selectionId}))).status,409);
    const reselected=await activate(a.id);assert.equal((await call('DELETE',{id:a.id})).status,200);assert.equal(await publicSnapshot(),null);
    assert.equal((await routes.blynk.POST(request('/api/blynk','POST',{deviceId:a.id,selectionId:reselected.selectionId}))).status,409);
    assert.equal(sqlDb.prepare('SELECT snapshot FROM shared_dashboard WHERE id=1').get().snapshot,legacyBefore);
    await call('DELETE',{id:b.id});sqlDb.exec('DELETE FROM device_selection');
  });
  await check('Saved-device storage fails closed when the encryption key is unavailable','real routes / configuration failure',async()=>{
    globalThis.auditHeaders=owner;const original=globalThis.auditEnv.BLYNK_VAULT_KEY;delete globalThis.auditEnv.BLYNK_VAULT_KEY;
    try{const response=await call('POST',{name:'Missing-key fixture',token:tokens[0]});assert.equal(response.status,503);assert.ok(!JSON.stringify(await response.json()).includes(tokens[0]));assert.equal(sqlDb.prepare('SELECT count(*) AS n FROM saved_devices').get().n,0);}finally{globalThis.auditEnv.BLYNK_VAULT_KEY=original;}
  });
}

export async function savedDeviceUiCases({check,driver,fixture,snapshot}){
  await check('Owner reload reconnects the saved device and switching discards an in-flight reading from the previous device','React lifecycle / controlled saved-device API',async()=>{
    const profiles=[{id:'saved-a',name:'Fridge A',metrics:{v0:{label:'Fridge A temperature',unit:'°F',visible:true}},createdAt:1,snapshot:null},{id:'saved-b',name:'Freezer B',metrics:{v0:{label:'Freezer B temperature',unit:'°F',visible:true}},createdAt:2,snapshot:null}];
    let selected=profiles[0],generation=0,readsA=0,release;const requests=[];
    const devices=async options=>{const method=options?.method||'GET';if(method==='GET')return Response.json({devices:profiles,active:selected?{device:selected,selectionId:'saved-generation-'+generation}:null});const data=JSON.parse(options.body);if(data.action==='disconnect'){selected=null;return Response.json({active:null});}selected=profiles.find(d=>d.id===data.id);generation++;return Response.json({active:{device:selected,selectionId:'saved-generation-'+generation}});};
    const reader=async(url,options,clock)=>{if(url==='/api/blynk'){const data=JSON.parse(options.body);requests.push(data);assert.ok(!('token' in data));if(data.deviceId==='saved-a'&&++readsA===2)return new Promise(resolve=>release=()=>resolve(Response.json({values:{v0:999},online:true,fetchedAt:clock})));return Response.json({values:{v0:data.deviceId==='saved-a'?21:8},online:true,fetchedAt:clock});}return Response.json({snapshot:null,saved:true,publishedAt:clock});};
    const d=driver(true,reader,devices);
    try{await d.settle();assert.ok(d.text(d.card('v0')).includes('21'));assert.equal(requests[0].deviceId,'saved-a');assert.equal(d.all(n=>n.type==='input'&&n.props.type==='password').length,0);await d.advance(5001);assert.equal(typeof release,'function');const select=d.all(n=>n.type==='select'&&n.props['aria-label']==='Switch saved device')[0];select.props.onChange({target:{value:'saved-b'}});await d.settle();release();await d.settle();assert.ok(d.text(d.card('v0')).includes('Freezer B'));assert.ok(d.text(d.card('v0')).includes('8'));assert.ok(!d.text(d.tree).includes('999'));assert.equal(d.chart().length,1);assert.equal(d.chart()[0].values.v0,8);for(const value of d.storage.values())assert.ok(!String(value).includes('synthetic_test_token'));}finally{d.close();}
    const reloaded=driver(true,reader,devices);try{await reloaded.settle();assert.ok(reloaded.text(reloaded.card('v0')).includes('Freezer B'));assert.equal(requests.at(-1).deviceId,'saved-b');}finally{reloaded.close();}
  });
  await check('Public viewers never request saved tokens and can switch to an older cached reading of the selected device','React lifecycle / controlled public snapshots',async()=>{
    let privateReads=0,snap=snapshot(fixture.clock,{v0:20},{sourceId:'selection-a'});const d=driver(false,async()=>Response.json({snapshot:snap}),async()=>{privateReads++;return Response.json({});});
    try{await d.settle();snap=snapshot(fixture.clock-5000,{v0:8},{sourceId:'selection-b',device:'Freezer B'});await d.advance(5000);assert.equal(privateReads,0);assert.equal(d.findText('button','Devices'),undefined);assert.ok(d.text(d.card('v0')).includes('8'));assert.equal(d.chart().length,1);assert.equal(d.chart()[0].values.v0,8);snap=null;await d.advance(5000);assert.ok(d.text(d.tree).includes('Public dashboard preview'));}finally{d.close();}
  });
}
