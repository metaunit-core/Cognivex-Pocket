'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { webcrypto } = require('node:crypto');
const { TextEncoder } = require('node:util');
const read = name => fs.readFileSync(path.join(__dirname, '../js/' + name + '.js'), 'utf8');
const original = JSON.stringify({ version: 1, materials: [{ id: 'ipad-material', groups: [{ id: 'group', runs: [{ completedAt: 100 }] }] }],
  currentSession: { currentStep: 'output' }, review: { lastReviewedAt: 100, roundHistory: [{ completedAt: 100 }] } });
function boot(store, formal = true) {
  const timers = new Map(); let timer = 0;
  const context = vm.createContext({ URL, location: new URL('http://localhost:5500/'), crypto: webcrypto, TextEncoder,
    setTimeout(fn) { timers.set(++timer, fn); return timer; }, clearTimeout: id => timers.delete(id),
    navigator: { locks: { request: async (name, options, fn) => fn({ name }) } },
    localStorage: { get length() { return store.size; }, key: index => [...store.keys()][index] ?? null,
      getItem: key => store.get(key) ?? null, setItem: (key, value) => store.set(key, value), removeItem: key => store.delete(key) } });
  if (formal) vm.runInContext("Object.defineProperty(globalThis, 'PocketEnvironment', { value: Object.freeze({ version: 1, isTest: false, firebaseAllowed: true, prefix: '', storage: localStorage, requireStorage: () => localStorage, assertFirebaseAllowed() {} }), writable: false, configurable: false });", context);
  else vm.runInContext(read('environment'), context);
  for (const name of ['device-local-data', 'data-deletion', 'cloud-backup', 'storage']) vm.runInContext(read(name), context);
  return { context, service: context.PocketDeviceLocalData, timers };
}
module.exports = (async () => {
  for (const formal of [true, false]) {
    const prefix = formal ? '' : 'pocket-development-v1:';
    const otherPrefix = formal ? 'pocket-development-v1:' : '';
    const store = new Map([[prefix + 'cognivex-pocket-state', original], [prefix + 'pocket-last-view-v1', '{"page":"home"}'],
      [otherPrefix + 'cognivex-pocket-state', 'other environment'], ['firebase:authUser:credential', 'keep'], ['unknown', 'keep']]);
    const device = boot(store, formal), prepared = device.service.preview();
    store.set(prefix + 'pocket-last-view-v1', '{"page":"home","scrollY":700}');
    store.set(prefix + 'pocket-view-history-v1', '[{"page":"learning"}]');
    await device.service.clear(prepared, '清除本地数据');
    assert.equal(store.has(prefix + 'cognivex-pocket-state'), false);
    assert.equal(store.has(prefix + 'pocket-last-view-v1'), false);
    assert.equal(store.has(prefix + 'pocket-view-history-v1'), false);
    assert.equal(store.get(otherPrefix + 'cognivex-pocket-state'), 'other environment');
    assert.equal(store.get('firebase:authUser:credential'), 'keep'); assert.equal(store.get('unknown'), 'keep');
    assert.equal(device.service.completed(), true);
    assert.throws(() => device.context.PocketStorage.saveState(JSON.parse(original)), /重新加载/);
    const reopened = boot(store, formal);
    assert.equal(reopened.context.PocketStorage.loadState().materials.length, 0);
    assert.equal(reopened.service.completed(), true);
    assert.equal(JSON.parse(store.get(prefix + 'pocket-local-reset-v1')).status, 'complete');
    store.set(prefix + 'cognivex-pocket-state', original);
    assert.equal(reopened.service.completed(), false);
  }
  const store = new Map([['cognivex-pocket-state', original], ['pocket-last-view-v1', '{"page":"home"}']]);
  const duringPause = boot(store), backup = duringPause.context.PocketCloudBackup;
  duringPause.context.PocketCloudBackup = { ...backup, async pauseForLocalReset(options) {
    await backup.pauseForLocalReset(options); store.set('pocket-last-view-v1', '{"page":"home","scrollY":900}');
  } };
  await duringPause.service.clear(duringPause.service.preview(), '清除本地数据');
  assert.equal(store.has('cognivex-pocket-state'), false);
  const changedStore = new Map([['cognivex-pocket-state', original]]), changed = boot(changedStore);
  const changedPreview = changed.service.preview();
  changedStore.set('cognivex-pocket-state', original.replace('ipad-material', 'new-material'));
  await assert.rejects(changed.service.clear(changedPreview, '清除本地数据'), /记录已变化/);
  assert.ok(changedStore.get('cognivex-pocket-state').includes('new-material'));
  const unsupportedStore = new Map([['cognivex-pocket-state', original]]), unsupported = boot(unsupportedStore);
  unsupported.context.navigator.locks = null;
  await assert.rejects(unsupported.service.clear(unsupported.service.preview(), '清除本地数据'), /安全隔离/);
  assert.equal(unsupportedStore.get('cognivex-pocket-state'), original);
  console.log('PASS: localhost VM emulated formal and test keys, navigation changes before/during clear, persistent empty restart, stale-memory write rejection, current-data success verification, substantive-change and unsupported-lock refusal.');
})().catch(error => { console.error(error); process.exitCode = 1; });
