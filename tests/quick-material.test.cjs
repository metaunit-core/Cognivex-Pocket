'use strict';
const assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path'), vm = require('node:vm');
const { boot, seed } = require('./helpers/pocket-learning-ui.cjs');
const location = new URL('http://localhost:4173/'), key = 'pocket-development-v1:cognivex-pocket-state';
const clock = { now: new Date(2026, 9, 23, 9).getTime() };
let app = boot({ location, clock, focusReview: true });
const grouping = app.context.PocketGrouping;
const walk = n => [n, ...n.children.flatMap(walk)];
const quickPage = () => app.document.getElementById('quick-material');
const open = () => { app.context.PocketLearning.showHome(); app.document.getElementById('quick-material-entry').fire('click'); };
const fill = (patch = {}) => { for (const [field, value] of Object.entries({ subject: '数学', title: '导数专题', questionRange: '1-10,13,15-18', groupSize: '5', ...patch })) {
  const n = app.document.getElementById('quick-material-' + field); n.value = value; n.fire('input');
} };
const submit = () => { const form = walk(quickPage()).find(n => n.tag === 'form'); form.fire('submit'); return form; };
open(); fill();
assert.match(walk(quickPage()).map(n => n.textContent).join('\n'), /分组预览：共3组/);
assert.ok(walk(quickPage()).some(n => n.textContent === '第3组：13, 15-18'));
const form = submit(); form.fire('submit');
let state = app.state(), material = state.materials[0];
assert.equal(state.materials.length, 1); assert.equal(material.status, 'completed'); assert.equal(material.totalGroups, 3);
assert.deepEqual(material.groups.map(g => [g.start, g.end, g.questionRange]), [[1, 5, undefined], [6, 10, undefined], [13, 18, '13, 15-18']]);
assert.equal(new Set(material.groups.map(g => g.id)).size, 3);
assert.deepEqual(Array.from(grouping.previewAppend(material, '14', '1'), g => [g.start, g.end]), [[14,14]]);
assert.throws(() => grouping.previewAppend(material, '15', '1'), /重复/);
assert.ok(material.groups.every(g => g.runs.length === 0 && g.firstLearningCompletedAt === null && g.videoCompleted === false && g.outputCompleted === false));
assert.ok(material.groups.every(g => g.latestAccuracyPercent === null && g.latestDurationMinutes === null && g.keyQuestions === ''));
assert.deepEqual(material.videoLinks, []); assert.deepEqual(material.outputLinks, []); assert.equal(state.currentSession, null);
assert.equal(state.reviewAdmission, undefined); assert.equal(state.dailyReverseReview.round, undefined);
assert.equal(quickPage().hidden, false);
assert.equal(app.document.getElementById('quick-material-status').textContent, '学习资料保存成功，可继续新增下一份。');
assert.deepEqual(Array.from(grouping.previewCompleted('1-6', '5'), g => [g.start, g.end]), [[1,5],[6,6]]);
assert.deepEqual(Array.from(grouping.previewCompleted('1-3,7,10-12', '5'), g => g.questionRange || `${g.start}-${g.end}`), ['1-3, 7, 10', '11-12']);
for (const range of ['1-3,3-5', '5-1', 'x', '', '1-10001']) assert.throws(() => grouping.previewCompleted(range, '5'));
for (const size of ['0', '-1', '1.5', 'Infinity']) assert.throws(() => grouping.previewCompleted('1-5', size));
const id = material.id, firstBytes = JSON.stringify(material);
app = boot({ location, clock, focusReview: true, store: app.store });
assert.equal(JSON.stringify(app.state().materials[0]), firstBytes); assert.equal(app.context.PocketExecutor.needsInitialization(app.state()), false);
open(); fill(); submit(); assert.equal(app.state().materials.length, 2); assert.notEqual(app.state().materials[1].id, id);
assert.equal(JSON.stringify(app.state().materials[0]), firstBytes);
open(); fill({ title: '' }); const before = app.store.get(key); submit(); assert.equal(app.store.get(key), before);
fill({ title: '重试资料' }); app.fail.enabled = true; submit(); app.fail.enabled = false;
assert.equal(app.store.get(key), before); assert.ok(walk(quickPage()).some(n => n.textContent.startsWith('保存失败')));
submit(); assert.equal(app.state().materials.length, 3);
// New normal completed materials join the usual queues, in normal saved order.
app.context.PocketLearning.showHome(); app.document.getElementById('daily-reverse-review-entry').fire('click');
state = app.state(); assert.deepEqual(state.dailyReverseReview.round.ids, state.materials.map(m => m.id));
assert.equal(state.dailyReverseReview.round.tasks.length, 9);
// Unfinished daily checkpoint, original learning session, focus history and old materials survive another quick save unchanged.
const outside = JSON.stringify({ materials: state.materials, session: state.currentSession, daily: state.dailyReverseReview.round, admission: state.reviewAdmission });
open(); fill({ title: '已有任务时录入', questionRange: '7-8', groupSize: '2' }); submit();
const next = app.state(); assert.equal(JSON.stringify({ materials: next.materials.slice(0,3), session: next.currentSession, daily: next.dailyReverseReview.round, admission: next.reviewAdmission }), outside);
// Quick materials remain available through daily review, not today's original-learning queue.
app.context.PocketLearning.showHome(); app.document.getElementById('daily-reverse-review-entry').fire('click');
while (app.context.PocketDailyReverse.task(app.state()).material.id !== id || app.context.PocketDailyReverse.task(app.state()).groupIndex !== 2) app.button('输出达标 → 下一步').fire('click');
const boxes = walk(app.document.getElementById('group-key-questions-panel')).filter(n => n.type === 'checkbox');
assert.deepEqual(boxes.map(n => Number(n['data-question-number'])), [13, 15, 16, 17, 18]);
for (const [suffix, value] of [['accuracy', '4/5'], ['duration', '6']]) { const n = app.document.getElementById('group-latest-' + suffix); n.value = value; n.fire('input'); }
const select = boxes.find(n => n['data-question-number'] === '15'); select.checked = true; select.fire('change');
walk(app.document.getElementById('group-key-questions-panel')).find(n => n.tag === 'button' && n.textContent === '加入重点复习系统').fire('click');
const question = app.state().focusReview.questions[0]; assert.equal(question.materialId, id); assert.equal(question.number, 15); assert.equal(question.groupId, material.groups[2].id);
assert.equal(app.state().materials[0].groups[2].latestAccuracyRatio, '4/5');
const focus = app.context.PocketFocusReview, data = app.state();
const focusId = focus.create(data, '数学', 1, focus.available(data, '数学').map(q => q.id)); focus.start(data, focusId);
focus.transition(data, focus.active(data).run.id, 'finish', { accuracy: '1/1', durationMinutes: '2' });
assert.equal(focus.groupingPlan(data, '数学', { duration: 1 }).questions.length, 1);
focus.startAll(data, '数学'); focus.transition(data, focus.active(data).run.id, 'finish', { accuracy: '1/1', durationMinutes: '1' });
assert.equal(data.focusReview.groups[0].runs.length, 2);
// Exports retain ordinary templates and empty runs; existing deletion applies to quick materials too.
for (const name of ['learning-backup', 'learning-archive']) vm.runInContext(fs.readFileSync(path.join(__dirname, '../js/' + name + '.js'), 'utf8'), app.context);
const md = app.context.PocketLearningArchive.render(JSON.stringify(data));
assert.match(md, /> 学习状态：已完成/); assert.match(md, /\| 第3组 \| 13, 15-18 \| 4\/5 \| 6分钟 \|/);
const untouched = JSON.stringify(data.materials.slice(1)); app.context.PocketMaterialDeletion.remove(data, [id]);
assert.equal(JSON.stringify(data.materials), untouched); assert.equal(data.materials.some(m => m.id === id), false);
assert.equal(focus.allQuestions(data, '数学').length, 0);
// An ordinary unfinished task is never overwritten, even when saving directly without having completed today's review.
const running = seed(1); running.currentSession = { materialId: 'm1', currentStep: 'output', currentGroupIndex: 0, currentRunIndex: 0, mode: 'new' };
const task = JSON.stringify(running.currentSession), old = JSON.stringify(running.materials[0]);
app.context.PocketQuickMaterial.create(running, { subject: '数学', title: '直接录入', questionRange: '1-5', groupSize: '2' }, clock.now);
assert.equal(JSON.stringify(running.currentSession), task); assert.equal(JSON.stringify(running.materials[0]), old);
module.exports = (async () => {
  const backup = await app.context.PocketLearningBackup.create(); assert.equal((await app.context.PocketLearningBackup.verify(JSON.stringify(backup))).valid, true);
  const restored = boot({ location, clock, focusReview: true, store: new Map([[key, backup.rawState]]) });
  assert.equal(JSON.stringify(restored.state().materials), JSON.stringify(app.state().materials));
  assert.ok(restored.context.PocketDailyReverse.orderedIds(restored.state()).includes(id));
  console.log('PASS localhost quick create/preview, normal completed schema, no fake runs, reload, IDs, failure retry, existing tasks, queues, metrics/focus, archive/JSON and deletion.');
})();
