'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm');
const { boot, seed } = require('./helpers/pocket-learning-ui.cjs');
const { local, remote, bind } = require('./helpers/pocket-cloud-fixture.cjs');
const location = new URL('http://localhost:4173/');
const key = 'pocket-development-v1:cognivex-pocket-state';
const initial = seed(1); initial.materials[0].title = 'A';
const now = Date.now();
const app = boot({ location, clock: { now }, store: new Map([[key, JSON.stringify(initial)]]) });
const api = app.context, state = app.state();
const quick = title => api.PocketQuickMaterial.create(state,
  { subject: '数学', title, questionRange: '1-2', groupSize: '2' }, now);
const a = state.materials[0].id, originalA = JSON.stringify(state.materials[0]);
const b = quick('B');
// Synthetic completed daily review and a valid legacy draft exercise the original
// save function without bypassing or changing its production admission checks.
state.dailyReverseReview.round = { id: 'mock-completed', day: api.PocketDailyReverse.day(now),
  ids: [a, b], index: 2, completedIds: [a, b], startedAt: now, completedAt: now };
const c = 'original-C';
state.currentSession = { materialId: c, currentStep: 'grouping' };
state.review.grandfatheredDraftId = c;
const materialC = structuredClone(seed(1).materials[0]);
materialC.id = c; materialC.title = 'C'; materialC.createdAt = 0;
materialC.status = 'learning'; materialC.completedAt = null; materialC.addedToReviewAt = null;
materialC.groups[0].id = 'C-group'; materialC.groups[0].addedToReviewAt = null;
require('./helpers/original-learning-fixture.cjs')({materials:[materialC]}, now);
materialC.status = 'learning'; materialC.completedAt = null;
api.PocketMaterialReview.createMaterial(state, materialC);
api.PocketHistory.markCompleted(materialC, now);
state.currentSession = null;
const d = quick('D'), expected = [a, b, c, d];
assert.deepEqual(state.materials.map(m => m.title), ['A', 'B', 'C', 'D']);
assert.equal(JSON.stringify(state.materials[0]), originalA);
const check = value => {
  assert.deepEqual(Array.from(value.materials, m => m.id), expected);
  assert.deepEqual(Array.from(value.dailyReverseReview.saveOrder), expected);
  assert.deepEqual(Array.from(api.PocketDailyReverse.orderedIds(value)), expected);
  assert.deepEqual(Array.from(api.PocketMaterialReview.groups(value), g => g.materialId), [...expected].reverse());
};
check(state);
state.materials[0].title = 'Z-renamed'; state.materials[1].subject = '物理';
api.PocketMaterialReview.open(state);
assert.equal(state.materialReviewSession.materialId, c);
assert.deepEqual(Array.from(state.materialReviewSession.materialIds), [c]);
api.PocketDailyReverse.start(state, now + 86400000);
assert.equal(state.dailyReverseReview.round.ids[0], a);
check(state);
api.PocketStorage.updateState(api.PocketStorage.loadState(), next => Object.assign(next, state));
module.exports = (async () => {
  vm.runInContext(fs.readFileSync(path.join(__dirname, '../js/learning-backup.js'), 'utf8'), api);
  const backup = await api.PocketLearningBackup.create();
  assert.equal((await api.PocketLearningBackup.verify(JSON.stringify(backup))).valid, true);
  const reloaded = boot({ location, store: new Map([[key, backup.rawState]]) });
  check(reloaded.state());
  // Only the in-memory Firebase adapter is used. Exercise both original restore paths.
  const cloud = remote(), device = local(cloud, JSON.parse(backup.rawState));
  await bind(device);
  const id = cloud.heads.get('A').snapshotId;
  const snapshot = await device.engine.readSnapshot('A', id);
  check(JSON.parse(snapshot.backup.rawState));
  await device.engine.restore(await device.engine.prepareRestore(id));
  check(JSON.parse(device.store.get('cognivex-pocket-state')));
  const target = local(cloud, seed(0));
  const prepared = await target.context.PocketCloudBackup.prepareFileRestore(JSON.stringify(backup));
  await target.context.PocketCloudBackup.restoreFile(prepared);
  check(JSON.parse(target.store.get('cognivex-pocket-state')));
  device.engine.dispose(); target.engine.dispose();
  console.log('PASS localhost A→quick B→original C→quick D; append/saveOrder, rename, daily A first, today original C only, reload, JSON restore and in-memory Firebase backup/restore.');
})();
