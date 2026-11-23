'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const {boot,seed}=require('./helpers/pocket-learning-ui.cjs');
const key='pocket-development-v1:cognivex-pocket-state',clock={now:new Date(2026,10,24,9).getTime()};
const initial=seed(2);
require('./helpers/original-learning-fixture.cjs')(initial,clock.now);
const app=boot({store:new Map([[key,JSON.stringify(initial)]]),clock,location:new URL('http://localhost:4173/'),focusReview:true});
vm.runInContext(fs.readFileSync(path.join(__dirname,'../js/relearning.js'),'utf8'),app.context);
const admission=app.context.PocketReviewAdmission,daily=app.context.PocketDailyReverse,model=app.context.PocketRelearning,storage=app.context.PocketStorage;
let state=app.state();
const counts=()=>JSON.parse(JSON.stringify(admission.entryCounts(state)));
const original=JSON.stringify(state);
assert.deepEqual(counts(),{selected:0,daily:0,focus:0});
assert.equal(JSON.stringify(state),original,'reading legacy data never writes counters');
const write=change=>{state=storage.updateState(state,change);};
write(next=>admission.countFocusClick(next));
write(next=>admission.countFocusClick(next));
assert.deepEqual(counts(),{selected:0,daily:0,focus:2});
assert.equal(admission.status(state).unlocked,false,'click counts cannot grant admission');
write(next=>{daily.start(next,clock.now);admission.trackEntry(next,'daily');});
assert.equal(counts().daily,0);
let tick=clock.now;
while(daily.task(state,tick)){
  const active=daily.task(state,tick),round=active.round;
  write(next=>daily.transition(next,'outputDone',{roundId:round.id,index:round.index,materialId:active.material.id,taskIndex:round.taskIndex,currentGroupIndex:active.groupIndex},++tick));
  if(daily.task(state,tick))assert.equal(counts().daily,0,'partial rounds do not count');
}
assert.equal(counts().daily,1);
write(next=>{admission.trackEntry(next,'daily');admission.recordDaily(next,tick);});
assert.equal(counts().daily,1,'repeated completion is deduplicated');
write(next=>{model.start(next,['m1']);admission.trackEntry(next,'selected');});
let guard=0;
while(model.pending(state)){
  assert.ok(++guard<100);
  const active=model.current(state),checkpoint=model.checkpoint(state);
  assert.equal(counts().selected,0,'unfinished selected batches do not count');
  write(next=>model.transition(next,active.session.currentStep==='groupComplete'?'continue':'outputDone',checkpoint));
}
assert.equal(counts().selected,1,'completed batches count even after admission already unlocked');
write(next=>{admission.trackEntry(next,'selected');admission.recordRelearning(next,next.relearning.completedAt);});
assert.equal(counts().selected,1);
state=storage.loadState();
assert.deepEqual(counts(),{selected:1,daily:1,focus:2},'counts survive storage reload');
assert.equal(admission.entrySuffix(state,'selected'),'（1次）');
assert.equal(admission.entrySuffix(state,'focus'),'（2次）');
const before=app.store.get(key);
app.fail.enabled=true;
assert.throws(()=>write(next=>admission.countFocusClick(next)),/Quota/);
assert.equal(app.store.get(key),before,'failed saves do not change persisted counts');
app.fail.enabled=false;
vm.runInContext(fs.readFileSync(path.join(__dirname,'../js/learning-backup.js'),'utf8'),app.context);
(async()=>{
  const backup=await app.context.PocketLearningBackup.create();
  assert.equal((await app.context.PocketLearningBackup.verify(JSON.stringify(backup))).valid,true);
  assert.deepEqual(JSON.parse(backup.rawState).reviewAdmission.entryStats,JSON.parse(JSON.stringify(state.reviewAdmission.entryStats)));
  console.log('review entry counts: PASS, including backup coverage');
})().catch(error=>{console.error(error);process.exitCode=1;});
