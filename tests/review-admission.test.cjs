'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { boot, seed } = require('./helpers/pocket-learning-ui.cjs');
const key = 'pocket-development-v1:cognivex-pocket-state';
const today = new Date(2026, 9, 21, 9).getTime(), tomorrow = new Date(2026, 9, 22, 9).getTime();
const plain = value => JSON.parse(JSON.stringify(value));
function setup(state = seed(2), clock = { now: today }) {
  return boot({ store: new Map([[key, JSON.stringify(state)]]), clock, location: new URL('http://localhost:4173/'), focusReview: true });
}
function finishFocus(model, state, at) {
  model.add(state, 'm1', 0, '1');
  const ids = model.available(state, '数学').map(question => question.id), id = model.create(state, '数学', 1, ids);
  model.start(state, id, at);
  const runId = model.active(state).run.id;
  model.transition(state, runId, 'videoSkip', {}, at + 1);
  model.transition(state, runId, 'finish', { accuracy: '1/1' }, at + 2);
  return id;
}
function finishDaily(daily, state, at) {
  daily.start(state, at);
  let tick = at;
  while (daily.task(state, tick)) {
    const active = daily.task(state, tick), round = active.round;
    daily.transition(state, 'outputDone', { roundId: round.id, index: round.index, materialId: active.material.id,
      taskIndex: round.taskIndex, currentGroupIndex: active.groupIndex }, ++tick);
  }
}
module.exports = (async () => {
  const app = setup(), admission = app.context.PocketReviewAdmission, daily = app.context.PocketDailyReverse, focus = app.context.PocketFocusReview;
  const state = app.state(), originalMaterials = JSON.stringify(state.materials);
  assert.equal(admission.status(state, today).unlocked, false);
  assert.throws(() => daily.assertCanCreate(state, today), /正序复习/);
  admission.markClicked(state, 'daily', today); daily.markClicked(state, today);
  assert.equal(admission.status(state, today).unlocked, false);
  admission.markClicked(state, 'focus', today + 1);
  assert.equal(admission.status(state, today).unlocked, false);
  assert.throws(() => focus.start(state, 'missing'), /不存在/);
  assert.equal(admission.status(state, today).focusCompleted, false);
  const firstGroup = finishFocus(focus, state, today + 10);
  assert.equal(admission.status(state, today).focusCompleted, true);
  assert.equal(admission.status(state, today).focusCompletedAt, today + 12);
  assert.equal(daily.needsReview(state, today), true, 'focus admission must not mark daily tasks complete');
  assert.doesNotThrow(() => daily.assertCanCreate(state, today));
  state.review.unlock = { generation: state.review.generation || 0, usedAt: null,
    collectionKey: JSON.stringify(state.materials.flatMap(material => material.groups.map(group => JSON.stringify([material.id, group.id]))).sort()) };
  assert.equal(app.context.PocketMaterialReview.canCreate(state), true, 'the downstream material gate must also accept focus qualification');
  const gateApp = setup(state);
  assert.equal(gateApp.context.PocketLearning.startNewMaterial(), true);
  assert.equal(gateApp.state().currentSession.currentStep, 'basic');
  const blockedOtherGate = plain(state); blockedOtherGate.review.unlock.usedAt = today;
  assert.equal(app.context.PocketMaterialReview.canCreate(blockedOtherGate), false, 'the original reverse-review grant must still be required');
  assert.equal(JSON.stringify(state.materials), originalMaterials);
  const qualified = JSON.stringify(state.reviewAdmission.focus);
  const questionId = focus.root(state).questions[0].id;
  focus.setStatus(state, questionId, 'mastered'); focus.retire(state, firstGroup);
  for (const id of ['additional', 'additional-again']) {
    state.materials.push({ ...plain(state.materials[1]), id, groups: [] });
    daily.recordSavedMaterial(state);
    assert.doesNotThrow(() => daily.assertCanCreate(state, today));
  }
  assert.equal(JSON.stringify(state.reviewAdmission.focus), qualified);
  assert.equal(admission.status(state, today).unlocked, true);
  admission.markClicked(state, 'daily', today + 20);
  assert.equal(admission.status(state, today).lastClicked.system, 'daily');
  assert.equal(admission.status(state, today).focusCompleted, true);
  state.materials.splice(-2);
  finishDaily(daily, state, today + 30);
  assert.equal(admission.status(state, today).dailyCompleted, true);
  assert.equal(admission.status(state, today).focusCompleted, true);
  assert.equal(admission.lines(state, today)[1], '今日完成：每日正序复习、重点复习系统');
  const historyBefore = JSON.stringify(state.reviewAdmission);
  assert.equal(admission.status(state, tomorrow).unlocked, false);
  assert.throws(() => daily.assertCanCreate(state, tomorrow), /正序复习/);
  assert.equal(JSON.stringify(state.reviewAdmission), historyBefore);
  const oldState = seed(1);
  oldState.dailyReverseReview = { version: 1, saveOrder: ['m1'], history: [], round: {
    id: 'old-round', day: daily.day(today), ids: ['m1'], index: 1, completedIds: ['m1'], startedAt: today - 100, completedAt: today
  } };
  assert.equal(admission.status(oldState, today).dailyCompleted, true);
  assert.doesNotThrow(() => daily.assertCanCreate(oldState, today));
  assert.equal(oldState.reviewAdmission, undefined, 'legacy recognition must not migrate or rewrite data');
  const dailyOnly = seed(1); finishDaily(daily, dailyOnly, today);
  assert.equal(admission.status(dailyOnly, today).unlocked, true);
  assert.equal(admission.status(dailyOnly, today).focusCompleted, false);
  const emptyAfterStart = seed(1);
  focus.add(emptyAfterStart, 'm1', 0, '1');
  const emptyGroup = focus.create(emptyAfterStart, '数学', 1, focus.available(emptyAfterStart, '数学').map(question => question.id));
  focus.start(emptyAfterStart, emptyGroup, today); const emptyRun = focus.active(emptyAfterStart).run.id;
  focus.setStatus(emptyAfterStart, focus.root(emptyAfterStart).questions[0].id, 'removed');
  focus.transition(emptyAfterStart, emptyRun, 'videoSkip', {}, today + 1); focus.transition(emptyAfterStart, emptyRun, 'finish', {}, today + 2);
  assert.equal(admission.status(emptyAfterStart, today).unlocked, false);
  app.context.PocketLearning.showHome();
  const entry = () => app.all().find(node => node.tag === 'button' && node.textContent === '重点复习系统');
  entry().fire('click');
  assert.equal(app.state().reviewAdmission.lastClicked.system, 'focus');
  assert.equal(admission.status(app.state(), today).unlocked, false);
  const clickAt = app.state().reviewAdmission.lastClicked.at;
  const reopened = boot({ store: app.store, clock: { now: today + 500 }, location: new URL('http://localhost:4173/'), focusReview: true });
  assert.equal(reopened.state().reviewAdmission.lastClicked.at, clickAt, 'automatic page restore must not count as an entrance');
  reopened.context.PocketLearning.showHome();
  reopened.document.getElementById('daily-reverse-review-entry').fire('click');
  assert.equal(reopened.state().reviewAdmission.lastClicked.system, 'daily');
  assert.equal(admission.status(reopened.state(), today).focusCompleted, false);
  const preserved = setup(state);
  assert.equal(preserved.context.PocketReviewAdmission.status(preserved.state()).unlocked, true);
  const renderedLines = preserved.document.getElementById('review-admission-status').children.map(node => node.textContent);
  assert.equal(renderedLines[0], '最近：正序复习全部');
  assert.equal(renderedLines.length, 1, 'completion and admission stay recorded but are not displayed on home');
  vm.runInContext(fs.readFileSync(path.join(__dirname, '../js/learning-backup.js'), 'utf8'), preserved.context);
  const backup = await preserved.context.PocketLearningBackup.create();
  assert.equal((await preserved.context.PocketLearningBackup.verify(JSON.stringify(backup))).valid, true);
  assert.equal(JSON.stringify(JSON.parse(backup.rawState).reviewAdmission), JSON.stringify(state.reviewAdmission));
  const switched = boot({ store: preserved.store, clock: { now: tomorrow }, location: new URL('http://localhost:4173/'), focusReview: true });
  assert.equal(switched.context.PocketReviewAdmission.status(switched.state()).unlocked, false);
  assert.equal(JSON.stringify(switched.state().reviewAdmission), historyBefore);
  console.log('PASS: daily OR valid focus admission, no click/empty-task unlock, independent timestamps and histories, sticky same-day qualification, local midnight, legacy daily completion, actual entrance vs restore, restart and JSON persistence.');
})().catch(error => { console.error(error); process.exitCode = 1; });
