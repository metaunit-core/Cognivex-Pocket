'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const {boot,seed}=require('./helpers/pocket-learning-ui.cjs');
const {local,remote,bind}=require('./helpers/pocket-cloud-fixture.cjs');
const location=new URL('http://localhost:4173/'),key='pocket-development-v1:cognivex-pocket-state';
const clock={now:new Date(2026,9,23,9).getTime()};
const initial=seed(3);initial.materials.forEach((material,index)=>{material.id=['A','B','C'][index];material.title=material.id;});
let app=boot({location,clock,focusReview:true,store:new Map([[key,JSON.stringify(initial)]])});
const model=()=>app.context.PocketMaterialReview;
const get=id=>app.document.getElementById(id);
const fill=(id,value)=>{get(id).value=value;get(id).fire('input');};
const submit=()=>app.content().find(node=>node.tag==='form').fire('submit');
const finishDaily=()=>{let limit=0;get('daily-reverse-review-entry').fire('click');while(!app.state().dailyReverseReview.round.completedAt){assert.ok(++limit<100);app.button('输出达标 → 下一步').fire('click');}};
// The existing date tool changes the study day without changing execution timestamps.
app.context.PocketDailyTestDate.set('2026-10-24');
assert.equal(model().canCreate(app.state()),false);finishDaily();
const learn=title=>{
  app.context.PocketLearning.startNewMaterial();fill('subject','数学');fill('title',title);submit();fill('question-range','1-6');fill('group-size','2');submit();
  const assignments=[];let limit=0;
  while(app.state().currentSession.currentStep!=='materialComplete'){
    assert.ok(++limit<100);const session=app.state().currentSession;
    assert.equal(app.state().review.requiredAfterLearning,undefined,'the inter-material obligation starts only after real internal completion');
    if(session.currentStep==='output')assignments.push([session.currentGroupIndex,session.mode]);
    app.button(session.currentStep==='output'?'输出达标 → 下一步':'继续').fire('click');
  }
  assert.deepEqual(assignments,[[0,'new'],[1,'new'],[0,'review'],[1,'review'],[2,'new'],[0,'review'],[1,'review'],[2,'review']]);
  assert.equal(model().canCreate(app.state()),false,'internal review must not unlock next material when the effective day differs from wall-clock day');
  return app.state().materials.at(-1).id;
};
const d=learn('不等式');
assert.equal(app.state().materials.at(-1).originalLearningDay,'2026-10-24');
// Already-saved first completions from the earlier version cannot exploit an
// empty "today" result; recognition is read-only and uses their saved dates.
const legacy=structuredClone(app.state());delete legacy.review.requiredAfterLearning;delete legacy.materials.at(-1).originalLearningDay;
const legacyRaw=JSON.stringify(legacy);assert.equal(model().canCreate(legacy),false);assert.equal(JSON.stringify(legacy),legacyRaw);
model().open(legacy);assert.deepEqual(Array.from(legacy.materialReviewSession.materialIds),[d]);
// Midnight before opening the queue also preserves the obligation and its day.
app.context.PocketDailyTestDate.set('2026-10-25');
const notOpened=structuredClone(app.state());assert.deepEqual(Array.from(model().todayGroups(notOpened)),[]);
model().open(notOpened);assert.deepEqual(Array.from(notOpened.materialReviewSession.materialIds),[d]);
app.context.PocketDailyTestDate.set('2026-10-24');
const enter=expected=>{
  app.button('开始下一份资料').fire('click');
  assert.equal(app.state().activeSessionType,'material-review');
  assert.deepEqual(app.state().materialReviewSession.materialIds,expected);
  assert.equal(app.state().materialReviewSession.completedGroupCount,0);
};
const finishReverse=()=>{
  let limit=0;
  while(app.state().materialReviewSession.currentStep!=='queueComplete'){
    assert.ok(++limit<100);assert.equal(model().canCreate(app.state()),false);
    app.button('输出达标 → 下一步').fire('click');
  }
};
enter([d]);
const invalid=structuredClone(app.state()),historyCount=invalid.review.roundHistory?.length||0;
invalid.materialReviewSession.queue.forEach(item=>{item.status='completed';item.completedAt=clock.now;});
invalid.materialReviewSession.currentQueueIndex=invalid.materialReviewSession.queue.length-1;
invalid.materialReviewSession.currentStep='materialCompletePending';model().advanceQueue(invalid);
assert.equal(invalid.materialReviewSession.currentStep,'queueBlocked');assert.equal(invalid.review.roundHistory?.length||0,historyCount);
assert.ok(invalid.review.requiredAfterLearning);
fill('group-latest-accuracy','2/3');fill('group-latest-duration','8');
const firstRound=app.state().materialReviewSession.roundId;
app.button('输出达标 → 下一步').fire('click');
assert.equal(model().canCreate(app.state()),false);
let checkpoint=JSON.stringify(app.state().materialReviewSession);
app=boot({location,clock,focusReview:true,store:app.store});
assert.equal(JSON.stringify(app.state().materialReviewSession),checkpoint);
finishReverse();assert.equal(model().canCreate(app.state()),true);
assert.equal(app.state().review.roundHistory.filter(round=>round.id===firstRound).length,1);
app=boot({location,clock,focusReview:true,store:app.store});
assert.equal(app.state().review.roundHistory.filter(round=>round.id===firstRound).length,1);
app.button('返回当前学习').fire('click');
const e=learn('减数分裂');enter([e,d]);
assert.notEqual(app.state().materialReviewSession.roundId,firstRound);
assert.ok(app.state().materialReviewSession.queue.every(item=>item.status==='pending'));
for(let index=0;index<3;index++)app.button('输出达标 → 下一步').fire('click');
assert.equal(app.state().materialReviewSession.materialId,d);
assert.equal(model().canCreate(app.state()),false,'finishing E cannot skip D or reuse the previous round');
const secondRound=app.state().materialReviewSession.roundId;
app.context.PocketLearning.startNewMaterial();assert.equal(app.state().materials.length,5);
get('start-review-button').fire('click');
finishReverse();assert.equal(model().canCreate(app.state()),true);
assert.equal(app.state().review.roundHistory.filter(round=>round.id===secondRound).length,1);
app.button('返回当前学习').fire('click');
const f=learn('运动');enter([f,e,d]);
// Quick input stays independent and never enters the original-learning queue.
get('quick-material-entry').fire('click');
for(const [field,value] of Object.entries({subject:'数学',title:'快捷Q',questionRange:'1-2',groupSize:'2'}))fill('quick-material-'+field,value);
const walk=node=>[node,...node.children.flatMap(walk)];
walk(get('quick-material')).find(node=>node.tag==='form').fire('submit');
const q=app.state().materials.at(-1).id;
assert.equal(get('quick-material').hidden,false);assert.deepEqual(app.state().materialReviewSession.materialIds,[f,e,d]);
checkpoint=JSON.stringify(app.state().materialReviewSession);
app.context.PocketDailyTestDate.set('2026-10-25');
app=boot({location,clock,focusReview:true,store:app.store});
assert.equal(JSON.stringify(app.state().materialReviewSession),checkpoint);
assert.equal(model().canCreate(app.state()),false);
assert.deepEqual(Array.from(model().todayGroups(app.state())),[]);
app.context.PocketLearning.showHome();get('start-review-button').fire('click');
// Finish the original frozen round; a quick save changed generation, so it may
// require the existing fresh snapshot before the old study day's obligation clears.
finishReverse();
if(app.state().review.requiredAfterLearning){get('start-review-button').fire('click');finishReverse();}
assert.equal(app.state().review.requiredAfterLearning,undefined);
assert.equal(model().canCreate(app.state()),false,'finishing yesterday reverse review cannot replace today admission');
finishDaily();
assert.deepEqual(app.state().dailyReverseReview.round.ids,['A','B','C',d,e,f,q]);
assert.equal(model().canCreate(app.state()),true);
const next=learn('次日资料D');enter([next]);
assert.ok(app.state().materialReviewSession.queue.every(item=>item.materialId===next));
// A focus completion qualifies A but cannot bypass an outstanding B.
let focusState=seed(1),focus=app.context.PocketFocusReview;
focus.add(focusState,'m1',0,'1');const focusId=focus.create(focusState,'数学',1,focus.available(focusState,'数学').map(question=>question.id));
focus.start(focusState,focusId,clock.now);focus.transition(focusState,focus.active(focusState).run.id,'finish',{},clock.now);
assert.equal(model().canCreate(focusState),true);
focusState.review.requiredAfterLearning={materialId:'m1',day:'2026-10-25'};
assert.equal(model().canCreate(focusState),false);
for(const name of ['learning-backup','learning-archive'])vm.runInContext(fs.readFileSync(path.join(__dirname,'../js/'+name+'.js'),'utf8'),app.context);
const raw=app.store.get(key),markdown=app.context.PocketLearningArchive.render(raw);
for(const title of ['A','B','C','不等式','减数分裂','运动','快捷Q','次日资料D'])assert.ok(markdown.includes(' · '+title));
module.exports=(async()=>{
  const backup=await app.context.PocketLearningBackup.create();assert.equal((await app.context.PocketLearningBackup.verify(JSON.stringify(backup))).valid,true);
  const cloud=remote(),device=local(cloud,JSON.parse(raw));await bind(device);
  const snapshot=await device.engine.readSnapshot('A',cloud.heads.get('A').snapshotId);assert.equal(snapshot.backup.rawState,raw);
  device.engine.dispose();
  console.log('PASS localhost original 3-Group schedule; A daily/focus admission and mandatory B; original completion-button handoff; D / E→D / F→E→D, pending and per-round locks, reload/cross-day, next-day all-history daily + quick, next-day D only, grades/archive/JSON/Firebase mock.');
})();
