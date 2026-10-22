'use strict';
const assert = require('node:assert/strict');
const { boot, seed } = require('./helpers/pocket-learning-ui.cjs');
const location = new URL('http://localhost:4173/');
const prefix = 'pocket-development-v1:';
for (const page of ['home', 'learning', 'learned-content', 'new-material-locked']) {
  const data = seed(2);
  const store = new Map([[prefix + 'cognivex-pocket-state', JSON.stringify(data)],
    [prefix + 'pocket-last-view-v1', JSON.stringify({ page })]]);
  let app = boot({ store, location, focusReview: true });
  const entry = app.nodes['quick-material-entry'];
  assert.equal(entry.hidden, false, page);
  assert.equal(entry.disabled, false, page);
  const before = JSON.stringify(app.state());
  entry.fire('click');
  assert.equal(app.document.getElementById('quick-material').hidden, false, page);
  assert.equal(JSON.stringify(app.state()), before, 'opening must not add a material');
  app.context.PocketLearning.showHome();
  assert.equal(entry.hidden, false);
  app = boot({ store, location, focusReview: true });
  assert.equal(app.nodes['quick-material-entry'].hidden, false, 'reload');
}
const app = boot({ location, focusReview: true });
assert.equal(app.nodes['quick-material-entry'].hidden, false, 'default initial route');
console.log('PASS quick entry: initial/restored home, learning, learned content, locked creation, open, return and reload.');
