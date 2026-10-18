'use strict';
// Mock DOM/storage only; the cloud test uses an in-memory fenced adapter.
const assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path'), vm = require('node:vm');
const { boot, seed } = require('./helpers/pocket-learning-ui.cjs');
const MAIN = 'cognivex-pocket-state';
const base = seed(2); base.materials[0].groupSize = 5;
base.dailyReverseReview = { version: 1, saveOrder: ['m1','m2'], history: [] };
const store = new Map([[MAIN, JSON.stringify(base)]]), fail = { enabled: false };
let ui = boot({ store, fail });
const open = (app, title) => {
  app.all().find(node => node['aria-label'] === `查看「${title}」资料详情`).fire('click');
  app.button('更改资料').fire('click');
};
assert.equal(ui.all().some(node => node.textContent === '修改名称'), false);
open(ui, '资料1');
assert.equal(ui.nodes['learning-heading'].textContent, '资料详情');
let subject = ui.document.getElementById('edit-material-subject'), title = ui.document.getElementById('edit-material-title');
assert.equal(subject.value, '数学'); assert.equal(title.value, '资料1');
const range = ui.document.getElementById('append-question-range'), size = ui.document.getElementById('append-group-size');
range.value = '16-25'; range.fire('input'); size.value = '4'; size.fire('input');
const appendForm = ui.content().find(node => node.tag === 'form');
const preview = ui.content().filter(node => node.tag === 'li').map(node => node.textContent);
const before = structuredClone(ui.state()), writesBeforeTyping = ui.writes.length;
title.value = '  函数专题  '; title.fire('input');
assert.deepEqual(ui.state(), before); assert.equal(ui.writes.length, writesBeforeTyping);
title.fire('keydown', { key: 'Enter', isComposing: true }); assert.deepEqual(ui.state(), before);
title.fire('keydown', { key: 'Enter' });
const renamed = structuredClone(before); renamed.materials[0].title = '函数专题';
assert.deepEqual(ui.state(), renamed); assert.equal(title.value, '函数专题');
assert.ok(ui.content().some(node => node.textContent === '资料名称已自动保存。'));
assert.equal(ui.content().find(node => node.tag === 'form'), appendForm);
assert.equal(range.value, '16-25'); assert.equal(size.value, '4');
assert.deepEqual(ui.content().filter(node => node.tag === 'li').map(node => node.textContent), preview);
assert.equal(ui.state().materials[0].groups.length, 1); // Enter does not submit append.
const writesAfterEnter = ui.writes.length; title.fire('blur'); assert.equal(ui.writes.length, writesAfterEnter);
subject.value = '  物理  '; subject.fire('input'); subject.fire('blur');
renamed.materials[0].subject = '物理'; assert.deepEqual(ui.state(), renamed);
assert.ok(ui.content().some(node => node.tag === 'h3' && node.textContent === '物理 · 函数专题'));
assert.ok(ui.all().some(node => node['aria-label'] === '查看「函数专题」资料详情'));
assert.equal(ui.content().find(node => node.tag === 'form'), appendForm);
assert.equal(range.value, '16-25'); assert.equal(size.value, '4');
// One invalid/unsaved field cannot prevent saving the other field.
title.value = '  '; title.fire('blur'); assert.deepEqual(ui.state(), renamed); assert.equal(title.value, '函数专题');
assert.match(ui.content().map(node => node.textContent).join('\n'), /资料名称不能为空/);
subject.value = ''; subject.fire('blur'); assert.deepEqual(ui.state(), renamed); assert.equal(subject.value, '物理');
assert.match(ui.content().map(node => node.textContent).join('\n'), /学科不能为空/);
title.value = '尚未提交的名称'; title.fire('input'); subject.value = '英语'; subject.fire('blur');
renamed.materials[0].subject = '英语'; assert.deepEqual(ui.state(), renamed); assert.equal(title.value, '尚未提交的名称');
title.value = '函数专题';
fail.enabled = true; subject.value = '失败的学科'; subject.fire('blur'); fail.enabled = false;
assert.deepEqual(ui.state(), renamed); assert.equal(subject.value, '英语');
assert.match(ui.content().map(node => node.textContent).join('\n'), /保存失败：Quota blocked/);
assert.ok(!ui.content().some(node => node.textContent === '失败的学科已自动保存。'));
assert.throws(() => ui.context.PocketStorage.updateMaterialMetadata(ui.state(), 'm1', 'groups', 'no'), /只能修改/);
assert.throws(() => ui.context.PocketStorage.updateMaterialMetadata(ui.state(), 'm1', 'subject', null), /不能为空/);
// Returning and reopening use the same IDs and latest metadata.
ui.button('返回已学内容').fire('click');
assert.ok(ui.content().some(node => node.textContent === '英语 · 函数专题'));
assert.equal(ui.all().some(node => node.textContent === '修改名称'), false);
ui = boot({ store, fail }); open(ui, '函数专题');
assert.equal(ui.document.getElementById('edit-material-subject').value, '英语');
assert.equal(ui.document.getElementById('edit-material-title').value, '函数专题');
assert.deepEqual(ui.state(), renamed);
assert.deepEqual(Array.from(ui.context.PocketDailyReverse.orderedIds(ui.state())), ['m1','m2']);
assert.deepEqual([...new Set(ui.context.PocketMaterialReview.groups(ui.state()).map(group => group.materialId))], ['m2','m1']);
// Append uses the latest metadata and keeps all original group/history fields.
ui.document.getElementById('append-question-range').value = '16-25';
ui.document.getElementById('append-question-range').fire('input');
ui.content().find(node => node.tag === 'form').fire('submit');
assert.equal(ui.state().materials[0].groups.length, 3);
assert.deepEqual(ui.state().materials[0].groups[0], renamed.materials[0].groups[0]);
assert.equal(ui.state().materials[0].subject, '英语'); assert.equal(ui.state().currentSession.title, '函数专题');
// Active original queues block append, but metadata edits neither reset nor complete them.
const busy = seed(1);
busy.materialReviewSession = { queueVersion: 2, currentStep: 'output', materialId: 'm1',
  queue: [{ materialId: 'm1', groupId: 'g1', status: 'pending' }], currentQueueIndex: 0, completedGroupCount: 0 };
const busyUI = boot({ store: new Map([[MAIN, JSON.stringify(busy)]]) });
const busyBefore = structuredClone(busyUI.state()); open(busyUI, '资料1');
assert.equal(busyUI.document.getElementById('append-question-range'), undefined);
const busySubject = busyUI.document.getElementById('edit-material-subject'); busySubject.value = '化学'; busySubject.fire('blur');
busyBefore.materials[0].subject = '化学'; assert.deepEqual(busyUI.state(), busyBefore);
// A stale tab cannot overwrite another tab's save.
const shared = new Map([[MAIN, JSON.stringify(seed(1))]]);
const tabA = boot({ store: shared }), tabB = boot({ store: shared }); open(tabA, '资料1'); open(tabB, '资料1');
tabA.document.getElementById('edit-material-title').value = 'A已保存'; tabA.document.getElementById('edit-material-title').fire('blur');
tabB.document.getElementById('edit-material-subject').value = 'B旧窗口'; tabB.document.getElementById('edit-material-subject').fire('blur');
assert.equal(tabB.state().materials[0].title, 'A已保存'); assert.equal(tabB.state().materials[0].subject, '数学');
assert.match(tabB.content().map(node => node.textContent).join('\n'), /其他窗口已更新/);
// Localhost edits stay in the existing isolated development namespace.
const formalBytes = JSON.stringify(seed(1)), localStore = new Map([[MAIN, formalBytes]]);
const prefix = 'pocket-development-v1:'; localStore.set(prefix + MAIN, JSON.stringify(seed(1)));
const localUI = boot({ store: localStore, location: { href: 'http://localhost:5500/' } }); open(localUI, '资料1');
localUI.document.getElementById('edit-material-subject').value = '本地测试学科'; localUI.document.getElementById('edit-material-subject').fire('blur');
assert.equal(localStore.get(MAIN), formalBytes); assert.equal(localUI.context.PocketEnvironment.firebaseAllowed, false);
assert.equal(localUI.context.PocketFirebaseAdapter, undefined);
assert.equal(JSON.parse(localStore.get(prefix + MAIN)).materials[0].subject, '本地测试学科');
(async () => {
  const { local, bind } = require('./helpers/pocket-cloud-fixture.cjs');
  const { fenced } = require('./helpers/pocket-generation-fixture.cjs');
  const cloud = fenced(); cloud.rotate('metadata-cycle-0000001'); const device = local(cloud, seed(1));
  await bind(device); const revision = cloud.cycles.get('A').lastRevision;
  let state = device.context.PocketStorage.loadState();
  state = device.context.PocketStorage.updateMaterialMetadata(state, 'm1', 'subject', '科学');
  state = device.context.PocketStorage.updateMaterialMetadata(state, 'm1', 'title', '新资料名称');
  await device.engine.retry();
  assert.equal(device.engine.view().latestVerified, true); assert.equal(device.engine.view().pending, false);
  assert.equal(cloud.cycles.get('A').lastRevision, revision + 1);
  const snapshot = await device.engine.readSnapshot('A', cloud.heads.get('A').snapshotId);
  assert.deepEqual(JSON.parse(snapshot.backup.rawState), JSON.parse(device.store.get(MAIN)));
  const backup = await device.context.PocketLearningBackup.create();
  assert.equal((await device.context.PocketLearningBackup.verify(JSON.stringify(backup))).valid, true);
  const restored = boot({ store: new Map([[MAIN, backup.rawState]]) });
  assert.equal(restored.state().materials[0].subject, '科学'); assert.equal(restored.state().materials[0].title, '新资料名称');
  vm.runInContext(fs.readFileSync(path.join(__dirname, '../js/learning-archive.js'), 'utf8'), device.context);
  const markdown = device.context.PocketLearningArchive.render(backup.rawState);
  assert.match(markdown, /科学/); assert.match(markdown, /新资料名称/);
  console.log('PASS: detail-only independent metadata autosave/Enter/blur/IME, no append redraw or submission, validation/failure/stale tabs, preserved IDs/history/review order, reload, append, local isolation, JSON/Markdown and mock cloud readback.');
})().catch(error => { console.error(error); process.exitCode = 1; });
