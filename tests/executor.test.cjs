// Run: node tests/executor.test.cjs
// Isolated DOM and localStorage: never reads or changes browser learning data.
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const sources = {};
for (const name of ['storage', 'grouping', 'scheduler', 'history', 'executor', 'material-review', 'external-links', 'output-sop-data', 'output-sop', 'app']) {
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
function createMaterial(subject,title,range,size) {
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
// Every new/internal-review assignment starts directly at OUTPUT; scheduler order is unchanged.
for(const count of [1,2,4,5]) {
  data.clear();app=boot();app.nodes['start-button'].fire('click');createMaterial('数学','调度'+count,'1-'+count,'1');
  const assignments=[];
  while(saved().currentSession.currentStep!=='materialComplete') {
    const session=saved().currentSession;
    assert.equal(session.currentStep,'output');assignments.push([session.currentGroupIndex,session.mode]);
    assert.ok(!walk(app.nodes['learning-content']).some(n=>n.textContent==='本组视频看完'));
    const snapshot=data.get('cognivex-pocket-state');app=boot();assert.equal(data.get('cognivex-pocket-state'),snapshot);
    const done=button(app,'输出达标 → 下一步');failSave=true;done.fire('click');failSave=false;assert.equal(data.get('cognivex-pocket-state'),snapshot);
    done.fire('click');const completed=data.get('cognivex-pocket-state');done.fire('click');assert.equal(data.get('cognivex-pocket-state'),completed);
    if(saved().currentSession.currentStep==='groupComplete')click(app,'继续');
  }
  if(count===4)assert.deepEqual(assignments,[[0,'new'],[1,'new'],[0,'review'],[1,'review'],[2,'new'],[0,'review'],[1,'review'],[2,'review'],[3,'new'],[0,'review'],[1,'review'],[2,'review'],[3,'review']]);
  const material=saved().materials[0];assert.equal(material.status,'completed');
  material.groups.forEach(g=>{assert.ok(g.firstLearningCompletedAt);assert.ok(g.runs.every(r=>r.videoSkipped&&!r.videoCompleted&&r.outputCompleted&&r.completedAt));});
}
console.log('PASS: direct OUTPUT for 1/2/4/5 groups, unchanged scheduler order, reloads, failed saves, stale events, completed histories and truthful videoSkipped records.');
// Upgrade only VIDEO checkpoints, retaining exact group/run/link/history identity.
data.clear();app=boot();app.nodes['start-button'].fire('click');createMaterial('数学','迁移','1-4','2');
const legacy=saved();legacy.currentSession.currentStep='video';delete legacy.materials[0].groups[0].runs[0].videoSkipped;
legacy.materials[0].videoLinks=[{id:'v',title:'视频',url:'course:a'}];legacy.materials[0].outputLinks=[{id:'o',title:'输出',url:'notes:a'}];
legacy.materials[0].groups[0].keyQuestions='第 1 题';data.set('cognivex-pocket-state',JSON.stringify(legacy));
app=boot();const expected=JSON.parse(JSON.stringify(legacy));expected.currentSession.currentStep='output';expected.materials[0].groups[0].runs[0].videoSkipped=true;
assert.deepEqual(saved(),expected);const upgraded=data.get('cognivex-pocket-state');app=boot();assert.equal(data.get('cognivex-pocket-state'),upgraded);
// Material link operations remain isolated from learning progression.
click(app,'视频');click(app,'＋ 新增链接');fill(app,'group-video-title','新增');fill(app,'group-video-url','course:b');submit(app);
assert.equal(saved().materials[0].videoLinks.length,2);assert.deepEqual(saved().currentSession,expected.currentSession);
app=boot();click(app,'题目');click(app,'＋ 新增链接');fill(app,'group-output-title','笔记');fill(app,'group-output-url','notes:b');submit(app);
assert.equal(saved().materials[0].outputLinks.length,2);assert.deepEqual(saved().currentSession,expected.currentSession);
console.log('PASS: legacy VIDEO upgrade retains material/group/run identity, histories, key questions and independent Material links.');
// Multi-material review updates recent review only at the final selected material.
data.clear();app=boot();app.nodes['start-button'].fire('click');
for(let i=0;i<3;i++){if(i)click(app,'开始下一份资料');createMaterial('数学','队列'+i,'1-2','1');finishActiveMaterial();}
app.nodes['add-review-button'].fire('click');click(app,'开始下一份资料');createMaterial('物理','当前资料','1-2','1');
const main=saved().currentSession;const mainMaterial=JSON.stringify(saved().materials[3]);
app.nodes['start-review-button'].fire('click');click(app,'开始本轮复习（3条）');
for(let materialIndex=0;materialIndex<3;materialIndex++) {
  for(let group=0;group<2;group++) {
    app=boot();assert.equal(saved().materialReviewSession.currentStep,'output');assert.equal(saved().materialReviewSession.currentGroupIndex,group);
    assert.equal(saved().materialReviewSession.currentMaterialIndex,materialIndex);
    assert.deepEqual(saved().currentSession,main);
    const before=data.get('cognivex-pocket-state');const done=button(app,'输出达标 → 下一组');
    failSave=true;done.fire('click');failSave=false;assert.equal(data.get('cognivex-pocket-state'),before);
    if(materialIndex===2&&group===1) {
      failOnSave=2;done.fire('click');
      assert.equal(saved().materialReviewSession.currentStep,'materialCompletePending');
      assert.equal(saved().review.lastReviewedAt,saved().materials[2].lastMaterialReviewedAt);
      const completedAt=saved().review.lastReviewedAt;const history=JSON.stringify(saved().materials[2].materialReviewHistory);
      click(app,'重试保存');assert.equal(saved().review.lastReviewedAt,completedAt);assert.equal(JSON.stringify(saved().materials[2].materialReviewHistory),history);
    } else {done.fire('click');assert.equal(saved().review.lastReviewedAt,null);}
    const once=data.get('cognivex-pocket-state');done.fire('click');assert.equal(data.get('cognivex-pocket-state'),once);
  }
}
assert.equal(saved().materialReviewSession.currentStep,'queueComplete');assert.ok(Number.isFinite(saved().review.lastReviewedAt));
assert.equal(saved().review.lastReviewedAt,saved().materialReviewSession.completedMaterials.at(-1).completedAt);
assert.equal(JSON.stringify(saved().materials[3]),mainMaterial);const recent=saved().review.lastReviewedAt;app=boot();assert.equal(saved().review.lastReviewedAt,recent);
assert.notEqual(app.nodes['review-time'].textContent,'暂无记录');click(app,'返回当前学习');assert.deepEqual(saved().currentSession,main);
assert.ok(!fs.readFileSync(path.join(__dirname,'../index.html'),'utf8').includes('id="review-button"'));
console.log('PASS: all selected review materials/groups start at OUTPUT, atomic automatic recent-review time on final completion, pending-save retry/reload stability, main-session isolation and removed manual button.');
// Reset is still explicit, atomic and confined to Pocket's learning key.
const beforeReset=data.get('cognivex-pocket-state');app.nodes['reset-data-button'].fire('click');assert.equal(data.get('cognivex-pocket-state'),beforeReset);
confirmReset=true;failRemove=true;app.nodes['reset-data-button'].fire('click');failRemove=false;assert.equal(data.get('cognivex-pocket-state'),beforeReset);
data.set('unrelated','keep');app.nodes['reset-data-button'].fire('click');assert.equal(data.get('unrelated'),'keep');assert.equal(data.has('cognivex-pocket-state'),false);
app=boot();assert.equal(saved().currentSession,null);assert.equal(saved().materials.length,0);confirmReset=false;
console.log('PASS: reset confirmation, failed deletion preservation, unrelated storage isolation and empty reload.');
