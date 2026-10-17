'use strict';
const assert = require('node:assert/strict');
const { boot, seed } = require('./helpers/pocket-learning-ui.cjs');
const initial = seed(5), clock = { now: new Date(2026, 9, 18, 9).getTime() };
initial.materials.forEach((m, i) => {
  m.id = ['A', 'B', 'C', 'D', 'E'][i];
  m.groups.push({ ...structuredClone(m.groups[0]), id: 'extra-' + i, start: 20, end: 25, addedToReviewAt: 100 - i });
});
const ui = boot({ store: new Map([['cognivex-pocket-state', JSON.stringify(initial)]]), clock });
const daily = ui.context.PocketDailyReverse, original = ui.context.PocketMaterialReview;
const state = ui.state();
daily.start(state, clock.now);
assert.deepEqual(Array.from(state.dailyReverseReview.round.ids), ['A', 'B', 'C', 'D', 'E']);
assert.equal(state.dailyReverseReview.round.order, 'oldest-first');
const dailyBefore = JSON.stringify(state.dailyReverseReview);
original.open(state);
assert.deepEqual(Array.from(state.materialReviewSession.materialIds), ['E', 'D', 'C', 'B', 'A']);
assert.deepEqual(Array.from(state.materialReviewSession.queue, q => [q.materialId, q.groupIndex]),
  ['E', 'D', 'C', 'B', 'A'].flatMap(id => [[id, 0], [id, 1]]));
assert.equal(JSON.stringify(state.dailyReverseReview), dailyBefore);
const fixedOriginal = JSON.stringify(state.materialReviewSession.queue);
const fixedDaily = JSON.stringify(state.dailyReverseReview.round.tasks);
state.materials.forEach(m => { m.title = 'renamed-' + m.id; m.completedAt = 999999; m.groups[0].latestAccuracyPercent = 99; });
state.materials.reverse();
original.open(state); daily.start(state, clock.now);
assert.equal(JSON.stringify(state.materialReviewSession.queue), fixedOriginal);
assert.equal(JSON.stringify(state.dailyReverseReview.round.tasks), fixedDaily);
assert.deepEqual(Array.from(daily.orderedIds(state)), ['A', 'B', 'C', 'D', 'E']);
assert.deepEqual(Array.from(new Set(original.groups(state).map(g => g.materialId))), ['E', 'D', 'C', 'B', 'A']);
// Previously saved reverse rounds continue exactly; completed rounds stay complete.
const legacy = seed(3);
legacy.dailyReverseReview = { version: 1, saveOrder: ['m1', 'm2', 'm3'], history: [], round: {
  id: 'old-saved-round', day: daily.day(clock.now), ids: ['m3', 'm2', 'm1'], index: 1, completedIds: ['m3'], startedAt: clock.now, completedAt: null } };
daily.start(legacy, clock.now);
assert.deepEqual(legacy.dailyReverseReview.round.ids, ['m3', 'm2', 'm1']);
assert.deepEqual(legacy.dailyReverseReview.round.completedIds, ['m3']);
assert.deepEqual(Array.from(legacy.dailyReverseReview.round.tasks, t => t.materialId), ['m2', 'm1']);
const active = JSON.stringify(legacy.dailyReverseReview.round);
const resumed = JSON.parse(JSON.stringify(legacy)); daily.start(resumed, clock.now);
assert.equal(JSON.stringify(resumed.dailyReverseReview.round), active);
const nextDay = clock.now + 86400000;
daily.start(legacy, nextDay);
assert.deepEqual(Array.from(legacy.dailyReverseReview.round.ids), ['m1', 'm2', 'm3']);
assert.equal(JSON.stringify(legacy.dailyReverseReview.history[0]), active);
const completed = seed(1);
completed.dailyReverseReview = { version: 1, saveOrder: ['m1'], history: [], round: {
  id: 'old-completed', day: daily.day(clock.now), ids: ['m1'], index: 1, completedIds: ['m1'], startedAt: clock.now, completedAt: clock.now } };
const before = JSON.stringify(completed); daily.start(completed, clock.now);
assert.equal(JSON.stringify(completed), before); assert.equal(daily.needsReview(completed, clock.now), false);
console.log('PASS A→E daily and E→A original with unchanged intra-material Groups, stable rename/order, independent fixed queues, legacy reverse resume/history/completion and next-day forward order');
