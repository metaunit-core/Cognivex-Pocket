'use strict';
const assert = require('node:assert/strict');
const { boot, seed } = require('./helpers/pocket-learning-ui.cjs');
const MAIN = 'cognivex-pocket-state';
const clock = { now: new Date(2026, 9, 18, 9).getTime() };
function setup(count, unlocked = true, change = () => {}) {
  const initial = seed(count);
  require('./helpers/original-learning-fixture.cjs')(initial, clock.now);
  if (unlocked) initial.review.unlock = { generation: 0, usedAt: null,
    collectionKey: JSON.stringify(initial.materials.map(m => JSON.stringify([m.id, m.groups[0].id])).sort()) };
  change(initial);
  const ui = boot({ store: new Map([[MAIN, JSON.stringify(initial)]]), clock });
  const learning = ui.context.PocketLearning;
  let calls = 0;
  ui.context.PocketLearning = { ...learning, startNewMaterial() {
    calls++;
    assert.equal(ui.context.PocketDailyReverse.complete(ui.state().dailyReverseReview.round, ui.context.PocketDailyReverse.day()), true);
    return learning.startNewMaterial();
  } };
  ui.document.getElementById('daily-reverse-review-entry').fire('click');
  return { ui, calls: () => calls };
}
function finish(ui) {
  const round = ui.state().dailyReverseReview.round;
  ui.button('\u8f93\u51fa\u8fbe\u6807 \u2192 \u4e0b\u4e00\u6b65').fire('click');
}
// Arbitrary count and IDs: a daily round follows saved order, not names or IDs.
const run = setup(4, true, state => {
  ['zebra', 'id-100', 'alpha', 'uuid-newest'].forEach((id, i) => { state.materials[i].id = id; });
  state.review.unlock.collectionKey = JSON.stringify(state.materials.map(m => JSON.stringify([m.id, m.groups[0].id])).sort());
});
const expected = ['zebra', 'id-100', 'alpha', 'uuid-newest'];
assert.deepEqual(run.ui.state().dailyReverseReview.round.ids, expected);
const originalMaterials = structuredClone(run.ui.state().materials), originalReview = structuredClone(run.ui.state().review);
for (let index = 0; index < expected.length; index++) {
  assert.equal(run.ui.context.PocketDailyReverse.current(run.ui.state()).id, expected[index]);
  finish(run.ui);
  assert.equal(run.calls(), index === expected.length - 1 ? 1 : 0);
}
assert.equal(run.ui.nodes['learning-heading'].textContent, '新资料');
assert.equal(run.ui.context.PocketNavigation.pocket().page, 'learning');
assert.equal(run.ui.state().materials.length, 4); // No material is created automatically.
assert.deepEqual(run.ui.state().materials, originalMaterials);
assert.deepEqual(run.ui.state().review, originalReview);
for (const [id, value] of [['subject', '物理'], ['title', '待填写的新资料']]) {
  const input = run.ui.content().find(node => node.id === id);
  assert.ok(input && !input.disabled); input.value = value; input.fire('input');
}
assert.equal(run.ui.state().currentSession.draft.title, '待填写的新资料');
run.ui.content().find(node => node.tag === 'form').fire('submit');
assert.equal(run.ui.nodes['learning-heading'].textContent, '分组设置');
assert.ok(run.ui.content().find(node => node.id === 'question-range'));
assert.ok(run.ui.content().find(node => node.id === 'group-size'));
const reloaded = boot({ store: run.ui.store, clock });
assert.equal(reloaded.context.PocketDailyReverse.needsReview(reloaded.state()), false);
assert.equal(reloaded.state().currentSession.draft.title, '待填写的新资料');
const manualStore = new Map(run.ui.store);
manualStore.set('pocket-last-view-v1', JSON.stringify({ page: 'learned-content' }));
const manual = boot({ store: manualStore, clock }), manualBefore = manual.state();
manual.button('新增资料 →').fire('click');
assert.equal(manual.nodes['learning-heading'].textContent, '分组设置');
assert.deepEqual(manual.state().currentSession, manualBefore.currentSession); // Reopen, do not replace the draft.
// Legacy ordering remains stable for any count, irrespective of names/timestamps/updates.
for (const count of [1, 3, 12]) {
  const state = seed(count), daily = run.ui.context.PocketDailyReverse;
  const ids = state.materials.map(m => m.id);
  daily.start(state, clock.now);
  assert.deepEqual(Array.from(state.dailyReverseReview.round.ids), ids);
  state.materials.forEach((m, i) => { m.title = 'reversed-' + (count - i); m.completedAt = count - i; m.groups[0].latestAccuracyPercent = i; });
  daily.start(state, clock.now);
  assert.deepEqual(Array.from(state.dailyReverseReview.round.ids), ids);
}
// Original review gate and unfinished VIDEO/OUTPUT/group session remain intact.
for (const busy of [false, true]) {
  const blocked = setup(1, busy, state => {
    if (busy) state.currentSession = { materialId: 'm1', mode: 'new', currentStep: 'output', currentGroupIndex: 0, currentRunIndex: 0 };
  });
  const before = blocked.ui.state(); finish(blocked.ui);
  assert.equal(blocked.calls(), 1);
  assert.equal(blocked.ui.context.PocketNavigation.pocket().page, 'new-material-locked');
  assert.equal(blocked.ui.nodes['learning-heading'].textContent, '新资料');
  assert.ok(blocked.ui.content().some(node => node.id === 'subject'));
  for (const [id, value] of [['subject', '数学'], ['title', '不能绕过限制']]) {
    const input = blocked.ui.content().find(node => node.id === id); input.value = value; input.fire('input');
  }
  blocked.ui.content().find(node => node.tag === 'form').fire('submit');
  for (const [id, value] of [['question-range', '1-10'], ['group-size', '5']]) {
    const input = blocked.ui.content().find(node => node.id === id); input.value = value; input.fire('input');
  }
  blocked.ui.content().find(node => node.tag === 'form').fire('submit');
  assert.match(blocked.ui.nodes.message.textContent, /请先完成已学内容的资料间倒序复习|已有未完成/);
  assert.deepEqual(blocked.ui.state().currentSession, before.currentSession);
  assert.deepEqual(blocked.ui.state().materials, before.materials);
  assert.deepEqual(blocked.ui.state().review, before.review);
  assert.equal(blocked.ui.context.PocketDailyReverse.needsReview(blocked.ui.state()), false);
  const reopened = boot({ store: blocked.ui.store, clock });
  assert.equal(reopened.context.PocketDailyReverse.needsReview(reopened.state()), false);
  assert.equal(reopened.nodes['learning-heading'].textContent, '新资料');
  assert.deepEqual(reopened.state().currentSession, before.currentSession);
  const manualBlockedStore = new Map(blocked.ui.store);
  manualBlockedStore.set('pocket-last-view-v1', JSON.stringify({ page: 'learned-content' }));
  const manualBlocked = boot({ store: manualBlockedStore, clock });
  manualBlocked.button('新增资料 →').fire('click');
  assert.equal(manualBlocked.nodes['learning-heading'].textContent, '新资料');
  assert.deepEqual(manualBlocked.state().currentSession, before.currentSession);
  if (!busy) {
    const permitted = blocked.ui.state();
    permitted.review.unlock = { generation: permitted.review.generation || 0, usedAt: null,
      collectionKey: manualBlocked.context.PocketMaterialReview.collectionKey(permitted) };
    const allowed = boot({ store: new Map([[MAIN, JSON.stringify(permitted)], ['pocket-last-view-v1', JSON.stringify({ page: 'new-material-locked' })]]), clock });
    for (const [id, value] of [['subject', '物理'], ['title', '条件满足后创建']]) {
      const input = allowed.content().find(node => node.id === id); input.value = value; input.fire('input');
    }
    allowed.content().find(node => node.tag === 'form').fire('submit');
    for (const [id, value] of [['question-range', '1-10'], ['group-size', '5']]) {
      const input = allowed.content().find(node => node.id === id); input.value = value; input.fire('input');
    }
    allowed.content().find(node => node.tag === 'form').fire('submit');
    assert.equal(allowed.state().materials.length, 2);
    assert.equal(allowed.state().materials[1].title, '条件满足后创建');
    assert.deepEqual(allowed.state().materials[0], before.materials[0]);
  }
}
const failed = setup(1);
failed.ui.fail.enabled = true; finish(failed.ui); failed.ui.fail.enabled = false;
assert.equal(failed.calls(), 0); assert.equal(failed.ui.state().dailyReverseReview.round.index, 0);
// Failure to open the existing destination cannot roll back daily completion.
failed.ui.context.PocketLearning = { startNewMaterial() { throw Error('Navigation unavailable'); } };
finish(failed.ui);
assert.equal(failed.ui.context.PocketDailyReverse.needsReview(failed.ui.state()), false);
assert.match(failed.ui.nodes.message.textContent, /已完成并保存.*Navigation unavailable/);
const afterFailure = boot({ store: failed.ui.store, clock });
assert.equal(afterFailure.state().currentSession, null); // Refresh does not re-trigger navigation.
assert.equal(afterFailure.context.PocketDailyReverse.needsReview(afterFailure.state()), false);
afterFailure.context.PocketLearning.resume();
assert.equal(afterFailure.state().currentSession, null);
// Showing an ordinary completed review never enters the new-material flow.
const ordinary = seed(1);
ordinary.activeSessionType = 'material-review';
ordinary.materialReviewSession = { sessionType: 'material-review', materialIds: ['m1'], currentStep: 'queueComplete', queueVersion: 2, materialId: 'm1', currentGroupIndex: 0,
  currentRunIndex: 0, queue: [], completedMaterials: ['m1'], completedGroupCount: 1 };
const normal = boot({ store: new Map([[MAIN, JSON.stringify(ordinary)]]), clock });
normal.context.PocketLearning.resume();
assert.equal(normal.state().currentSession, null);
assert.equal(normal.state().dailyReverseReview?.round, undefined);
assert.equal(normal.state().materialReviewSession.currentStep, 'queueComplete');
assert.ok(normal.content().some(node => node.textContent === '✓ 本轮复习全部完成'));
console.log('PASS daily completion saves before existing navigation, editable form/grouping, independent gates, failed save/navigation, refresh, arbitrary stable saved order and no automatic material creation');
