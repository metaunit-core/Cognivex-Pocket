'use strict';
const assert = require('node:assert/strict');
const { boot, seed } = require('./helpers/pocket-learning-ui.cjs');
const location = new URL('http://localhost:4173/'), key = 'pocket-development-v1:cognivex-pocket-state';
const probe = boot({ location, focusReview: true }), model = probe.context.PocketFocusReview;
const walk = node => [node, ...node.children.flatMap(walk)];
for (const mode of ['single', 'all']) {
  const state = seed(2); state.materials.forEach(material => { material.subject = '数学'; material.groups[0].start = 1; material.groups[0].end = 20; });
  state.materials[0].title = '函数'; state.materials[1].title = '向量';
  model.add(state, 'm1', 0, '2'); model.add(state, 'm2', 0, '2'); model.add(state, 'm1', 0, '3'); model.add(state, 'm2', 0, '4');
  const first = model.create(state, '数学', 3, model.available(state, '数学').slice(0, 3).map(question => question.id));
  model.create(state, '数学', 1, model.available(state, '数学').map(question => question.id));
  if (mode === 'all') model.startAll(state, '数学'); else model.start(state, first);
  const id = model.active(state).group.id, original = JSON.stringify(state.materials), members = JSON.stringify(state.focusReview.groups.map(group => group.members));
  let app = boot({ location, store: new Map([[key, JSON.stringify(state)]]), focusReview: true });
  const page = () => app.document.getElementById('focus-review');
  const press = label => { const node = walk(page()).find(node => node.tag === 'button' && node.textContent === label && !node.disabled); assert.ok(node, label); node.fire('click'); return node; };
  app.context.PocketFocusReviewUI.open({ subject: '数学', focusGroup: id });
  const before = app.store.get(key); press('移除');
  let choices = walk(page()).filter(node => node.className === 'focus-removal-choice');
  assert.deepEqual(choices.map(node => node.children[1].textContent), ['数学 · 函数 · 第 2 题', '数学 · 向量 · 第 2 题', '数学 · 函数 · 第 3 题']);
  assert.ok(choices.every(node => node.children[0].checked === false));
  assert.equal(walk(page()).find(node => node.textContent === '确认移出所选题目').disabled, true);
  choices[0].children[0].checked = true; choices[0].children[0].fire('change');
  choices[0].children[0].checked = false; choices[0].children[0].fire('change'); assert.equal(app.store.get(key), before);
  press('取消'); assert.equal(app.store.get(key), before);
  press('移除'); choices = walk(page()).filter(node => node.className === 'focus-removal-choice');
  for (const index of [1, 2]) { choices[index].children[0].checked = true; choices[index].children[0].fire('change'); }
  app.fail.enabled = true; press('确认移出所选题目'); assert.equal(app.store.get(key), before); app.fail.enabled = false;
  const stale = press('确认移出所选题目'); const saved = app.store.get(key); stale.fire('click'); assert.equal(app.store.get(key), saved);
  assert.equal(app.context.PocketFocusReview.active(app.state()).index, 0);
  assert.deepEqual(app.state().focusReview.questions.map(question => question.status), ['active', 'mastered', 'mastered', 'active']);
  assert.equal(app.context.PocketReviewAdmission.status(app.state()).unlocked, false);
  assert.equal(JSON.stringify(app.state().materials), original); assert.equal(JSON.stringify(app.state().focusReview.groups.map(group => group.members)), members);
  app = boot({ location, store: app.store, focusReview: true });
  app.context.PocketFocusReviewUI.open({ subject: '数学', focusGroup: id }); press('输出达标 → 下一步');
  if (mode === 'all') {
    assert.equal(app.context.PocketFocusReview.active(app.state()).question.number, 4);
    press('移除'); const only = walk(page()).filter(node => node.className === 'focus-removal-choice'); assert.equal(only.length, 1);
    only[0].children[0].checked = true; only[0].children[0].fire('change'); press('确认移出所选题目');
  }
  assert.equal(app.state().focusReview.session, null);
}
const removed = seed(1); model.add(removed, 'm1', 0, String(removed.materials[0].groups[0].start));
const groupId = model.create(removed, '数学', 1, model.available(removed, '数学').map(question => question.id)); model.start(removed, groupId);
model.removeSelected(removed, model.active(removed).run.id, 0, [removed.focusReview.questions[0].id]);
assert.equal(probe.context.PocketReviewAdmission.status(removed).unlocked, false);
assert.equal(removed.focusReview.groups[0].runs[0].questionProgress[0].outputCompleted, false);
console.log('PASS Group-scoped checkbox selection in single/all modes, same-number source isolation, multi-select, cancellation/failure/stale protection, future skips, unchanged current and no removal-only admission.');
