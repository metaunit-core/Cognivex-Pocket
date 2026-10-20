'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm');
const { boot, seed } = require('./helpers/pocket-learning-ui.cjs');
const location = new URL('http://localhost:4173/'), key = 'pocket-development-v1:cognivex-pocket-state';
const state = seed(2), setup = boot({ location, focusReview: true }), model = setup.context.PocketFocusReview;
state.materials.forEach(m => { m.groups[0].start = 1; m.groups[0].end = 20; });
model.add(state, 'm1', 0, '1、2'); model.add(state, 'm2', 0, '1、2');
for (let i = 0; i < 2; i++) model.create(state, '数学', 2, model.available(state, '数学').slice(0, 2).map(q => q.id));
const oldId = state.focusReview.groups[0].id;
const finish = (id, accuracy, duration) => {
  model.start(state, id);
  while (model.active(state)) model.transition(state, model.active(state).run.id, 'finish', { accuracy, durationMinutes: duration });
};
finish(oldId, '1/2', '8'); finish(oldId, '0/2', '9');
const old = JSON.stringify(state.focusReview.groups[0]), original = JSON.stringify({ materials: state.materials, review: state.review, currentSession: state.currentSession });
const regroup = (quantity, filters = {}) => {
  const p = model.groupingPlan(state, '数学', filters);
  return model.regroup(state, '数学', quantity, { filters, questionIds: p.questions.map(q => q.id), groupIds: p.groupIds }, true);
};
const newIds = regroup(1, { accuracy: 60 });
assert.equal(newIds.length, 2);
const retired = state.focusReview.groups[0];
assert.equal(JSON.stringify({ ...retired, retiredAt: null }), old, 'regroup only retires the old Group, preserving every run/member/id');
assert.equal(retired.runs.length, 2);
assert.equal(model.findGroup(state, newIds[0]).runs.length, 0);
assert.equal(model.groupingPlan(state, '数学', { accuracy: 60 }).questions.length, 0, 'new Groups never inherit old scores');
let app;
const walk = node => [node, ...node.children.flatMap(walk)];
const open = id => {
  app = boot({ location, store: new Map([[key, JSON.stringify(state)]]), focusReview: true });
  app.context.PocketFocusReviewUI.open({ subject: '数学', focusGroup: id });
};
const area = () => walk(app.document.getElementById('focus-review')).find(n => n.tag === 'details' && n.children[0]?.textContent.startsWith('复习记录：'));
const text = n => walk(n).map(n => n.textContent).join('\n');
open(newIds[0]);
assert.match(text(area()), /复习记录：0次/);
assert.match(text(area()), /当前 Group 复习记录/);
assert.match(text(area()), /相关历史复习记录：2条/);
assert.match(text(area()), /原重点 Group 1/);
assert.match(text(area()), /资料1 · 第 1、2 题/);
assert.doesNotMatch(text(area()), /资料2/, 'same question numbers in different materials are unrelated');
assert.match(text(area()), /正确率：1\/2 · 用时：8分钟/);
assert.match(text(area()), /正确率：0\/2 · 用时：9分钟/);
const beforeOpen = app.store.get(key);
app.context.PocketFocusReviewUI.open({ subject: '数学', focusGroup: newIds[0] });
assert.equal(app.store.get(key), beforeOpen, 'history display is read-only');
// Names and members must come from stored historical snapshots, even after a rename/removal.
state.materials[0].title = '当前改名';
open(newIds[0]); assert.match(text(area()), /资料1 · 第 1、2 题/);
state.materials[0].title = '资料1';
const sourceMaterial = state.materials.shift();
open(newIds[0]); assert.match(text(area()), /资料1 · 第 1、2 题/);
state.materials.unshift(sourceMaterial);
open(newIds[0]);
const click = label => { const n = walk(app.document.getElementById('focus-review')).find(n => n.tag === 'button' && n.textContent === label); assert.ok(n, label); n.fire('click'); };
click('复习');
assert.match(text(area()), /复习记录：0次/);
assert.match(text(area()), /相关历史复习记录：2条/);
for (const [suffix, value] of [['accuracy', '1/1'], ['duration', '3']]) {
  const input = app.document.getElementById('focus-group-latest-' + suffix); input.value = value; input.fire('input');
}
click('输出达标 → 下一步');
assert.match(text(area()), /复习记录：1次/);
assert.match(text(area()), /相关历史复习记录：2条/);
Object.assign(state, app.state());
// All-review aggregates and their Group copies represent one historical training, not duplicate single-Group runs.
model.startAll(state, '数学');
while (model.active(state)) model.transition(state, model.active(state).run.id, 'finish', { accuracy: '1/1', durationMinutes: '4' });
open(newIds[0]);
assert.match(text(area()), /来自全部复习的 Group 记录/);
assert.match(text(area()), /相关历史复习记录：2条/, 'all-review copies already shown in current records are not repeated in related history');
const allBytes = JSON.stringify(state.focusReview.allReviews);
const histories = state.focusReview.groups.map(g => JSON.stringify(g.runs));
const thirdIds = regroup(2);
assert.equal(JSON.stringify(state.focusReview.allReviews), allBytes);
assert.deepEqual(state.focusReview.groups.slice(0, histories.length).map(g => JSON.stringify(g.runs)), histories);
assert.equal(JSON.stringify({ materials: state.materials, review: state.review, currentSession: state.currentSession }), original);
open(thirdIds[0]);
assert.match(text(area()), /复习记录：0次/);
assert.match(text(area()), /相关历史复习记录：4条/); // two original + one new single + one all-review aggregate
assert.match(text(area()), /全部复习/);
assert.match(text(area()), /正确率：1\/1 · 用时：3分钟/);
assert.match(text(area()), /正确率：1\/1 · 用时：4分钟/);
assert.equal(model.groupingPlan(state, '数学', { accuracy: 60 }).questions.length, 0);
// No history is fabricated for an unreviewed, unrelated Group.
model.add(state, 'm2', 0, '10');
const emptyId = model.create(state, '数学', 1, model.available(state, '数学').map(q => q.id));
open(emptyId); assert.match(text(area()), /暂无相关历史复习记录/);
// Existing JSON backup verification + fresh local boot restore every record without a migration.
module.exports = (async () => {
  open(thirdIds[0]);
  vm.runInContext(fs.readFileSync(path.join(__dirname, '../js/learning-backup.js'), 'utf8'), app.context);
  const backup = await app.context.PocketLearningBackup.create();
  assert.equal((await app.context.PocketLearningBackup.verify(JSON.stringify(backup))).valid, true);
  const restored = JSON.parse(backup.rawState);
  assert.equal(JSON.stringify(restored.focusReview), JSON.stringify(state.focusReview));
  const restoredApp = boot({ location, store: new Map([[key, backup.rawState]]), focusReview: true });
  restoredApp.context.PocketFocusReviewUI.open({ subject: '数学', focusGroup: thirdIds[0] });
  assert.match(text(restoredApp.document.getElementById('focus-review')), /相关历史复习记录：4条/);
  assert.equal(JSON.stringify(restoredApp.state().focusReview), JSON.stringify(state.focusReview));
  console.log('PASS localhost regroup historical linkage, separate scores/counts, snapshots, repeated regroup, all-review deduplication and JSON round-trip.');
})();
