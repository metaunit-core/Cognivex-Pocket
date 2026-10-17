'use strict';
const assert = require('node:assert/strict'), fs = require('node:fs'), vm = require('node:vm');
const { local, bind } = require('./helpers/pocket-cloud-fixture.cjs');
const { fenced } = require('./helpers/pocket-generation-fixture.cjs');
async function screen(cloud, store) {
  const d = local(cloud, null, store), nodes = new Map(), events = {};
  const get = id => {
    if (!nodes.has(id)) nodes.set(id, { id, textContent: '', disabled: false, hidden: false, open: false,
      events: {}, addEventListener(k, f) { this.events[k] = f; }, replaceChildren() {}, focus() {} });
    return nodes.get(id);
  };
  d.context.document = { getElementById: get, addEventListener() {} };
  d.context.window = { addEventListener(k, f) { events[k] = f; }, confirm: () => true };
  d.context.PocketEnvironment = { firebaseAllowed: true, isTest: false };
  d.context.connectFirebase = async () => ({ adapter: cloud.adapter,
    target: { projectId: 'cognivex-pocket', databaseId: '(default)' }, observe() {} });
  vm.runInContext(fs.readFileSync('js/firebase-ui.js', 'utf8').replace(/^import[^\n]*\n/, ''), d.context);
  await vm.runInContext('connect()', d.context);
  const engine = vm.runInContext('engine', d.context);
  await engine.setUser({ uid: 'A' });
  return { d, get, engine, click: () => get('firebase-bind-local').events.click(),
    feedback: () => get('firebase-local-backup-feedback').textContent };
}
(async () => {
  const cloud = fenced(); cloud.rotate('ui-cycle-000000000001');
  const seed = local(cloud); await bind(seed);
  seed.change(s => { s.materials[0].groups[0].keyQuestions = 'pending local'; });
  const ui = await screen(cloud, seed.store);
  let confirmations = [];
  ui.d.context.window.confirm = message => { confirmations.push(message); return true; };
  await ui.click();
  assert.equal(confirmations.length, 2); assert.match(confirmations[0], /本地：|云端：/);
  assert.match(ui.feedback(), /最新数据已备份/);
  assert.equal(ui.engine.view().latestVerified, true);
  const commitsBeforeDiagnosis = cloud.stats.commits;
  await ui.get('firebase-readonly-diagnose').events.click();
  const diagnostics = ui.get('firebase-readonly-report').textContent;
  assert.match(diagnostics, /当前 Firebase 项目：cognivex-pocket/);
  assert.match(diagnostics, /Firestore 数据库：\(default\)/);
  assert.match(diagnostics, /users\/A\/backup\/head/);
  assert.match(diagnostics, /内容摘要一致：是/);
  assert.doesNotMatch(diagnostics, /must never upload|authUser|password|idToken/);
  assert.equal(cloud.stats.commits, commitsBeforeDiagnosis);
  ui.d.context.PocketCloudSignal.saved('cognivex-pocket-state');
  assert.doesNotMatch(ui.feedback(), /最新数据已备份/);
  // Fresh reload has no comparison; clicking still compares and confirms.
  const reopened = await screen(cloud, seed.store);
  assert.equal(reopened.engine.view().comparison, null);
  await reopened.click(); assert.match(reopened.feedback(), /最新数据已备份/);
  // Rendering during comparison must not re-enable an active button.
  seed.change(s => { s.materials[0].groups[0].keyQuestions = 'duplicate pending'; });
  const head = cloud.adapter.head; let entered, release;
  const ready = new Promise(r => { entered = r; });
  cloud.adapter.head = async uid => { entered(); await new Promise(r => { release = r; }); return head(uid); };
  confirmations = []; const first = ui.click(); await ready;
  assert.equal(ui.get('firebase-bind-local').disabled, true);
  assert.match(ui.feedback(), /正在比较/);
  await ui.click(); assert.equal(confirmations.length, 0);
  cloud.adapter.head = head; release(); await first; assert.equal(confirmations.length, 2);
  // Cloud changes after comparison: reject before any local-first upload.
  const other = local(cloud, null, new Map(seed.store)); await other.engine.setUser({ uid: 'A' });
  other.change(s => { s.materials[0].groups[0].keyQuestions = 'other device'; });
  seed.change(s => { s.materials[0].groups[0].keyQuestions = 'local before race'; });
  ui.d.context.window.confirm = () => true;
  const originalBind = ui.engine.bindLocal;
  vm.runInContext('globalThis.testEngine = engine', ui.d.context);
  ui.d.context.testEngine = { ...ui.engine, bindLocal: async (...args) => { await other.engine.retry(); return originalBind(...args); } };
  vm.runInContext('engine = globalThis.testEngine', ui.d.context);
  await ui.click(); assert.match(ui.feedback(), /操作失败：.*云端已变化/);
  ui.d.context.testEngineOriginal = ui.engine;
  vm.runInContext('engine = globalThis.testEngineOriginal', ui.d.context);
  // Upload failures are swallowed by sync internally but remain visible here.
  seed.change(s => { s.materials[0].groups[0].keyQuestions = 'local chosen'; });
  cloud.stats.partial = true; await ui.click();
  assert.match(ui.feedback(), /操作失败：.*Write denied/);
  assert.equal(ui.engine.view().latestVerified, false);
  cloud.stats.partial = false;
  const before = cloud.stats.commits;
  ui.d.context.window.confirm = () => false; await ui.click();
  assert.match(ui.feedback(), /已取消/); assert.equal(cloud.stats.commits, before);
  // Old generation cannot be rebound or initialized even with explicit confirmation.
  cloud.cycles.get('A').generation = 'ui-new-cycle-000000002';
  const h = cloud.heads.get('A'); h.generation = cloud.cycles.get('A').generation;
  cloud.manifests.get('A/' + h.snapshotId).generation = h.generation;
  for (const [key, chunk] of cloud.chunks) if (key.startsWith('A/' + h.snapshotId + '/')) chunk.generation = h.generation;
  ui.d.context.window.confirm = () => true;
  await ui.click(); assert.match(ui.feedback(), /旧备份周期/);
  assert.equal(cloud.stats.commits, before); assert.equal(cloud.stats.initializations, 0);
  assert.equal(seed.store.get('cognivex-pocket-state'), ui.d.store.get('cognivex-pocket-state'));
  console.log('PASS: bound click events, fresh comparison, two confirmations, visible progress/cancellation/failure, refresh, duplicate click, concurrent revision rejection and old-generation protection.');
})().catch(error => { console.error(error); process.exitCode = 1; });
