'use strict';
const assert = require('node:assert/strict');
const { boot, seed } = require('./helpers/pocket-learning-ui.cjs');
const MAIN = 'cognivex-pocket-state';
const store = new Map(), clock = { now: new Date(2026, 9, 18, 9).getTime() }, fail = { enabled: false };
const initial = seed();
initial.review.unlock = { generation: 0, usedAt: null, collectionKey: JSON.stringify(initial.materials.map(m => JSON.stringify([m.id, m.groups[0].id])).sort()) };
store.set(MAIN, JSON.stringify(initial)); store.set('pocket-last-view-v1', JSON.stringify({ page: 'home' }));
let app = boot({ store, clock, fail });
assert.equal(app.context.PocketNavigation.pocket().page, 'home');
assert.equal(app.state().dailyReverseReview, undefined); // No automatic prompt, state write or navigation.
assert.equal(app.focus.length, 0);
app.context.PocketLearning.startNewMaterial();
assert.match(app.nodes.message.textContent, /请先完成今日正序复习/);
assert.equal(app.state().dailyReverseReview?.round, undefined); // Still requires an explicit start.
assert.equal(app.focus.at(-1).id, 'daily-reverse-review-entry');
assert.equal(app.nodes['learned-material-details'].open, true);
assert.equal(app.context.PocketMaterialReview.canCreate(app.state()), false);
// Metadata editing is available only in the existing material detail editor.
function openEditor(ui, title) {
  ui.all().find(n => n['aria-label'] === `查看「${title}」资料详情`).fire('click');
  ui.button('更改资料').fire('click');
}
assert.equal(app.all().some(n => n.textContent === '修改名称'), false);
const oldState = app.state(); openEditor(app, '资料1');
let input = app.document.getElementById('edit-material-title'); input.value = '  ';
input.fire('blur'); assert.deepEqual(app.state(), oldState); assert.match(app.content().map(n => n.textContent).join('\n'), /不能为空/);
input.value = '  新名称  '; app.context.scrollY = 888; input.fire('blur');
const expected = structuredClone(oldState); expected.materials[0].title = '新名称'; assert.deepEqual(app.state(), expected);
assert.equal(app.context.scrollY, 888);
assert.equal(app.context.PocketNavigation.pocket().page, 'learned-content');
app = boot({ store, clock, fail }); assert.equal(app.state().materials[0].title, '新名称');
assert.doesNotMatch(app.nodes.message.textContent, /开始正式学习新的资料前/);
openEditor(app, '新名称'); input = app.document.getElementById('edit-material-title');
input.value = 'failed save'; fail.enabled = true; input.fire('blur'); fail.enabled = false;
assert.equal(app.state().materials[0].title, '新名称'); assert.equal(input.value, '新名称');
const outsideDaily = state => { const result = structuredClone(state); delete result.dailyReverseReview; return result; };
const beforeRound = outsideDaily(app.state());
app.document.getElementById('daily-reverse-review-entry').fire('click');
assert.equal(app.nodes['learning-heading'].textContent, '每日正序复习');
assert.equal(app.context.PocketDailyReverse.current(app.state()).id, 'm1');
assert.deepEqual(outsideDaily(app.state()), beforeRound);
const roundBeforeRename = JSON.stringify(app.state().dailyReverseReview);
openEditor(app, '新名称'); input = app.document.getElementById('edit-material-title');
input.value = '最新资料改名'; input.fire('blur'); beforeRound.materials[0].title = '最新资料改名';
assert.equal(JSON.stringify(app.state().dailyReverseReview), roundBeforeRename);
app.context.PocketNavigation.back();
assert.ok(app.content().some(n => n.tag === 'h3' && n.textContent === '数学 · 最新资料改名'));
// Existing VIDEO/OUTPUT editor works in this independent round without a run/queue mutation.
app.button('输出').fire('click');
app.content().filter(n => n.tag === 'button' && n.textContent === '＋ 新增链接')[0].fire('click');
let form = app.content().find(n => n.tag === 'form');
app.document.getElementById('group-output-title').value = '每日笔记';
app.document.getElementById('group-output-url').value = 'https://example.test/note'; form.fire('submit');
assert.equal(app.state().materials[0].outputLinks.length, 1);
const afterLink = outsideDaily(app.state()); assert.deepEqual(afterLink.review, beforeRound.review);
assert.deepEqual(afterLink.materials[0].groups, beforeRound.materials[0].groups);
const seen = [];
for (let i = 0; i < 9; i++) {
  seen.push(app.context.PocketDailyReverse.current(app.state()).id);
  if (i === 2) {
    app.button('返回已学内容').fire('click'); app.context.PocketLearning.startNewMaterial();
    assert.match(app.nodes.message.textContent, /请先完成今日正序复习/);
    const round = JSON.stringify(app.state().dailyReverseReview.round);
    app = boot({ store, clock, fail }); assert.equal(JSON.stringify(app.state().dailyReverseReview.round), round);
    app.button('继续每日正序复习').fire('click');
  }
  const done = app.button('\u8f93\u51fa\u8fbe\u6807 \u2192 \u4e0b\u4e00\u6b65');
  if (i === 3) {
    fail.enabled = true; done.fire('click'); fail.enabled = false;
    assert.equal(app.state().dailyReverseReview.round.index, i);
  }
  done.fire('click'); done.fire('click'); // A detached stale event cannot complete another material.
  assert.equal(app.state().dailyReverseReview.round.index, i + 1);
}
assert.deepEqual(seen, [1,2,3,4,5,6,7,8,9].map(n => 'm' + n));
assert.equal(app.context.PocketMaterialReview.canCreate(app.state()), true);
assert.deepEqual(outsideDaily(app.state()), { ...afterLink, currentSession: app.state().currentSession, activeSessionType: 'learning' });
assert.equal(app.nodes['learning-heading'].textContent, '新资料');
assert.ok(app.state().currentSession.draft); // Immediately unlocked, original grant already satisfied.
const draft = structuredClone(app.state().currentSession);
const existingPage = JSON.stringify(app.context.PocketNavigation.pocket());
clock.now = new Date(2026, 9, 19, 9).getTime(); app.fire('focus');
assert.equal(JSON.stringify(app.context.PocketNavigation.pocket()), existingPage); assert.deepEqual(app.state().currentSession, draft);
assert.equal(app.context.PocketDailyReverse.needsReview(app.state()), true);
const todayState = JSON.stringify(app.state()); app.fire('focus'); assert.equal(JSON.stringify(app.state()), todayState);
app.context.PocketLearning.startNewMaterial();
assert.match(app.nodes.message.textContent, /请先完成今日正序复习/);
const bypass = app.state(); bypass.currentSession.currentStep = 'grouping'; bypass.review.grandfatheredDraftId = bypass.currentSession.materialId;
assert.throws(() => app.context.PocketMaterialReview.createMaterial(bypass, { id: bypass.currentSession.materialId, groups: [] }), /今日正序复习/);
app.button('每日正序复习').fire('click'); assert.equal(app.state().dailyReverseReview.history.length, 1);
const empty = new Map([[MAIN, JSON.stringify(seed(0))]]); const fresh = boot({ store: empty, clock });
assert.equal(fresh.context.PocketDailyReverse.needsReview(fresh.state()), false); fresh.context.PocketLearning.startNewMaterial(); assert.ok(fresh.state().currentSession.draft);
// Detail metadata editing preserves the original review's task, group/run and queue.
const oldReview = seed(1);
oldReview.dailyReverseReview = { version: 1, saveOrder: ['m1'], history: [], promptedDay: app.context.PocketDailyReverse.day(clock.now) };
oldReview.materials[0].groups[0].runs.push({ mode: 'material-review', startedAt: 10, completedAt: null, outputCompleted: false, videoSkipped: true, reviewRoundId: 'old-round' });
oldReview.activeSessionType = 'material-review';
oldReview.materialReviewSession = { queueVersion: 2, roundId: 'old-round', materialIds: ['m1'], materialId: 'm1', currentMaterialIndex: 0,
  currentQueueIndex: 0, completedGroupCount: 0, completedMaterials: [], currentGroupIndex: 0, currentRunIndex: 1, currentStep: 'output', mode: 'material-review',
  queue: [{ materialId: 'm1', groupId: 'g1', runIndex: 1, startedAt: 10, status: 'pending' }] };
const live = boot({ store: new Map([[MAIN, JSON.stringify(oldReview)]]), clock }); live.button('视频').fire('click');
const liveBefore = live.state(); openEditor(live, '资料1');
const liveInput = live.document.getElementById('edit-material-title');
liveInput.value = '原复习中改名'; live.context.scrollY = 777; liveInput.fire('blur');
liveBefore.materials[0].title = '原复习中改名'; assert.deepEqual(live.state(), liveBefore);
assert.equal(live.context.scrollY, 777); live.context.PocketNavigation.back();
assert.ok(live.button('← 返回 OUTPUT'));
assert.ok(live.content().some(n => n.tag === 'dd' && n.textContent === '原复习中改名'));
console.log('PASS: detail metadata autosave/empty/failure/reload, explicit creation-only daily guidance, shared links, independent review queues, daily+original gates, next-day recheck and empty library.');
