'use strict';
const assert = require('node:assert/strict');
const {boot,seed} = require('./helpers/pocket-learning-ui.cjs');
const state=seed(2),store=new Map([['cognivex-pocket-state',JSON.stringify(state)]]);
const app=boot({store});
function open() {
  app.document.getElementById('learned-material-details').fire('click');
  app.all().find(node=>node['aria-label']==='查看「资料1」资料详情').fire('click');
  app.button('更改资料').fire('click');
}
open();
const before=JSON.stringify(app.state()),writes=app.writes.length;
const append=app.document.getElementById('append-groups-panel'),regroup=app.document.getElementById('review-regroup-panel');
assert.equal(append.hidden,true);assert.equal(regroup.hidden,true);
app.button('追加题目与分组').fire('click');
assert.equal(append.hidden,false);assert.equal(regroup.hidden,true);
const range=app.document.getElementById('append-question-range'),size=app.document.getElementById('append-group-size');
range.value='10-19';range.fire('input');size.value='2';size.fire('input');
app.button('改分组情况').fire('click');
assert.equal(append.hidden,false);assert.equal(regroup.hidden,false);
const newSize=app.document.getElementById('review-group-size');newSize.value='2';newSize.fire('input');
for(let index=0;index<3;index++) {
  app.button('追加题目与分组').fire('click');assert.equal(append.hidden,true);assert.equal(regroup.hidden,false);
  app.button('改分组情况').fire('click');assert.equal(regroup.hidden,true);
  app.button('追加题目与分组').fire('click');app.button('改分组情况').fire('click');
  assert.equal(app.document.getElementById('append-question-range'),range);
  assert.equal(app.document.getElementById('review-group-size'),newSize);
}
assert.equal(range.value,'10-19');assert.equal(size.value,'2');assert.equal(newSize.value,'2');
assert.equal(newSize.events.input.length,1);assert.equal(app.button('确认重新分组').events.click.length,1);
assert.equal(JSON.stringify(app.state()),before);assert.equal(app.writes.length,writes);
app.button('更改资料').fire('click');
assert.equal(app.document.getElementById('append-groups-panel').hidden,true);
assert.equal(app.document.getElementById('review-regroup-panel').hidden,true);
console.log('PASS independent grouping panels: collapsed defaults, simultaneous expansion, input/node/listener retention, no writes and reset on page re-entry.');
