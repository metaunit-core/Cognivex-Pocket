'use strict';
const assert = require('node:assert/strict');
const { local, bind } = require('./helpers/pocket-cloud-fixture.cjs');
const { fenced } = require('./helpers/pocket-generation-fixture.cjs');
const CONFIRM = 'RESTART_WITH_VERIFIED_RULES', JOURNAL = 'pocket-cloud-new-start-v1';
function secureCloud() {
  const cloud = fenced(); cloud.enableInitialization();
  const initialize = cloud.adapter.initializeGeneration;
  cloud.adapter.initializeGeneration = async (uid, g, guard, expected) => {
    if (expected !== undefined && JSON.stringify(cloud.cycles.get(uid) || null) !== expected) throw Error('cycle changed');
    const result = await initialize(uid, g, guard);
    if (cloud.stats.loseInitAck) { cloud.stats.loseInitAck = false; throw Error('Lost init acknowledgement'); }
    return result;
  };
  cloud.adapter.cycleClaim = async (uid, g) => cloud.claims.has(uid + '/' + g) ? { uid, generation: g, createdAt: 1 } : null;
  cloud.stats.probes = 0;
  cloud.adapter.verifyWriteFence = async (uid, guard) => {
    guard(); cloud.stats.probes++;
    if (cloud.stats.unsafe || cloud.stats.failProbeAt === cloud.stats.probes) throw Error('旧写入保护验证失败');
    await assert.rejects(cloud.adapter.stage(uid, 'probe', 'stale-probe-000000001'), /stale generation/);
    await assert.rejects(cloud.adapter.stage(uid, 'legacy'), /stale generation/);
    await assert.rejects(cloud.adapter.writeChunk(uid, 'legacy', 0, { uid, index: 0, content: 'probe', hash: 'a'.repeat(64) }), /stale generation/);
    guard(); return { legacyDenied: true, staleDenied: true };
  };
  return cloud;
}
async function start(d) { return d.engine.startNewBackup(await d.engine.prepareNewBackup(), CONFIRM); }
(async () => {
  let cloud = secureCloud(), d = local(cloud); await d.engine.setUser({ uid: 'A' });
  d.store.set('pocket-cloud-control-v1', JSON.stringify({ version: 1, owner: 'A', bound: true, generation: 'old-deleted-cycle-001', revision: 8, pause: '数据冲突', dirty: true }));
  const dataBefore = JSON.stringify(d.context.PocketCloudBackup.DATA_KEYS.map(key => d.store.get(key))), preview = await d.engine.prepareNewBackup();
  assert.equal(preview.generationMissing, true); assert.equal(preview.oldLocalGeneration, 'old-deleted-cycle-001');
  assert.equal(cloud.stats.initializations, 0);
  await assert.rejects(d.engine.startNewBackup(preview, ''), /确认/);
  await d.engine.startNewBackup(preview, CONFIRM);
  assert.equal(cloud.stats.initializations, 1); assert.equal(cloud.stats.commits, 1); assert.equal(cloud.stats.probes, 3);
  assert.equal(d.engine.view().latestVerified, true); assert.equal(d.engine.view().pending, false); assert.equal(d.engine.view().paused, false);
  assert.equal(d.store.has(JOURNAL), false);
  assert.equal(JSON.stringify(d.context.PocketCloudBackup.DATA_KEYS.map(key => d.store.get(key))), dataBefore);
  const firstGeneration = cloud.cycles.get('A').generation;
  assert.equal(cloud.cycles.get('A').protocolVersion, 3); assert.ok(cloud.claims.has('A/' + firstGeneration));
  const reload = local(cloud, null, d.store); await reload.engine.setUser({ uid: 'A' }); await reload.fire();
  assert.equal(reload.engine.view().latestVerified, true);
  reload.change(s => { s.materials[0].groups[0].keyQuestions = 'after refresh'; }); reload.advance(500); await reload.fire();
  assert.equal(cloud.heads.get('A').revision, 2); assert.equal(reload.engine.view().pending, false);
  await assert.rejects(reload.engine.prepareNewBackup(), /head 仍存在/);
  // An old device, including one already staging an upload, loses authority.
  cloud = secureCloud(); cloud.rotate('old-device-cycle-00001'); const old = local(cloud); await bind(old);
  old.change(s => { s.materials[0].groups[0].keyQuestions = 'old in flight'; });
  let entered, release; const ready = new Promise(r => { entered = r; });
  cloud.stats.onCommit = () => { entered(); return new Promise(r => { release = r; }); };
  const oldRequest = old.engine.retry(); await ready;
  const oldSnapshot = cloud.heads.get('A').snapshotId; cloud.heads.clear(); cloud.cycles.clear();
  d = local(cloud); await d.engine.setUser({ uid: 'A' }); await start(d);
  const latest = cloud.heads.get('A').snapshotId; release(); await oldRequest;
  assert.equal(cloud.heads.get('A').snapshotId, latest); assert.equal(old.engine.view().paused, true);
  assert.ok(cloud.manifests.has('A/' + oldSnapshot));
  // Upload, initialization acknowledgement and readback failures preserve data and retry same cycle.
  for (const failure of ['upload', 'init-ack', 'readback']) {
    cloud = secureCloud(); d = local(cloud); await d.engine.setUser({ uid: 'A' });
    const before = d.store.get('cognivex-pocket-state');
    if (failure === 'upload') cloud.stats.partial = true;
    if (failure === 'init-ack') cloud.stats.loseInitAck = true;
    const chunk = cloud.adapter.chunk, commit = cloud.adapter.commit; let failRead = false;
    if (failure === 'readback') {
      cloud.adapter.commit = async (...args) => { await commit(...args); failRead = true; };
      cloud.adapter.chunk = async (...args) => { if (failRead) throw Error('readback failed'); return chunk(...args); };
    }
    await assert.rejects(start(d)); assert.equal(d.engine.view().paused, true); assert.equal(d.engine.view().latestVerified, false);
    assert.equal(d.store.get('cognivex-pocket-state'), before); assert.ok(d.store.has(JOURNAL));
    const g = cloud.cycles.get('A').generation;
    cloud.stats.partial = false; failRead = false; cloud.adapter.commit = commit;
    const resumed = local(cloud, null, d.store); await resumed.engine.setUser({ uid: 'A' }); await start(resumed);
    assert.equal(cloud.cycles.get('A').generation, g); assert.equal(cloud.stats.initializations, 1); assert.equal(cloud.stats.commits, 1);
    assert.equal(resumed.engine.view().pending, false); assert.equal(resumed.store.get('cognivex-pocket-state'), before);
  }
  cloud = secureCloud(); cloud.stats.unsafe = true; d = local(cloud); await d.engine.setUser({ uid: 'A' });
  await assert.rejects(start(d), /旧写入保护/); assert.equal(cloud.stats.initializations, 0); assert.equal(cloud.stats.commits, 0);
  // Two clients checking the absent generation cannot both rotate it.
  cloud = secureCloud(); const a = local(cloud), b = local(cloud); await a.engine.setUser({ uid: 'A' }); await b.engine.setUser({ uid: 'A' });
  const pa = await a.engine.prepareNewBackup(), pb = await b.engine.prepareNewBackup();
  const results = await Promise.allSettled([a.engine.startNewBackup(pa, CONFIRM), b.engine.startNewBackup(pb, CONFIRM)]);
  assert.equal(results.filter(r => r.status === 'fulfilled').length, 1); assert.equal(cloud.stats.initializations, 1); assert.equal(cloud.stats.commits, 1);
  console.log('PASS: missing generation/old local pause, explicit confirmation, protocol3/claim/head/first upload/readback, unchanged local data, refresh+automatic edit, stale in-flight device rejection, immutable history, failure retry without new cycles, unsafe rules and concurrent initialization fail closed.');
})().catch(error => { console.error(error); process.exitCode = 1; });
