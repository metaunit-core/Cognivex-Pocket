'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs'), vm = require('node:vm'), path = require('node:path');
const {boot, seed} = require('./helpers/pocket-learning-ui.cjs');
const location = new URL('http://localhost:4173/'), key = 'pocket-development-v1:cognivex-pocket-state';
const clock = {now:new Date(2026,10,4,9).getTime()};
function fixture(total = 30) {
  const state = seed(2), material = state.materials[0];
  material.groups = Array.from({length:Math.ceil(total/10)}, (_, index) => ({...structuredClone(material.groups[0]),
    id:'original-'+index,start:index*10+1,end:Math.min(total,index*10+10)}));
  material.questionRange = '1-'+total; material.groupSize = 10; material.totalGroups = material.groups.length;
  require('./helpers/original-learning-fixture.cjs')(state, clock.now);
  return state;
}
function runtime(initial = fixture()) {
  const store = new Map([[key, JSON.stringify(initial)]]), fail = {enabled:false};
  const app = boot({location, store, clock, fail, focusReview:true});
  return {app,store,fail,model:app.context.PocketGrouping};
}
function commit(app, change) {
  return app.context.PocketStorage.updateState(app.context.PocketStorage.loadState(), change);
}
function regroup(app, size) {
  return commit(app, state => app.context.PocketGrouping.regroup(state,'m1',size,JSON.stringify(state.materials[0])));
}
function detail(app) {
  app.document.getElementById('learned-material-details').fire('click');
  app.all().find(node => node['aria-label'] === '查看「资料1」资料详情').fire('click');
  app.button('更改资料').fire('click'); app.button('改分组情况').fire('click');
}
for (const [total,size,count,last] of [[30,10,3,[21,30]],[30,5,6,[26,30]],[31,10,4,[31,31]]]) {
  const {app,model} = runtime(fixture(total)), original = app.state();
  const state = regroup(app,size), material = state.materials[0], planned = model.reviewMaterial(material,model.reviewId(material));
  assert.equal(planned.groups.length,count); assert.deepEqual([planned.groups.at(-1).start,planned.groups.at(-1).end],last);
  assert.equal(JSON.stringify(material.groups),JSON.stringify(original.materials[0].groups));
  assert.equal(JSON.stringify(state.materials[1]),JSON.stringify(original.materials[1]));
  const cleaned=structuredClone(material);delete cleaned.reviewGrouping;assert.deepEqual(cleaned,original.materials[0]);
  assert.ok(planned.groups.every(group=>!group.executionCompleted && group.runs.length===0));
}
{
  const {app,model} = runtime(), before = JSON.stringify(app.state()); detail(app);
  assert.ok(app.content().some(node=>node.textContent.includes('最新题目总数：30')));
  const input=app.document.getElementById('review-group-size'); input.value='0';input.fire('input');
  assert.equal(app.button('确认重新分组').disabled,true);
  input.value='5';input.fire('input');assert.equal(app.button('确认重新分组').disabled,false);
  app.document.getElementById('review-regroup-panel').children.find(node=>node.tag==='button' && node.textContent==='取消').fire('click');
  assert.equal(JSON.stringify(app.state()),before);
  app.button('改分组情况').fire('click');
  app.document.getElementById('review-group-size').value='5';app.document.getElementById('review-group-size').fire('input');
  app.button('确认重新分组').fire('click');
  assert.equal(model.reviewMaterial(app.state().materials[0],model.reviewId(app.state().materials[0])).groups.length,6);
}
{
  const {app,model,fail}=runtime(), before=JSON.stringify(app.state());
  fail.enabled=true;assert.throws(()=>regroup(app,5),/Quota/);fail.enabled=false;assert.equal(JSON.stringify(app.state()),before);
  for(const change of [state=>{state.currentSession={materialId:'m2',currentStep:'output'};},
    state=>{state.currentSession={materialId:'orphan',currentStep:'output'};},
    state=>{state.materialReviewSession={currentStep:'output'};},
    state=>{state.dailyReverseReview={round:{completedAt:null}};},
    state=>{state.relearning={completedAt:null,queue:[{materialId:'m1'}]};},
    state=>{state.review.requiredAfterLearning={materialId:'m2'};}]) {
    const state=fixture();change(state);const snapshot=JSON.stringify(state);
    assert.throws(()=>model.regroup(state,'m1',5,JSON.stringify(state.materials[0])));
    assert.equal(JSON.stringify(state),snapshot);
  }
  const state=fixture();assert.throws(()=>model.regroup(state,'m1',5,'stale'),/变化/);
}
{
  const initial=fixture(20), material=initial.materials[0];
  material.groups.push({...structuredClone(material.groups[0]),id:'appended',start:25,end:31,appended:true,addedToReviewAt:clock.now});
  material.questionRange='1-20';
  const {app,model}=runtime(initial), state=regroup(app,10), planned=model.reviewMaterial(state.materials[0],model.reviewId(state.materials[0]));
  assert.equal(model.materialNumbers(state.materials[0]).length,27);
  assert.equal(JSON.stringify(planned.groups.flatMap(model.questionNumbers)),JSON.stringify([...Array.from({length:20},(_,index)=>index+1),25,26,27,28,29,30,31]));
}
{
  const {app,model,store}=runtime();let state=regroup(app,5);const original=JSON.stringify(state.materials[0].groups);
  commit(app,next=>app.context.PocketDailyReverse.start(next));
  let guard=0;
  while(!app.state().dailyReverseReview.round.completedAt) {
    assert.ok(++guard<20);state=app.context.PocketStorage.loadState();
    const active=app.context.PocketDailyReverse.task(state), round=active.round;
    assert.ok(active.material.groups[active.groupIndex]);
    const reload=boot({location,store,clock,focusReview:true});
    assert.equal(reload.context.PocketDailyReverse.task(reload.state()).item.groupId,active.item.groupId);
    commit(app,next=>app.context.PocketDailyReverse.transition(next,'outputDone',{
      roundId:round.id,index:round.index,materialId:active.material.id,taskIndex:round.taskIndex,currentGroupIndex:active.groupIndex}));
  }
  assert.equal(app.state().dailyReverseReview.round.tasks.filter(task=>task.materialId==='m1').length,6);
  assert.equal(JSON.stringify(app.state().materials[0].groups),original);
  state=regroup(app,10);assert.equal(state.materials[0].reviewGrouping.layouts.length,2);
  const oldTask=state.dailyReverseReview.round.tasks[0];
  assert.equal(model.reviewMaterial(state.materials[0],oldTask.reviewLayoutId).groups.length,6);
  vm.runInContext(fs.readFileSync(path.join(__dirname,'../js/relearning.js'),'utf8'),app.context);
  const relearning=app.context.PocketRelearning;
  commit(app,next=>relearning.start(next,['m1']));
  let completed=0;
  while(relearning.pending(app.state())) {
    state=app.context.PocketStorage.loadState();assert.equal(state.materials[0].relearningCount,undefined);
    commit(app,next=>relearning.transition(next,'outputDone',relearning.checkpoint(state)));completed++;
  }
  assert.equal(completed,3);assert.equal(app.state().materials[0].relearningCount,1);
  assert.equal(JSON.stringify(app.state().materials[0].groups),original);
  assert.equal(app.context.PocketReviewAdmission.status(app.state()).unlocked,true);
}
{
  const {app,model}=runtime();let state=regroup(app,5);
  const layoutId=model.reviewId(state.materials[0]);
  commit(app,next=>app.context.PocketMaterialReview.start(next));
  let steps=0;
  while(app.state().materialReviewSession.currentStep!=='queueComplete') {
    assert.ok(++steps<40);state=app.context.PocketStorage.loadState();
    const session=state.materialReviewSession;
    if(session.currentStep==='output') {
      const active=app.context.PocketExecutor.getCurrentGroup(state,'materialReviewSession');
      assert.ok(active.group);
      commit(app,next=>app.context.PocketExecutor.transition(next,'outputDone',{...session,sessionType:'material-review'}));
    } else commit(app,next=>app.context.PocketMaterialReview.advanceQueue(next));
  }
  state=app.state();assert.equal(state.materials[0].reviewGrouping.layouts[0].groups.filter(group=>group.runs.length===1).length,6);
  const original=JSON.stringify(state.materials[0].groups);
  commit(app,next=>app.context.PocketFocusReview.add(next,'m1',0,'3'));
  assert.ok(app.context.PocketFocusReview.locate(app.state(),app.state().focusReview.questions[0]));
  regroup(app,3);
  assert.ok(app.context.PocketFocusReview.locate(app.state(),app.state().focusReview.questions[0]));
  assert.equal(model.reviewMaterial(app.state().materials[0],layoutId).groups.length,6);
  assert.equal(JSON.stringify(app.state().materials[0].groups),original);
}
{
  const {app,model}=runtime();regroup(app,5);
  commit(app,next=>app.context.PocketDailyReverse.start(next));
  const before=app.state().dailyReverseReview.round.tasks[0].run.questionRangeSnapshot;
  commit(app,next=>{
    const entry=app.context.PocketLearningQuestionRemoval.entries(next.materials[0]).find(item=>item.number===3);
    app.context.PocketLearningQuestionRemoval.remove(next,'m1',[entry.key]);
  });
  const state=app.state(),active=app.context.PocketDailyReverse.task(state);
  assert.equal(model.questionNumbers(active.material.groups[active.groupIndex]).join(','),'1,2,4,5');
  assert.equal(active.item.run.questionRangeSnapshot,before);
  assert.equal(state.materials[0].reviewGrouping.layouts[0].groups[0].start,1);
}
(async () => {
  const {app,model}=runtime();regroup(app,5);regroup(app,3);
  app.context.TextEncoder=TextEncoder;
  for(const name of ['learning-backup','learning-archive'])vm.runInContext(fs.readFileSync(path.join(__dirname,'../js/'+name+'.js'),'utf8'),app.context);
  const before=JSON.stringify(app.state()), backup=await app.context.PocketLearningBackup.create();
  const report=await app.context.PocketLearningBackup.verify(JSON.stringify(backup));
  assert.equal(report.valid,true);assert.equal(backup.rawState,before);
  const restored=JSON.parse(backup.rawState);
  assert.equal(model.reviewId(restored.materials[0]),model.reviewId(app.state().materials[0]));
  assert.equal(restored.materials[0].reviewGrouping.layouts.length,2);
  assert.match(app.context.PocketLearningArchive.render(backup.rawState),/复习分组版本 2（当前）/);
  assert.equal(JSON.stringify(app.state()),before);
  console.log('PASS regroup preview/UI/cancel/atomic failure/conflicts/latest discontinuous ranges; original identities/history/focus preserved; daily/material-review versions and reload; forward relearning/count/unlock; JSON verification and archive.');
})().catch(error=>{console.error(error);process.exitCode=1;});
