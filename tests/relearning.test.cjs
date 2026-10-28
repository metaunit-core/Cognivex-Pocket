'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const {boot,seed}=require('./helpers/pocket-learning-ui.cjs');
const {local,remote,bind}=require('./helpers/pocket-cloud-fixture.cjs');
const location=new URL('http://localhost:4173/'),key='pocket-development-v1:cognivex-pocket-state';
function install(app){vm.runInContext(fs.readFileSync(path.join(__dirname,'../js/relearning.js'),'utf8'),app.context);return app.context.PocketRelearning;}
function fixture(){
 const state=seed(4);
 state.materials.slice(0,3).forEach((m,i)=>{m.title='同名资料';m.createdAt=9000-i*1000;m.groups=Array.from({length:3},(_,g)=>({...m.groups[0],id:m.id+'-g'+g,start:g*2+1,end:g*2+2,runs:JSON.parse(JSON.stringify(m.groups[0].runs))}));m.totalGroups=3;});
 state.dailyReverseReview={version:1,saveOrder:['m1','m2','m3','m4'],history:[]};
 state.materials=[state.materials[2],state.materials[0],state.materials[3],state.materials[1]];
 return state;
}
const clock={now:new Date(2026,9,29,9).getTime()},fail={enabled:false};
let app=boot({location,clock,fail,focusReview:true,store:new Map([[key,JSON.stringify(fixture())]])});
let model=install(app),state=app.context.PocketStorage.loadState();
const initial=JSON.stringify(state);
const clean=value=>{const copy=JSON.parse(JSON.stringify(value));delete copy.relearning;delete copy.relearningArchives;if(copy.reviewAdmission){delete copy.reviewAdmission.relearning;if(!copy.reviewAdmission.daily.length&&!copy.reviewAdmission.focus.length&&copy.reviewAdmission.lastClicked===null)delete copy.reviewAdmission;}copy.materials.forEach(m=>{delete m.relearningCount;delete m.relearningHistory;});return JSON.stringify(copy);};
const startedDay=clock.now;
const admission=()=>app.context.PocketReviewAdmission;
assert.equal(admission().status(state).unlocked,false);
const write=change=>{state=app.context.PocketStorage.updateState(state,change);};
assert.deepEqual(Array.from(model.ordered(state,['m3','m1','m2']),m=>m.id),['m1','m2','m3']);
const legacy=JSON.parse(initial);delete legacy.dailyReverseReview;
assert.deepEqual(Array.from(model.ordered(legacy,['m3','m1','m2']),m=>m.id),['m3','m1','m2'],'legacy stable list fallback, never draft time');
assert.throws(()=>model.start(state,[]),/选择/);
fail.enabled=true;assert.throws(()=>write(next=>model.start(next,['m1'])),/Quota/);assert.equal(app.store.get(key),initial);fail.enabled=false;
write(next=>model.start(next,['m3','m1','m2']));const firstBatch=state.relearning.id;
assert.equal(admission().status(state).unlocked,false,'starting does not unlock');
write(next=>assert.equal(model.start(next,['m4']),false));assert.equal(state.relearning.id,firstBatch,'unfinished task never replaced');
assert.equal(clean(state),initial);
const expectedSchedule=[['review',0],['review',1],['review',2]];
const traces={m1:[],m2:[],m3:[]},rounds=[],execution=[];let guard=0,failed=false,reloaded=false,settlementFailed=false;
while(model.pending(state)){
 assert.ok(++guard<150);
 const active=model.current(state),expected=model.checkpoint(state);
 if(!reloaded&&active.source.id==='m2'&&active.session.currentGroupIndex===1){
  const checkpoint=JSON.stringify(state.relearning);clock.now+=86400000;
  app=boot({location,clock,fail,focusReview:true,store:app.store});model=install(app);state=app.context.PocketStorage.loadState();
  assert.equal(JSON.stringify(state.relearning),checkpoint,'midnight/reload resumes unfinished B2 exactly');reloaded=true;
 }
 if(active.session.currentStep==='output'){
  execution.push([active.source.id,active.session.mode,active.session.currentGroupIndex]);
  if(active.batch.phase==='learning')traces[active.source.id].push([active.session.mode,active.session.currentGroupIndex]);
  else if(!rounds.some(r=>r.roundId===active.session.roundId))rounds.push({roundId:active.session.roundId,ids:Array.from(active.session.materialIds)});
  if(guard===1){write(next=>model.metrics(next,expected,'latestAccuracyPercent',50,'1/2'));write(next=>model.metrics(next,expected,'latestDurationMinutes',8));}
 }
 if(!failed&&guard===4){fail.enabled=true;const bytes=app.store.get(key);assert.throws(()=>write(next=>model.transition(next,'outputDone',expected)),/Quota/);assert.equal(app.store.get(key),bytes);fail.enabled=false;failed=true;}
 const action=active.session.currentStep==='groupComplete'?'continue':'outputDone';
 if(!settlementFailed&&active.batch.index===2&&active.session.currentGroupIndex===2){
  fail.enabled=true;const bytes=app.store.get(key);
  assert.throws(()=>write(next=>model.transition(next,action,expected)),/Quota/);
  assert.equal(app.store.get(key),bytes);assert.ok(state.materials.every(m=>model.count(m)===0),'failed final settlement increments nobody');
  assert.equal(admission().status(state).unlocked,false,'failed settlement cannot unlock');
  fail.enabled=false;settlementFailed=true;
 }
 write(next=>model.transition(next,action,expected));
 const after=JSON.stringify(state);
 write(next=>assert.equal(model.transition(next,action,expected),false,'stale double event ignored'));
 assert.equal(JSON.stringify(state),after);
 if(model.pending(state)){assert.ok(state.materials.every(m=>model.count(m)===0),'no early per-material or reverse-review counting');assert.equal(admission().status(state).unlocked,false,'partial learning or reverse review never unlocks');}
 assert.equal(clean(state),initial,'all original sessions, schedules, grades, Run and Group metadata remain byte-equivalent');
}
for(const id of ['m1','m2','m3']){
 assert.deepEqual(traces[id],expectedSchedule);
 const source=state.materials.find(m=>m.id===id);assert.equal(model.count(source),1);assert.equal(source.relearningHistory.length,1);
}
assert.deepEqual(rounds,[]);
assert.deepEqual(execution,['m1','m2','m3'].flatMap(id=>expectedSchedule.map(([mode,index])=>[id,mode,index])));
assert.equal(reloaded,true);
assert.equal(model.count(state.materials.find(m=>m.id==='m4')),0);
assert.equal(state.relearning.reviewRounds.length,0);
assert.equal(settlementFailed,true);
assert.equal(admission().status(state).unlocked,true);
assert.equal(admission().status(state,startedDay).unlocked,false,'cross-day completion never unlocks start day');
assert.equal(admission().status(state,clock.now+86400000).unlocked,false,'next day locks again');
assert.equal(admission().status(state).dailyCompleted,false);
assert.equal(admission().status(state).focusCompleted,false);
assert.equal(state.reviewAdmission.relearning.length,1);
assert.equal(admission().status(app.context.PocketStorage.loadState()).unlocked,true,'reload retains durable unlock');
assert.doesNotThrow(()=>app.context.PocketDailyReverse.assertCanCreate(state));
const blocked=JSON.parse(JSON.stringify(state));blocked.materialReviewSession={currentStep:'queueBlocked'};
assert.equal(app.context.PocketMaterialReview.canCreate(blocked),false,'other material admission safeguards remain');
const completed=JSON.stringify(state);write(next=>assert.equal(model.transition(next,'outputDone',{}),false));assert.equal(JSON.stringify(state),completed);
// A fresh, unique single-material batch increments once, including its mandatory reverse round.
write(next=>model.start(next,['m1']));assert.notEqual(state.relearning.id,firstBatch);
guard=0;while(model.pending(state)){assert.ok(++guard<40);const active=model.current(state),cp=model.checkpoint(state);write(next=>model.transition(next,active.session.currentStep==='groupComplete'?'continue':'outputDone',cp));}
assert.equal(model.count(state.materials.find(m=>m.id==='m1')),2);
assert.equal(state.relearning.reviewRounds.length,0,'single selected material needs only its complete internal schedule');
assert.equal(state.reviewAdmission.relearning.length,1,'already unlocked day does not receive another grant');
// Explicit cancellation preserves partial work separately and never increments.
write(next=>model.start(next,['m2']));write(next=>model.transition(next,'outputDone',model.checkpoint(next)));write(next=>model.cancel(next));
assert.equal(model.count(state.materials.find(m=>m.id==='m2')),1);assert.equal(state.relearningArchives.length,1);
// Group membership changes block unsafe continuation, rather than guessing or fabricating completion.
const changed=JSON.parse(completed);model.start(changed,['m1']);changed.materials.find(m=>m.id==='m1').groups[0].questionRange='1';assert.throws(()=>model.current(changed),/题号已变化/);
// Explicit deletion trims all active references and cancels this unfinished batch without any new count.
const deleted=JSON.parse(completed);model.start(deleted,['m1','m2']);app.context.PocketMaterialDeletion.remove(deleted,['m1']);
assert.equal(model.pending(deleted),false);assert.ok(!deleted.relearning.engine);assert.ok(deleted.relearning.queue.every(q=>q.materialId!=='m1'));
assert.equal(deleted.materials.find(m=>m.id==='m2').relearningCount,1);
module.exports=(async()=>{
 for(const name of ['learning-backup','learning-archive'])vm.runInContext(fs.readFileSync(path.join(__dirname,'../js/'+name+'.js'),'utf8'),app.context);
 const backup=await app.context.PocketLearningBackup.create();assert.equal((await app.context.PocketLearningBackup.verify(JSON.stringify(backup))).valid,true);
 assert.equal(backup.rawState,app.store.get(key));
 const beforeArchive=app.context.PocketLearningArchive.render(initial,'2026-10-29T00:00:00Z');
 assert.equal(app.context.PocketLearningArchive.render(backup.rawState,'2026-10-29T00:00:00Z'),beforeArchive,'original Markdown stats and grades unchanged');
 const cloud=remote(),device=local(cloud,JSON.parse(initial));await bind(device);
 const commits=cloud.stats.commits;
 device.change(next=>Object.assign(next,JSON.parse(backup.rawState)));
 device.advance(400);await device.engine.retry();
 assert.equal(cloud.stats.commits,commits+1,'the existing debounced automatic backup receives updated relearning fields');
 const snapshot=await device.engine.readSnapshot('A',cloud.heads.get('A').snapshotId);assert.equal(snapshot.backup.rawState,backup.rawState);
 const restored=local(cloud,seed(0));await restored.context.PocketCloudBackup.restoreFile(await restored.context.PocketCloudBackup.prepareFileRestore(JSON.stringify(backup)));
 assert.equal(JSON.parse(restored.store.get('cognivex-pocket-state')).materials.find(m=>m.id==='m1').relearningCount,2);
 assert.equal(JSON.stringify(JSON.parse(restored.store.get('cognivex-pocket-state')).reviewAdmission),JSON.stringify(state.reviewAdmission),'JSON/Firebase mock preserves admission');
 device.engine.dispose();restored.engine.dispose();
 console.log('PASS localhost forward-only relearning A1→A2→A3→B1→B2→B3→C1→C2→C3; atomic counts/unlock, unfinished B2 reload/cross-day, failure/stale events, isolated originals, JSON/Firebase mock.');
})();
