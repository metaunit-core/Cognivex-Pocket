'use strict';
const assert = require('node:assert/strict');
const { boot, seed } = require('./helpers/pocket-learning-ui.cjs');
const location = new URL('http://localhost:4173/'), key = 'pocket-development-v1:cognivex-pocket-state';
const initial = seed(1), setup = boot({ location, focusReview: true }), model = setup.context.PocketFocusReview;
initial.materials[0].groups[0].start = 1; initial.materials[0].groups[0].end = 4;
model.add(initial, 'm1', 0, '1、2、3、4');
for (let i = 0; i < 2; i++) model.create(initial, '数学', 2, model.available(initial, '数学').slice(0, 2).map(q => q.id));
const originals = JSON.stringify(initial.materials), groups = initial.focusReview.groups.map(g => g.id);
let app = boot({ location, store: new Map([[key, JSON.stringify(initial)]]), focusReview: true });
const walk = node => [node, ...node.children.flatMap(walk)];
const page = () => app.document.getElementById('focus-review');
const text = () => walk(page()).map(n => n.textContent).join('\n');
const click = label => { const n = walk(page()).find(n => n.tag === 'button' && n.textContent === label); assert.ok(n, label); n.fire('click'); };
const fill = (accuracy, duration) => {
  for (const [suffix, value] of [['accuracy', accuracy], ['duration', duration]]) {
    const n = app.document.getElementById('focus-group-latest-' + suffix); n.value = value; n.fire('input');
  }
};
const next = () => click('输出达标 → 下一步');
app.context.PocketFocusReviewUI.open({ subject: '数学' }); click('全部复习');
fill('1/2', '8');
assert.match(text(), /重点 Group 1 · 未完成 · 正确率：1\/2 · 用时：8分钟/);
assert.match(text(), /复习记录：0次/);
next();
assert.equal(app.state().focusReview.groups[0].runs.length, 0);
app = boot({ location, store: app.store, focusReview: true });
assert.equal(app.document.getElementById('focus-group-latest-accuracy').value, '1/2');
next(); // Group 1 settles before the whole round finishes.
let saved = app.state();
assert.equal(saved.focusReview.groups[0].runs.length, 1);
assert.equal(saved.focusReview.groups[0].runs[0].accuracy, '1/2');
assert.ok(Number.isFinite(saved.focusReview.groups[0].runs[0].completedAt));
assert.equal(saved.focusReview.allReviews[0].runs[0].completedAt, null);
assert.deepEqual(Array.from(model.groupingPlan(saved, '数学', { accuracy: 60 }).questions, q => q.number), [1, 2]);
fill('2/2', '5'); next(); next();
assert.deepEqual(app.state().focusReview.groups.map(g => [g.runs.length, g.runs[0].accuracy, g.runs[0].durationMinutes]), [[1, '1/2', '8'], [1, '2/2', '5']]);
assert.match(text(), /复习记录：1次/);
assert.match(text(), /重点 Group 1 · 已结束 · 正确率：1\/2 · 用时：8分钟 · 开始：.+ · 完成：/);
assert.match(text(), /重点 Group 2 · 已结束 · 正确率：2\/2 · 用时：5分钟 · 开始：.+ · 完成：/);
app = boot({ location, store: app.store, focusReview: true });
app.context.PocketFocusReviewUI.open({ subject: '数学', focusGroup: groups[0] }); click('复习');
fill('2/2', '0'); next();
assert.match(text(), /重点 Group 1/);
assert.match(text(), /复习记录：1次/); // Draft is not a completed review.
const oldHistory = JSON.stringify(app.state().focusReview.groups[0].runs[0]);
next();
saved = app.state();
assert.equal(saved.focusReview.groups[0].runs.length, 2);
assert.equal(JSON.stringify(saved.focusReview.groups[0].runs[0]), oldHistory);
assert.equal(JSON.stringify(saved.materials), originals);
assert.equal(model.groupingPlan(saved, '数学', { accuracy: 60 }).questions.length, 0);
assert.match(text(), /复习记录：2次/);
// Numeric zero is a valid model input too; it must survive normalization.
model.start(saved, groups[1]);
model.transition(saved, model.active(saved).run.id, 'save', { accuracy: '0/2', durationMinutes: 0 });
assert.equal(model.metricRecord(saved).durationMinutes, '0');
console.log('PASS localhost Group drafts, independent settlement/timestamps, reload, latest-completed filters, counts, history preservation and zero duration.');
