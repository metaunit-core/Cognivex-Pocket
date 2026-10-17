'use strict';
const assert = require('node:assert/strict');
const { boot, seed } = require('./helpers/pocket-learning-ui.cjs');
const MAIN = 'cognivex-pocket-state';
const store = new Map(), clock = { now: new Date(2026, 9, 18, 9).getTime() }, fail = { enabled: false };
const initial = seed();
initial.review.unlock = { generation: 0, usedAt: null, collectionKey: JSON.stringify(initial.materials.map(m => JSON.stringify([m.id, m.groups[0].id])).sort()) };
store.set(MAIN, JSON.stringify(initial)); store.set('pocket-last-view-v1', JSON.stringify({ page: 'home' }));
let app = boot({ store, clock, fail });
assert.match(app.nodes.message.textContent, /开始正式学习新的资料前/);
assert.equal(app.state().dailyReverseReview.round, undefined); // No automatic start.
assert.equal(app.focus.at(-1).id, 'daily-reverse-review-entry');
assert.equal(app.nodes['learned-material-details'].open, true);
assert.equal(app.context.PocketMaterialReview.canCreate(app.state()), false);
// Rename changes only title, keeps row/page/scroll and does not mutate drafts on cancel.
const row = app.content().find(n => n.tag === 'li'), oldState = app.state();
app.button('修改名称').fire('click'); let form = app.content().find(n => n.tag === 'form');
let input = app.content().find(n => n.tag === 'input'); input.value = '  ';
form.fire('submit'); assert.deepEqual(app.state(), oldState); assert.match(app.content().map(n => n.textContent).join('\n'), /不能为空/);
input.value = 'cancelled'; app.button('取消').fire('click'); assert.deepEqual(app.state(), oldState);
app.button('修改名称').fire('click'); form = app.content().find(n => n.tag === 'form'); input = app.content().find(n => n.tag === 'input');
input.value = '  新名称  '; app.context.scrollY = 888; form.fire('submit');
const expected = structuredClone(oldState); expected.materials[0].title = '新名称'; assert.deepEqual(app.state(), expected);
assert.ok(app.content().includes(row)); assert.equal(app.context.scrollY, 888);
assert.equal(app.context.PocketNavigation.pocket().page, 'learned-content');
assert.equal(app.all().filter(n => n.tag === 'span' && n.textContent === '数学 · 新名称').length, 2);
app = boot({ store, clock, fail }); assert.equal(app.state().materials[0].title, '新名称');
assert.doesNotMatch(app.nodes.message.textContent, /开始正式学习新的资料前/);
app.button('修改名称').fire('click'); form = app.content().find(n => n.tag === 'form'); input = app.content().find(n => n.tag === 'input');
input.value = 'failed save'; fail.enabled = true; form.fire('submit'); fail.enabled = false;
assert.equal(app.state().materials[0].title, '新名称'); assert.equal(input.value, 'failed save'); app.button('取消').fire('click');
const outsideDaily = state => { const result = structuredClone(state); delete result.dailyReverseReview; return result; };
const beforeRound = outsideDaily(app.state());
app.document.getElementById('daily-reverse-review-entry').fire('click');
assert.equal(app.nodes['learning-heading'].textContent, '每日倒序复习');
assert.equal(app.context.PocketDailyReverse.current(app.state()).id, 'm9');
assert.deepEqual(outsideDaily(app.state()), beforeRound);
const roundBeforeRename = JSON.stringify(app.state().dailyReverseReview);
app.all().find(n => n.tag === 'button' && n['aria-label'] === '修改「资料9」名称').fire('click');
form = app.all().find(n => n.tag === 'form'); input = app.all().find(n => n.tag === 'input' && n.id?.startsWith('rename-title-'));
input.value = '最新资料改名'; form.fire('submit'); beforeRound.materials[8].title = '最新资料改名';
assert.equal(JSON.stringify(app.state().dailyReverseReview), roundBeforeRename);
assert.ok(app.content().some(n => n.tag === 'h3' && n.textContent === '数学 · 最新资料改名'));
// Existing VIDEO/OUTPUT editor works in this independent round without a run/queue mutation.
app.content().filter(n => n.tag === 'button' && n.textContent === '＋ 新增链接')[1].fire('click');
form = app.content().find(n => n.tag === 'form');
app.document.getElementById('group-output-title').value = '每日笔记';
app.document.getElementById('group-output-url').value = 'https://example.test/note'; form.fire('submit');
assert.equal(app.state().materials[8].outputLinks.length, 1);
const afterLink = outsideDaily(app.state()); assert.deepEqual(afterLink.review, beforeRound.review);
assert.deepEqual(afterLink.materials[8].groups, beforeRound.materials[8].groups);
const seen = [];
for (let i = 0; i < 9; i++) {
  seen.push(app.context.PocketDailyReverse.current(app.state()).id);
  if (i === 2) {
    app.button('返回已学内容').fire('click'); app.context.PocketLearning.startNewMaterial();
    assert.match(app.nodes.message.textContent, /请先完成今日倒序复习/);
    const round = JSON.stringify(app.state().dailyReverseReview.round);
    app = boot({ store, clock, fail }); assert.equal(JSON.stringify(app.state().dailyReverseReview.round), round);
    app.button('继续每日倒序复习').fire('click');
  }
  const done = app.button(i === 8 ? '确认完成今日倒序复习' : '已完成本份资料，下一份');
  if (i === 3) {
    fail.enabled = true; done.fire('click'); fail.enabled = false;
    assert.equal(app.state().dailyReverseReview.round.index, i);
  }
  done.fire('click'); done.fire('click'); // A detached stale event cannot complete another material.
  assert.equal(app.state().dailyReverseReview.round.index, i + 1);
}
assert.deepEqual(seen, [9,8,7,6,5,4,3,2,1].map(n => 'm' + n));
assert.equal(app.context.PocketMaterialReview.canCreate(app.state()), true);
assert.deepEqual(outsideDaily(app.state()), afterLink);
app.button('返回已学内容').fire('click'); app.context.PocketLearning.startNewMaterial();
assert.ok(app.state().currentSession.draft); // Immediately unlocked, original grant already satisfied.
const draft = structuredClone(app.state().currentSession);
clock.now = new Date(2026, 9, 19, 9).getTime(); app.fire('focus');
assert.match(app.nodes.message.textContent, /开始正式学习新的资料前/); assert.deepEqual(app.state().currentSession, draft);
assert.equal(app.context.PocketDailyReverse.needsReview(app.state()), true);
const todayState = JSON.stringify(app.state()); app.fire('focus'); assert.equal(JSON.stringify(app.state()), todayState);
const bypass = app.state(); bypass.currentSession.currentStep = 'grouping'; bypass.review.grandfatheredDraftId = bypass.currentSession.materialId;
assert.throws(() => app.context.PocketMaterialReview.createMaterial(bypass, { id: bypass.currentSession.materialId, groups: [] }), /今日倒序复习/);
app.button('每日倒序复习').fire('click'); assert.equal(app.state().dailyReverseReview.history.length, 1);
const empty = new Map([[MAIN, JSON.stringify(seed(0))]]); const fresh = boot({ store: empty, clock });
assert.equal(fresh.context.PocketDailyReverse.needsReview(fresh.state()), false); fresh.context.PocketLearning.startNewMaterial(); assert.ok(fresh.state().currentSession.draft);
// Renaming while the original review's VIDEO panel is open preserves the
// exact task DOM, active group/run and old review queue; canonical labels update.
const oldReview = seed(1);
oldReview.dailyReverseReview = { version: 1, saveOrder: ['m1'], history: [], promptedDay: app.context.PocketDailyReverse.day(clock.now) };
oldReview.materials[0].groups[0].runs.push({ mode: 'material-review', startedAt: 10, completedAt: null, outputCompleted: false, videoSkipped: true, reviewRoundId: 'old-round' });
oldReview.activeSessionType = 'material-review';
oldReview.materialReviewSession = { queueVersion: 2, roundId: 'old-round', materialIds: ['m1'], materialId: 'm1', currentMaterialIndex: 0,
  currentQueueIndex: 0, completedGroupCount: 0, completedMaterials: [], currentGroupIndex: 0, currentRunIndex: 1, currentStep: 'output', mode: 'material-review',
  queue: [{ materialId: 'm1', groupId: 'g1', runIndex: 1, startedAt: 10, status: 'pending' }] };
const live = boot({ store: new Map([[MAIN, JSON.stringify(oldReview)]]), clock }); live.button('视频').fire('click');
const taskNode = live.button('← 返回 OUTPUT'), liveBefore = live.state(), navBefore = JSON.stringify(live.context.PocketNavigation.pocket());
live.all().find(n => n.tag === 'button' && n['aria-label'] === '修改「资料1」名称').fire('click');
const liveForm = live.all().find(n => n.tag === 'form'), liveInput = live.all().find(n => n.tag === 'input' && n.id?.startsWith('rename-title-'));
liveInput.value = '原复习中改名'; live.context.scrollY = 777; liveForm.fire('submit');
liveBefore.materials[0].title = '原复习中改名'; assert.deepEqual(live.state(), liveBefore);
assert.equal(live.button('← 返回 OUTPUT'), taskNode); assert.equal(live.context.scrollY, 777);
assert.equal(JSON.stringify(live.context.PocketNavigation.pocket()), navBefore);
assert.ok(live.content().some(n => n.tag === 'dd' && n.textContent === '原复习中改名'));
console.log('PASS: in-place rename/empty/cancel/failure/reload, first-day one-time cue without auto-start, 9→1 UI completion/resume/quota/stale clicks, shared links and independent queues, daily+original gates, next-day recheck and empty library.');
