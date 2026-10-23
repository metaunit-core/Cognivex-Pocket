'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const {boot,seed}=require('./helpers/pocket-learning-ui.cjs');
const {local,remote,bind}=require('./helpers/pocket-cloud-fixture.cjs');
const location=new URL('http://localhost:4173/'),key='pocket-development-v1:cognivex-pocket-state';
const clock={now:new Date(2026,9,23,10).getTime()};
let app=boot({location,clock,focusReview:true});
function exporter(target) {for(const name of ['learning-backup','learning-archive'])vm.runInContext(fs.readFileSync(path.join(__dirname,'../js/'+name+'.js'),'utf8'),target.context);return target.context.PocketLearningArchive;}
let archive=exporter(app),state=seed(3);state.materials.forEach(material=>{material.groups[0].start=1;material.groups[0].end=6;material.questionRange='1-6';});
state.materials[0].title='导数 | <原题>';state.materials[1].title='向量';
const focus=app.context.PocketFocusReview,ordinary=app.context.PocketLearningQuestionRemoval;
focus.add(state,'m1',0,'3、5、6');focus.add(state,'m2',0,'3、4');
const id=focus.create(state,'数学',5,focus.available(state,'数学').map(question=>question.id));
focus.start(state,id);while(focus.active(state))focus.transition(state,focus.active(state).run.id,'finish',{accuracy:'2/5',durationMinutes:'12'});
const members=JSON.stringify(state.focusReview.groups[0].members),oldRun=JSON.stringify(state.focusReview.groups[0].runs[0]);
focus.start(state,id);
const q3=state.focusReview.questions.find(question=>question.materialId==='m1'&&question.number===3);
focus.removeSelected(state,focus.active(state).run.id,focus.active(state).index,[q3.id]);
const removeOrdinary=(materialId,numbers)=>ordinary.remove(state,materialId,
  ordinary.entries(state.materials.find(material=>material.id===materialId)).filter(entry=>numbers.includes(entry.number)).map(entry=>entry.key),clock.now);
removeOrdinary('m1',[2,3]);
const q5=state.focusReview.questions.find(question=>question.materialId==='m1'&&question.number===5);
focus.removeSelected(state,focus.active(state).run.id,focus.active(state).index,[q5.id]);
const other3=state.focusReview.questions.find(question=>question.materialId==='m2'&&question.number===3);
focus.removeSelected(state,focus.active(state).run.id,focus.active(state).index,[other3.id]);
// Missing links alone, or entire-material deletion, are not removal evidence.
focus.add(state,'m1',0,'4');state.focusReview.questions.at(-1).groupKey='id:temporarily-missing';
focus.add(state,'m3',0,'1');app.context.PocketMaterialDeletion.remove(state,['m3']);
const material=state.materials[0],record=material.groups[0].questionRemovalHistory[0];
assert.equal(record.materialId,'m1');assert.equal(record.groupKey,'id:g1');assert.equal(record.materialTitle,'导数 | <原题>');
assert.equal(material.groups[0].questionRange,'1, 4-6');
assert.equal(JSON.stringify(state.focusReview.groups[0].members),members);assert.equal(JSON.stringify(state.focusReview.groups[0].runs[0]),oldRun);
const before=JSON.stringify(state),store=JSON.stringify([...app.store]),md=archive.render(before),title='## 三、已熟练并移除的所有题目';
const third=md.split(title)[1],second=md.split('## 二、重点复习系统学习数据')[1].split(title)[0];
assert.equal((md.match(/^## [一二三]、/gm)||[]).length,3);
assert.equal((md.match(/三、已熟练并移除的所有题目/g)||[]).length,1);
assert.doesNotMatch(md,/已熟练及已移出的重点题|已熟练、已移出及来源不可用的重点题/);
assert.match(third,/\| 学科 \| 资料名称 \| 题号 \| 移除来源 \|/);
assert.match(third,/第2题 \| 普通学习资料 \|/);
assert.match(third,/第3题 \| 普通学习资料、重点复习系统 \|/);
assert.match(third,/第5题 \| 重点复习系统 \|/);
assert.match(third,/\| 数学 \| 向量 \| 第3题 \| 重点复习系统 \|/);
assert.equal((third.match(/第3题/g)||[]).length,2,'same number in different material IDs remains distinct');
assert.equal((third.match(/普通学习资料、重点复习系统/g)||[]).length,1,'two entry records plus run evidence are one identity');
assert.doesNotMatch(third,/第1题|第4题|第6题|资料3|来源不可用/);
assert.match(second,/第6题 \| 2\/5 \| 12分钟/);assert.match(second,/\| 向量 \| 第4题 \| — \| — \|/);
assert.ok(third.includes('导数 \\| &lt;原题&gt;'));
assert.equal(JSON.stringify(state),before);assert.equal(JSON.stringify([...app.store]),store);
// No explicit removals means a real empty third section, not a table of missing sources.
const noEvidence=seed(1);focus.add(noEvidence,'m1',0,'1');noEvidence.materials=[];
assert.equal(archive.render(JSON.stringify(noEvidence)).split(title)[1],'\n\n暂无已熟练并移除的题目');
// Legacy A events need no migration; legacy B status markers need no invented event.
const legacy=JSON.parse(before);
for(const group of legacy.materials[0].groups)for(const record of group.questionRemovalHistory||[])for(const field of ['materialId','groupKey','subjectName','materialTitle'])delete record[field];
const old3=legacy.focusReview.questions.find(question=>question.id===q3.id);old3.groupKey='legacy:'+JSON.stringify([0,1,6]);old3.groupId=old3.groupKey;
const old5=legacy.focusReview.questions.find(question=>question.id===q5.id);old5.status='removed';delete old5.events;
const legacyRaw=JSON.stringify(legacy),legacyThird=archive.render(legacyRaw).split(title)[1];
assert.equal((legacyThird.match(/普通学习资料、重点复习系统/g)||[]).length,1);
assert.match(legacyThird,/第5题 \| 重点复习系统/);assert.equal(JSON.stringify(legacy),legacyRaw);
// Same title in separate materials is not a deduplication key.
const sameName=JSON.parse(before);sameName.materials[1].title=sameName.materials[0].title;
assert.equal((archive.render(JSON.stringify(sameName)).split(title)[1].match(/第3题/g)||[]).length,2);
// Current reactivated questions do not inherit an old removal listing.
const reactivated=JSON.parse(before);reactivated.focusReview.questions.find(question=>question.id===q5.id).status='active';
assert.doesNotMatch(archive.render(JSON.stringify(reactivated)).split(title)[1],/第5题/);
app.context.PocketStorage.updateState(app.context.PocketStorage.loadState(),next=>Object.assign(next,state));
app=boot({location,clock,focusReview:true,store:app.store});archive=exporter(app);
assert.equal(archive.render(app.store.get(key)).split(title)[1],third);
module.exports=(async()=>{
  const backup=await app.context.PocketLearningBackup.create();assert.equal((await app.context.PocketLearningBackup.verify(JSON.stringify(backup))).valid,true);
  const cloud=remote(),device=local(cloud,JSON.parse(backup.rawState));await bind(device);
  const snapshot=await device.engine.readSnapshot('A',cloud.heads.get('A').snapshotId);assert.equal(snapshot.backup.rawState,backup.rawState);
  const restored=local(cloud,seed(0));await restored.context.PocketCloudBackup.restoreFile(await restored.context.PocketCloudBackup.prepareFileRestore(JSON.stringify(backup)));
  const recovered=boot({location,clock,focusReview:true,store:new Map([[key,restored.store.get('cognivex-pocket-state')]])});
  assert.equal(exporter(recovered).render(recovered.store.get(key)).split(title)[1],third);
  device.engine.dispose();restored.engine.dispose();
  console.log('PASS localhost unified removal archive: real A/B operations, merged stable identities, different/same-name materials, remaining Groups/grades, missing-source exclusion, legacy records, escaped tables, read-only render, reload/JSON restore and Firebase mock.');
})();
