// Run: node tests/executor.test.cjs
// Isolated DOM and localStorage: never reads or changes browser learning data.
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const sources = {};
for (const name of ['storage', 'grouping', 'scheduler', 'history', 'executor', 'material-review', 'external-links', 'output-sop-data', 'output-sop', 'review-ui', 'app']) {
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
function boot({ resumeDraft = true } = {}) {
  const nodes = {};
  for (const id of ['message', 'learning-content', 'start-button', 'learning-heading', 'review-time', 'review-button', 'pending-count', 'review-count', 'add-review-button', 'review-materials', 'start-review-button', 'reset-data-button']) {
    nodes[id] = new Element('div');
  }
  const body = new Element('body'); body.append(...Object.values(nodes));
  const document = { body,
    getElementById: id => nodes[id] || walk(body).find(node => node.id === id),
    createElement: tag => new Element(tag)
  };
  const context = vm.createContext({ document, Intl, Date, URL, localStorage: {
    getItem: key => data.get(key) ?? null,
    removeItem(key) { if (failRemove) throw new Error('Removal blocked'); removedKeys.push(key); data.delete(key); },
    setItem(key, value) { if (failSave || (failOnSave > 0 && --failOnSave === 0)) throw new Error('Storage blocked'); data.set(key, value); snapshots.push(JSON.parse(value)); }
  } });
  require('./helpers/environment.cjs')(context);
  context.window = context;
  context.confirm = prompt => { resetPrompt = prompt; return confirmReset; };
  for (const name of Object.keys(sources)) vm.runInContext(sources[name], context);
  // Existing form-flow scenarios explicitly reopen the preserved draft.
  if (resumeDraft && nodes['start-button'].hidden === false &&
      nodes['start-button'].textContent === '正式开始学习新资料' &&
      JSON.parse(data.get('cognivex-pocket-state')).currentSession?.currentStep === 'basic') {
    nodes['start-button'].fire('click');
  }
  return { nodes, document, context };
}
const saved = () => JSON.parse(data.get('cognivex-pocket-state'));
const text = app => walk(app.nodes['learning-content']).map(node => node.textContent).join('\n');
function fill(app, id, value) { const node = app.document.getElementById(id); node.value = value; node.fire('input'); }
function submit(app) { walk(app.nodes['learning-content']).find(node => node.tag === 'form').fire('submit'); }
function button(app, label) {
  const result = walk(app.nodes['learning-content']).find(node => node.tag === 'button' && walk(node).map(child => child.textContent).join('') === label);
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


let app=boot();
function createMaterial(subject,title,range,size) {
  // Fixture setup completes any required full review before creating another material.
  if (!app.context.PocketMaterialReview.canCreate(saved()) && !saved().currentSession?.draft) finishReviewForFixture();
  if (!app.document.getElementById('subject')) {
    if (!app.context.PocketMaterialReview.canCreate(saved())) finishReviewForFixture();
    app.context.PocketLearning.startNewMaterial();
  }
  fill(app,'subject',subject);fill(app,'title',title);submit(app);
  fill(app,'question-range',range);fill(app,'group-size',size);submit(app);
}
function finishActiveMaterial() {
  let iterations=0;
  while(saved().currentSession.currentStep!=='materialComplete') {
    assert.ok(++iterations<200);app=boot();
    click(app,saved().currentSession.currentStep==='output'?'输出达标 → 下一步':'继续');
  }
  app=boot();assert.ok(text(app).includes('✓ 当前资料完成'));
}
function finishReviewForFixture() {
  app.nodes['start-review-button'].fire('click');let limit=0;
  while(saved().materialReviewSession.currentStep!=='queueComplete') {
    assert.ok(++limit<200);click(app,'输出达标 → 下一步');
  }
  click(app,'返回当前学习');
}
// Original new/internal-review schedules remain unchanged; completion auto-admits all groups.
for(const count of [1,2,4,5]) {
  data.clear();app=boot();app.nodes['start-button'].fire('click');createMaterial('数学','调度'+count,'1-'+count,'1');
  const assignments=[];
  while(saved().currentSession.currentStep!=='materialComplete') {
    const session=saved().currentSession;assert.equal(session.currentStep,'output');assignments.push([session.currentGroupIndex,session.mode]);
    const snapshot=data.get('cognivex-pocket-state');app=boot();assert.equal(data.get('cognivex-pocket-state'),snapshot);
    const done=button(app,'输出达标 → 下一步');failSave=true;done.fire('click');failSave=false;assert.equal(data.get('cognivex-pocket-state'),snapshot);
    done.fire('click');const completed=data.get('cognivex-pocket-state');done.fire('click');assert.equal(data.get('cognivex-pocket-state'),completed);
    if(saved().currentSession.currentStep==='groupComplete')click(app,'继续');
  }
  if(count===4)assert.deepEqual(assignments,[[0,'new'],[1,'new'],[0,'review'],[1,'review'],[2,'new'],[0,'review'],[1,'review'],[2,'review'],[3,'new'],[0,'review'],[1,'review'],[2,'review'],[3,'review']]);
  const material=saved().materials[0];assert.equal(material.addedToReviewAt,material.completedAt);
  material.groups.forEach(g=>{assert.ok(g.id);assert.equal(g.addedToReviewAt,material.completedAt);assert.ok(g.runs.every(r=>r.videoSkipped&&!r.videoCompleted&&r.outputCompleted&&r.completedAt));});
  const once=data.get('cognivex-pocket-state');app=boot();assert.equal(data.get('cognivex-pocket-state'),once);
}
console.log('PASS: first creation, 1/2/4/5-group new/internal schedules, automatic idempotent admission, stable IDs/timestamps, failed saves and stale events.');
// Seed three legacy learned materials; preserve links, questions and old histories.
const template=saved().materials[0];
function learned(id,times) {
  const material=JSON.parse(JSON.stringify(template));material.id=id;material.title=id;material.groups=material.groups.slice(0,times.length);
  material.addedToReviewAt=50;material.completedAt=40;material.videoLinks=[{id:'v',title:'课程',url:'course:'+id}];material.outputLinks=[{id:'o',title:'笔记',url:'notes:'+id}];
  material.materialReviewHistory=[{startedAt:10,completedAt:20}];
  material.groups.forEach((g,index)=>{delete g.id;g.addedToReviewAt=times[index];g.keyQuestions='重点 '+id+index;});return material;
}
const seed={version:1,review:{lastReviewedAt:null},currentSession:null,materials:[learned('A',[300,100]),learned('B',[200,100]),learned('C',[100,400])]};
data.clear();data.set('cognivex-pocket-state',JSON.stringify(seed));app=boot();
assert.equal(JSON.stringify(app.context.PocketMaterialReview.groups(saved()).map(e=>[e.materialId,e.groupIndex])),JSON.stringify([['C',0],['C',1],['B',1],['B',0],['A',1],['A',0]]));
const original=saved();const admission=data.get('cognivex-pocket-state');app=boot();assert.equal(data.get('cognivex-pocket-state'),admission);
assert.equal(app.context.PocketLearning.startNewMaterial(),true);assert.ok(text(app).includes('请先完成已学内容的资料间倒序复习，再新增资料。'));
assert.equal(saved().currentSession,null);assert.equal(saved().materials.length,3);app=boot();assert.equal(app.context.PocketLearning.startNewMaterial(),true);
click(app,'返回已学内容区 →');click(app,'开始资料间倒序复习');assert.equal(saved().materialReviewSession.queueVersion,2);
const fixed=JSON.stringify(saved().materialReviewSession.queue.map(e=>[e.materialId,e.groupId]));
const first=button(app,'输出达标 → 下一步');first.fire('click');const afterFirst=data.get('cognivex-pocket-state');first.fire('click');assert.equal(data.get('cognivex-pocket-state'),afterFirst);
assert.equal(saved().materialReviewSession.completedGroupCount,1);app=boot();assert.equal(saved().materialReviewSession.currentQueueIndex,1);
assert.equal(JSON.stringify(saved().materialReviewSession.queue.map(e=>[e.materialId,e.groupId])),fixed);
while(saved().materialReviewSession.currentQueueIndex<5)click(app,'输出达标 → 下一步');
const final=button(app,'输出达标 → 下一步');failOnSave=2;final.fire('click');assert.equal(saved().materialReviewSession.currentStep,'materialCompletePending');
assert.equal(app.context.PocketMaterialReview.canCreate(saved()),false);const histories=JSON.stringify(saved().materials.map(m=>m.materialReviewHistory));
click(app,'重试保存');assert.equal(saved().materialReviewSession.currentStep,'queueComplete');assert.equal(saved().materialReviewSession.completedGroupCount,6);
assert.equal(JSON.stringify(saved().materials.map(m=>m.materialReviewHistory)),histories);assert.ok(app.context.PocketMaterialReview.canCreate(saved()));
const grant=JSON.stringify(saved().review.unlock);app=boot();assert.equal(JSON.stringify(saved().review.unlock),grant);
original.materials.forEach((m,index)=>{assert.deepEqual(saved().materials[index].videoLinks,m.videoLinks);assert.deepEqual(saved().materials[index].outputLinks,m.outputLinks);assert.deepEqual(saved().materials[index].groups.map(g=>g.keyQuestions),m.groups.map(g=>g.keyQuestions));});
click(app,'返回当前学习');assert.equal(app.context.PocketLearning.startNewMaterial(),true);
createMaterial('物理','D','1-2','1');assert.ok(saved().review.unlock.usedAt);assert.equal(app.context.PocketMaterialReview.canCreate(saved()),false);
const unfinished=data.get('cognivex-pocket-state');assert.equal(app.context.PocketLearning.startNewMaterial(),true);assert.equal(data.get('cognivex-pocket-state'),unfinished);
finishActiveMaterial();assert.equal(saved().materials.length,4);app.nodes['start-review-button'].fire('click');assert.equal(saved().materialReviewSession.queue.length,8);
assert.ok(saved().materialReviewSession.queue.some(e=>e.materialId===saved().materials[3].id));
console.log('PASS: full sorted/interleaved Group snapshots, stable ties, halfway restore, exact no-double runs/history, durable unlock/retry, one-time consumption, guarded entry and new+old next-round coverage.');
// Missing current group blocks without silently granting access; explicit rebuilding archives it.
const broken=saved();const item=broken.materialReviewSession.queue[broken.materialReviewSession.currentQueueIndex];
const owner=broken.materials.find(m=>m.id===item.materialId);owner.groups=owner.groups.filter(g=>g.id!==item.groupId);data.set('cognivex-pocket-state',JSON.stringify(broken));
app=boot();assert.equal(saved().materialReviewSession.currentStep,'queueBlocked');assert.ok(text(app).includes('缺失'));assert.equal(app.context.PocketMaterialReview.canCreate(saved()),false);
click(app,'重新建立完整复习轮次');assert.ok(saved().review.archivedSessions.some(s=>s.currentStep==='queueBlocked'));
console.log('PASS: deleted group is reported safely and preserves the old queue in an explicit rebuild archive.');
// Corrupt storage is retained; stale windows cannot overwrite another window's checkpoint.
const durable=data.get('cognivex-pocket-state');const oldWindow=app;
const other=saved();other.review.lastReviewedAt=123;data.set('cognivex-pocket-state',JSON.stringify(other));
assert.throws(()=>oldWindow.context.PocketStorage.updateState(JSON.parse(durable),()=>{}),/其他窗口/);
data.set('cognivex-pocket-state','broken-json');app=boot();assert.equal(data.get('cognivex-pocket-state'),'broken-json');
assert.throws(()=>app.context.PocketStorage.saveState(app.context.PocketStorage.getInitialState()),/禁止覆盖/);
console.log('PASS: corrupt data is never reset and stale-window writes are rejected.');
// Keep the shared fixture in a usable empty state for the independent feature suites.
data.clear();app=boot();
