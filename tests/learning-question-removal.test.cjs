'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const {boot,seed}=require('./helpers/pocket-learning-ui.cjs');
const originalLearning=require('./helpers/original-learning-fixture.cjs');
const {local,remote,bind}=require('./helpers/pocket-cloud-fixture.cjs');
const location=new URL('http://localhost:4173/'),key='pocket-development-v1:cognivex-pocket-state';
const clock={now:new Date(2026,9,23,10).getTime()};
function fixture() {
  const state=seed(2),material=state.materials[0];material.title=state.materials[1].title='同名资料';material.questionRange='1-5';
  material.groups=[...[[1,2],[3,4],[5,5]]].map(([start,end],index)=>({...structuredClone(material.groups[0]),id:'original-'+index,start,end}));
  originalLearning(state,clock.now);return state;
}
let app=boot({location,clock,focusReview:true,store:new Map([[key,JSON.stringify(fixture())]])});
const walk=node=>[node,...node.children.flatMap(walk)],page=()=>app.document.getElementById('learning-question-removal');
const open=()=>app.nodes['learning-question-removal-entry'].fire('click');
const pickMaterial=id=>{const select=app.document.getElementById('learning-removal-material');select.value=id;select.fire('change');};
const boxes=()=>walk(page()).filter(node=>node.type==='checkbox');
const pick=number=>{const box=boxes().find(node=>Number(node['data-question-number'])===number);assert.ok(box);box.checked=true;box.fire('change');};
const click=label=>{const button=walk(page()).find(node=>node.tag==='button'&&node.textContent===label);assert.ok(button,label);button.fire('click');return button;};
const api=()=>app.context.PocketLearningQuestionRemoval;
const selected=(state,id,numbers)=>Array.from(api().entries(state.materials.find(m=>m.id===id))).filter(entry=>numbers.includes(entry.number)).map(entry=>entry.key);
open();pickMaterial('m1');assert.deepEqual(boxes().map(box=>Number(box['data-question-number'])),[1,2,3,4,5]);
const before=app.store.get(key),other=JSON.stringify(app.state().materials[1]),runs=JSON.stringify(app.state().materials[0].groups.map(group=>group.runs));
pick(3);assert.equal(app.store.get(key),before);click('移除选中题目（1）');const cancelled=click('取消');
assert.equal(app.store.get(key),before);assert.equal(app.document.getElementById('learning-removal-confirm').hidden,true);
pickMaterial('m2');assert.ok(boxes().every(box=>!box.checked));pickMaterial('m1');pick(3);click('移除选中题目（1）');
app.fail.enabled=true;click('确认移除');app.fail.enabled=false;assert.equal(app.store.get(key),before);
assert.match(app.document.getElementById('learning-removal-status').textContent,/移除失败/);
const yes=click('确认移除');yes.fire('click');
let state=app.state(),material=state.materials[0];
assert.equal(material.questionRange,'1-2, 4-5');assert.equal(material.groups[1].questionRange,'4');
assert.deepEqual(material.groups.map(group=>group.id),['original-0','original-1','original-2']);
assert.equal(JSON.stringify(material.groups.map(group=>group.runs)),runs);assert.equal(JSON.stringify(state.materials[1]),other);
assert.equal(material.groups[1].latestAccuracyPercent,80);assert.equal(material.groups[1].latestDurationMinutes,12);
assert.deepEqual(boxes().map(box=>Number(box['data-question-number'])),[1,2,4,5]);
assert.equal(material.groups[1].questionRemovalHistory.length,1);
assert.throws(()=>api().remove(state,'m1',['tampered'],clock.now),/无效/);
const stable=JSON.stringify(state);assert.throws(()=>api().remove(state,'m1',api().entries(material).map(entry=>entry.key),clock.now),/整份资料/);assert.equal(JSON.stringify(state),stable);
// Empty Group remains history, but never appears in a new queue.
api().remove(state,'m1',selected(state,'m1',[4]),clock.now);
assert.equal(state.materials[0].groups[1].questionsInactive,true);assert.equal(state.materials[0].groups.length,3);
assert.deepEqual(Array.from(app.context.PocketMaterialReview.groups(state)).filter(item=>item.materialId==='m1').map(item=>item.groupIndex),[0,2]);
app.context.PocketDailyReverse.start(state,clock.now);
assert.deepEqual(Array.from(state.dailyReverseReview.round.tasks).filter(item=>item.materialId==='m1').map(item=>item.groupIndex),[0,2]);
// Currently executing empty daily Group is pruned without fabricating a completion.
let daily=fixture();app.context.PocketDailyReverse.start(daily,clock.now);
api().remove(daily,'m1',selected(daily,'m1',[1,2]),clock.now);
assert.equal(app.context.PocketDailyReverse.validRound(daily.dailyReverseReview.round),true);
assert.equal(app.context.PocketDailyReverse.task(daily,clock.now).groupIndex,1);
assert.ok(daily.dailyReverseReview.round.tasks.every(task=>task.status==='pending'&&task.run.completedAt===null));
assert.equal(daily.dailyReverseReview.questionRemovalHistory.length,1);
// Existing reverse queue skips only the empty Group; preserve the original Run as history.
let reverse=fixture();app.context.PocketMaterialReview.start(reverse);
const current=reverse.materialReviewSession.materialId;
assert.equal(current,'m2');
api().remove(reverse,'m1',selected(reverse,'m1',[3,4]),clock.now);
assert.equal(reverse.materialReviewSession.materialId,current);
assert.deepEqual(Array.from(reverse.materialReviewSession.queue).filter(item=>item.materialId==='m1').map(item=>item.groupIndex),[0,2]);
assert.equal(reverse.review.questionRemovalHistory.length,1);
// Focus history is retained; only the removed source is unavailable, including in mixed Groups.
let focused=fixture();const focus=app.context.PocketFocusReview;
focus.add(focused,'m1',1,'3、4');focus.add(focused,'m2',0,'2');
const groupId=focus.create(focused,'数学',3,focus.available(focused,'数学').map(question=>question.id));
focus.start(focused,groupId,clock.now);const members=JSON.stringify(focused.focusReview.groups[0].members);
api().remove(focused,'m1',selected(focused,'m1',[3]),clock.now);
assert.equal(focus.locate(focused,focused.focusReview.questions.find(question=>question.number===3)),null);
assert.equal(focused.focusReview.questions.filter(question=>question.materialId==='m1'&&focus.locate(focused,question)).length,1);
assert.equal(JSON.stringify(focused.focusReview.groups[0].members),members);
assert.equal(focus.active(focused).question.number,4);
assert.equal(focused.focusReview.groups[0].runs[0].questionProgress[0].outputCompleted,false);
assert.equal(focused.focusReview.groups[0].runs[0].questionProgress[0].resolution,'inactive');
// Duplicate numbers in distinct Groups remain distinct original identities.
let duplicate=fixture();duplicate.materials[0].groups[1].start=2;
const duplicates=api().entries(duplicate.materials[0]).filter(entry=>entry.number===2);assert.equal(duplicates.length,2);
api().remove(duplicate,'m1',[duplicates[1].key],clock.now);
assert.ok(app.context.PocketFocusReview.groupNumbers(duplicate.materials[0].groups[0]).includes(2));
assert.equal(app.context.PocketFocusReview.groupNumbers(duplicate.materials[0].groups[1]).includes(2),false);
// Interrupted original learning resumes at the next live Group, with unchanged relative algorithm.
function newLearning() {
  const state=fixture(),material=state.materials[0];material.status='learning';material.completedAt=null;
  material.groups.forEach(group=>{group.runs=[];group.executionCompleted=false;});
  state.currentSession={materialId:'m1',currentStep:'output',mode:'new'};state.activeSessionType='learning';
  app.context.PocketExecutor.startRun(state,{groupIndex:0,mode:'new',schedulerState:{phase:'new',newGroupIndex:0,reviewGroupIndex:0}});return state;
}
const advance=state=>{const session=state.currentSession;app.context.PocketExecutor.transition(state,session.currentStep==='output'?'outputDone':'continue',{...session,sessionType:'learning'});};
let learning=newLearning();api().remove(learning,'m1',selected(learning,'m1',[1,2]),clock.now);
assert.equal(learning.currentSession.currentGroupIndex,1);
let limit=0;while(learning.currentSession.currentStep!=='materialComplete'){assert.ok(++limit<30);assert.notEqual(learning.currentSession.currentGroupIndex,0);advance(learning);}
assert.equal(learning.materials[0].status,'completed');
// Removing the final as-yet-unlearned Group does not force a second full internal review.
learning=newLearning();limit=0;while(!(learning.currentSession.currentGroupIndex===2&&learning.currentSession.currentStep==='output')){assert.ok(++limit<30);advance(learning);}
const count=learning.materials[0].groups.slice(0,2).map(group=>group.runs.length);
api().remove(learning,'m1',selected(learning,'m1',[5]),clock.now);
assert.equal(learning.currentSession.currentStep,'materialComplete');assert.deepEqual(learning.materials[0].groups.slice(0,2).map(group=>group.runs.length),count);
// Refresh, latest material detail, Markdown and exact backup/restore round trip.
const savedStore=app.store;app=boot({location,clock,focusReview:true,store:savedStore});
assert.equal(app.state().materials[0].questionRange,'1-2, 4-5');
app.context.PocketLearning.showHome();app.document.getElementById('learned-material-details').fire('click');
const detail=app.all().find(node=>node['aria-label']==='查看「同名资料」资料详情');detail.fire('click');
assert.ok(app.content().some(node=>node.textContent.includes('1-2, 4-5')));
for(const name of ['learning-backup','learning-archive'])vm.runInContext(fs.readFileSync(path.join(__dirname,'../js/'+name+'.js'),'utf8'),app.context);
const md=app.context.PocketLearningArchive.render(JSON.stringify(focused));
assert.match(md,/\| 第2组 \| 4 \| 80%（历史成绩，题号：3-4） \| 12分钟（历史成绩，题号：3-4）/);
assert.match(md,/\| 数学 \| 同名资料 \| 第3题 \| 普通学习资料 \|/);
assert.match(md,/\| 同名资料 \| 第4题/);
app.context.PocketLearning.showHome();app.document.getElementById('daily-reverse-review-entry').fire('click');
app.button('输出达标 → 下一步').fire('click');
const accuracy=app.document.getElementById('group-latest-accuracy');accuracy.value='1/1';accuracy.fire('input');
const updated=app.context.PocketLearningArchive.render(app.store.get(key));
assert.match(updated,/\| 第2组 \| 4 \| 1\/1 \| 12分钟（历史成绩，题号：3-4）/);
module.exports=(async()=>{
  const backup=await app.context.PocketLearningBackup.create();assert.equal((await app.context.PocketLearningBackup.verify(JSON.stringify(backup))).valid,true);
  const cloud=remote(),device=local(cloud,JSON.parse(backup.rawState));await bind(device);
  const head=cloud.heads.get('A'),snapshot=await device.engine.readSnapshot('A',head.snapshotId);assert.equal(snapshot.backup.rawState,backup.rawState);
  const restored=local(cloud,seed(0));await restored.context.PocketCloudBackup.restoreFile(await restored.context.PocketCloudBackup.prepareFileRestore(JSON.stringify(backup)));
  assert.equal(restored.store.get('cognivex-pocket-state'),backup.rawState);device.engine.dispose();restored.engine.dispose();
  const scheduledCloud=remote(),scheduled=local(scheduledCloud,fixture());
  for(const name of ['grouping','scheduler','history','daily-reverse-review','executor','material-review','focus-review','learning-question-removal'])vm.runInContext(fs.readFileSync(path.join(__dirname,'../js/'+name+'.js'),'utf8'),scheduled.context);
  await bind(scheduled);const commitCount=scheduledCloud.stats.commits;
  scheduled.change(next=>{
    const model=scheduled.context.PocketLearningQuestionRemoval;
    model.remove(next,'m1',model.entries(next.materials[0]).filter(entry=>entry.number===3).map(entry=>entry.key),clock.now);
  });
  assert.equal(scheduledCloud.stats.commits,commitCount);
  scheduled.advance(400);await scheduled.fire();await scheduled.engine.retry();
  const cloudState=await scheduled.engine.readSnapshot('A',scheduledCloud.heads.get('A').snapshotId);
  assert.equal(JSON.parse(cloudState.backup.rawState).materials[0].groups[1].questionRange,'4');
  scheduled.engine.dispose();
  console.log('PASS localhost learning question removal: selection/cancel/failure/double submit, IDs/order/duplicate sources, partial/empty Groups, whole-material guard, active daily/reverse/original/focus repair, historical grades, detail/archive/JSON, reload and Firebase mock.');
})();
