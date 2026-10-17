'use strict';
const assert = require('node:assert/strict'), fs = require('node:fs'), vm = require('node:vm');
const { boot, seed } = require('./helpers/pocket-learning-ui.cjs');
const P = 'pocket-development-v1:', MAIN = 'cognivex-pocket-state';
const location = new URL('http://127.0.0.1:5500');
let allow = false, confirms = 0;
const locks = { request: async (name, options, fn) => fn({ name }) };
const desktop = { navigator: { platform: 'Win32', userAgent: 'Mozilla/5.0 Windows NT 10.0', maxTouchPoints: 0, locks },
  matchMedia: () => ({ matches: true }), confirm(message) { confirms++; assert.match(message, /确定清空电脑测试版/); return allow; } };
(async () => {
  const production = new Map([[MAIN, 'production raw bytes'], ['pocket-cloud-control-v1', 'production backup control'], ['firebase:authUser:secret', 'authentication unchanged'], ['other-app-key', 'unrelated']]);
  const store = new Map([...production, [P + MAIN, JSON.stringify(seed(3))], [P + 'pocket-daily-review-test-date-v1', '2030-01-01'],
    [P + 'pocket-training-sop-model-v1', '{"test":"draft"}'], [P + 'pocket-listening-start-v1', '{}'],
    [P + 'pocket-offline-backup-meta-v1', '{"lastExportAt":1}'], [P + 'firebase:authUser:secret', 'even prefixed auth is preserved'],
    [P + 'pocket-cloud-emergency-00000000-0000-4000-8000-000000000000', 'test rescue']]);
  const ui = boot({ store, location, device: desktop });
  assert.equal(ui.nodes['clear-local-test-data'].hidden, false);
  const beforeCancel = [...store];
  assert.equal(await ui.context.PocketLocalTestTools.clear(), false);
  assert.deepEqual([...store], beforeCancel);
  let networkCalls = 0;
  for (const key of ['fetch', 'WebSocket', 'XMLHttpRequest', 'connectFirebase']) ui.context[key] = () => { networkCalls++; throw Error('Network forbidden'); };
  allow = true;
  const staleTab = boot({ store, location, device: desktop });
  await ui.nodes['clear-local-test-data'].events.click[0]();
  assert.match(ui.nodes['clear-local-test-status'].textContent, /已清空/);
  assert.equal(ui.nodes['clear-local-test-data'].disabled, false);
  assert.throws(() => staleTab.context.PocketDataDeletion.ensureReady(), /已清空/);
  assert.equal(networkCalls, 0);
  assert.equal(confirms, 2);
  for (const [key, raw] of production) assert.equal(store.get(key), raw);
  assert.equal(store.get(P + 'firebase:authUser:secret'), 'even prefixed auth is preserved');
  assert.equal(ui.state().materials.length, 0); assert.equal(ui.state().currentSession, null);
  assert.equal(ui.state().materialReviewSession, undefined); assert.equal(ui.state().dailyReverseReview, undefined);
  assert.equal(ui.context.PocketNavigation.pocket().page, 'home');
  assert.equal(ui.context.PocketDailyTestDate.dayOverride(), null);
  assert.equal(ui.nodes['daily-test-date'].value, '2026-10-18');
  assert.equal(store.has(P + 'pocket-cloud-emergency-00000000-0000-4000-8000-000000000000'), false);
  assert.equal(store.has(P + 'pocket-training-sop-model-v1'), false);
  assert.equal(store.has(P + 'pocket-listening-start-v1'), false);
  assert.equal(store.has(P + 'pocket-offline-backup-meta-v1'), false);
  const reopened = boot({ store, location, device: desktop });
  assert.equal(reopened.state().materials.length, 0);
  assert.equal(reopened.context.PocketLearning.startNewMaterial(), true);
  assert.ok(reopened.content().some(node => node.id === 'subject'));
  assert.throws(() => reopened.context.PocketCloudBackup.createEngine({}), /禁止连接/);
  const deniedLocks = { request: async (name, options, fn) => fn(options.mode === 'exclusive' ? null : { name }) };
  const occupiedStore = new Map([[P + MAIN, JSON.stringify(seed(1))]]);
  const occupied = boot({ store: occupiedStore, location, device: { ...desktop, navigator: { ...desktop.navigator, locks: deniedLocks } } });
  const occupiedBefore = [...occupiedStore];
  await assert.rejects(occupied.context.PocketLocalTestTools.clear(), /关闭其他/);
  assert.deepEqual([...occupiedStore], occupiedBefore);
  for (const [address, device] of [
    ['https://metaunit-core.github.io/Cognivex-Pocket/?test=true', desktop],
    ['https://unknown-preview.example/Pocket/', desktop],
    ['http://192.168.1.8:5500', desktop],
    ['file://remote-server/Pocket/index.html', desktop],
    [location.href, { ...desktop, navigator: { ...desktop.navigator, platform: 'iPhone', userAgent: 'iPhone' } }],
    [location.href, { ...desktop, navigator: { ...desktop.navigator, platform: 'MacIntel', maxTouchPoints: 5 } }],
    [location.href, { ...desktop, navigator: { ...desktop.navigator, userAgentData: { mobile: true } } }],
    [location.href, { ...desktop, matchMedia: () => ({ matches: false }) }]
  ]) {
    const c = boot({ location: new URL(address), device });
    assert.equal(c.nodes['clear-local-test-data'].hidden, true, address);
    assert.equal(c.context.PocketLocalTestTools, undefined);
  }
  for (const environment of [undefined, { version: 1, isTest: true, firebaseAllowed: false, prefix: P }, Object.freeze({ version: 1, isTest: true, firebaseAllowed: false, prefix: P, requireStorage() { throw Error('Failed initialization'); } })]) {
    const c = vm.createContext({ PocketEnvironment: environment, location, URL, navigator: desktop.navigator, matchMedia: desktop.matchMedia });
    vm.runInContext(fs.readFileSync('js/local-test-tools.js', 'utf8'), c);
    assert.equal(c.PocketLocalTestTools, undefined);
  }
  assert.doesNotMatch(fs.readFileSync('js/local-test-tools.js', 'utf8'), /\.clear\s*\(|\blocalStorage\b|\bsessionStorage\b|\bfetch\s*\(|\.reload\s*\(/);
  console.log('PASS desktop local confirmation/cancel, namespace+key allowlist, production/auth bytes unchanged, no network, clean in-memory restart/reopen/add, real date, mobile/remote/production/invalid-environment denial');
})().catch(error => { console.error(error); process.exitCode = 1; });
