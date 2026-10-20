'use strict';
const assert = require('node:assert/strict');
const { boot, seed } = require('./helpers/pocket-learning-ui.cjs');
const key = 'pocket-development-v1:cognivex-pocket-state', location = new URL('http://localhost:4173/');
let app = boot({ location, focusReview: true });
const model = app.context.PocketFocusReview, state = seed(1);
state.materials[0].groups[0].start = 1; state.materials[0].groups[0].end = 20;
for (const [number, at] of [[4, 400], [1, 100], [3, 300], [2, 200], [5, 500], [6, 600]]) model.add(state, 'm1', 0, String(number), false, at);
const plan = model.groupingPlan(state, '数学');
const ids = model.regroup(state, '数学', 2, { questionIds: plan.questions.map(question => question.id), groupIds: [] });
for (const [index, values] of [{ accuracy: '1/2', durationMinutes: '8' }, { accuracy: '3/3', durationMinutes: '12' }, { accuracy: '2/2', durationMinutes: '5' }].entries()) {
  model.start(state, ids[index]);
  for (let position = 0; position < 2; position++) model.transition(state, model.active(state).run.id, 'finish', values, Date.now(), position);
}
const numbers = (target, filters) => JSON.parse(JSON.stringify(model.groupingPlan(target, '数学', filters).questions.map(question => question.number)));
assert.deepEqual(numbers(state, {}), [1, 2, 3, 4, 5, 6]);
assert.deepEqual(numbers(state, { accuracy: 80 }), [1, 2]);
assert.deepEqual(numbers(state, { duration: 10 }), [3, 4]);
assert.deepEqual(numbers(state, { accuracy: 80, duration: 10 }), [1, 2, 3, 4]);
assert.equal(model.groupingPlan(state, '数学', { accuracy: 80 }).groupMetrics, 2);
for (const filters of [{ accuracy: -1 }, { accuracy: 101 }, { accuracy: '' }, { duration: -1 }, { duration: 'NaN' }]) assert.throws(() => model.groupingPlan(state, '数学', filters));
const unknown = JSON.parse(JSON.stringify(state)); unknown.focusReview.groups[1].runs = [];
assert.deepEqual(numbers(unknown, { accuracy: 80 }), [1, 2]);
const legacy = JSON.parse(JSON.stringify(state));
for (const group of legacy.focusReview.groups) for (const run of group.runs) { delete run.metricsScope; run.questionProgress.forEach(record => { record.accuracy = '0/100'; }); }
assert.equal(model.groupingPlan(legacy, '数学', { accuracy: 80 }).questions.length, 0, 'old per-question grades cannot become current Group grades');
const groupLegacy = JSON.parse(JSON.stringify(state));
for (const group of groupLegacy.focusReview.groups) for (const run of group.runs) { delete run.metricsScope; delete run.progressVersion; delete run.questionProgress; }
assert.deepEqual(numbers(groupLegacy, { accuracy: 80 }), [1, 2]);
const before = JSON.stringify(state.focusReview.groups.map(group => group.runs)), questions = JSON.stringify(state.focusReview.questions);
app = boot({ store: new Map([[key, JSON.stringify(state)]]), location, focusReview: true });
app.context.PocketFocusReviewUI.open({ subject: '数学' });
const walk = node => [node, ...node.children.flatMap(walk)];
const page = () => app.document.getElementById('focus-review');
const press = text => { const node = walk(page()).find(node => node.tag === 'button' && node.textContent === text && !node.disabled); assert.ok(node, text); node.fire('click'); };
app.document.getElementById('focus-filter-accuracy-mode').value = 'limit';
app.document.getElementById('focus-filter-accuracy').value = '80';
app.document.getElementById('focus-filter-accuracy-mode').fire('change');
assert.ok(walk(page()).some(node => node.textContent === '筛选结果：2道'));
app.document.getElementById('focus-group-size').value = '2'; press('分组'); press('确认');
const saved = app.state(), groups = saved.focusReview.groups.filter(group => !group.retiredAt);
assert.equal(groups.length, 1); assert.deepEqual(groups[0].members.map(question => question.number), [1, 2]); assert.equal(groups[0].runs.length, 0);
assert.equal(JSON.stringify(saved.focusReview.questions), questions);
assert.equal(JSON.stringify(saved.focusReview.groups.slice(0, 3).map(group => group.runs)), before);
assert.equal(model.groupingPlan(saved, '数学', { accuracy: 80 }).questions.length, 0, 'new Group and currently ungrouped questions must not borrow archived grades');
const fresh = boot({ store: app.store, location, focusReview: true });
assert.equal(fresh.state().focusReview.groups.filter(group => !group.retiredAt).length, 1);
assert.equal(model.allQuestions(saved, '数学').length, 2);
console.log('PASS current Group latest grades only: 1/2+8, 3/3+12, 2/2+5; strict OR, missing retention, per-question exclusion, stable sorting and regroup without grade inheritance.');
