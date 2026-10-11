'use strict';
const assert = require('node:assert/strict');
const { local, remote, bind, initial } = require('./helpers/pocket-cloud-fixture.cjs');
const KEY = 'pocket-local-reset-v1';
(async () => {
  const cloud = remote(), original = local(cloud); await bind(original);
  await original.context.PocketDataDeletion.clearLocal(original.context.PocketDataDeletion.preview().raw);
  const device = local(cloud, null, original.store); await device.engine.setUser({ uid: 'A' });
  let indexes = { remaining: true, headEmpty: false, snapshotsEmpty: false, uploadsEmpty: true };
  cloud.adapter.inspectCloudDeletion = async () => indexes;
  let report = await device.engine.prepareRestartAutoBackup();
  assert.equal(report.indexCheckPassed, false);
  assert.ok(report.blockers.includes('cloud-records-remain'));
  await assert.rejects(device.engine.restartAutoBackup(report), /索引检查尚未通过/);
  indexes = { remaining: true, headEmpty: true, snapshotsEmpty: true, uploadsEmpty: false };
  report = await device.engine.prepareRestartAutoBackup();
  assert.equal(report.indexes.uploads, false);
  assert.equal(report.automaticBackupSafe, false);
  indexes = { remaining: false }; // An incomplete response must not certify emptiness.
  report = await device.engine.prepareRestartAutoBackup(); assert.equal(report.indexCheckPassed, false);
  indexes = { remaining: false, headEmpty: true, snapshotsEmpty: true, uploadsEmpty: true };
  const before = JSON.stringify([...device.store]), commits = cloud.stats.commits;
  report = await device.engine.prepareRestartAutoBackup();
  assert.equal(report.indexCheckPassed, true);
  assert.equal(report.historicalDeletionVerified, false);
  assert.equal(report.automaticBackupSafe, false);
  assert.deepEqual({ ...report.localCounts }, { materials: 0, groups: 0, runs: 0 });
  assert.deepEqual([...report.blockers], ['server-generation-fence-missing']);
  assert.equal(report.message, '云端当前备份为空。历史残留分片无法完全验证。');
  assert.equal(JSON.stringify([...device.store]), before);
  await assert.rejects(device.engine.restartAutoBackup(report), /代际保护/);
  assert.equal(JSON.stringify([...device.store]), before);
  assert.equal(cloud.stats.commits, commits);
  // New local learning is reported truthfully, without silently binding it.
  device.store.set('cognivex-pocket-state', JSON.stringify(initial()));
  const current = await device.engine.prepareRestartAutoBackup();
  assert.deepEqual({ ...current.localCounts }, { materials: 1, groups: 1, runs: 1 });
  assert.notEqual(current.localHash, report.localHash);
  await assert.rejects(device.engine.restartAutoBackup(report), /重新检查/);
  await device.engine.setUser({ uid: 'B' });
  await assert.rejects(device.engine.restartAutoBackup(current), /账号已变化/);
  const reopened = local(cloud, null, device.store); await reopened.engine.setUser({ uid: 'A' });
  await reopened.engine.retry(); await reopened.fire();
  assert.equal(reopened.engine.view().waitingCloudDeletion, true);
  assert.equal(cloud.stats.commits, commits);
  // A genuinely unfinished current-device task is a separate blocker.
  let releaseHead, entered;
  const started = new Promise(resolve => { entered = resolve; });
  const priorHead = cloud.adapter.head;
  cloud.adapter.head = () => { entered(); return new Promise(resolve => { releaseHead = resolve; }); };
  const comparing = reopened.engine.compare(); await started;
  await assert.rejects(reopened.engine.prepareRestartAutoBackup(), /尚未完成的备份或恢复任务/);
  releaseHead(await priorHead('A')); await comparing;
  cloud.adapter.head = priorHead;
  // Demonstrate why revision-only restart is unsafe: deleting head resets its
  // revision, allowing a previously prepared other-device commit to match it.
  // This runs exclusively against in-memory fake cloud data, never Firebase.
  const raceCloud = remote(), old = local(raceCloud); await bind(old);
  old.change(state => { state.oldDevicePayload = true; }); old.advance(400);
  let releaseCommit, commitEntered;
  const waiting = new Promise(resolve => { commitEntered = resolve; });
  raceCloud.stats.onCommit = () => { commitEntered(); return new Promise(resolve => { releaseCommit = resolve; }); };
  const oldRequest = old.engine.retry(); await waiting;
  raceCloud.heads.clear(); raceCloud.manifests.clear(); // unverified orphan chunks remain
  const freshState = initial(); freshState.freshCyclePayload = true;
  const fresh = local(raceCloud, freshState); await bind(fresh);
  assert.equal(raceCloud.heads.get('A').revision, 1);
  const freshId = raceCloud.heads.get('A').snapshotId;
  releaseCommit(); await oldRequest;
  assert.equal(raceCloud.heads.get('A').revision, 2);
  assert.notEqual(raceCloud.heads.get('A').snapshotId, freshId);
  const overwritten = await old.engine.readSnapshot('A', raceCloud.heads.get('A').snapshotId);
  assert.equal(JSON.parse(overwritten.backup.rawState).oldDevicePayload, true);
  // The exposed restart entry therefore must remain blocked until a real
  // server-side generation fence is implemented and deployed.
  assert.equal(reopened.store.has(KEY), true);
  console.log('PASS: separate index/history/restart assessment, local preview, valid-backup/upload/incomplete-index/active-task blockers, UID/stale-preview/reopen safety; reproduced revision-reset stale-device overwrite and blocked unsupported cycle creation.');
})().catch(error => { console.error(error); process.exitCode = 1; });
