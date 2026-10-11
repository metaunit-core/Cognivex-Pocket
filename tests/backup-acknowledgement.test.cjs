'use strict';
const assert = require('node:assert/strict');
const { local, bind } = require('./helpers/pocket-cloud-fixture.cjs');
const { fenced } = require('./helpers/pocket-generation-fixture.cjs');

(async () => {
  const cloud = fenced(); cloud.rotate('ack-cycle-000000000001');
  const device = local(cloud); await bind(device);
  const commit = cloud.adapter.commit;
  let loseAck = true;
  cloud.adapter.commit = async (...args) => {
    await commit(...args);
    if (loseAck) { loseAck = false; throw Error('Lost acknowledgement'); }
  };
  device.change(s => { s.materials[0].groups[0].keyQuestions = 'latest learning'; });
  await device.engine.retry();
  assert.equal(device.engine.view().status, '失败');
  assert.equal(device.engine.view().paused, false);
  assert.equal(cloud.cycles.get('A').lastRevision, 2);
  const data = device.store.get('cognivex-pocket-state'), writes = cloud.stats.writes;
  const refreshed = local(cloud, null, device.store);
  await refreshed.engine.setUser({ uid: 'A' }); await refreshed.engine.retry();
  assert.equal(refreshed.engine.view().latestVerified, true);
  assert.equal(refreshed.engine.view().pending, false);
  assert.equal(refreshed.engine.view().paused, false);
  assert.equal(cloud.stats.commits, 2);
  assert.equal(cloud.stats.writes, writes);
  assert.equal(device.store.get('cognivex-pocket-state'), data);
  // An already open tab safely recognizes the same confirmed payload as well.
  await device.engine.retry();
  assert.equal(device.engine.view().latestVerified, true);
  refreshed.change(s => { s.materials[0].groups[0].keyQuestions = 'next change'; });
  await refreshed.engine.retry();
  await device.engine.retry();
  assert.equal(device.engine.view().paused, false);
  assert.equal(device.engine.view().latestVerified, true);
  // A separate device with different pending content must keep conflict protection.
  const separate = local(cloud, null, new Map(device.store));
  await separate.engine.setUser({ uid: 'A' });
  separate.change(s => { s.materials[0].groups[0].keyQuestions = 'separate edit'; });
  refreshed.change(s => { s.materials[0].groups[0].keyQuestions = 'cloud edit'; });
  await refreshed.engine.retry(); await separate.engine.retry();
  assert.equal(separate.engine.view().paused, true);
  assert.equal(separate.engine.view().status, '数据冲突');
  const pausedControl = separate.store.get('pocket-cloud-control-v1');
  await separate.engine.retry();
  assert.equal(separate.store.get('pocket-cloud-control-v1'), pausedControl);
  // Identical data in a different generation never authorizes automatic rebind.
  cloud.cycles.get('A').generation = 'different-cycle-0000002';
  await refreshed.engine.retry();
  assert.equal(refreshed.engine.view().paused, true);
  assert.equal(refreshed.store.get('cognivex-pocket-state'), device.store.get('cognivex-pocket-state'));
  console.log('PASS: lost commit acknowledgement, refresh and shared tabs reconcile exact verified content without writes; different data, persisted pause and generation changes remain protected.');
})().catch(error => { console.error(error); process.exitCode = 1; });
