// Run: node tests/output-entry-key-questions.test.cjs
// All data is isolated in memory; real localStorage is never accessed.
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const source = fs.readFileSync(path.join(__dirname, 'executor.test.cjs'), 'utf8');
const checks = `
function keyInput() { return app.document.getElementById('group-key-questions'); }
function writeKey(value) {
  const before = saved(); const input = keyInput(); input.value = value; input.fire('input');
  const after = saved();
  const session = before.activeSessionType === 'material-review' ? before.materialReviewSession : before.currentSession;
  before.materials.find(m => m.id === session.materialId).groups[session.currentGroupIndex].keyQuestions = value;
  assert.deepEqual(after,before); // Precisely one shared group field changed.
}
function checkChoiceNavigation() {
  const before = data.get('cognivex-pocket-state'); const writes = snapshots.length;
  const task = walk(app.nodes['learning-content']).find(n => n.className === 'current-task');
  const choices = task.children.find(n => n.className === 'output-entries');
  const sections = task.children.filter(n => n.tag === 'section');
  assert.equal(choices.hidden,false);
  assert.deepEqual(choices.children.map(n => n.textContent),['视频','题目']);
  assert.ok(sections.every(n => n.hidden));
  choices.children[0].fire('click');
  assert.equal(choices.hidden,true); assert.equal(sections[0].hidden,false); assert.equal(sections[1].hidden,true);
  assert.ok(walk(sections[0]).some(n => n.textContent === '预习+看视频'));
  assert.ok(!walk(task).some(n => n.tag === 'button' && n.textContent === '本组视频看完'));
  const back = task.children.find(n => n.textContent === '← 返回 OUTPUT'); back.fire('click');
  assert.equal(choices.hidden,false); assert.ok(sections.every(n => n.hidden));
  choices.children[1].fire('click');
  assert.equal(sections[1].hidden,false);
  assert.ok(walk(sections[1]).some(n => n.className === 'output-entry' && n.children.some(c => c.textContent === '做题')));
  back.fire('click');
  assert.equal(data.get('cognivex-pocket-state'),before); assert.equal(snapshots.length,writes);
}
data.clear(); app=boot(); app.nodes['start-button'].fire('click'); createMaterial('数学','A','1-4','2');
assert.equal(keyInput().value,'');
assert.ok(!walk(app.nodes['learning-content']).find(n => n.className === 'group-key-questions').open);
writeKey('第 3、7、12 题\\n关注换元范围');
app=boot(); assert.equal(keyInput().value,'第 3、7、12 题\\n关注换元范围');
checkChoiceNavigation();
app=boot(); checkChoiceNavigation(); assert.equal(saved().currentSession.currentStep,'output');
click(app,'输出达标 → 下一步'); click(app,'继续');
assert.equal(saved().currentSession.currentGroupIndex,1); assert.equal(keyInput().value,''); writeKey('第二组独有');
click(app,'输出达标 → 下一步'); click(app,'继续');
assert.equal(saved().currentSession.mode,'review'); assert.equal(saved().currentSession.currentGroupIndex,0);
assert.equal(keyInput().value,'第 3、7、12 题\\n关注换元范围'); writeKey('内部复习更新');
app=boot(); assert.equal(keyInput().value,'内部复习更新');
finishActiveMaterial(); click(app,'开始下一份资料'); createMaterial('数学','B','1-4','2');
assert.equal(keyInput().value,''); writeKey('B 第一组');
assert.equal(saved().materials[0].groups[0].keyQuestions,'内部复习更新');
assert.equal(saved().materials[0].groups[1].keyQuestions,'第二组独有');
const learningBefore = saved().currentSession;
app.nodes['add-review-button'].fire('click'); app.nodes['start-review-button'].fire('click'); click(app,'开始本轮复习（1条）');
assert.equal(keyInput().value,'内部复习更新'); writeKey('全局复习最新内容');
assert.deepEqual(saved().currentSession,learningBefore);
app=boot(); assert.equal(keyInput().value,'全局复习最新内容');
checkChoiceNavigation();
failSave=true; keyInput().value='未保存草稿'; keyInput().fire('input'); failSave=false;
assert.equal(saved().materials[0].groups[0].keyQuestions,'全局复习最新内容');
assert.equal(keyInput().value,'未保存草稿'); assert.ok(text(app).includes('保存失败'));
writeKey(''); app=boot(); assert.equal(keyInput().value,''); writeKey('全局复习最终版本');
click(app,'输出达标 → 下一组'); assert.equal(keyInput().value,'第二组独有');
click(app,'输出达标 → 下一组'); click(app,'返回当前学习');
assert.equal(keyInput().value,'B 第一组');
assert.equal(saved().materials[0].groups[0].keyQuestions,'全局复习最终版本');
const css = fs.readFileSync(path.join(__dirname,'../css/style.css'),'utf8');
assert.match(css,/\\.group-key-questions summary\\s*\\{[^}]*color: #facc15;[^}]*font-weight: 700;/);
console.log('PASS: OUTPUT default choices, original content and return without storage writes; shared per-Material/per-Group text, autosave/reload, internal/global review edits, material isolation, empty values, failed-save draft preservation and yellow bold heading.');
`;
vm.runInNewContext(source + checks, {require,__dirname,console,URL}, {filename:__filename});
