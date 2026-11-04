'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const {boot,seed}=require('./helpers/pocket-learning-ui.cjs');
const key='cognivex-pocket-state',store=new Map([[key,JSON.stringify(seed(2))]]),fail={enabled:false};
let app=boot({store,fail,focusReview:true});
function open(id='m1') {
  app.document.getElementById('learned-material-details').fire('click');
  app.all().find(node=>node['aria-label']===`查看「资料${id.slice(1)}」资料详情`).fire('click');
  app.button('更改资料').fire('click');
}
open();
const storage=app.context.PocketStorage,original=app.state(),text='  第3题、7题\n解题心得 <script> 不解析题号\n\n口诀：先分类！  ';
assert.equal(app.document.getElementById('material-question-summary-panel').hidden,true);
app.button('重点题号总结').fire('click');
const input=app.document.getElementById('material-question-summary');
input.value=text;input.fire('input');
assert.equal(app.state().materials[0].questionSummary,text);
const writes=app.writes.length;
app.button('重点题号总结').fire('click');app.button('重点题号总结').fire('click');
assert.equal(input.value,text);assert.equal(app.writes.length,writes);
const cleaned=app.state();delete cleaned.materials[0].questionSummary;assert.deepEqual(cleaned,original);
assert.equal(app.state().focusReview,undefined);
const stale=storage.loadState();
let latest=storage.updateState(stale,next=>{next.materials[1].lastMaterialReviewedAt=123;});
latest=storage.updateMaterialSummary('m1',text+'新输入',text);
assert.equal(latest.materials[1].lastMaterialReviewedAt,123);
assert.throws(()=>storage.updateState(stale,next=>{next.review.generation=999;}),/其他窗口/);
assert.equal(storage.readMaterialSummary('m1'),text+'新输入');
assert.throws(()=>storage.updateMaterialSummary('m1','冲突旧文本',text),/其他窗口/);
storage.updateMaterialSummary('m2','B独立笔记','');
assert.equal(storage.readMaterialSummary('m1'),text+'新输入');assert.equal(storage.readMaterialSummary('m2'),'B独立笔记');
app=boot({store,fail,focusReview:true});open();app.button('重点题号总结').fire('click');
const resumed=app.document.getElementById('material-question-summary');assert.equal(resumed.value,text+'新输入');
fail.enabled=true;resumed.value+='未保存';resumed.fire('input');fail.enabled=false;
assert.equal(app.context.PocketStorage.readMaterialSummary('m1'),text+'新输入');
assert.ok(app.content().some(node=>node.textContent.includes('尚未保存')));
resumed.fire('input');assert.equal(app.context.PocketStorage.readMaterialSummary('m1'),resumed.value);
let state=app.context.PocketStorage.loadState(),note=state.materials[0].questionSummary;
state=app.context.PocketStorage.updateState(state,next=>app.context.PocketGrouping.regroup(next,'m1',1,JSON.stringify(next.materials[0])));
assert.equal(state.materials[0].questionSummary,note);
state=app.context.PocketStorage.updateState(state,next=>app.context.PocketGrouping.appendToMaterial(next,'m1','10-11',1));
let guard=0;
while(state.currentSession.currentStep!=='materialComplete') {
  assert.ok(++guard<40);const session=state.currentSession;
  state=app.context.PocketStorage.updateState(state,next=>app.context.PocketExecutor.transition(next,session.currentStep==='output'?'outputDone':'continue',{...session,sessionType:'learning'}));
  assert.equal(state.materials[0].questionSummary,note);
}
vm.runInContext(fs.readFileSync(path.join(__dirname,'../js/relearning.js'),'utf8'),app.context);
const relearning=app.context.PocketRelearning;
state=app.context.PocketStorage.updateState(state,next=>relearning.start(next,['m1']));
while(relearning.pending(state)) {
  const checkpoint=relearning.checkpoint(state);
  state=app.context.PocketStorage.updateState(state,next=>relearning.transition(next,'outputDone',checkpoint));
  assert.equal(state.materials[0].questionSummary,note);
}
state=app.context.PocketStorage.updateState(state,next=>app.context.PocketDailyReverse.start(next));
while(!state.dailyReverseReview.round.completedAt) {
  const active=app.context.PocketDailyReverse.task(state),round=active.round;
  state=app.context.PocketStorage.updateState(state,next=>app.context.PocketDailyReverse.transition(next,'outputDone',{
    roundId:round.id,index:round.index,materialId:active.material.id,taskIndex:round.taskIndex,currentGroupIndex:active.groupIndex}));
  assert.equal(state.materials[0].questionSummary,note);
}
(async()=>{
  app.context.TextEncoder=TextEncoder;
  for(const name of ['learning-backup','learning-archive'])vm.runInContext(fs.readFileSync(path.join(__dirname,'../js/'+name+'.js'),'utf8'),app.context);
  const backup=await app.context.PocketLearningBackup.create();assert.equal((await app.context.PocketLearningBackup.verify(JSON.stringify(backup))).valid,true);
  const restored=JSON.parse(backup.rawState);assert.equal(restored.materials[0].questionSummary,note);assert.equal(restored.materials[1].questionSummary,'B独立笔记');
  const archive=app.context.PocketLearningArchive.render(backup.rawState);assert.match(archive,/重点题号总结/);assert.ok(!archive.includes('<script>'));
  console.log('PASS independent notes, exact text, toggles/reload, latest-state merge/stale-write guards/conflicts, failure/retry, append learning/regroup, JSON and escaped archive.');
})().catch(error=>{console.error(error);process.exitCode=1;});
