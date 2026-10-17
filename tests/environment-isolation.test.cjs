'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm');
const { webcrypto } = require('node:crypto');
const { boot } = require('./helpers/pocket-learning-ui.cjs');
const source = name => fs.readFileSync(path.join(__dirname, '../js/' + name + '.js'), 'utf8');
function context(url, store = new Map()) {
  const c = vm.createContext({ location: new URL(url), URL, crypto: webcrypto, TextEncoder,
    localStorage: { get length() { return store.size; }, key: i => [...store.keys()][i] ?? null,
      getItem: key => store.get(key) ?? null, setItem: (key, value) => store.set(key, String(value)), removeItem: key => store.delete(key) } });
  vm.runInContext(source('environment'), c); return c;
}
(async () => {
  for (const url of ['http://localhost:5500', 'http://127.0.0.1:5500', 'https://localhost', 'http://[::1]:5500', 'file:///D:/Pocket/index.html', 'http://192.168.1.2:5500']) {
    assert.equal(context(url).PocketEnvironment.isTest, true, url);
  }
  for (const url of ['https://example.github.io/Pocket/', 'https://example.github.io/Pocket/?test=true', 'https://localhost.example.com/Pocket/']) {
    const c = context(url); assert.equal(c.PocketEnvironment.isTest, false); assert.equal(c.PocketEnvironment.storage, c.localStorage);
  }
  const store = new Map([['cognivex-pocket-state', 'untouched learning data'], ['pocket-cloud-control-v1', 'untouched old cycle']]);
  const local = context('http://localhost:5500', store), area = local.PocketEnvironment.storage;
  assert.equal(area.getItem('cognivex-pocket-state'), null);
  area.setItem('cognivex-pocket-state', 'test only');
  assert.equal(context('http://localhost:5500', store).PocketEnvironment.storage.getItem('cognivex-pocket-state'), 'test only');
  assert.equal(store.get('cognivex-pocket-state'), 'untouched learning data');
  assert.equal(area.length, 1); assert.equal(area.key(0), 'cognivex-pocket-state');
  area.clear(); assert.equal(store.size, 2); assert.equal(store.get('pocket-cloud-control-v1'), 'untouched old cycle');
  vm.runInContext(source('cloud-backup'), local);
  let calls = 0;
  assert.throws(() => local.PocketCloudBackup.createEngine({ adapter: new Proxy({}, { get() { calls++; throw Error('Cloud contacted'); } }) }), /测试环境/);
  assert.equal(calls, 0);
  const adapter = source('firebase-adapter').replace(/^import .*;\r?\n/m, '').replace('export async function', 'async function');
  vm.runInContext(adapter, local);
  await assert.rejects(local.connectFirebase(), /禁止连接/); // Guard precedes SDK import and auth persistence.
  const noEnvironment = vm.createContext({}); vm.runInContext(adapter, noEnvironment);
  await assert.rejects(noEnvironment.connectFirebase(), /禁止连接/);
  const uiStore = new Map([['cognivex-pocket-state', 'must not be read or migrated']]);
  let ui = boot({ store: uiStore, location: new URL('http://127.0.0.1:5500') });
  let state = ui.context.PocketStorage.loadState();
  assert.equal(state.materials.length, 0);
  state.materials.push({ id: 'test-A', title: '测试资料', groups: [] });
  ui.context.PocketStorage.saveState(state);
  ui = boot({ store: uiStore, location: new URL('http://127.0.0.1:5500') });
  assert.equal(ui.state().materials[0].title, '测试资料');
  assert.equal(uiStore.get('cognivex-pocket-state'), 'must not be read or migrated');
  assert.equal(ui.nodes['environment-banner'].hidden, false);
  ui.document.querySelectorAll = selector => selector === '[id^="firebase-"]' ? Object.values(ui.nodes).filter(node => node.id.startsWith('firebase-')) : [];
  ui.context.connectFirebase = () => { calls++; throw Error('Firebase UI tried connecting'); };
  vm.runInContext(source('firebase-ui').replace(/^import .*;\r?\n/m, ''), ui.context);
  await assert.rejects(ui.context.PocketPrepareRestartAutoBackup(), /测试环境/);
  await assert.rejects(ui.context.PocketVerifyManualCloudDeletion(), /测试环境/);
  await assert.rejects(ui.context.PocketClearAndRestart('confirm'), /测试环境/);
  assert.equal(calls, 0);
  assert.equal(ui.nodes['firebase-login'].disabled, true);
  vm.runInContext(source('learning-backup'), ui.context);
  const exported = await ui.context.PocketLearningBackup.create();
  assert.equal(JSON.parse(exported.rawState).materials[0].id, 'test-A');
  assert.equal(exported.entries[0].key, 'cognivex-pocket-state');
  assert.equal((await ui.context.PocketLearningBackup.verify(JSON.stringify(exported))).valid, true);
  const html = fs.readFileSync(path.join(__dirname, '../index.html'), 'utf8');
  assert.ok(html.indexOf('js/environment.js') < html.indexOf('js/data-deletion.js'));
  assert.match(html, /<script src="js\/environment.js"><\/script>/);
  console.log('PASS environment origins, isolated storage, refresh, no migration, Firebase engine/SDK guards, local learning persistence');
})().catch(error => { console.error(error); process.exitCode = 1; });
