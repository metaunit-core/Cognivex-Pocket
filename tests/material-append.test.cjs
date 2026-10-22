'use strict';
// Only mock storage/DOM and fake cloud adapters; never uses browser or Firebase data.
const assert = require('node:assert/strict');
const fs = require('node:fs'), vm = require('node:vm'), path = require('node:path');
const { boot, seed } = require('./helpers/pocket-learning-ui.cjs');
const MAIN = 'cognivex-pocket-state';
const clock = { now: new Date(2026, 9, 18, 9).getTime() };
function fixture() {
  const state = seed(2), material = state.materials[0], original = material.groups[0];
  material.questionRange = '1-15'; material.groupSize = 5;
  material.groups = Array.from({ length: 3 }, (_, index) => ({ ...structuredClone(original),
    id: 'original-' + index, start: index * 5 + 1, end: index * 5 + 5 }));
  state.materials[1].groups[0].id = 'other-group';
  material.totalGroups = 3;
  material.materialReviewHistory = [{ id: 'historical-review', completedAt: 50 }];
  state.currentSession = { materialId: material.id, currentStep: 'materialComplete', mode: 'review',
    currentGroupIndex: 2, currentRunIndex: 0,
    schedulerState: { phase: 'complete', newGroupIndex: 2, reviewGroupIndex: 2 } };
  state.activeSessionType = 'learning';
  return state;
}
function detail(ui) {
  ui.document.getElementById('learned-material-details').fire('click');
  ui.all().find(node => node.tag === 'button' && node['aria-label'] === '查看「资料1」资料详情').fire('click');
  ui.button('更改资料').fire('click');
}
function fill(ui, range, size = '5') {
  const input = ui.document.getElementById('append-question-range'); input.value = range; input.fire('input');
  const count = ui.document.getElementById('append-group-size'); count.value = size; count.fire('input');
}
function submit(ui) { ui.content().find(node => node.tag === 'form').fire('submit'); }
const base = fixture(), store = new Map([[MAIN, JSON.stringify(base)]]), fail = { enabled: false };
let ui = boot({ store, clock, fail });
detail(ui);
assert.equal(ui.nodes['learning-heading'].textContent, '资料详情');
const beforeCancel = structuredClone(ui.state()); fill(ui, '16-25'); ui.button('取消').fire('click');
assert.deepEqual(ui.state(), beforeCancel);
ui.button('更改资料').fire('click');
for (const invalid of ['15-20', '16-20,20-25', '16,16', '20-16', 'abc', '16-20,']) {
  fill(ui, invalid); assert.equal(ui.button('保存新增分组').disabled, true); submit(ui);
  assert.deepEqual(ui.state(), beforeCancel);
}
fill(ui, '16-20,23,25-30');
assert.equal(ui.button('保存新增分组').disabled, false);
assert.ok(ui.content().some(node => /^第7组：30/.test(node.textContent)));
fill(ui, '16-25');
fail.enabled = true; submit(ui); fail.enabled = false;
assert.deepEqual(ui.state(), beforeCancel);
assert.match(ui.content().map(node => node.textContent).join('\n'), /Quota blocked/);
submit(ui);
let state = ui.state(), material = state.materials[0];
assert.equal(state.materials.length, 2); assert.equal(material.groups.length, 5);
assert.deepEqual(material.groups.slice(0, 3), base.materials[0].groups);
for (const key of ['id','sectionId','createdAt','completedAt','addedToReviewAt','videoLinks','outputLinks','materialReviewHistory']) {
  assert.deepEqual(material[key], base.materials[0][key]);
}
assert.equal(new Set(material.groups.map(group => group.id)).size, 5);
assert.equal(material.groups[3].executionCompleted, false);
assert.equal(material.groups[4].runs.length, 0);
assert.equal(state.currentSession.currentGroupIndex, 3);
assert.deepEqual(state.completedLearningSessions[0], base.currentSession);
assert.equal(ui.context.PocketMaterialReview.counts(state).total, 4); // 3 old + other material; not 6.
assert.deepEqual(Array.from(ui.context.PocketDailyReverse.orderedIds(state)), ['m1', 'm2']);
ui.button('视频').fire('click');
assert.ok(ui.content().some(node => node.textContent === 'VIDEO'));
assert.ok(ui.content().some(node => node.href === base.materials[0].videoLinks[0].url));
for (const [id, value] of [['group-latest-accuracy','4/5'],['group-latest-duration','6.5']]) {
  const input = ui.document.getElementById(id); input.value = value; input.fire('input');
}
assert.equal(ui.state().materials[0].groups[3].latestAccuracyPercent, 80);
assert.equal(ui.state().materials[0].groups[3].latestDurationMinutes, 6.5);
assert.equal(ui.content().some(node => node.tag === 'textarea' && node.id === 'group-key-questions'), false);
assert.deepEqual(ui.state().materials[0].groups.slice(0, 3), base.materials[0].groups);
// Refresh retains the exact new learning checkpoint and unfinished groups.
ui = boot({ store, clock }); assert.equal(ui.state().currentSession.currentGroupIndex, 3);
const order = [], originalRuns = base.materials[0].groups.map(group => structuredClone(group.runs));
let attempts = 0;
while (ui.state().currentSession.currentStep !== 'materialComplete') {
  assert.ok(++attempts < 40, 'Scheduler must finish');
  const active = ui.state().currentSession;
  if (active.currentStep === 'output') {
    order.push([active.mode, active.currentGroupIndex]);
    ui.button('输出达标 → 下一步').fire('click');
  } else {
    const before = ui.state();
    const expected = { ...before.currentSession, sessionType: 'learning' };
    ui.context.PocketStorage.updateState(before, next => ui.context.PocketExecutor.transition(next, 'continue', expected));
    ui = boot({ store, clock });
  }
}
assert.deepEqual(order, [['new',3],['review',0],['review',1],['review',2],['review',3],
  ['new',4],['review',0],['review',1],['review',2],['review',3],['review',4]]);
state = ui.state(); material = state.materials[0];
assert.equal(material.status, 'completed'); assert.equal(material.completedAt, base.materials[0].completedAt);
originalRuns.forEach((runs, index) => assert.deepEqual(material.groups[index].runs.slice(0, runs.length), runs));
assert.equal(ui.context.PocketMaterialReview.counts(state).total, 6);
assert.deepEqual([...new Set(ui.context.PocketMaterialReview.groups(state).map(group => group.materialId))], ['m2','m1']);
assert.deepEqual(Array.from(ui.context.PocketDailyReverse.orderedIds(state)), ['m1','m2']);
// A completed daily snapshot survives append; next day snapshots include learned additions.
const daily = ui.context.PocketDailyReverse;
let completed = structuredClone(state); daily.start(completed);
while (!daily.complete(completed.dailyReverseReview.round, daily.day())) {
  const round = completed.dailyReverseReview.round, task = daily.task(completed);
  daily.finish(completed, { roundId: round.id, index: round.index, taskIndex: round.taskIndex,
    materialId: task.material.id, currentGroupIndex: task.groupIndex });
}
const dailyBefore = JSON.stringify(completed.dailyReverseReview);
const previousGroups = JSON.stringify(completed.materials[0].groups);
ui.context.PocketGrouping.appendToMaterial(completed, 'm1', '31-35', 5);
assert.equal(completed.materials[0].groups.length, 6);
assert.equal(JSON.stringify(completed.materials[0].groups.slice(0, 5)), previousGroups);
assert.equal(JSON.stringify(completed.dailyReverseReview), dailyBefore);
assert.equal(daily.needsReview(completed), false);
clock.now += 86400000; daily.start(completed);
assert.equal(completed.dailyReverseReview.round.tasks.filter(task => task.materialId === 'm1').length, 5);
assert.ok(daily.task(completed)); // 6 physical groups, only 5 learned groups; no false corruption error.
const savedRound = JSON.stringify(completed.dailyReverseReview.round);
completed.materials[0].groups[5].executionCompleted = true;
completed.materials[0].groups[5].addedToReviewAt = clock.now;
assert.ok(daily.task(completed)); // Admission while a round is running does not enlarge that round.
assert.equal(JSON.stringify(completed.dailyReverseReview.round), savedRound);
// Busy task/queue/day progress protections leave their records untouched.
for (const kind of ['learning','review','daily']) {
  const blocked = fixture();
  if (kind === 'learning') blocked.currentSession.currentStep = 'output';
  if (kind === 'review') blocked.materialReviewSession = { currentStep: 'output', queue: [{ original: true }] };
  if (kind === 'daily') daily.start(blocked);
  const raw = JSON.stringify(blocked);
  assert.throws(() => ui.context.PocketGrouping.appendToMaterial(blocked, 'm1', '16-20', 5));
  assert.equal(JSON.stringify(blocked), raw);
}
// Stale tabs cannot persist an append over another tab's saved change.
const stale = fixture(), staleStore = new Map([[MAIN, JSON.stringify(stale)]]);
const first = boot({ store: staleStore, clock }), second = boot({ store: staleStore, clock });
first.context.PocketStorage.renameMaterial(first.state(), 'm1', '已被其他标签页修改');
assert.throws(() => second.context.PocketStorage.updateState(stale, next => second.context.PocketGrouping.appendToMaterial(next, 'm1', '16-20', 5)), /其他窗口/);
// Existing complete JSON payload and Markdown render all old/new groups without a protocol change.
for (const name of ['learning-backup', 'learning-archive']) vm.runInContext(fs.readFileSync(path.join(__dirname, '../js/' + name + '.js'), 'utf8'), ui.context);
const raw = JSON.stringify(state), restored = JSON.parse(raw);
assert.deepEqual(restored, state);
const markdown = ui.context.PocketLearningArchive.render(raw, new Date(clock.now).toISOString());
assert.match(markdown, /16.*20/); assert.match(markdown, /21.*25/);
assert.equal(restored.materials[0].groups[0].id, base.materials[0].groups[0].id);
(async () => {
  const backup = await ui.context.PocketLearningBackup.create();
  assert.equal((await ui.context.PocketLearningBackup.verify(JSON.stringify(backup))).valid, true);
  const recovery = boot({ store: new Map([[MAIN, backup.rawState]]), clock });
  assert.deepEqual(recovery.state().materials, state.materials);
  // Run the real backup engine against in-memory generation/revision-fenced adapters.
  const { local, bind } = require('./helpers/pocket-cloud-fixture.cjs');
  const { fenced } = require('./helpers/pocket-generation-fixture.cjs');
  const cloud = fenced(); cloud.rotate('append-cycle-000000001');
  const device = local(cloud, fixture());
  for (const name of ['grouping','scheduler','history','daily-reverse-review','executor','material-review']) {
    vm.runInContext(fs.readFileSync(path.join(__dirname, '../js/' + name + '.js'), 'utf8'), device.context);
  }
  await bind(device);
  const generation = cloud.cycles.get('A').generation, revision = cloud.cycles.get('A').lastRevision;
  device.change(next => device.context.PocketGrouping.appendToMaterial(next, 'm1', '16-25', 5));
  await device.engine.retry();
  assert.equal(device.engine.view().latestVerified, true); assert.equal(device.engine.view().pending, false);
  assert.equal(cloud.cycles.get('A').generation, generation);
  assert.equal(cloud.cycles.get('A').lastRevision, revision + 1);
  const currentBackup = await device.context.PocketLearningBackup.create();
  const hash = await device.context.PocketCloudBackup.sha(JSON.stringify(currentBackup.entries.map(entry => [entry.key, entry.content])));
  assert.equal(hash, cloud.heads.get('A').dataHash);
  console.log('PASS: append UI/preview/cancel/duplicates/atomic failure, preserved identities/history, refresh, original internal scheduler, independent review ordering/progress, stale tabs, JSON recovery/Markdown, fenced automatic upload and readback.');
})().catch(error => { console.error(error); process.exitCode = 1; });
