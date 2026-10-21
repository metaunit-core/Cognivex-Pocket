'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm');
const { local, remote, bind } = require('./helpers/pocket-cloud-fixture.cjs');
const { seed } = require('./helpers/pocket-learning-ui.cjs');
module.exports = (async () => {
  const cloud = remote(), state = seed(3), device = local(cloud, state);
  for (const name of ['history', 'executor', 'material-review', 'daily-reverse-review', 'material-deletion']) {
    vm.runInContext(fs.readFileSync(path.join(__dirname, '../js/' + name + '.js'), 'utf8'), device.context);
  }
  await bind(device);
  const oldHead = cloud.heads.get('A').snapshotId, commits = cloud.stats.commits;
  device.change(next => device.context.PocketMaterialDeletion.remove(next, ['m1']));
  const localBytes = device.store.get('cognivex-pocket-state');
  device.advance(400); await device.fire(); await device.engine.retry();
  assert.equal(cloud.stats.commits, commits, 'existing loss protection must not be bypassed');
  assert.match(device.engine.view().status, /暂停|异常/);
  const comparison = await device.engine.compare();
  await assert.rejects(device.engine.bindLocal(comparison, false), /合法删除/);
  await device.engine.bindLocal(comparison, true);
  assert.equal(device.store.get('cognivex-pocket-state'), localBytes);
  const snapshot = await device.engine.readSnapshot('A', cloud.heads.get('A').snapshotId);
  assert.deepEqual(JSON.parse(snapshot.backup.rawState).materials.map(m => m.id), ['m2', 'm3']);
  assert.ok(cloud.manifests.has('A/' + oldHead), 'original cloud history remains immutable');
  // Delete during an older in-flight upload: it may finish its snapshot, never restore local objects.
  device.change(next => { next.materials[0].title = 'upload captured before deletion'; });
  cloud.stats.onWrite = async () => device.change(next => device.context.PocketMaterialDeletion.remove(next, ['m2']));
  device.advance(400); await device.engine.retry();
  assert.deepEqual(JSON.parse(device.store.get('cognivex-pocket-state')).materials.map(m => m.id), ['m3']);
  assert.equal(device.engine.view().pending, true);
  const again = await device.engine.compare(); await device.engine.bindLocal(again, true);
  const latest = await device.engine.readSnapshot('A', cloud.heads.get('A').snapshotId);
  assert.deepEqual(JSON.parse(latest.backup.rawState).materials.map(m => m.id), ['m3']);
  device.change(next => { next.materials[0].title = 'offline latest'; }); cloud.stats.fail = true;
  device.advance(400); await device.engine.retry(); assert.notEqual(device.engine.view().status, '备份成功');
  assert.equal(JSON.parse(device.store.get('cognivex-pocket-state')).materials[0].title, 'offline latest');
  device.engine.dispose();
  console.log('PASS mock-only original full-state backup, deletion loss guard, existing confirmation, latest payload, immutable cloud history and in-flight/offline safety.');
})();
