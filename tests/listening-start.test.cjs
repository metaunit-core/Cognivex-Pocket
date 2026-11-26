'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {boot,seed}=require('./helpers/pocket-learning-ui.cjs');
const root=path.resolve(__dirname,'..'),key='pocket-listening-start-v1',stateKey='cognivex-pocket-state';
const html=fs.readFileSync(path.join(root,'index.html'),'utf8'),appSource=fs.readFileSync(path.join(root,'js/app.js'),'utf8'),css=fs.readFileSync(path.join(root,'css/style.css'),'utf8');
assert.equal(fs.existsSync(path.join(root,'js/listening-start.js')),false);
assert.ok(!/listening-start|泛听启动|跳过泛听/.test(html));assert.ok(!/listening-start|listening-clock/.test(css));
assert.ok(!/PocketListeningStart|listeningBeforeNewMaterial|showListening|resumeListening/.test(appSource));
assert.ok(appSource.includes("register('listening',continueAfterListening)"));
for(const name of ['learning-backup','cloud-backup','device-local-data'])assert.ok(fs.readFileSync(path.join(root,'js',name+'.js'),'utf8').includes(key));
for(const raw of ['invalid-json',...['ready','running','paused','completed'].map(status=>JSON.stringify({old:{subject:'数学',localDate:'2026-10-09',status,startedAt:1,endsAt:3600001,remainingMs:1000,future:{preserve:true}}}))]){
  for(const existing of [false,true]){
    const initial=seed(existing?1:0);
    if(existing){
      require('./helpers/original-learning-fixture.cjs')(initial,Date.now());
      const group=initial.materials[0].groups[0];group.runs.push({mode:'new',videoSkipped:true,outputCompleted:false,startedAt:Date.now(),completedAt:null});
      initial.currentSession={materialId:'m1',currentGroupIndex:0,currentRunIndex:group.runs.length-1,currentStep:'output',mode:'new',schedulerState:{phase:'new',newGroupIndex:0,reviewGroupIndex:0}};
    }
    const store=new Map([[stateKey,JSON.stringify(initial)],[key,raw],['pocket-last-view-v1',JSON.stringify({page:'listening',subject:'数学',localDate:'2026-10-09'})]]);
    let app=boot({store});assert.equal(store.get(key),raw);assert.equal(JSON.parse(store.get('pocket-last-view-v1')).page,'learning');
    assert.equal(app.state().currentSession.currentStep,existing?'output':'basic');assert.equal(app.state().materials.length,existing?1:0);
    const before=store.get(stateKey),session=app.state().currentSession;
    app.context.PocketNavigation.navigate({page:'listening'});assert.equal(store.get(stateKey),before);
    app=boot({store});assert.equal(store.get(stateKey),before);assert.deepEqual(app.state().currentSession,session);assert.equal(store.get(key),raw);
    for(const event of ['focus','pageshow','visibilitychange'])app.fire(event);
    assert.equal(store.get(stateKey),before);assert.equal(store.get(key),raw);assert.equal(app.context.PocketListeningStart,undefined);
  }
}
console.log('PASS listening removal: no page/script/styles/timer, legacy route resumes exactly once, existing task preserved, corrupt/running/paused/completed history retained byte-for-byte, backup keys retained.');
