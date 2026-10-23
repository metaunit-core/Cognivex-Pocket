'use strict';
const assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path'), vm = require('node:vm');
const { boot, seed } = require('./helpers/pocket-learning-ui.cjs');
const location = new URL('http://localhost:4173/'), key = 'pocket-development-v1:cognivex-pocket-state';
const setup = boot({ location, focusReview: true }), model = setup.context.PocketFocusReview;
function load(state) {
  const app = boot({ location, focusReview: true, store: new Map([[key, JSON.stringify(state)]]) });
  for (const name of ['learning-backup', 'learning-archive']) vm.runInContext(fs.readFileSync(path.join(__dirname, '../js/' + name + '.js'), 'utf8'), app.context);
  return app;
}
const base = seed(3); base.materials.forEach(m => { m.groups[0].start = 1; m.groups[0].end = 20; }); base.materials[2].subject = '物理';
const groupIds = [];
for (const [id, subject, numbers] of [['m1', '数学', '2、3、4'], ['m2', '数学', '5、6'], ['m3', '物理', '8、9']]) {
  model.add(base, id, 0, numbers); groupIds.push(model.create(base, subject, model.available(base, subject).length, model.available(base, subject).map(q => q.id)));
}
model.start(base, groupIds[0]);
while (model.active(base)) model.transition(base, model.active(base).run.id, 'finish', { accuracy: '2/3', durationMinutes: '12' });
const members = JSON.stringify(base.focusReview.groups[0].members), history = JSON.stringify(base.focusReview.groups[0].runs[0]);
const originals = JSON.stringify(base.materials), others = JSON.stringify(base.focusReview.groups.slice(1));
model.start(base, groupIds[0]);
let app = load(base);
const walk = n => [n, ...n.children.flatMap(walk)];
const page = () => app.document.getElementById('focus-review');
const press = label => { const n = walk(page()).find(n => n.tag === 'button' && n.textContent === label); assert.ok(n, label); n.fire('click'); };
app.context.PocketFocusReviewUI.open({ subject: '数学', focusGroup: groupIds[0] }); press('移除');
const choice = walk(page()).find(n => n.className === 'focus-removal-choice' && n.children[1].textContent.endsWith('第 3 题'));
choice.children[0].checked = true; choice.children[0].fire('change'); press('确认移出所选题目');
const activeSection = state => load(state).context.PocketLearningArchive.render(JSON.stringify(state)).split('## 二、重点复习系统学习数据')[1].split('## 三、已熟练并移除的所有题目')[0];
let state = app.state(), current = activeSection(state);
assert.match(current, /### 重点 Group 1\n/);
assert.match(current, /\| 资料1 \| 第2、4题 \| 2\/3 \| 12分钟 \|/); // A and E
assert.equal(state.focusReview.questions.find(q => q.materialId === 'm1' && q.number === 3).status, 'mastered');
assert.equal(JSON.stringify(state.focusReview.groups[0].members), members);
assert.equal(JSON.stringify(state.focusReview.groups[0].runs[0]), history);
assert.equal(JSON.stringify(state.focusReview.groups.slice(1)), others);
assert.equal(JSON.stringify(state.materials), originals);
const hidden = app.context.PocketLearningArchive.render(JSON.stringify(state)).split('## 三、已熟练并移除的所有题目')[1];
assert.equal((hidden.match(/\| 数学 \| 资料1 \| 第3题 \| 重点复习系统 \|/g) || []).length, 1);
// F: the page, unconditioned filter and current archive all agree on the active members.
app.context.PocketFocusReviewUI.open({ subject: '数学', questionList: true });
const visible = walk(page()).filter(n => n.className === 'focus-strip-numbers').map(n => n.textContent).join(' ');
assert.match(visible, /第 2、4 题/); assert.doesNotMatch(visible, /第 3 题/);
assert.deepEqual(Array.from(model.groupingPlan(state, '数学').questions, q => q.number), [2, 4, 5, 6]);
assert.deepEqual(Array.from(model.allQuestions(state, '数学'), q => q.number), [2, 4, 5, 6]);
app.context.PocketLearning.showHome();
assert.match(app.document.getElementById('focus-review-statistics').textContent, /重点题 6 道 · 重点 Group 3 组/);
// B: a single surviving member still retains its Group and original aggregate score.
let running = model.active(state);
model.removeSelected(state, running.run.id, running.index, [state.focusReview.questions.find(q => q.materialId === 'm1' && q.number === 4).id]);
assert.match(activeSection(state), /\| 资料1 \| 第2题 \| 2\/3 \| 12分钟 \|/);
// C: only an actually empty Group disappears from the current list; history remains byte-for-byte intact.
running = model.active(state); model.removeSelected(state, running.run.id, running.index, [running.question.id]);
assert.doesNotMatch(activeSection(state), /\| 资料1 \|/);
assert.match(activeSection(state), /\| 资料2 \| 第5、6题/); assert.match(activeSection(state), /\| 资料3 \| 第8、9题/);
assert.equal(JSON.stringify(state.focusReview.groups[0].members), members); assert.equal(JSON.stringify(state.focusReview.groups[0].runs[0]), history);
// D: removing the only member of one source must not remove the other source's members or recompute the shared score.
const mixed = seed(2); mixed.materials.forEach(m => { m.groups[0].start = 1; m.groups[0].end = 20; });
model.add(mixed, 'm1', 0, '2'); model.add(mixed, 'm2', 0, '3、4');
const mixedId = model.create(mixed, '数学', 3, model.available(mixed, '数学').map(q => q.id)); model.start(mixed, mixedId);
while (model.active(mixed)) model.transition(mixed, model.active(mixed).run.id, 'finish', { accuracy: '2/3', durationMinutes: '12' });
model.start(mixed, mixedId); running = model.active(mixed); model.removeSelected(mixed, running.run.id, running.index, [running.question.id]);
const mixedExport = activeSection(mixed);
assert.doesNotMatch(mixedExport, /\| 资料1 \|/); assert.match(mixedExport, /\| 资料2 \| 第3、4题 \| 2\/3 \| 12分钟 \|/);
const raw = JSON.stringify(mixed), reader = load(mixed), bytes = reader.store.get(key);
reader.context.PocketLearningArchive.render(raw); assert.equal(reader.store.get(key), bytes); assert.equal(JSON.stringify(mixed), raw);
console.log('PASS localhost A-F: real remove interaction, per-member archive, last/empty Group, mixed sources, original grades/history and page/filter parity.');
