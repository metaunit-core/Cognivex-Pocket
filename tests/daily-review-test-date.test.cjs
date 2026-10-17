'use strict';
const assert = require('node:assert/strict'), fs = require('node:fs'), vm = require('node:vm');
const { boot, seed } = require('./helpers/pocket-learning-ui.cjs');
const PREFIX = 'pocket-development-v1:', MAIN = 'cognivex-pocket-state', KEY = 'pocket-daily-review-test-date-v1';
const clock = { now: new Date(2026, 9, 18, 9).getTime() }, location = new URL('http://127.0.0.1:5500');
const initial = seed(2);
initial.review.unlock = { generation: 0, usedAt: null, collectionKey: JSON.stringify(initial.materials.map(m => JSON.stringify([m.id, m.groups[0].id])).sort()) };
const store = new Map([[PREFIX + MAIN, JSON.stringify(initial)], [MAIN, 'formal data untouched']]);
let ui = boot({ store, clock, location });
assert.equal(ui.nodes['daily-test-tools'].hidden, false);
assert.equal(ui.nodes['daily-test-date'].value, '2026-10-18');
function select(date) { ui.nodes['daily-test-date'].value = date; ui.nodes['daily-test-date'].fire('change'); }
select('2026-10-18');
const daily = ui.context.PocketDailyReverse;
ui.document.getElementById('daily-reverse-review-entry').fire('click');
ui.button('\u8f93\u51fa\u8fbe\u6807 \u2192 \u4e0b\u4e00\u6b65').fire('click');
assert.equal(daily.needsReview(ui.state()), true);
ui.context.PocketLearning.startNewMaterial();
assert.match(ui.nodes.message.textContent, /请先完成今日正序复习/);
ui.document.getElementById('daily-reverse-review-entry').fire('click');
ui.button('\u8f93\u51fa\u8fbe\u6807 \u2192 \u4e0b\u4e00\u6b65').fire('click');
assert.equal(ui.nodes['learning-heading'].textContent, '新资料');
assert.equal(daily.needsReview(ui.state()), false);
const completed = structuredClone(ui.state().dailyReverseReview.round);
const originalMaterials = structuredClone(ui.state().materials), originalSession = structuredClone(ui.state().currentSession);
assert.equal(completed.startedAt, clock.now); assert.equal(completed.completedAt, clock.now);
ui = boot({ store, clock, location });
assert.equal(ui.context.PocketDailyReverse.needsReview(ui.state()), false);
assert.doesNotMatch(ui.nodes.message.textContent, /请先完成今日|开始正式学习/);
select('2026-10-19');
assert.equal(ui.context.PocketDailyReverse.day(), '2026-10-19');
assert.equal(ui.context.PocketDailyReverse.needsReview(ui.state()), true);
assert.equal(ui.context.PocketNavigation.pocket().page, 'learning');
ui.context.PocketLearning.startNewMaterial();
assert.match(ui.nodes.message.textContent, /请先完成今日正序复习/);
assert.equal(ui.context.PocketMaterialReview.canCreate(ui.state()), false);
assert.deepEqual(ui.state().dailyReverseReview.round, completed); // Date selection never rewrites progress/history.
assert.deepEqual(ui.state().materials, originalMaterials);
assert.deepEqual(ui.state().currentSession, originalSession);
assert.equal(vm.runInContext('Date.now()', ui.context), clock.now);
assert.equal(store.get(PREFIX + KEY), '2026-10-19'); assert.equal(store.has(KEY), false);
ui = boot({ store, clock, location });
assert.equal(ui.nodes['daily-test-date'].value, '2026-10-19');
assert.equal(ui.context.PocketDailyReverse.needsReview(ui.state()), true);
ui.nodes['daily-test-date-reset'].fire('click');
assert.equal(ui.context.PocketDailyReverse.day(), '2026-10-18');
assert.equal(ui.context.PocketDailyReverse.needsReview(ui.state()), false);
assert.equal(store.has(PREFIX + KEY), false);
assert.deepEqual(ui.state().dailyReverseReview.round, completed);
// A simulated round still uses actual timestamps and all existing completion gates.
select('2026-10-19'); ui.document.getElementById('daily-reverse-review-entry').fire('click');
assert.equal(ui.state().dailyReverseReview.round.day, '2026-10-19');
assert.equal(ui.state().dailyReverseReview.round.startedAt, clock.now);
assert.deepEqual(ui.state().dailyReverseReview.history[0], completed);
ui.button('\u8f93\u51fa\u8fbe\u6807 \u2192 \u4e0b\u4e00\u6b65').fire('click'); ui.button('\u8f93\u51fa\u8fbe\u6807 \u2192 \u4e0b\u4e00\u6b65').fire('click');
assert.equal(ui.context.PocketDailyReverse.needsReview(ui.state()), false);
assert.equal(ui.state().dailyReverseReview.round.completedAt, clock.now);
assert.deepEqual(ui.state().currentSession, originalSession); // Busy learning remains protected.
assert.equal(ui.context.PocketNavigation.pocket().page, 'learning');
assert.equal(ui.nodes['learning-heading'].textContent, '新资料'); // Resume the existing unsubmitted draft.
ui = boot({ store, clock, location });
assert.equal(ui.context.PocketDailyReverse.day(), '2026-10-19');
assert.equal(ui.context.PocketDailyReverse.needsReview(ui.state()), false);
assert.doesNotMatch(ui.nodes.message.textContent, /开始正式学习新的资料前/);
assert.equal(store.get(MAIN), 'formal data untouched');
assert.throws(() => ui.context.PocketCloudBackup.createEngine({}), /禁止连接/);
const beforeBadDate = store.get(PREFIX + KEY);
assert.throws(() => ui.context.PocketDailyTestDate.set('2026-02-30'), /有效/);
assert.equal(store.get(PREFIX + KEY), beforeBadDate);
// Formal desktop/mobile and remote HTTPS previews cannot enable this local-only tool.
for (const address of ['https://metaunit-core.github.io/Cognivex-Pocket/', 'https://unknown-preview.example/Pocket/']) {
  const testStore = new Map([[PREFIX + KEY, '2030-01-01'], [KEY, '2030-01-01']]);
  const official = boot({ store: testStore, clock, location: new URL(address) });
  assert.equal(official.context.PocketDailyTestDate, undefined);
  assert.equal(official.nodes['daily-test-tools'].hidden, true);
  assert.equal(official.context.PocketDailyReverse.day(), '2026-10-18');
}
for (const env of [undefined, { isTest: true, firebaseAllowed: false }, { isTest: false, firebaseAllowed: true }]) {
  const c = vm.createContext({ URL, location, PocketEnvironment: env });
  vm.runInContext(fs.readFileSync('js/daily-review-test-date.js', 'utf8'), c);
  assert.equal(c.PocketDailyTestDate, undefined);
}
console.log('PASS local-only simulated day, repeat open/next day/gates/navigation/reset, persistent isolated setting, real timestamps, unchanged records, invalid date and formal/failed-environment denial');
