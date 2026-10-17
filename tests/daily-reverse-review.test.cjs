'use strict';
const assert = require('node:assert/strict'), fs = require('node:fs'), vm = require('node:vm');
const { local, bind } = require('./helpers/pocket-cloud-fixture.cjs');
const { fenced } = require('./helpers/pocket-generation-fixture.cjs');
const { seed } = require('./helpers/pocket-learning-ui.cjs');
const MAIN = 'cognivex-pocket-state';
(async () => {
  const cloud = fenced(); cloud.rotate('daily-test-cycle-00001'); const d = local(cloud, seed());
  for (const name of ['history','daily-reverse-review','grouping','scheduler','executor','material-review']) vm.runInContext(fs.readFileSync('js/' + name + '.js', 'utf8'), d.context);
  const daily = d.context.PocketDailyReverse, storage = d.context.PocketStorage, review = d.context.PocketMaterialReview;
  const at = new Date(2026, 9, 18, 9).getTime(), tomorrow = new Date(2026, 9, 19, 9).getTime();
  let state = storage.loadState();
  const untouched = JSON.stringify(state);
  assert.equal(daily.needsReview(state, at), true); assert.equal(daily.shouldPrompt(state, at), true);
  assert.equal(JSON.stringify(state), untouched); // Read-only checks do not migrate data.
  state = storage.updateState(state, next => daily.markPrompted(next, at));
  assert.equal(daily.shouldPrompt(state, at), false);
  state = storage.updateState(state, next => daily.start(next, at));
  const expected = [9,8,7,6,5,4,3,2,1].map(n => 'm' + n);
  assert.deepEqual(Array.from(state.dailyReverseReview.round.ids), expected);
  const original = structuredClone(state); delete original.dailyReverseReview;
  const seen = [];
  for (let index = 0; index < 9; index++) {
    const id = daily.current(state, at).id; seen.push(id);
    const token = { roundId: state.dailyReverseReview.round.id, index, materialId: id };
    if (index === 2) {
      state = JSON.parse(JSON.stringify(state)); daily.start(state, at); // Reopen must resume.
      assert.equal(daily.current(state, at).id, 'm7'); assert.equal(daily.needsReview(state, at), true);
    }
    state = storage.updateState(state, next => daily.finish(next, token, at + index + 1));
    assert.equal(daily.finish(state, token, at + index + 2), false); // Stale completion cannot double advance.
    const rest = structuredClone(state); delete rest.dailyReverseReview; assert.deepEqual(rest, original);
  }
  assert.deepEqual(seen, expected); assert.equal(daily.needsReview(state, at), false);
  assert.equal(review.canCreate(state), false); // Original gate remains independent.
  const currentRound = JSON.stringify(state.dailyReverseReview.round); daily.start(state, at); assert.equal(JSON.stringify(state.dailyReverseReview.round), currentRound);
  state = storage.updateState(state, next => { next.materials.reverse(); next.materials.find(m => m.id === 'm9').title = '改名'; });
  assert.equal(daily.shouldPrompt(state, tomorrow), true); assert.equal(daily.needsReview(state, tomorrow), true);
  state = storage.updateState(state, next => daily.start(next, tomorrow));
  assert.deepEqual(Array.from(state.dailyReverseReview.round.ids), expected); assert.equal(state.dailyReverseReview.history.length, 1);
  assert.equal(daily.needsReview(seed(0), at), false);
  const originalOnly = seed(1); review.open(originalOnly);
  const session = originalOnly.materialReviewSession;
  d.context.PocketExecutor.transition(originalOnly, 'outputDone', { sessionType: 'material-review', materialId: session.materialId,
    currentGroupIndex: session.currentGroupIndex, currentRunIndex: session.currentRunIndex, currentStep: session.currentStep, mode: session.mode });
  review.advanceQueue(originalOnly);
  assert.equal(originalOnly.materialReviewSession.currentStep, 'queueComplete');
  assert.ok(originalOnly.review.unlock); assert.equal(daily.needsReview(originalOnly, at), true);
  assert.equal(originalOnly.dailyReverseReview, undefined); assert.equal(review.canCreate(originalOnly), false);
  const corrupt = seed(1); corrupt.dailyReverseReview = structuredClone(state.dailyReverseReview); corrupt.dailyReverseReview.round.index = 9; corrupt.dailyReverseReview.round.completedAt = tomorrow;
  assert.equal(daily.needsReview(corrupt, tomorrow), true); // A completion flag alone proves nothing.
  assert.throws(() => daily.finish(state, { roundId: state.dailyReverseReview.round.id, index: 0, materialId: 'm9' }, at), /日期/);
  // Daily state rides the existing raw JSON/Firebase envelope without rule changes.
  await bind(d); await d.engine.retry(); assert.equal(d.engine.view().pending, false);
  const staleDevice = local(cloud, null, new Map(d.store)); await staleDevice.engine.setUser({ uid: 'A' });
  state = storage.loadState(); const beforeRename = JSON.parse(JSON.stringify(state));
  state = storage.renameMaterial(state, 'm1', '云端新名称'); beforeRename.materials.find(m => m.id === 'm1').title = '云端新名称';
  assert.deepEqual(JSON.parse(JSON.stringify(state)), beforeRename); assert.equal(d.engine.view().pending, true);
  d.advance(500); await d.fire(); assert.equal(d.engine.view().pending, false);
  const snapshot = await d.engine.readSnapshot('A', cloud.heads.get('A').snapshotId);
  assert.equal(JSON.parse(snapshot.backup.rawState).materials.find(m => m.id === 'm1').title, '云端新名称');
  vm.runInContext(fs.readFileSync('js/learning-archive.js', 'utf8'), d.context);
  assert.match(d.context.PocketLearningArchive.render(d.store.get(MAIN)), /云端新名称/);
  assert.deepEqual(JSON.parse(snapshot.backup.rawState).dailyReverseReview, JSON.parse(d.store.get(MAIN)).dailyReverseReview);
  const latestId = cloud.heads.get('A').snapshotId;
  staleDevice.change(next => { next.dailyReverseReview.round.completedAt = tomorrow; }); await staleDevice.engine.retry();
  assert.equal(staleDevice.engine.view().paused, true); assert.equal(cloud.heads.get('A').snapshotId, latestId);
  const backup = await d.context.PocketLearningBackup.create(); const report = await d.context.PocketLearningBackup.verify(JSON.stringify(backup)); assert.equal(report.valid, true);
  const prepared = await d.context.PocketCloudBackup.prepareFileRestore(JSON.stringify(backup));
  await d.context.PocketCloudBackup.restoreFile(prepared);
  assert.deepEqual(JSON.parse(d.store.get(MAIN)).dailyReverseReview, JSON.parse(snapshot.backup.rawState).dailyReverseReview);
  console.log('PASS: nine stable IDs in reverse save order, exact-once progress, resume/new day/no empty round, original state isolation, invalid completion blocked, raw JSON restore and Firebase snapshot compatibility.');
})().catch(error => { console.error(error); process.exitCode = 1; });
