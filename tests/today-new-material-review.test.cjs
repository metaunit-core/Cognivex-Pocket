'use strict';
const assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path'), vm = require('node:vm');
const { boot, seed } = require('./helpers/pocket-learning-ui.cjs');
const { local, remote, bind } = require('./helpers/pocket-cloud-fixture.cjs');
const location = new URL('http://localhost:4173/'), key = 'pocket-development-v1:cognivex-pocket-state';
const clock = { now: new Date(2026, 9, 23, 9).getTime() };
const initial = seed(3);
initial.materials.forEach((m, i) => { m.id = ['A','B','C'][i]; m.title = m.id;
  m.completedAt = clock.now - (3-i)*86400000;
});
let app = boot({ location, clock, focusReview: true, store: new Map([[key, JSON.stringify(initial)]]) });
const model = () => app.context.PocketMaterialReview;
const ids = () => Array.from(model().todayGroups(app.state()), g => g.materialId);
const fill = (id, value) => { const node = app.document.getElementById(id); assert.ok(node, id); node.value = value; node.fire('input'); };
const submit = () => app.content().find(n => n.tag === 'form').fire('submit');
const finishLearning = () => { let n=0; while (app.state().currentSession.currentStep !== 'materialComplete') {
  assert.ok(++n<100); app.button(app.state().currentSession.currentStep === 'output' ? '输出达标 → 下一步' : '继续').fire('click');
} };
const learn = title => {
  app.context.PocketLearning.startNewMaterial(); fill('subject','数学'); fill('title',title); submit();
  fill('question-range','1-4'); fill('group-size','2'); submit(); finishLearning();
  return app.state().materials.at(-1).id;
};
const finishReverse = () => { let n=0; while (app.state().materialReviewSession.currentStep !== 'queueComplete') {
  assert.ok(++n<100); app.button('输出达标 → 下一步').fire('click');
} };
assert.deepEqual(ids(), []); assert.equal(model().canCreate(app.state()), false);
app.context.PocketLearning.startNewMaterial(); assert.equal(app.state().materials.length, 3);
assert.equal(app.nodes['start-review-button'].disabled, true);
app.document.getElementById('daily-reverse-review-entry').fire('click');
let n=0; while (!app.state().dailyReverseReview.round.completedAt) { assert.ok(++n<30); app.button('输出达标 → 下一步').fire('click'); }
assert.equal(model().canCreate(app.state()), true);
const d = learn('D'); assert.deepEqual([...new Set(ids())], [d]);
assert.equal(model().canCreate(app.state()), true);
const e = learn('E');
assert.deepEqual([...new Set(ids())], [e,d]);
app.nodes['start-review-button'].fire('click');
assert.deepEqual(app.state().materialReviewSession.materialIds, [d]);
fill('group-latest-accuracy','2/3'); fill('group-latest-duration','8');
let frozen = JSON.stringify(app.state().materialReviewSession.queue);
app = boot({ location, clock, focusReview: true, store: app.store });
assert.equal(JSON.stringify(app.state().materialReviewSession.queue), frozen);
finishReverse(); app.button('返回当前学习').fire('click');
assert.equal(app.state().materials.find(m=>m.id===d).groups[0].latestAccuracyRatio, '2/3');
const f = learn('F'); app.nodes['start-review-button'].fire('click');
assert.deepEqual(app.state().materialReviewSession.materialIds, [e,d]);
frozen = JSON.stringify(app.state().materialReviewSession.queue);
// A quick save stays completed and appended, without joining or changing the active queue.
app.nodes['quick-material-entry'].fire('click');
for (const [field,value] of Object.entries({ subject:'数学',title:'快捷Q',questionRange:'1-2',groupSize:'2' })) fill('quick-material-'+field,value);
const quickPage = app.document.getElementById('quick-material');
const walk = node => [node,...node.children.flatMap(walk)];
walk(quickPage).find(node=>node.tag==='form').fire('submit');
const q = app.state().materials.at(-1).id;
assert.equal(app.state().materials.at(-1).status,'completed');
assert.deepEqual([...new Set(ids())], [f,e,d]);
assert.equal(JSON.stringify(app.state().materialReviewSession.queue), frozen);
// Renaming or reviewing historical data does not make its first completion today.
let state = app.state(); const oldTime = state.materials[0].completedAt;
state.materials[0].title='旧资料改名'; state.materials[0].lastMaterialReviewedAt=clock.now;
state.materials[0].groups[0].runs.push({mode:'material-review',videoSkipped:true,outputCompleted:true,startedAt:clock.now,completedAt:clock.now});
assert.deepEqual([...new Set(model().todayGroups(state).map(g=>g.materialId))],[f,e,d]);
assert.equal(state.materials[0].completedAt, oldTime);
// Unknown/migrated history is not guessed; later append-only new runs do not turn quick data into learned data.
const unknown=structuredClone(state.materials.find(m=>m.id===d)); unknown.id='unknown'; delete unknown.completedAt;
state.materials.push(unknown); assert.equal(model().todayGroups(state).some(g=>g.materialId==='unknown'),false);
clock.now += 86400000;
app = boot({ location, clock, focusReview:true, store:app.store });
assert.deepEqual(ids(), []);
assert.equal(JSON.stringify(app.state().materialReviewSession.queue), frozen);
app.context.PocketLearning.showHome(); app.nodes['start-review-button'].fire('click'); finishReverse();
assert.ok(app.state().review.roundHistory.length >= 2);
assert.equal(model().canCreate(app.state()),false, 'new day still requires daily/focus admission');
app.document.getElementById('daily-reverse-review-entry').fire('click');
assert.deepEqual(app.state().dailyReverseReview.round.ids,['A','B','C',d,e,f,q]);
assert.equal(app.state().dailyReverseReview.round.tasks[0].materialId,'A');
assert.deepEqual(Array.from(model().groups(app.state()),g=>g.materialId).filter((id,i,a)=>a.indexOf(id)===i),[q,f,e,d,'C','B','A']);
for (const name of ['learning-backup','learning-archive']) vm.runInContext(fs.readFileSync(path.join(__dirname,'../js/'+name+'.js'),'utf8'), app.context);
const raw = app.store.get(key), markdown=app.context.PocketLearningArchive.render(raw);
for (const title of ['A','B','C','D','E','F','快捷Q']) assert.ok(markdown.includes(' · '+title));
module.exports=(async()=>{
  const backup=await app.context.PocketLearningBackup.create();
  assert.equal((await app.context.PocketLearningBackup.verify(JSON.stringify(backup))).valid,true);
  const cloud=remote(), device=local(cloud,JSON.parse(raw)); await bind(device);
  const snapshot=await device.engine.readSnapshot('A',cloud.heads.get('A').snapshotId);
  assert.equal(snapshot.backup.rawState,raw);
  device.engine.dispose();
  console.log('PASS localhost original learning: D none, E reviews D, F reviews E→D; real metrics/history, admission, quick/history exclusion, frozen cross-day resume, archive/JSON/Firebase mock.');
})();
