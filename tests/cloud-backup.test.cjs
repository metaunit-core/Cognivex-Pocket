'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { webcrypto } = require('node:crypto');
const { TextEncoder } = require('node:util');
const sources = Object.fromEntries(['cloud-backup', 'learning-backup', 'storage'].map(name =>
  [name, fs.readFileSync(path.join(__dirname, '../js', name + '.js'), 'utf8')]));
const initial = () => ({ version: 1, review: { lastReviewedAt: null, roundHistory: [] },
  currentSession: { currentStep: 'output', currentGroupIndex: 0 }, materials: [
    { id: 'A', groups: [{ id: 'a1', keyQuestions: '第3题', runs: [{ startedAt: 1, completedAt: 2 }] }], materialReviewHistory: [] }
  ], future: { preserve: '未知 🧠' } });
function remote() {
  const heads = new Map(), manifests = new Map(), chunks = new Map();
  const stats = { commits: 0, writes: 0, fail: false, partial: false, onCommit: null, onWrite: null, afterCommit: false };
  const id = (uid, snapshot) => uid + '/' + snapshot;
  const adapter = {
    async head(uid) { if (stats.fail) throw Error('Offline'); return heads.get(uid) || null; },
    async manifest(uid, snapshot) { return manifests.get(id(uid, snapshot)) || null; },
    async chunk(uid, snapshot, index) { return chunks.get(id(uid, snapshot) + '/' + index) || null; },
    async writeChunk(uid, snapshot, index, value) {
      if (stats.fail || stats.partial) throw Error('Write denied');
      assert.equal(chunks.has(id(uid, snapshot) + '/' + index), false);
      chunks.set(id(uid, snapshot) + '/' + index, structuredClone(value)); stats.writes++;
      if (stats.onWrite) { const fn = stats.onWrite; stats.onWrite = null; await fn(); }
    },
    async commit(uid, snapshot, expected, manifest) {
      if (stats.onCommit) { const fn = stats.onCommit; stats.onCommit = null; await fn(); }
      if ((heads.get(uid)?.revision || 0) !== expected) throw Object.assign(Error('Conflict'), { conflict: true });
      assert.equal(manifests.has(id(uid, snapshot)), false);
      manifests.set(id(uid, snapshot), structuredClone({ ...manifest, createdAt: Date.now() }));
      heads.set(uid, { uid, revision: expected + 1, snapshotId: snapshot, dataHash: manifest.dataHash }); stats.commits++;
      if (stats.afterCommit) throw Error('Lost acknowledgement');
    },
    async list(uid) { return [...manifests].filter(([key]) => key.startsWith(uid + '/')).map(([key, value]) => ({ id: key.split('/')[1], ...value })); }
  };
  return { adapter, heads, manifests, chunks, stats };
}
function local(cloud, seed = initial(), existing) {
  const store = existing || new Map();
  if (!existing) {
    store.set('cognivex-pocket-state', JSON.stringify(seed));
    store.set('pocket-listening-start-v1', JSON.stringify({ subject: { status: 'paused', remaining: 5000 } }));
    store.set('pocket-training-sop-model-v1', JSON.stringify({ purpose: '输入' }));
    store.set('pocket-last-view-v1', JSON.stringify({ page: 'learning' }));
    store.set('pocket-view-history-v1', JSON.stringify([{ page: 'home' }]));
    store.set('firebase:authUser:secret', 'must never upload');
  }
  let online = true, clock = 1000000, failKey = null;
  const timers = new Map(); let timerId = 0;
  const setTimeout = (fn, delay) => { const id = ++timerId; timers.set(id, { fn, delay }); return id; };
  const context = vm.createContext({ crypto: webcrypto, TextEncoder, structuredClone, console,
    setTimeout, clearTimeout: id => timers.delete(id),
    localStorage: { getItem: key => store.get(key) ?? null,
      setItem(key, value) { if (key === failKey) { failKey = null; throw Error('Quota blocked'); } store.set(key, value); },
      removeItem(key) { if (key === failKey) { failKey = null; throw Error('Removal blocked'); } store.delete(key); } } });
  require('./helpers/environment.cjs')(context);
  for (const name of ['cloud-backup', 'learning-backup', 'storage']) vm.runInContext(sources[name], context);
  const engine = context.PocketCloudBackup.createEngine({ isolateRestore: work => work(), adapter: cloud.adapter, now: () => clock,
    online: () => online, debounce: 15, interval: 300, setTimeout, clearTimeout: id => timers.delete(id) });
  return { context, engine, store, timers, online(value) { online = value; }, advance(value) { clock += value; },
    fail(key) { failKey = key; }, async fire() { const next = [...timers.values()].pop(); timers.clear(); if (next) await next.fn(); await new Promise(resolve => setImmediate(resolve)); },
    change(fn) { const state = context.PocketStorage.loadState(); return context.PocketStorage.updateState(state, fn); } };
}
async function bind(device, uid = 'A', allowLoss = false) {
  await device.engine.setUser({ uid, email: uid + '@example.test' });
  if (device.engine.view().bound && !device.engine.view().comparison) return;
  const compared = device.engine.view().comparison || await device.engine.compare();
  await device.engine.bindLocal(compared, allowLoss);
}
module.exports = (async () => {
  // Regression: equal counts (Material 1 / Group 2 / Run 5) are never used as content identity.
  const fixture = initial();
  fixture.materials[0].groups[0].runs = [{ completedAt: 1 }, { completedAt: 2 }];
  fixture.materials[0].groups.push({ id: 'a2', runs: [{ completedAt: 3 }, { completedAt: 4 }, { completedAt: 5 }] });
  const regressionCloud = remote(), source = local(regressionCloud, fixture);
  await bind(source);
  const matchingStore = new Map(source.store);
  const controlKey = 'pocket-cloud-control-v1';
  const originalControl = JSON.parse(matchingStore.get(controlKey));
  matchingStore.set(controlKey, JSON.stringify({ ...originalControl, bound: false }));
  const matching = local(regressionCloud, null, matchingStore);
  await matching.engine.setUser({ uid: 'A' });
  assert.equal(matching.engine.view().bound, true);
  assert.equal(matching.engine.view().comparison, null);
  assert.equal(matching.engine.view().lastSuccessAt, originalControl.lastSuccessAt);
  assert.equal(regressionCloud.stats.commits, 1); // automatic binding has no cloud writes
  const differentStore = new Map(matchingStore);
  differentStore.delete(controlKey);
  const different = local(regressionCloud, null, differentStore);
  different.change(state => { state.materials[0].groups[0].keyQuestions = 'same counts, different content'; });
  await different.engine.setUser({ uid: 'A' });
  const compared = different.engine.view().comparison;
  assert.equal(JSON.stringify(compared.local.summary.counts), JSON.stringify(compared.cloud.summary.counts));
  assert.notEqual(compared.local.hash, compared.cloud.manifest.dataHash);
  assert.equal(different.engine.view().bound, false);
  assert.equal(different.engine.view().status, '发现两份不同的学习记录，需要确认');
  await different.engine.retry();
  assert.equal(regressionCloud.stats.commits, 1);
  // Only confirmed binding enables timer-driven uploads; changes keep old versions.
  matching.change(state => { state.future.automatic = true; });
  matching.advance(400); await matching.fire();
  assert.equal(regressionCloud.stats.commits, 2);
  assert.equal(regressionCloud.manifests.size, 2);
  const corruptStore = new Map(matching.store); corruptStore.delete(controlKey);
  const corrupt = local(regressionCloud, null, corruptStore);
  const badId = regressionCloud.heads.get('A').snapshotId;
  const badKey = 'A/' + badId + '/0', saved = regressionCloud.chunks.get(badKey);
  regressionCloud.chunks.set(badKey, { ...saved, content: 'corrupt' });
  await corrupt.engine.setUser({ uid: 'A' });
  assert.equal(corrupt.engine.view().bound, false);
  assert.equal(corrupt.engine.view().status, '失败');
  assert.match(corrupt.engine.view().reason, /损坏/);
  assert.equal(regressionCloud.stats.commits, 2);
  regressionCloud.chunks.set(badKey, saved);
  for (const device of [source, matching, different, corrupt]) device.engine.dispose();
  const cloud = remote(), first = local(cloud);
  await first.engine.setUser({ uid: 'A', email: 'a@example.test' });
  assert.equal(cloud.stats.commits, 0); // Login cannot upload before explicit confirmation.
  assert.equal(first.engine.view().comparison.cloud, null);
  await first.engine.bindLocal(first.engine.view().comparison);
  assert.equal(cloud.stats.commits, 1); assert.equal(first.engine.view().status, '备份成功');
  const firstId = cloud.heads.get('A').snapshotId;
  const snapshot = await first.engine.readSnapshot('A', firstId);
  assert.equal(snapshot.backup.entries.length, 5);
  assert.equal(snapshot.backup.rawState, first.store.get('cognivex-pocket-state'));
  assert.equal(JSON.stringify(snapshot.backup).includes('must never upload'), false);
  await first.engine.retry(); assert.equal(cloud.stats.commits, 1); // Deduplicate by data, not export time.
  first.change(state => { state.future.value = 1; });
  first.change(state => { state.future.value = 2; });
  first.change(state => { state.future.value = 3; });
  assert.equal(first.timers.size, 1); first.advance(400); await first.engine.retry();
  assert.equal(cloud.stats.commits, 2); assert.equal(cloud.manifests.has('A/' + firstId), true);
  first.online(false); first.change(state => { state.future.value = 4; }); await first.engine.retry();
  assert.equal(first.engine.view().status, '待备份'); assert.equal(cloud.stats.commits, 2);
  assert.equal(JSON.parse(first.store.get('pocket-cloud-control-v1')).dirty, true);
  first.engine.dispose();
  const reopened = local(cloud, null, first.store);
  await reopened.engine.setUser({ uid: 'A' }); await reopened.engine.retry();
  assert.equal(cloud.stats.commits, 3); // Reopen detects and sends dirty data.
  cloud.stats.fail = true; reopened.change(state => { state.future.value = 5; });
  const beforeFailure = reopened.store.get('cognivex-pocket-state'); await reopened.engine.retry();
  assert.equal(reopened.engine.view().status, '失败'); assert.equal(reopened.store.get('cognivex-pocket-state'), beforeFailure);
  cloud.stats.fail = false; await reopened.engine.retry(); assert.equal(cloud.stats.commits, 4);
  reopened.change(state => { state.materials = []; }); await reopened.engine.retry();
  assert.match(reopened.engine.view().status, /数据异常/); assert.equal(cloud.stats.commits, 4);
  await reopened.engine.compare(); await assert.rejects(reopened.engine.bindLocal(reopened.engine.view().comparison), /缺少/);
  // Explicit acknowledged legitimate deletion publishes an exact version and keeps prior history.
  await reopened.engine.bindLocal(reopened.engine.view().comparison, true); assert.equal(cloud.stats.commits, 5);
  assert.equal(cloud.manifests.has('A/' + firstId), true);
  const prepared = await reopened.engine.prepareRestore(firstId);
  assert.ok(reopened.store.has(prepared.rescueKey));
  assert.equal(JSON.parse(reopened.store.get(prepared.rescueKey)).entries[0].content, reopened.store.get('cognivex-pocket-state'));
  await reopened.engine.restore(prepared);
  assert.equal(reopened.store.get('cognivex-pocket-state'), snapshot.backup.rawState);
  assert.equal(reopened.store.has('pocket-cloud-restore-journal-v1'), false);
  await reopened.engine.retry(); assert.equal(cloud.stats.commits, 6);
  // Two devices race against the same revision. Winner remains safe, loser pauses.
  const second = local(cloud); await bind(second);
  const revision = cloud.heads.get('A').revision;
  reopened.change(state => { state.future.device = 'phone'; });
  second.change(state => { state.future.device = 'desktop'; });
  await reopened.engine.retry(); assert.equal(cloud.heads.get('A').revision, revision + 1);
  await second.engine.retry(); assert.equal(second.engine.view().status, '数据冲突');
  assert.equal(JSON.parse(second.store.get('cognivex-pocket-state')).future.device, 'desktop');
  // Account switch always requires a fresh explicit binding, even with previous data.
  await second.engine.setUser({ uid: 'B' }); await second.engine.retry();
  assert.equal(cloud.heads.has('B'), false); assert.equal(second.engine.view().comparison.cloud, null);
  await second.engine.bindLocal(second.engine.view().comparison); assert.equal(cloud.heads.get('B').uid, 'B');
  const bHead = cloud.heads.get('B'); assert.equal(cloud.heads.get('A').revision, revision + 1);
  // Integrity, partitioning, and a partial upload must never publish a new head.
  second.change(state => { state.future.large = '未知🧠'.repeat(40000); });
  await second.engine.retry(); assert.ok(cloud.manifests.get('B/' + cloud.heads.get('B').snapshotId).chunkCount > 1);
  const big = await second.engine.readSnapshot('B', cloud.heads.get('B').snapshotId);
  assert.equal(JSON.parse(big.backup.rawState).future.large.length, 160000);
  const chunkKey = 'B/' + cloud.heads.get('B').snapshotId + '/1'; const savedChunk = cloud.chunks.get(chunkKey);
  cloud.chunks.set(chunkKey, { ...savedChunk, content: 'damaged' });
  await assert.rejects(second.engine.readSnapshot('B', cloud.heads.get('B').snapshotId), /损坏/);
  cloud.chunks.set(chunkKey, savedChunk);
  const beforePartial = cloud.heads.get('B').snapshotId; cloud.stats.partial = true;
  second.change(state => { state.future.value = 10; }); await second.engine.retry();
  assert.equal(cloud.heads.get('B').snapshotId, beforePartial); cloud.stats.partial = false;
  await second.engine.retry();
  // A commit accepted by the server but with a lost reply is recognized on retry.
  cloud.stats.afterCommit = true; second.change(state => { state.future.value = 11; }); await second.engine.retry();
  const commitsAfterLostReply = cloud.stats.commits; cloud.stats.afterCommit = false; await second.engine.retry();
  assert.equal(cloud.stats.commits, commitsAfterLostReply); assert.equal(second.engine.view().status, '备份成功');
  // A write during upload remains dirty instead of being falsely reported as fully backed up.
  cloud.stats.onWrite = async () => second.change(state => { state.future.concurrent = 2; });
  second.change(state => { state.future.concurrent = 1; }); await second.engine.retry();
  assert.equal(JSON.parse(second.store.get('pocket-cloud-control-v1')).dirty, true);
  await second.engine.retry(); assert.equal(JSON.parse(second.store.get('pocket-cloud-control-v1')).dirty, false);
  // Restore failure rolls back all five keys, and retains the original rescue file.
  const originalEntries = second.context.PocketCloudBackup.DATA_KEYS.map(key => second.store.get(key) ?? null);
  const restore = await second.engine.prepareRestore(bHead.snapshotId);
  second.fail('pocket-training-sop-model-v1'); await assert.rejects(second.engine.restore(restore), /回滚/);
  assert.deepEqual(second.context.PocketCloudBackup.DATA_KEYS.map(key => second.store.get(key) ?? null), originalEntries);
  assert.ok(second.store.has(restore.rescueKey));
  // Interrupted multi-key restore is rolled back before the next loadState read.
  second.store.set('pocket-cloud-restore-journal-v1', JSON.stringify({ version: 1,
    entries: second.context.PocketCloudBackup.DATA_KEYS.map((key, i) => ({ key, content: originalEntries[i] })),
    originalControl: JSON.parse(second.store.get('pocket-cloud-control-v1')) }));
  second.store.set('cognivex-pocket-state', '{}'); second.engine.dispose();
  const recovered = local(cloud, null, second.store);
  assert.equal(recovered.store.get('cognivex-pocket-state'), originalEntries[0]);
  assert.equal(recovered.store.has('pocket-cloud-restore-journal-v1'), false);
  // No notifications for failed local saves, and no reset of corrupt original data.
  recovered.fail('cognivex-pocket-state');
  const old = recovered.store.get('cognivex-pocket-state');
  assert.throws(() => recovered.change(state => { state.future.invalid = true; }), /Quota/);
  assert.equal(recovered.store.get('cognivex-pocket-state'), old);
  recovered.store.set('cognivex-pocket-state', '{corrupt');
  recovered.context.PocketStorage.loadState();
  assert.throws(() => recovered.context.PocketStorage.saveState(initial()), /禁止覆盖/);
  assert.equal(recovered.store.get('cognivex-pocket-state'), '{corrupt');
  for (const device of [first, reopened, second, recovered]) device.engine.dispose();
  console.log('PASS: local-first save, explicit binding, dedup/debounce, offline/reopen/failure retry, immutable chunk snapshots, integrity, anomaly/legitimate deletion, conflicts/account isolation, uncertain commits, concurrent changes, rescue/rollback/crash recovery.');
})();
if (require.main === module) module.exports.catch(error => { console.error(error); process.exitCode = 1; });
