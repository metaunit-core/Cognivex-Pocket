'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const {boot,seed}=require('./helpers/pocket-learning-ui.cjs');
const key='pocket-development-v1:cognivex-pocket-state';
const app=boot({location:new URL('http://localhost:4173/'),focusReview:true,store:new Map([[key,JSON.stringify(seed(0))]])});
for(const name of ['video-learning','learning-backup'])vm.runInContext(fs.readFileSync(path.join(__dirname,'../js/'+name+'.js'),'utf8'),app.context);
const model=app.context.PocketVideoLearning,storage=app.context.PocketStorage;
let state=storage.loadState();const write=change=>{state=storage.updateState(state,change);};
write(next=>model.saveProgress(next,'continuous','step',3));
assert.equal(Object.hasOwn(state.videoLearning,'moduleCycle'),false,'normal guide steps no longer create completion records');
write(next=>model.saveProgress(next,'question','question',12));
write(next=>model.saveProgress(next,'question','step',6));
const previousPositions=model.progress(state);
write(next=>model.saveProgress(next,'intro','step',0));
assert.equal(model.progress(state).continuous,previousPositions.continuous);assert.equal(model.progress(state).question,previousPositions.question);assert.equal(model.progress(state).currentQuestion,12);
for(const status of ['learning','pending-grouping','grouped']){
  const legacy={id:'old-'+status,status,sourceStage:'question',materialId:status==='grouped'?'history-id':null,startedAt:1,groupedAt:status==='grouped'?2:null};
  write(next=>{next.videoLearning.moduleCycle=legacy;});
  write(next=>model.saveProgress(next,'intro','step',0));
  assert.deepEqual(JSON.parse(JSON.stringify(state.videoLearning.moduleCycle)),legacy,'existing completion fields are retained but not used or reset');
}
const before=app.store.get(key);app.fail.enabled=true;assert.throws(()=>write(next=>model.saveProgress(next,'intro','step',1)),/Quota/);app.fail.enabled=false;assert.equal(app.store.get(key),before);
assert.throws(()=>storage.updateState(JSON.parse(before),next=>{model.saveProgress(next,'intro','step',1);throw Error('cancel');}),/cancel/);assert.equal(app.store.get(key),before);
assert.equal(model.completeModuleGrouping,undefined);assert.equal(model.prepareModuleGrouping,undefined);
const source=fs.readFileSync(path.join(__dirname,'../js/app.js'),'utf8');assert.ok(!source.includes('completeModuleGrouping'));assert.ok(!source.includes('linkVideoGrouping'));
(async()=>{
  const backup=await app.context.PocketLearningBackup.create();assert.equal((await app.context.PocketLearningBackup.verify(JSON.stringify(backup))).valid,true);
  assert.deepEqual(JSON.parse(backup.rawState).videoLearning,JSON.parse(JSON.stringify(state.videoLearning)));
  console.log('PASS reminder model: unchanged positions/questions, no new completion state or creation hooks, retained legacy fields, atomic failure and backup.');
})().catch(error=>{console.error(error);process.exitCode=1;});
