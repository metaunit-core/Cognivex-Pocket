'use strict';
const assert = require('node:assert/strict');
const { boot, seed } = require('./helpers/pocket-learning-ui.cjs');
const MAIN = 'cognivex-pocket-state', clock = { now: new Date(2026, 9, 18, 9).getTime() };
const initial = seed(2);
initial.materials.forEach((m, i) => {
  m.groups = Array.from({ length: i ? 3 : 2 }, (_, g) => ({ ...structuredClone(m.groups[0]), id: m.id + '-group-' + g, start: g * 5 + 1, end: g * 5 + 5 }));
});
initial.currentSession = { materialId: 'm1', currentGroupIndex: 0, currentRunIndex: 0, currentStep: 'output', mode: 'new' };
let ui = boot({ store: new Map([[MAIN, JSON.stringify(initial)]]), clock });
const outside = state => { const value = structuredClone(state); delete value.dailyReverseReview; return value; };
const original = outside(ui.state());
ui.document.getElementById('daily-reverse-review-entry').fire('click');
assert.equal(ui.state().dailyReverseReview.round.tasks.length, 5);
assert.deepEqual(ui.state().dailyReverseReview.round.ids, ['m1', 'm2']);
assert.equal(ui.content().some(n => /确认完成今日倒序|已完成本份资料/.test(n.textContent)), false);
const seen = [];
for (let index = 0; index < 5; index++) {
  const active = ui.context.PocketDailyReverse.task(ui.state());
  seen.push([active.material.id, active.groupIndex]);
  assert.ok(ui.document.getElementById('group-key-questions'));
  assert.ok(ui.document.getElementById('group-latest-accuracy'));
  assert.ok(ui.document.getElementById('group-latest-duration'));
  if (index === 0) {
    const accuracy = ui.document.getElementById('group-latest-accuracy'); accuracy.value = '4/5'; accuracy.fire('input');
    original.materials[0].groups[0].latestAccuracyPercent = 80;
    original.materials[0].groups[0].latestAccuracyRatio = '4/5';
    assert.deepEqual(outside(ui.state()), original);
    assert.equal(ui.state().dailyReverseReview.round.taskIndex, 0);
  }
  assert.ok(ui.content().some(n => n.className === 'question-range' && n.textContent === (active.groupIndex * 5 + 1) + '-' + (active.groupIndex * 5 + 5)));
  assert.equal(ui.state().dailyReverseReview.round.index, index < 2 ? 0 : 1);
  const state = ui.state(), beforeSkip = JSON.stringify(state.dailyReverseReview);
  assert.equal(ui.context.PocketDailyReverse.finish(state, {
    roundId: state.dailyReverseReview.round.id, materialId: active.material.id, index: state.dailyReverseReview.round.index }), false);
  assert.equal(JSON.stringify(state.dailyReverseReview), beforeSkip); // A material-only token cannot skip groups.
  if (index === 1) {
    ui.button('视频').fire('click');
    assert.ok(ui.button('← 返回 OUTPUT'));
    const saved = JSON.stringify(ui.state().dailyReverseReview);
    ui = boot({ store: ui.store, clock });
    assert.ok(ui.button('← 返回 OUTPUT'));
    assert.equal(JSON.stringify(ui.state().dailyReverseReview), saved);
    ui.button('← 返回 OUTPUT').fire('click');
    ui.button('输出').fire('click');
    assert.ok(ui.content().some(n => n.className === 'output-entries'));
  }
  const done = ui.button('输出达标 → 下一步');
  if (index === 2) {
    ui.fail.enabled = true; done.fire('click'); ui.fail.enabled = false;
    assert.equal(ui.state().dailyReverseReview.round.taskIndex, index);
  }
  done.fire('click'); done.fire('click'); // Detached events must not complete another group.
  assert.equal(ui.state().dailyReverseReview.round.taskIndex, index + 1);
  assert.deepEqual(outside(ui.state()), original); // No original run, queue, learning/history mutation.
}
assert.deepEqual(seen, [['m1', 0], ['m1', 1], ['m2', 0], ['m2', 1], ['m2', 2]]);
assert.equal(ui.context.PocketDailyReverse.needsReview(ui.state()), false);
assert.equal(ui.nodes['learning-heading'].textContent, '新资料');
assert.equal(ui.state().materials.length, 2);
assert.equal(ui.state().dailyReverseReview.round.tasks.every(t => t.status === 'completed' && t.run.outputCompleted), true);
// Missing/reordered groups use stable IDs; changed or missing ranges cannot be skipped.
const current = seed(1), daily = ui.context.PocketDailyReverse;
daily.start(current, clock.now);
current.materials[0].groups[0].end++;
assert.throws(() => daily.task(current), /范围已变化/);
// Existing in-progress material-only rounds are retained and expanded only on explicit continue.
const legacy = seed(2);
legacy.dailyReverseReview = { version: 1, saveOrder: ['m1', 'm2'], history: [], round: {
  id: 'legacy', day: daily.day(), ids: ['m2', 'm1'], index: 1, completedIds: ['m2'], startedAt: clock.now, completedAt: null } };
daily.start(legacy, clock.now);
assert.deepEqual(legacy.dailyReverseReview.round.completedIds, ['m2']);
assert.equal(legacy.dailyReverseReview.round.tasks.length, 1);
assert.equal(legacy.dailyReverseReview.round.tasks[0].materialId, 'm1');
const ordered = seed(1);
ordered.materials[0].groups = [30, 10, 20].map((time, i) => ({ ...structuredClone(ordered.materials[0].groups[0]), id: 'order-' + i, addedToReviewAt: time }));
daily.start(ordered, clock.now);
assert.deepEqual(Array.from(ordered.dailyReverseReview.round.tasks, t => t.groupIndex), [1, 2, 0]); // Reuse the original pure Group ordering.
console.log('PASS shared real review UI, all 5 groups in material reverse order, no material skip, VIDEO/OUTPUT restore, failed saves/stale events, separate runs and original state, range guard and non-destructive legacy continuation');
