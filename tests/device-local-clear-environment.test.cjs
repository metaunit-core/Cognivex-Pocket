'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { webcrypto } = require('node:crypto');
const { TextEncoder } = require('node:util');
const read = name => fs.readFileSync(path.join(__dirname, '../js/' + name + '.js'), 'utf8');
const prefix = 'pocket-development-v1:';
const initial = JSON.stringify({ version: 1, materials: [], currentSession: null, review: { lastReviewedAt: null } });
function boot(store, options = {}) {
  const listeners = [], calls = { writes: 0, deletes: 0 };
  const context = vm.createContext({ URL, location: new URL('http://localhost:5500/'), crypto: webcrypto, TextEncoder, setTimeout, clearTimeout,
    navigator: { locks: { request: async (name, settings, fn) => fn({ name }) } },
    document: { getElementById: () => null, addEventListener(name, fn) { if (name === 'DOMContentLoaded') listeners.push(fn); } },
    localStorage: { get length() { return store.size; }, key: index => [...store.keys()][index] ?? null,
      getItem(key) { if (options.readFailure) throw Error('Denied'); return store.get(key) ?? null; },
      setItem(key, value) { calls.writes++; if (options.failWrite === key) throw Error('Write denied'); store.set(key, value); },
      removeItem(key) { calls.deletes++; if (options.failDelete === key) throw Error('Delete denied'); store.delete(key); } } });
  for (const name of ['environment', 'device-local-data', 'data-deletion', 'cloud-backup', 'learning-backup', 'storage']) vm.runInContext(read(name), context);
  return { context, calls };
}
module.exports = (async () => {
  const store = new Map([['cognivex-pocket-state', 'formal untouched'],
    [prefix + 'cognivex-pocket-state', initial], [prefix + 'pocket-listening-start-v1', '{}'],
    [prefix + 'pocket-training-sop-model-v1', '{}'], [prefix + 'unknown', 'keep'],
    ['firebase:authUser:credential', 'keep']]);
  const device = boot(store), service = device.context.PocketDeviceLocalData;
  let cloudCalls = 0;
  const adapter = new Proxy({}, { get() { cloudCalls++; throw Error('Cloud access forbidden'); } });
  assert.throws(() => device.context.PocketCloudBackup.createEngine({ adapter }), /测试环境/);
  const before = JSON.stringify([...store]), writeCount = device.calls.writes;
  const preview = service.preview(), usageBefore = service.usage();
  assert.equal(preview.environment, '开发测试版');
  assert.equal(preview.backupTime, null);
  assert.equal(JSON.stringify([...store]), before);
  assert.equal(device.calls.writes, writeCount);
  await assert.rejects(service.clear(preview, 'wrong'), /两次确认/);
  assert.equal(JSON.stringify([...store]), before);
  await service.clear(preview, '清除本地数据');
  assert.ok(!store.has(prefix + 'cognivex-pocket-state'));
  assert.ok(!store.has(prefix + 'pocket-listening-start-v1'));
  assert.equal(store.get('cognivex-pocket-state'), 'formal untouched');
  assert.equal(store.get(prefix + 'unknown'), 'keep');
  assert.equal(store.get('firebase:authUser:credential'), 'keep');
  assert.ok(service.usage() >= 0); assert.ok(usageBefore > 0);
  assert.equal(service.completed(), true);
  const refreshed = boot(store);
  assert.equal(refreshed.context.PocketStorage.loadState().materials.length, 0);
  assert.equal(refreshed.context.PocketDeviceLocalData.completed(), true);
  assert.equal(cloudCalls, 0);
  const nodes = Object.fromEntries(['local-capacity-result', 'local-capacity-time', 'local-capacity-refresh'].map(id => [id, { textContent: '', addEventListener() {} }]));
  refreshed.context.document.getElementById = id => nodes[id];
  vm.runInContext(read('local-capacity'), refreshed.context);
  const usage = refreshed.context.PocketDeviceLocalData.usage();
  assert.match(nodes['local-capacity-result'].textContent, /5 MiB（参考）/);
  assert.ok(nodes['local-capacity-result'].textContent.includes((usage / 1024).toFixed(2) + ' KB'));
  const unchanged = JSON.stringify([...store]);
  refreshed.context.PocketLocalCapacity.refresh();
  assert.equal(JSON.stringify([...store]), unchanged);
  const corrupt = boot(new Map([[prefix + 'pocket-cloud-control-v1', '{invalid'], [prefix + 'cognivex-pocket-state', initial]]));
  assert.throws(() => corrupt.context.PocketDeviceLocalData.preview());
  const blockedStore = new Map([[prefix + 'cognivex-pocket-state', initial]]);
  const blocked = boot(blockedStore, { failWrite: prefix + 'pocket-device-clear-journal-v1' });
  await assert.rejects(blocked.context.PocketDeviceLocalData.clear(blocked.context.PocketDeviceLocalData.preview(), '清除本地数据'), /Write denied/);
  assert.equal(blockedStore.get(prefix + 'cognivex-pocket-state'), initial);
  assert.equal(blocked.calls.deletes, 0);
  const failureStore = new Map([[prefix + 'cognivex-pocket-state', initial], [prefix + 'pocket-training-sop-model-v1', '{}']]);
  const failure = boot(failureStore, { failDelete: prefix + 'pocket-training-sop-model-v1' });
  await assert.rejects(failure.context.PocketDeviceLocalData.clear(failure.context.PocketDeviceLocalData.preview(), '清除本地数据'), /清除失败/);
  assert.equal(failureStore.get(prefix + 'cognivex-pocket-state'), initial);
  assert.equal(failure.context.PocketDeviceLocalData.completed(), false);
  const cleanupStore = new Map([[prefix + 'cognivex-pocket-state', initial]]);
  const cleanupOptions = { failDelete: prefix + 'pocket-device-clear-journal-v1' };
  const cleanup = boot(cleanupStore, cleanupOptions), cleanupService = cleanup.context.PocketDeviceLocalData;
  await assert.rejects(cleanupService.clear(cleanupService.preview(), '清除本地数据'), /清除失败/);
  assert.equal(cleanupStore.get(prefix + 'cognivex-pocket-state'), initial);
  assert.equal(cleanupService.completed(), false);
  cleanupOptions.failDelete = null;
  await cleanupService.recover();
  assert.equal(cleanupStore.has(prefix + 'pocket-device-clear-journal-v1'), false);
  const recoveryCloud = new Map([[prefix + 'pocket-cloud-restore-journal-v1', '{}'], [prefix + 'cognivex-pocket-state', initial]]);
  const recovering = boot(recoveryCloud);
  assert.throws(() => recovering.context.PocketDeviceLocalData.preview(), /未完成的备份或恢复/);
  const options = { readFailure: false }, unreadable = boot(new Map([[prefix + 'cognivex-pocket-state', initial]]), options);
  options.readFailure = true;
  assert.throws(() => unreadable.context.PocketDeviceLocalData.preview(), /Denied/);
  console.log('PASS: localhost-only prefixed test storage, zero cloud adapter calls, read-only preview/usage, reload pause, unknown/auth/formal-key preservation and refusal on unreadable/control/journal/deletion failures.');
})().catch(error => { console.error(error); process.exitCode = 1; });
