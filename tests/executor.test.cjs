// Run: node tests/executor.test.cjs
// Isolated DOM and localStorage: never reads or changes browser learning data.
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const sources = {};
for (const name of ['storage', 'grouping', 'scheduler', 'history', 'executor', 'material-review', 'external-links', 'app']) {
  sources[name] = fs.readFileSync(path.join(__dirname, '../js', `${name}.js`), 'utf8');
  new vm.Script(sources[name]);
}
const data = new Map();
let confirmReset = false; let resetPrompt = null; let failRemove = false; const removedKeys = []; let failSave = false; let failOnSave = 0; const snapshots = [];
class Element {
  constructor(tag) { this.tag = tag; this.children = []; this.events = {}; this.value = ''; this.textContent = ''; }
  append(...nodes) { this.children.push(...nodes); }
  replaceChildren(...nodes) { this.children = nodes; }
  setAttribute(key, value) { this[key] = value; }
  removeAttribute(key) { delete this[key]; }
  addEventListener(key, handler) { this.events[key] = handler; }
  fire(key) { this.events[key]?.({ preventDefault() {} }); }
}
const walk = node => [node, ...node.children.flatMap(walk)];
function boot() {
  const nodes = {};
  for (const id of ['message', 'learning-content', 'start-button', 'learning-heading', 'review-time', 'review-button', 'pending-count', 'review-count', 'add-review-button', 'review-materials', 'start-review-button', 'reset-data-button']) {
    nodes[id] = new Element('div');
  }
  const document = {
    getElementById: id => nodes[id] || walk(nodes['learning-content']).find(node => node.id === id),
    createElement: tag => new Element(tag)
  };
  const context = vm.createContext({ document, Intl, Date, URL, localStorage: {
    getItem: key => data.get(key) ?? null,
    removeItem(key) { if (failRemove) throw new Error('Removal blocked'); removedKeys.push(key); data.delete(key); },
    setItem(key, value) { if (failSave || (failOnSave > 0 && --failOnSave === 0)) throw new Error('Storage blocked'); data.set(key, value); snapshots.push(JSON.parse(value)); }
  } });
  context.window = context;
  context.confirm = prompt => { resetPrompt = prompt; return confirmReset; };
  for (const name of Object.keys(sources)) vm.runInContext(sources[name], context);
  return { nodes, document, context };
}
const saved = () => JSON.parse(data.get('cognivex-pocket-state'));
const text = app => walk(app.nodes['learning-content']).map(node => node.textContent).join('\n');
function fill(app, id, value) { const node = app.document.getElementById(id); node.value = value; node.fire('input'); }
function submit(app) { walk(app.nodes['learning-content']).find(node => node.tag === 'form').fire('submit'); }
function button(app, label) {
  const result = walk(app.nodes['learning-content']).find(node => node.tag === 'button' && node.textContent === label);
  assert.ok(result, `Missing button: ${label}`);
  return result;
}
function click(app, label) { const node = button(app, label); assert.ok(!node.disabled); node.fire('click'); }
function expectCheckpoint(index, step, label) {
  const app = boot();
  assert.equal(saved().currentSession.currentGroupIndex, index);
  assert.equal(saved().currentSession.currentStep, step);
  assert.ok(text(app).includes(label));
  assert.equal(app.nodes['start-button'].hidden, true);
  return app;
}
let app = boot();
app.nodes['start-button'].fire('click');
submit(app);
assert.equal(saved().currentSession.currentStep, 'basic');
fill(app, 'subject', '数学'); fill(app, 'title', '函数第一课时');
app = boot();
assert.equal(app.document.getElementById('title').value, '函数第一课时');
submit(app);
fill(app, 'question-range', '12-28'); fill(app, 'group-size', '4');
assert.equal(saved().currentSession.draft.groups.length, 5);
assert.equal(saved().currentSession.draft.groups[4].start, 28);
fill(app, 'group-size', '0'); submit(app);
assert.equal(saved().materials.length, 0);
fill(app, 'question-range', '30-1'); fill(app, 'group-size', '5');
assert.equal(saved().currentSession.draft.groups.length, 0);
fill(app, 'question-range', '1-30');
app = boot();
assert.equal(app.document.getElementById('question-range').value, '1-30');
assert.equal(saved().currentSession.draft.groups.length, 6);
submit(app);
assert.equal(saved().materials[0].groups.length, 6);
assert.equal(saved().currentSession.materialId, saved().materials[0].id);
// Four-group acceptance scenario, plus final review cycle.
data.clear(); app = boot(); app.nodes['start-button'].fire('click');
fill(app, 'subject', '数学'); fill(app, 'title', '函数'); submit(app);
fill(app, 'question-range', '1-20'); fill(app, 'group-size', '5'); submit(app);
const assignments = [[0,'new'],[1,'new'],[0,'review'],[1,'review'],[2,'new'],
  [0,'review'],[1,'review'],[2,'review'],[3,'new'],[0,'review'],[1,'review'],[2,'review'],[3,'review']];
const staleButtons = [];
const firstLearning = new Map();
for (const [index, mode] of assignments) {
  app = expectCheckpoint(index, 'video', '看本组对应的课程视频');
  assert.equal(saved().currentSession.mode, mode);
  assert.ok(text(app).includes(`${mode === 'new' ? '新学' : '复习'}｜第${index + 1}/4组`));
  const runIndex = saved().currentSession.currentRunIndex;
  assert.equal(saved().materials[0].groups[index].runs[runIndex].videoCompleted, false);
  for (const oldButton of staleButtons) oldButton.fire('click');
  assert.equal(saved().currentSession.currentStep, 'video');
  for (const [action, step, label] of [['本组视频看完','output','输出'],
      ['输出达标 → 下一步','groupComplete',`第${index + 1}组本轮完成`]]) {
    const node = button(app, action);
    const before = data.get('cognivex-pocket-state');
    failSave = true; node.fire('click'); failSave = false;
    assert.equal(data.get('cognivex-pocket-state'), before);
    assert.ok(app.nodes.message.textContent.includes('保存失败'));
    node.fire('click'); staleButtons.push(node);
    app = expectCheckpoint(index, index === 3 && mode === 'review' && step === 'groupComplete' ? 'materialComplete' : step, index === 3 && mode === 'review' && step === 'groupComplete' ? '✓ 当前资料完成' : label);
    assert.equal(saved().currentSession.mode, mode);
    assert.equal(saved().currentSession.currentRunIndex, runIndex);
  }
  const group = saved().materials[0].groups[index];
  const run = group.runs[runIndex];
  assert.ok(run.videoCompleted && run.outputCompleted && run.completedAt !== null);
  if (saved().currentSession.currentStep !== 'materialComplete') assert.ok(text(app).includes('视频 ✓') && text(app).includes('输出 ✓'));
  if (mode === 'new') firstLearning.set(index, JSON.stringify(group.runs[0]));
  else assert.equal(JSON.stringify(group.runs[0]), firstLearning.get(index));
  assert.ok(group.videoCompleted && group.outputCompleted && group.executionCompleted);
  if (saved().currentSession.currentStep === 'materialComplete') continue;
  const next = button(app, '继续');
  const beforeNext = data.get('cognivex-pocket-state');
  failSave = true; next.fire('click'); failSave = false;
  assert.equal(data.get('cognivex-pocket-state'), beforeNext);
  next.fire('click'); staleButtons.push(next);
}
app = expectCheckpoint(3, 'materialComplete', '✓ 当前资料完成');
assert.equal(saved().currentSession.schedulerState.phase, 'complete');
assert.equal(saved().materials[0].groups.reduce((sum,g)=>sum+g.runs.length,0),13);
assert.ok(button(app, '开始下一份资料')); assert.equal(saved().materials[0].status, 'completed');
// Single-group and two-group boundaries, with full restart after every action.
for (const count of [1,2,5]) {
  data.clear(); app = boot(); app.nodes['start-button'].fire('click');
  fill(app,'subject','数学'); fill(app,'title','边界'); submit(app);
  fill(app,'question-range',`1-${count*5}`); fill(app,'group-size','5'); submit(app);
  const expected = count === 1 ? [[0,'new'],[0,'review']] : [[0,'new']];
  if (count > 1) for(let n=1;n<count;n++) {
    expected.push([n,'new']); for(let r=0;r<=n;r++) expected.push([r,'review']);
  }
  for (const [index,mode] of expected) {
    app=expectCheckpoint(index,'video','看本组对应的课程视频');
    assert.equal(saved().currentSession.mode,mode);
    click(app,'本组视频看完'); app=expectCheckpoint(index,'output','输出');
    click(app,'输出达标 → 下一步');
    if (saved().currentSession.currentStep !== 'materialComplete') { app=expectCheckpoint(index,'groupComplete','本轮完成'); click(app,'继续'); }
  }
  assert.equal(saved().currentSession.currentStep,'materialComplete');
}
// Upgrade Phase 3 checkpoints without resetting group, step or first learning flags.
for (const step of ['video','output','groupComplete']) {
  const legacy={version:1,review:{lastReviewedAt:1234},materials:[{id:'legacy',subject:'数学',title:'旧资料',
    groups:[{start:1,end:5,videoCompleted:true,outputCompleted:true,executionCompleted:true},
      {start:6,end:10,videoCompleted:step!=='video',outputCompleted:step==='groupComplete',executionCompleted:step==='groupComplete'},
      {start:11,end:15}]}],currentSession:{materialId:'legacy',currentGroupIndex:1,mode:'new',currentStep:step}};
  data.clear();data.set('cognivex-pocket-state',JSON.stringify(legacy));
  app=expectCheckpoint(1,step,'6-10');
  assert.equal(saved().review.lastReviewedAt,1234);
  const first=saved().materials[0].groups[0];
  assert.ok(first.executionCompleted && first.runs[0].completedAt!==null);
  if(step==='groupComplete') { click(app,'继续');assert.equal(saved().currentSession.mode,'review');assert.equal(saved().currentSession.currentGroupIndex,0); }
  const once=data.get('cognivex-pocket-state');boot();assert.equal(data.get('cognivex-pocket-state'),once);
}
console.log('PASS: scheduler sequences (1/2/4/5 groups), every new/review checkpoint, independent runs, first-learning preservation, failed saves, stale events, final completion, drafts/grouping and Phase 3 migration.');

// Phase 5: two consecutive materials, immediate final-output completion and preserved history.
function createMaterial(subject, title, range, size) {
  fill(app,'subject',subject);fill(app,'title',title);submit(app);
  assert.equal(app.document.getElementById('question-range').value,'');
  assert.equal(app.document.getElementById('group-size').value,'');
  fill(app,'question-range',range);fill(app,'group-size',size);submit(app);
}
function finishActiveMaterial() {
  let iterations=0;
  while(saved().currentSession.currentStep!=='materialComplete') {
    assert.ok(++iterations<100);
    app=boot();
    if(saved().currentSession.currentStep==='video')click(app,'本组视频看完');
    else if(saved().currentSession.currentStep==='output')click(app,'输出达标 → 下一步');
    else click(app,'继续');
  }
  app=boot();assert.ok(text(app).includes('✓ 当前资料完成'));
}
data.clear();app=boot();app.nodes['start-button'].fire('click');
createMaterial('数学','函数资料01','1-10','5');
finishActiveMaterial();
const firstMaterial=JSON.stringify(saved().materials[0]);
assert.equal(saved().materials[0].status,'completed');
assert.ok(Number.isFinite(saved().materials[0].completedAt));
assert.equal(saved().materials[0].addedToReviewAt,null);
assert.equal(saved().materials[0].totalGroups,2);
assert.equal(app.nodes['pending-count'].textContent,'今日新增：1条');
const completionTimestamp=saved().materials[0].completedAt;
app=boot();assert.equal(saved().materials[0].completedAt,completionTimestamp);
// Starting a new draft fails atomically, then succeeds and cannot be repeated by an old button.
const nextMaterialButton=button(app,'开始下一份资料');
const beforeStart=data.get('cognivex-pocket-state');
failSave=true;nextMaterialButton.fire('click');failSave=false;
assert.equal(data.get('cognivex-pocket-state'),beforeStart);
assert.ok(button(app,'开始下一份资料'));
nextMaterialButton.fire('click');
const secondId=saved().currentSession.materialId;
assert.notEqual(secondId,saved().materials[0].id);
assert.equal(saved().currentSession.currentStep,'basic');
assert.deepEqual(saved().currentSession.draft,{subject:'',title:'',questionRange:'',groupSize:'',groups:[]});
nextMaterialButton.fire('click');assert.equal(saved().currentSession.materialId,secondId);
fill(app,'subject','数学');fill(app,'title','函数资料02');app=boot();
assert.equal(app.document.getElementById('title').value,'函数资料02');
assert.equal(JSON.stringify(saved().materials[0]),firstMaterial);
submit(app);assert.equal(app.document.getElementById('question-range').value,'');
fill(app,'question-range','12-28');fill(app,'group-size','4');submit(app);
click(app,'本组视频看完');click(app,'输出达标 → 下一步');click(app,'继续');
click(app,'本组视频看完');app=expectCheckpoint(1,'output','16-19');
assert.equal(saved().currentSession.materialId,secondId);
assert.equal(JSON.stringify(saved().materials[0]),firstMaterial);
assert.equal(saved().materials[1].status,'learning');
// Reach final review OUTPUT. It must not be completed just because all new runs are done.
while(!(saved().currentSession.mode==='review' && saved().currentSession.currentGroupIndex===4 &&
    saved().currentSession.currentStep==='output')) {
  if(saved().currentSession.currentStep==='video')click(app,'本组视频看完');
  else if(saved().currentSession.currentStep==='output')click(app,'输出达标 → 下一步');
  else click(app,'继续');
}
assert.equal(saved().materials[1].status,'learning');
assert.equal(app.context.PocketHistory.completeCurrentMaterial(app.context.PocketStorage.loadState()),false);
const beforeFinal=data.get('cognivex-pocket-state');
failSave=true;click(app,'输出达标 → 下一步');failSave=false;
assert.equal(data.get('cognivex-pocket-state'),beforeFinal);
assert.equal(saved().currentSession.currentStep,'output');
click(app,'输出达标 → 下一步');
// No Continue or Save click is required here.
app=boot();assert.equal(saved().currentSession.currentStep,'materialComplete');
assert.ok(text(app).includes('已自动保存为学习历史'));
assert.equal(app.nodes['pending-count'].textContent,'今日新增：2条');
assert.equal(saved().materials.length,2);
assert.equal(JSON.stringify(saved().materials[0]),firstMaterial);
assert.equal(saved().materials[1].status,'completed');
assert.equal(saved().materials[1].questionRange,'12-28');
assert.equal(saved().materials[1].groupSize,4);
assert.equal(saved().materials[1].totalGroups,5);
assert.ok(saved().materials.every(material=>material.groups.every(group=>group.runs.every(run=>
  run.videoCompleted && run.outputCompleted && Number.isFinite(run.completedAt)))));
// Fourth-stage completion upgrades in place, preserving runs and the active material.
const stage4=saved();const originalRuns=JSON.stringify(stage4.materials[1].groups);
for(const material of stage4.materials) {
  delete material.status;delete material.completedAt;delete material.addedToReviewAt;delete material.totalGroups;
}
stage4.materials.splice(0,1);
data.clear();data.set('cognivex-pocket-state',JSON.stringify(stage4));
app=boot();assert.equal(saved().materials[0].status,'completed');
assert.equal(JSON.stringify(saved().materials[0].groups),originalRuns);
assert.equal(saved().currentSession.materialId,secondId);
assert.equal(app.nodes['pending-count'].textContent,'今日新增：1条');
const upgraded=data.get('cognivex-pocket-state');boot();assert.equal(data.get('cognivex-pocket-state'),upgraded);
// A saved final groupComplete from Phase 4 also completes automatically on startup.
const finalGroup=saved();finalGroup.currentSession.currentStep='groupComplete';
finalGroup.currentSession.schedulerState.phase='review';
finalGroup.materials[0].status='learning';finalGroup.materials[0].completedAt=null;
data.set('cognivex-pocket-state',JSON.stringify(finalGroup));app=boot();
assert.equal(saved().currentSession.currentStep,'materialComplete');
// V1 pending count includes unfinished review admission from earlier days, not a UTC day filter.
const pending=saved();pending.materials[0].completedAt=new Date(2026,9,7,23,59).getTime();
assert.equal(app.context.PocketHistory.getPendingCount(pending),1);
pending.materials[0].addedToReviewAt=Date.now();assert.equal(app.context.PocketHistory.getPendingCount(pending),0);
console.log('PASS: automatic final-output completion, two consecutive histories, second material OUTPUT recovery, blank next draft, failed saves, stable timestamps, Phase 4 upgrade and pending-count semantics.');

// Phase 6: global review admission, completed history and active review OUTPUT isolation.
data.clear();app=boot();
assert.equal(app.nodes['review-count'].textContent,'已进入复习：0条');
assert.equal(app.nodes['add-review-button'].disabled,true);
assert.equal(app.nodes['add-review-button'].textContent,'今日暂无新增资料');
app.nodes['start-button'].fire('click');
createMaterial('数学','函数资料01','1-10','5');finishActiveMaterial();
click(app,'开始下一份资料');createMaterial('数学','函数资料02','1-10','5');finishActiveMaterial();
assert.equal(app.nodes['pending-count'].textContent,'今日新增：2条');
assert.equal(app.nodes['review-count'].textContent,'已进入复习：0条');
assert.equal(app.nodes['add-review-button'].textContent,'将今日新增 2 条加入复习');
const pendingTitles=walk(app.nodes['review-materials']).filter(node=>node.tag==='li').map(node=>node.textContent);
assert.deepEqual(pendingTitles,['数学 · 函数资料01','数学 · 函数资料02']);
// Keep yesterday's unadmitted completion pending today.
const carried=saved();carried.materials[0].completedAt=new Date(2026,9,7,23,59).getTime();
data.set('cognivex-pocket-state',JSON.stringify(carried));app=boot();
assert.equal(app.nodes['pending-count'].textContent,'今日新增：2条');
click(app,'开始下一份资料');
// Global refresh does not rebuild or clear a draft's input elements.
fill(app,'subject','物理');fill(app,'title','曲线运动01');
const inputBefore=app.document.getElementById('title');
const draftSession=JSON.stringify(saved().currentSession);
app.nodes['review-button'].fire('click');
assert.equal(JSON.stringify(saved().currentSession),draftSession);
assert.equal(app.document.getElementById('title'),inputBefore);
assert.ok(Number.isFinite(saved().review.lastReviewedAt));
submit(app);fill(app,'question-range','1-10');fill(app,'group-size','5');submit(app);
// Complete new1, new2, review1, then stop at review2 OUTPUT.
for(let assignment=0;assignment<3;assignment++) {
  click(app,'本组视频看完');click(app,'输出达标 → 下一步');click(app,'继续');
}
click(app,'本组视频看完');
assert.equal(saved().currentSession.currentStep,'output');
assert.equal(saved().currentSession.mode,'review');
assert.equal(saved().currentSession.currentGroupIndex,1);
const beforeAdmission=saved();const learningNodes=app.nodes['learning-content'].children.slice();
// Failed batch save cannot partially move completed materials or advance the active run.
failSave=true;app.nodes['add-review-button'].fire('click');failSave=false;
assert.deepEqual(saved(),beforeAdmission);
assert.equal(app.nodes['pending-count'].textContent,'今日新增：2条');
assert.equal(app.nodes['review-count'].textContent,'已进入复习：0条');
app.nodes['add-review-button'].fire('click');
const admitted=saved();
assert.deepEqual(admitted.currentSession,beforeAdmission.currentSession);
assert.deepEqual(admitted.review,beforeAdmission.review);
assert.equal(admitted.materials.length,3);
assert.equal(admitted.materials[0].addedToReviewAt,admitted.materials[1].addedToReviewAt);
assert.ok(Number.isFinite(admitted.materials[0].addedToReviewAt));
assert.equal(admitted.materials[2].addedToReviewAt,null);
for(let index=0;index<3;index++) {
  const expectedMaterial={...beforeAdmission.materials[index],addedToReviewAt:index<2?admitted.materials[index].addedToReviewAt:null};
  assert.deepEqual(admitted.materials[index],expectedMaterial);
}
assert.equal(app.nodes['pending-count'].textContent,'今日新增：0条');
assert.equal(app.nodes['review-count'].textContent,'已进入复习：2条');
assert.equal(app.nodes['add-review-button'].disabled,true);
assert.equal(app.nodes['add-review-button'].textContent,'今日暂无新增资料');
assert.deepEqual(app.nodes['learning-content'].children,learningNodes);
const idempotent=data.get('cognivex-pocket-state');app.nodes['add-review-button'].fire('click');
assert.equal(data.get('cognivex-pocket-state'),idempotent);
// Global review timestamp has the same atomic save guarantee.
failSave=true;app.nodes['review-button'].fire('click');failSave=false;
assert.equal(data.get('cognivex-pocket-state'),idempotent);
app.nodes['review-button'].fire('click');
const lastReview=saved().review.lastReviewedAt;
assert.deepEqual(saved().currentSession,beforeAdmission.currentSession);
assert.deepEqual(saved().materials,admitted.materials);
app=expectCheckpoint(1,'output','复习｜第2/2组');
assert.equal(saved().review.lastReviewedAt,lastReview);
assert.equal(app.nodes['review-count'].textContent,'已进入复习：2条');
assert.equal(app.nodes['pending-count'].textContent,'今日新增：0条');
assert.deepEqual(walk(app.nodes['review-materials']).filter(node=>node.tag==='li').map(node=>node.textContent),
  ['数学 · 函数资料01','数学 · 函数资料02']);
assert.ok(!walk(app.nodes['review-materials']).some(node=>node.tag==='button'||node.tag==='a'));
finishActiveMaterial();
assert.equal(app.nodes['pending-count'].textContent,'今日新增：1条');
assert.equal(app.nodes['review-count'].textContent,'已进入复习：2条');
assert.equal(app.nodes['add-review-button'].textContent,'将今日新增 1 条加入复习');
const thirdSession=JSON.stringify(saved().currentSession);
app.nodes['add-review-button'].fire('click');
assert.equal(JSON.stringify(saved().currentSession),thirdSession);
assert.equal(saved().materials[0].addedToReviewAt,admitted.materials[0].addedToReviewAt);
assert.equal(saved().materials[1].addedToReviewAt,admitted.materials[1].addedToReviewAt);
app=boot();assert.equal(app.nodes['review-count'].textContent,'已进入复习：3条');
assert.equal(app.nodes['pending-count'].textContent,'今日新增：0条');
assert.equal(saved().review.lastReviewedAt,lastReview);
assert.deepEqual(walk(app.nodes['review-materials']).filter(node=>node.tag==='li').map(node=>node.textContent),
  ['数学 · 函数资料01','数学 · 函数资料02','物理 · 曲线运动01']);
assert.equal(Object.hasOwn(saved(),'reviewMaterials'),false);
console.log('PASS: batch admission 2 then 1, summary lists, midnight carryover, no material copies, active review2 OUTPUT/draft isolation, timestamp recovery, atomic save failures and idempotent admission.');

// Phase 7: whole-material review reuses the executor and never replaces the main checkpoint.
data.clear();app=boot();
assert.equal(app.nodes['start-review-button'].disabled,true);
assert.equal(app.nodes['start-review-button'].textContent,'暂无已学资料需要复习');
app.nodes['start-button'].fire('click');createMaterial('数学','函数资料01','1-20','5');finishActiveMaterial();
click(app,'开始下一份资料');createMaterial('数学','函数资料02','12-28','4');finishActiveMaterial();
app.nodes['add-review-button'].fire('click');
click(app,'开始下一份资料');createMaterial('物理','动量资料01','1-20','5');
// New1, new2, internal review1, internal review2 -> new3 VIDEO.
for(let iteration=0;iteration<4;iteration++) {
  click(app,'本组视频看完');click(app,'输出达标 → 下一步');click(app,'继续');
}
assert.equal(saved().currentSession.currentGroupIndex,2);
assert.equal(saved().currentSession.mode,'new');
assert.equal(saved().currentSession.currentStep,'video');
const mainCheckpoint=JSON.stringify(saved().currentSession);
const mainMaterial=JSON.stringify(saved().materials[2]);
const oldMaterials=saved().materials.slice(0,2);
const manualReviewTime=saved().review.lastReviewedAt;
const mainVideoButton=button(app,'本组视频看完');
const beforeOpen=data.get('cognivex-pocket-state');
failSave=true;app.nodes['start-review-button'].fire('click');failSave=false;
assert.equal(data.get('cognivex-pocket-state'),beforeOpen);
app.nodes['start-review-button'].fire('click');mainVideoButton.fire('click');app=boot();
assert.equal(saved().activeSessionType,'review-selection');
assert.equal(app.nodes['learning-heading'].textContent,'选择要复习的资料');
assert.equal(JSON.stringify(saved().currentSession),mainCheckpoint);
assert.equal(walk(app.nodes['learning-content']).filter(node=>node.type==='checkbox').length,2);
function chooseReview(title) {
  const choices=walk(app.nodes['learning-content']).filter(node=>node.type==='checkbox').map(node=>node['aria-label']);
  for(const name of choices) {
    const node=walk(app.nodes['learning-content']).find(entry=>entry['aria-label']===name);
    const checked=name===`选择 ${title}`;
    if(node.checked!==checked){node.checked=checked;node.fire('change');}
  }
  return button(app,'开始本轮复习（1条）');
}
const choose=chooseReview('数学 · 函数资料01');
const beforeChoice=data.get('cognivex-pocket-state');
failSave=true;choose.fire('click');failSave=false;
assert.equal(data.get('cognivex-pocket-state'),beforeChoice);
choose.fire('click');choose.fire('click');
assert.equal(saved().activeSessionType,'material-review');
assert.equal(saved().materialReviewSession.materialId,oldMaterials[0].id);
assert.equal(saved().materials[0].groups[0].runs.length,oldMaterials[0].groups[0].runs.length+1);
// A stale button from the hidden main learning page must not mutate the main run.
assert.equal(JSON.stringify(saved().currentSession),mainCheckpoint);
const staleReviewButtons=[];
for(let index=0;index<4;index++) {
  app=boot();
  assert.equal(app.nodes['learning-heading'].textContent,'整条资料复习');
  assert.equal(saved().materialReviewSession.currentGroupIndex,index);
  assert.equal(saved().materialReviewSession.currentStep,'video');
  assert.ok(text(app).includes(`${index*5+1}-${index*5+5}`));
  // Old page elements are discarded by a real reload; duplicate events are tested before boot below.
  assert.equal(saved().materialReviewSession.currentStep,'video');
  assert.equal(saved().materialReviewSession.currentGroupIndex,index);
  const video=button(app,'本组视频看完');
  const beforeVideo=data.get('cognivex-pocket-state');
  failSave=true;video.fire('click');failSave=false;
  assert.equal(data.get('cognivex-pocket-state'),beforeVideo);
  video.fire('click');video.fire('click');staleReviewButtons.push(video);
  app=boot();
  assert.equal(saved().materialReviewSession.currentGroupIndex,index);
  assert.equal(saved().materialReviewSession.currentStep,'output');
  assert.ok(button(app,'输出达标 → 下一组'));
  // Global controls preserve both sessions, even at third-group OUTPUT.
  const currentReview=JSON.stringify(saved().materialReviewSession);
  app.nodes['add-review-button'].fire('click');app.nodes['review-button'].fire('click');
  assert.equal(JSON.stringify(saved().materialReviewSession),currentReview);
  assert.equal(JSON.stringify(saved().currentSession),mainCheckpoint);
  const output=button(app,'输出达标 → 下一组');
  const beforeOutput=data.get('cognivex-pocket-state');
  failSave=true;output.fire('click');failSave=false;
  assert.equal(data.get('cognivex-pocket-state'),beforeOutput);
  const globalTime=saved().review.lastReviewedAt;
  output.fire('click');output.fire('click');staleReviewButtons.push(output);
  assert.equal(saved().review.lastReviewedAt,globalTime);
  assert.equal(JSON.stringify(saved().currentSession),mainCheckpoint);
  assert.equal(JSON.stringify(saved().materials[2]),mainMaterial);
}
app=boot();assert.equal(saved().materialReviewSession.currentStep,'queueComplete');
assert.ok(text(app).includes('✓ 本轮复习全部完成'));
assert.ok(Number.isFinite(saved().materials[0].lastMaterialReviewedAt));
assert.equal(saved().materials[0].materialReviewHistory.length,1);
const reviewedMaterial=saved().materials[0];
assert.equal(reviewedMaterial.completedAt,oldMaterials[0].completedAt);
assert.equal(reviewedMaterial.addedToReviewAt,oldMaterials[0].addedToReviewAt);
assert.equal(JSON.stringify(saved().materials[1]),JSON.stringify(oldMaterials[1]));
for(let index=0;index<4;index++) {
  const original=oldMaterials[0].groups[index];const actual=reviewedMaterial.groups[index];
  assert.deepEqual(actual.runs.slice(0,original.runs.length),original.runs);
  assert.equal(actual.runs.length,original.runs.length+1);
  assert.equal(actual.firstLearningCompletedAt,original.firstLearningCompletedAt);
  assert.equal(actual.videoCompleted,original.videoCompleted);
  assert.equal(actual.outputCompleted,original.outputCompleted);
  assert.equal(actual.runs.at(-1).mode,'material-review');
  assert.ok(actual.runs.at(-1).videoCompleted && actual.runs.at(-1).outputCompleted);
}
const reviewCompletion=saved().materials[0].lastMaterialReviewedAt;
const returnButton=button(app,'返回当前学习');
const beforeReturn=data.get('cognivex-pocket-state');
failSave=true;returnButton.fire('click');failSave=false;
assert.equal(data.get('cognivex-pocket-state'),beforeReturn);
// Updating the top review time must not invalidate the completion page's return button.
app.nodes['review-button'].fire('click');returnButton.fire('click');
app=expectCheckpoint(2,'video','新学｜第3/4组');
assert.equal(JSON.stringify(saved().currentSession),mainCheckpoint);
assert.equal(saved().activeSessionType,'learning');
assert.equal(saved().materials[0].lastMaterialReviewedAt,reviewCompletion);
assert.equal(JSON.stringify(saved().currentSession),mainCheckpoint);
// With no main session, review can still execute and return to the normal empty homepage.
const noMain=saved();noMain.currentSession=null;data.set('cognivex-pocket-state',JSON.stringify(noMain));app=boot();
app.nodes['start-review-button'].fire('click');chooseReview('数学 · 函数资料02').fire('click');
for(let index=0;index<5;index++) {
  app=boot();assert.equal(saved().materialReviewSession.currentGroupIndex,index);
  click(app,'本组视频看完');app=boot();assert.equal(saved().materialReviewSession.currentStep,'output');
  click(app,'输出达标 → 下一组');
}
app=boot();click(app,'返回当前学习');app=boot();
assert.equal(saved().currentSession,null);assert.equal(app.nodes['start-button'].hidden,false);
assert.ok(text(app).includes('目前没有进行中的学习'));
assert.equal(saved().materials.length,3);
console.log('PASS: independent sessions, original group-order review, every review VIDEO/OUTPUT restart, group3 OUTPUT recovery, append-only runs, automatic review completion, manual global timestamp isolation, failed saves, stale events and precise main-learning return/no-main return.');



// Review Queue: A -> B -> C, durable per-material completion BEFORE automatic advancement.
data.clear();app=boot();app.nodes['start-button'].fire('click');
createMaterial('数学','队列A','1-10','5');finishActiveMaterial();
click(app,'开始下一份资料');createMaterial('数学','队列B','12-28','4');finishActiveMaterial();
click(app,'开始下一份资料');createMaterial('物理','队列C','1-5','5');finishActiveMaterial();
app.nodes['add-review-button'].fire('click');
const queueOriginal=saved().materials.slice();
click(app,'开始下一份资料');createMaterial('物理','动量主学习','1-20','5');
for(let index=0;index<4;index++){click(app,'本组视频看完');click(app,'输出达标 → 下一步');click(app,'继续');}
click(app,'本组视频看完');
const queueMain=JSON.stringify(saved().currentSession);
assert.equal(saved().currentSession.currentStep,'output');
const queueManualTime=saved().review.lastReviewedAt;
app.nodes['start-review-button'].fire('click');
// Selection is stored and survives refresh; empty selection cannot start a queue.
for(const name of walk(app.nodes['learning-content']).filter(n=>n.type==='checkbox').map(n=>n['aria-label'])) {
  const choice=walk(app.nodes['learning-content']).find(n=>n['aria-label']===name);
  choice.checked=false;choice.fire('change');
}
assert.equal(button(app,'开始本轮复习（0条）').disabled,true);
app=boot();assert.equal(saved().reviewSelectionIds.length,0);
for(const name of walk(app.nodes['learning-content']).filter(n=>n.type==='checkbox').map(n=>n['aria-label'])) {
  const choice=walk(app.nodes['learning-content']).find(n=>n['aria-label']===name);
  choice.checked=true;choice.fire('change');
}
app=boot();assert.equal(button(app,'开始本轮复习（3条）').disabled,false);
click(app,'开始本轮复习（3条）');
assert.deepEqual(saved().materialReviewSession.materialIds,queueOriginal.map(item=>item.id));
assert.equal(saved().materialReviewSession.currentMaterialIndex,0);
assert.equal(Object.hasOwn(saved().materialReviewSession,'groups'),false);
assert.equal(JSON.stringify(saved().currentSession),queueMain);
click(app,'本组视频看完');click(app,'输出达标 → 下一组');
click(app,'本组视频看完');
// A's last OUTPUT succeeds, second write fails: A's history is durable, B has not started.
const writesBeforeA=snapshots.length;
failOnSave=2;click(app,'输出达标 → 下一组');
assert.equal(snapshots.length,writesBeforeA+1);
assert.equal(saved().materialReviewSession.currentStep,'materialCompletePending');
assert.equal(saved().materialReviewSession.currentMaterialIndex,0);
assert.equal(saved().materials[0].materialReviewHistory.length,1);
assert.equal(saved().materials[1].groups[0].runs.length,queueOriginal[1].groups[0].runs.length);
assert.ok(button(app,'重试保存'));
const aHistory=JSON.stringify(saved().materials[0]);
// Reopening automatically makes the SECOND snapshot and enters B, without replaying A.
app=boot();assert.equal(saved().materialReviewSession.currentMaterialIndex,1);
assert.equal(saved().materialReviewSession.materialId,queueOriginal[1].id);
assert.equal(saved().materialReviewSession.currentGroupIndex,0);
assert.equal(saved().materialReviewSession.currentStep,'video');
assert.equal(JSON.stringify(saved().materials[0]),aHistory);
assert.ok(!walk(app.nodes['learning-content']).some(n=>n.textContent==='返回当前学习'));
for(let index=0;index<2;index++){click(app,'本组视频看完');click(app,'输出达标 → 下一组');}
click(app,'本组视频看完');app=boot();
assert.equal(saved().materialReviewSession.currentMaterialIndex,1);
assert.equal(saved().materialReviewSession.currentGroupIndex,2);
assert.equal(saved().materialReviewSession.currentStep,'output');
assert.ok(text(app).includes('队列B'));
assert.ok(text(app).includes('20-23'));
assert.equal(saved().materialReviewSession.completedMaterials.length,1);
assert.equal(JSON.stringify(saved().currentSession),queueMain);
// Old single-material review checkpoints migrate as a one-item queue without restarting a run.
const beforeLegacy=saved();const legacyReview=JSON.parse(JSON.stringify(beforeLegacy));
delete legacyReview.materialReviewSession.materialIds;delete legacyReview.materialReviewSession.currentMaterialIndex;
delete legacyReview.materialReviewSession.completedMaterials;delete legacyReview.materialReviewSession.materialStartedAt;
data.set('cognivex-pocket-state',JSON.stringify(legacyReview));app=boot();
assert.deepEqual(saved().materialReviewSession.materialIds,[queueOriginal[1].id]);
assert.equal(saved().materialReviewSession.currentStep,'output');
assert.equal(saved().materialReviewSession.currentGroupIndex,2);
assert.deepEqual(saved().materials,beforeLegacy.materials);
data.set('cognivex-pocket-state',JSON.stringify(beforeLegacy));app=boot();
click(app,'输出达标 → 下一组');
click(app,'本组视频看完');click(app,'输出达标 → 下一组');
click(app,'本组视频看完');
const writesBeforeB=snapshots.length;
click(app,'输出达标 → 下一组');
assert.equal(snapshots.length,writesBeforeB+2);
const firstB=snapshots[writesBeforeB];const secondB=snapshots[writesBeforeB+1];
assert.equal(firstB.materialReviewSession.currentStep,'materialCompletePending');
assert.equal(firstB.materialReviewSession.currentMaterialIndex,1);
assert.equal(firstB.materials[1].materialReviewHistory.length,1);
assert.equal(firstB.materials[2].groups[0].runs.length,queueOriginal[2].groups[0].runs.length);
assert.equal(secondB.materialReviewSession.currentMaterialIndex,2);
assert.equal(secondB.materialReviewSession.currentStep,'video');
assert.equal(secondB.materialReviewSession.currentGroupIndex,0);
assert.equal(secondB.materialReviewSession.materialId,queueOriginal[2].id);
assert.ok(text(app).includes('队列C'));
assert.ok(!walk(app.nodes['learning-content']).some(n=>n.textContent==='返回当前学习'));
click(app,'本组视频看完');
// Final history is saved first too; retry only finalizes the queue, never appends history twice.
failOnSave=2;click(app,'输出达标 → 下一组');
assert.equal(saved().materialReviewSession.currentStep,'materialCompletePending');
assert.equal(saved().materialReviewSession.completedMaterials.length,3);
assert.equal(saved().materials[2].materialReviewHistory.length,1);
click(app,'重试保存');app=boot();
assert.equal(saved().materialReviewSession.currentStep,'queueComplete');
assert.ok(text(app).includes('✓ 本轮复习全部完成'));
assert.ok(text(app).includes('已复习：3条资料'));
for(const item of queueOriginal)assert.ok(text(app).includes(`✓ ${item.subject} · ${item.title}`));
assert.equal(saved().review.lastReviewedAt,queueManualTime);
assert.equal(JSON.stringify(saved().currentSession),queueMain);
for(let index=0;index<3;index++) {
  const material=saved().materials[index];const original=queueOriginal[index];
  assert.equal(material.completedAt,original.completedAt);
  assert.equal(material.addedToReviewAt,original.addedToReviewAt);
  assert.equal(material.materialReviewHistory.length,1);
  for(let groupIndex=0;groupIndex<original.groups.length;groupIndex++) {
    const runs=material.groups[groupIndex].runs;const oldRuns=original.groups[groupIndex].runs;
    assert.deepEqual(runs.slice(0,oldRuns.length),oldRuns);assert.equal(runs.length,oldRuns.length+1);
  }
}
click(app,'返回当前学习');app=boot();
assert.equal(saved().materialReviewSession,null);
assert.equal(JSON.stringify(saved().currentSession),queueMain);
assert.ok(text(app).includes('动量主学习'));
assert.ok(text(app).includes('新学｜第3/4组'));
assert.ok(button(app,'输出达标 → 下一步'));
console.log('PASS: persisted selection/queue, automatic A-B-C handoff, ordered two-write completion, second-write failure and restart/retry recovery, B group3 OUTPUT, no repeated completed materials, singleton migration, queue summary and original main OUTPUT return.');

// Group video URLs belong to groups, shared by new/internal review/material review.
data.clear();app=boot();app.nodes['start-button'].fire('click');
createMaterial('数学','视频链接测试','1-10','5');
function videoLink(app) { return walk(app.nodes['learning-content']).find(node=>node.tag==='a' && node.textContent==='打开本组视频'); }
function saveVideo(value) {
  const input=app.document.getElementById('group-video-url');assert.ok(input);
  input.value=value;
  const form=walk(app.nodes['learning-content']).find(node=>node.tag==='form' && walk(node).includes(input));
  assert.ok(form);form.fire('submit');
}
const noLinkCheckpoint=JSON.stringify(saved().currentSession);
const beforeInvalid=data.get('cognivex-pocket-state');
for(const invalid of ['javascript:alert(1)', 'data:text/html,<script>alert(1)</script>', 'vbscript:x']) {
  saveVideo(invalid);assert.equal(data.get('cognivex-pocket-state'),beforeInvalid);
  assert.equal(videoLink(app),undefined);
}
const beforeSave=saved();
failSave=true;saveVideo('https://pan.baidu.com/s/lesson-one');failSave=false;
assert.deepEqual(saved(),beforeSave);assert.ok(app.document.getElementById('group-video-url'));
saveVideo('  https://pan.baidu.com/s/lesson-one  ');
const storedLink='https://pan.baidu.com/s/lesson-one';
const expectedAfterSave=JSON.parse(JSON.stringify(beforeSave));expectedAfterSave.materials[0].groups[0].videoUrl=storedLink;
assert.deepEqual(saved(),expectedAfterSave);
assert.equal(JSON.stringify(saved().currentSession),noLinkCheckpoint);
app=boot();assert.equal(videoLink(app).href,storedLink);
assert.equal(videoLink(app).target,'_blank');assert.equal(videoLink(app).rel,'noopener noreferrer');
assert.equal(Object.keys(videoLink(app).events).length,0);
const beforeVideoOpen=data.get('cognivex-pocket-state');videoLink(app).fire('click');
assert.equal(data.get('cognivex-pocket-state'),beforeVideoOpen);
assert.equal(saved().currentSession.currentStep,'video');
assert.equal(saved().materials[0].groups[0].runs[0].videoCompleted,false);
click(app,'修改链接');assert.equal(app.document.getElementById('group-video-url').value,storedLink);
const beforeEdit=saved();saveVideo('http://example.com/course?group=1');
const expectedEdit=JSON.parse(JSON.stringify(beforeEdit));expectedEdit.materials[0].groups[0].videoUrl='http://example.com/course?group=1';
assert.deepEqual(saved(),expectedEdit);
click(app,'本组视频看完');assert.equal(saved().currentSession.currentStep,'output');
click(app,'输出达标 → 下一步');click(app,'继续');
// Group 2 has no link; it must still complete VIDEO and OUTPUT normally.
assert.equal(videoLink(app),undefined);click(app,'本组视频看完');click(app,'输出达标 → 下一步');click(app,'继续');
assert.equal(saved().currentSession.mode,'review');assert.equal(saved().currentSession.currentGroupIndex,0);
app=boot();assert.equal(videoLink(app).href,'http://example.com/course?group=1');
assert.equal(saved().materials[0].groups[0].runs.at(-1).videoCompleted,false);
finishActiveMaterial();app.nodes['add-review-button'].fire('click');
app.nodes['start-review-button'].fire('click');click(app,'开始本轮复习（1条）');app=boot();
assert.equal(saved().materialReviewSession.currentStep,'video');
assert.equal(videoLink(app).href,'http://example.com/course?group=1');
const beforeGlobalEdit=saved();
click(app,'修改链接');assert.equal(app.document.getElementById('group-video-url').value,'http://example.com/course?group=1');
saveVideo('https://example.com/new-video');
const expectedGlobalEdit=JSON.parse(JSON.stringify(beforeGlobalEdit));expectedGlobalEdit.materials[0].groups[0].videoUrl='https://example.com/new-video';
assert.deepEqual(saved(),expectedGlobalEdit);
assert.ok(saved().materials[0].groups.every(group=>group.runs.every(run=>!Object.hasOwn(run,'videoUrl'))));
const oldGlobalEdit=button(app,'修改链接');
app.nodes['review-button'].fire('click');oldGlobalEdit.fire('click');
assert.equal(app.document.getElementById('group-video-url').value,'https://example.com/new-video');
app=boot();assert.equal(videoLink(app).href,'https://example.com/new-video');
const beforeGlobalOpen=data.get('cognivex-pocket-state');videoLink(app).fire('click');
assert.equal(data.get('cognivex-pocket-state'),beforeGlobalOpen);
click(app,'本组视频看完');assert.equal(saved().materialReviewSession.currentStep,'output');
assert.equal(saved().materials[0].groups[0].runs.at(-1).videoCompleted,true);
// Defensive rendering: unsafe URLs in manually modified storage never become anchors.
const tampered=saved();tampered.materialReviewSession.currentStep='video';
tampered.materials[0].groups[0].videoUrl='javascript:alert(1)';
data.set('cognivex-pocket-state',JSON.stringify(tampered));app=boot();
assert.equal(videoLink(app),undefined);assert.ok(app.document.getElementById('group-video-url'));
console.log('PASS: optional video URLs, HTTP/HTTPS validation, unsafe saved URL protection, group-only edits, atomic save failures, refresh restoration, shared new/review/material-review link and open-link versus video-completion isolation.');


// Shared URI handling and optional OUTPUT group links.
data.clear();app=boot();app.nodes['start-button'].fire('click');createMaterial('数学','输出入口','1-10','5');
const normalize=app.context.PocketExternalLinks.normalizeUri;
for(const value of ['https://Example.com:443/a%2fb?x=1','http://example.com','someapp://notes/123',
  'unknown-app+v2:open?id=3','mailto:test@example.com']) assert.equal(normalize(`  ${value}  `),value);
assert.equal(normalize('   '),'');
for(const value of ['JaVaScRiPt:alert(1)','data:text/html,x','vbscript:x','java\nscript:alert(1)',
  'JAVASCRIPT:alert(1)', '\u0000javascript:x']) assert.equal(app.context.PocketExternalLinks.canNavigate(value),false);
saveVideo('  someapp://video/1  ');assert.equal(saved().materials[0].groups[0].videoUrl,'someapp://video/1');
app=boot();assert.equal(videoLink(app).href,'someapp://video/1');
click(app,'本组视频看完');
function outputLink(app) {return walk(app.nodes['learning-content']).find(node=>node.tag==='a' && node.textContent==='打开本组输出');}
function saveOutput(value) {
  const input=app.document.getElementById('group-output-url');assert.ok(input);input.value=value;
  const form=walk(app.nodes['learning-content']).find(node=>node.tag==='form' && walk(node).includes(input));
  form.fire('submit');
}
assert.ok(app.document.getElementById('group-output-url'));
const beforeOutputUri=saved();
for(const value of ['javascript:alert(1)','data:text/html,x','vbscript:x']) {
  saveOutput(value);assert.deepEqual(saved(),beforeOutputUri);assert.equal(outputLink(app),undefined);
}
failSave=true;saveOutput('notesapp://group/1');failSave=false;assert.deepEqual(saved(),beforeOutputUri);
saveOutput('  notesapp://group/1  ');
const expectedOutputUri=JSON.parse(JSON.stringify(beforeOutputUri));expectedOutputUri.materials[0].groups[0].outputUrl='notesapp://group/1';
assert.deepEqual(saved(),expectedOutputUri);
app=boot();assert.equal(outputLink(app).href,'notesapp://group/1');
assert.equal(outputLink(app).target,'_blank');assert.equal(outputLink(app).rel,'noopener noreferrer');
const beforeOutputNavigation=data.get('cognivex-pocket-state');outputLink(app).fire('click');
assert.equal(data.get('cognivex-pocket-state'),beforeOutputNavigation);
assert.equal(saved().currentSession.currentStep,'output');assert.equal(saved().materials[0].groups[0].runs[0].outputCompleted,false);
click(app,'修改链接');assert.equal(app.document.getElementById('group-output-url').value,'notesapp://group/1');
saveOutput('   ');assert.equal(Object.hasOwn(saved().materials[0].groups[0],'outputUrl'),false);
assert.equal(saved().currentSession.currentStep,'output');
saveOutput('https://Example.com:443/a%2fb?note=1');
assert.equal(saved().materials[0].groups[0].outputUrl,'https://Example.com:443/a%2fb?note=1');
click(app,'输出达标 → 下一步');click(app,'继续');click(app,'本组视频看完');
assert.equal(outputLink(app),undefined);click(app,'输出达标 → 下一步');click(app,'继续');
assert.equal(saved().currentSession.mode,'review');assert.equal(videoLink(app).href,'someapp://video/1');
click(app,'本组视频看完');app=boot();assert.equal(outputLink(app).href,'https://Example.com:443/a%2fb?note=1');
finishActiveMaterial();app.nodes['add-review-button'].fire('click');app.nodes['start-review-button'].fire('click');
click(app,'开始本轮复习（1条）');click(app,'本组视频看完');app=boot();
assert.equal(outputLink(app).href,'https://Example.com:443/a%2fb?note=1');
const beforeGlobalOutputEdit=saved();click(app,'修改链接');saveOutput('custom-notes:group/1');
const expectedGlobalOutputEdit=JSON.parse(JSON.stringify(beforeGlobalOutputEdit));expectedGlobalOutputEdit.materials[0].groups[0].outputUrl='custom-notes:group/1';
assert.deepEqual(saved(),expectedGlobalOutputEdit);
assert.ok(saved().materials[0].groups.every(group=>group.runs.every(run=>!Object.hasOwn(run,'outputUrl') && !Object.hasOwn(run,'videoUrl'))));
app=boot();assert.equal(outputLink(app).href,'custom-notes:group/1');
const unsafeOutput=saved();unsafeOutput.materials[0].groups[0].outputUrl='javascript:alert(1)';
data.set('cognivex-pocket-state',JSON.stringify(unsafeOutput));app=boot();assert.equal(outputLink(app),undefined);
assert.ok(app.document.getElementById('group-output-url'));
console.log('PASS: shared custom/unknown schemes, exact trimmed URI storage, dangerous protocol blocking, empty unset, OUTPUT navigation isolation, unchanged histories/sessions, optional legacy fields and shared links in all three learning modes.');

// Exported entry strings are not guessed, reparsed, or reformatted.
for(const entry of ['app-exported-address', '/notes/3', 'someapp://笔记/第一题',
  'customapp:open?title=函数 笔记', 'HTTPS://Example.com:443/a%2fb', 'https://']) {
  assert.equal(app.context.PocketExternalLinks.normalizeUri(`  ${entry}  `),entry);
  assert.equal(app.context.PocketExternalLinks.canNavigate(entry),true);
}
data.clear();app=boot();app.nodes['start-button'].fire('click');createMaterial('数学','入口原文','1-5','5');
saveVideo('  customapp:open?title=函数 笔记  ');
assert.equal(saved().materials[0].groups[0].videoUrl,'customapp:open?title=函数 笔记');
app=boot();assert.equal(videoLink(app).href,'customapp:open?title=函数 笔记');
click(app,'本组视频看完');saveOutput('  App导出的入口字符串  ');
assert.equal(saved().materials[0].groups[0].outputUrl,'App导出的入口字符串');
app=boot();assert.equal(outputLink(app).href,'App导出的入口字符串');
const exportedCheckpoint=data.get('cognivex-pocket-state');outputLink(app).fire('click');
assert.equal(data.get('cognivex-pocket-state'),exportedCheckpoint);
assert.equal(saved().currentSession.currentStep,'output');
console.log('PASS: original exported strings, trim-only persistence, unrecognized formats delegated to browser, executable protocol protection and unchanged OUTPUT checkpoint.');

// Local reset: explicit confirmation, Pocket key only, immediate defaults and reload persistence.
const foreignKey='other-app-state';const foreignValue='unrelated-data';data.set(foreignKey,foreignValue);
const beforeReset=data.get('cognivex-pocket-state');
confirmReset=false;app.nodes['reset-data-button'].fire('click');
assert.equal(data.get('cognivex-pocket-state'),beforeReset);
assert.equal(data.get(foreignKey),foreignValue);
for(const phrase of ['当前学习断点','materials','groups','runs','reviewSession','VIDEO / OUTPUT','数据无法恢复'])assert.ok(resetPrompt.includes(phrase));
confirmReset=true;failRemove=true;app.nodes['reset-data-button'].fire('click');failRemove=false;
assert.equal(data.get('cognivex-pocket-state'),beforeReset);
assert.ok(app.nodes.message.textContent.includes('清空失败'));
app.nodes['reset-data-button'].fire('click');
assert.equal(data.has('cognivex-pocket-state'),false);
assert.deepEqual(removedKeys,['cognivex-pocket-state']);
assert.equal(data.get(foreignKey),foreignValue);
assert.equal(app.nodes['start-button'].hidden,false);
assert.equal(app.nodes['pending-count'].textContent,'今日新增：0条');
assert.equal(app.nodes['review-count'].textContent,'已进入复习：0条');
assert.equal(app.nodes['review-time'].textContent,'暂无记录');
assert.ok(text(app).includes('目前没有进行中的学习'));
app=boot();assert.deepEqual(saved(),{version:1,review:{lastReviewedAt:null},currentSession:null,materials:[]});
assert.equal(data.get(foreignKey),foreignValue);
app.nodes['start-button'].fire('click');assert.equal(saved().currentSession.currentStep,'basic');
console.log('PASS: reset confirmation/cancellation, failed deletion preservation, Pocket-only key removal, immediate empty UI, reload defaults, unrelated data preservation and fresh learning after reset.');
