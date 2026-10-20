'use strict';
const assert = require('node:assert/strict');
const { boot, seed } = require('./helpers/pocket-learning-ui.cjs');
const MAIN = 'cognivex-pocket-state';
const positionOf = ui => { const view = ui.context.PocketNavigation.pocket(); return JSON.stringify([view.page, view.outputPage, view.context]); };
for (const originalReview of [false, true]) {
  const initial = seed(2), clock = { now: new Date(2026, 9, 18, 9).getTime() };
  initial.currentSession = { materialId: 'm1', currentGroupIndex: 0, currentRunIndex: 0, currentStep: 'output', mode: 'new' };
  if (originalReview) {
    initial.materials[0].groups[0].runs.push({ mode: 'material-review', startedAt: 10, completedAt: null,
      outputCompleted: false, videoSkipped: true, reviewRoundId: 'original-round' });
    initial.activeSessionType = 'material-review';
    initial.materialReviewSession = { sessionType: 'material-review', queueVersion: 2, roundId: 'original-round',
      materialIds: ['m1'], materialId: 'm1', currentMaterialIndex: 0, currentQueueIndex: 0,
      completedGroupCount: 0, completedMaterials: [], currentGroupIndex: 0, currentRunIndex: 1,
      currentStep: 'output', mode: 'material-review', queue: [{ materialId: 'm1', groupId: 'g1', runIndex: 1, startedAt: 10, status: 'pending' }] };
  }
  const store = new Map([[MAIN, JSON.stringify(initial)]]);
  let ui = boot({ store, clock });
  const durable = store.get(MAIN);
  ui.button('视频').fire('click');
  const video = ui.button('← 返回 OUTPUT');
  const position = positionOf(ui);
  ui.fire('pagehide');
  clock.now = new Date(2026, 9, 19, 9).getTime();
  for (const event of ['focus', 'pageshow', 'visibilitychange']) ui.fire(event);
  assert.equal(ui.button('← 返回 OUTPUT'), video); // No automatic rerender of the active task.
  assert.equal(store.get(MAIN), durable);
  assert.equal(positionOf(ui), position);
  ui = boot({ store, clock });
  assert.ok(ui.button('← 返回 OUTPUT'));
  assert.equal(store.get(MAIN), durable);
  assert.equal(positionOf(ui), position);
  assert.equal(ui.state().dailyReverseReview, undefined);
  ui.button('← 返回 OUTPUT').fire('click');
  assert.ok(ui.button('输出达标 → 下一步')); // Existing learning can continue without a daily round.
  ui.context.PocketLearning.startNewMaterial();
  assert.match(ui.nodes.message.textContent, /请先完成今日正序复习，再新增资料/);
  assert.equal(ui.context.PocketNavigation.pocket().page, 'new-material-locked');
  assert.equal(Boolean(ui.document.getElementById('learned-material-details')?.open), false);
  assert.equal(ui.state().dailyReverseReview, undefined); // Gate navigates only, no automatic start.
  assert.equal(store.get(MAIN), durable);
  const outsideDaily = state => { const next = structuredClone(state); delete next.dailyReverseReview; return next; };
  const prior = outsideDaily(ui.state());
  ui.document.getElementById('daily-reverse-review-entry').fire('click');
  assert.deepEqual(ui.state().dailyReverseReview.round.ids, ['m1', 'm2']);
  ui.button('\u8f93\u51fa\u8fbe\u6807 \u2192 \u4e0b\u4e00\u6b65').fire('click');
  assert.deepEqual(outsideDaily(ui.state()), prior);
  ui.context.PocketLearning.resume();
  assert.ok(ui.button('输出达标 → 下一步'));
  assert.equal(ui.context.PocketDailyReverse.needsReview(ui.state()), true);
  ui.document.getElementById('daily-reverse-review-entry').fire('click');
  assert.equal(ui.state().dailyReverseReview.round.index, 1);
  ui.button('\u8f93\u51fa\u8fbe\u6807 \u2192 \u4e0b\u4e00\u6b65').fire('click');
  assert.equal(ui.context.PocketDailyReverse.needsReview(ui.state()), false);
  assert.equal(ui.nodes['learning-heading'].textContent, '新资料');
  assert.deepEqual(outsideDaily(ui.state()), prior); // Daily completion never completes the original queue or changes learning.
  ui.context.PocketLearning.startNewMaterial();
  assert.equal(ui.nodes['learning-heading'].textContent, '新资料');
  assert.equal(ui.context.PocketDailyReverse.needsReview(ui.state()), false);
  const completed = JSON.stringify(ui.state().dailyReverseReview);
  clock.now = new Date(2026, 9, 20, 9).getTime();
  const page = JSON.stringify(ui.context.PocketNavigation.pocket());
  ui.fire('focus'); ui.fire('pageshow'); ui.fire('visibilitychange');
  assert.equal(JSON.stringify(ui.context.PocketNavigation.pocket()), page);
  assert.equal(JSON.stringify(ui.state().dailyReverseReview), completed);
  assert.equal(ui.context.PocketDailyReverse.needsReview(ui.state()), true);
  ui.context.PocketLearning.startNewMaterial();
  assert.match(ui.nodes.message.textContent, /请先完成今日正序复习/);
  assert.deepEqual(outsideDaily(ui.state()), prior);
  if (originalReview) {
    ui.context.PocketLearning.resume();
    ui.button('输出达标 → 下一步').fire('click');
    assert.equal(ui.state().materialReviewSession.currentStep, 'queueComplete');
    assert.equal(JSON.stringify(ui.state().dailyReverseReview), completed);
    assert.equal(ui.context.PocketDailyReverse.needsReview(ui.state()), true); // Original completion cannot complete today's daily round.
  }
}
console.log('PASS cross-day main/original-review VIDEO and OUTPUT restore, passive lifecycle preserves DOM/data, creation-only daily guidance, explicit stable round, independent completion and next-day gating');
