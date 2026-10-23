// Run: node tests/review-policy.test.cjs. No real browser storage is touched.
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const source=fs.readFileSync(path.join(__dirname,'executor.test.cjs'),'utf8');
const checks = `
// Missing old timestamps have a stable migration, not a new Date.now() on each open.
const timed=learned('TIMED',[undefined,undefined]);timed.addedToReviewAt=100;timed.completedAt=200;
const untimed=learned('UNTIMED',[undefined,undefined]);delete untimed.addedToReviewAt;untimed.completedAt=null;
data.clear();data.set('cognivex-pocket-state',JSON.stringify({version:1,review:{lastReviewedAt:null},currentSession:null,materials:[timed,untimed]}));
app=boot();assert.equal(saved().materials[0].addedToReviewAt,100);assert.equal(saved().materials[1].addedToReviewAt,0);
assert.equal(saved().materials[0].groups[0].addedToReviewAt,100);assert.equal(saved().materials[1].groups[0].addedToReviewAt,0);
const stable=data.get('cognivex-pocket-state');app=boot();assert.equal(data.get('cognivex-pocket-state'),stable);
assert.equal(app.context.PocketMaterialReview.groups(saved())[0].materialId,'UNTIMED');
// Separate today's genuine-learning gate fixture from the legacy-date checks above.
const gateFixtures=saved();gateFixtures.materials.forEach(material=>{material.completedAt=Date.now();});
data.set('cognivex-pocket-state',JSON.stringify(gateFixtures));app=boot();
// A completed unlock remains usable while the user starts a voluntary extra round.
finishReviewForFixture();const initialGrant=JSON.stringify(saved().review.unlock);assert.ok(app.context.PocketMaterialReview.canCreate(saved()));
app.nodes['start-review-button'].fire('click');assert.ok(app.context.PocketMaterialReview.canCreate(saved()));
assert.equal(JSON.stringify(saved().review.unlock),initialGrant);
assert.equal(app.context.PocketLearning.startNewMaterial(),true);
createMaterial('物理','消费解锁','1-2','1');const mainDraft=saved().currentSession;
assert.ok(saved().review.unlock.usedAt);assert.equal(app.context.PocketMaterialReview.canCreate(saved()),false);
// This round started before creation: finishing it cannot grant another permission.
app.nodes['start-review-button'].fire('click');
while(saved().materialReviewSession.currentStep!=='queueComplete')click(app,'输出达标 → 下一步');
assert.equal(app.context.PocketMaterialReview.canCreate(saved()),false);assert.deepEqual(saved().currentSession,mainDraft);
click(app,'返回当前学习');
// Protect every new-material API entry when a main learning session is unfinished.
const protectedMain=data.get('cognivex-pocket-state');assert.equal(app.context.PocketLearning.startNewMaterial(),true);
assert.equal(data.get('cognivex-pocket-state'),protectedMain);
console.log('PASS: stable old-time fallback, no infinite relock before use, voluntary round does not revoke unlock, and a pre-consumption round cannot issue a second unlock after consumption.');
// Legacy unfinished Material queues retain their exact active Run and queue order.
const oldA=learned('OLD-A',[10,10]);const oldB=learned('OLD-B',[20,20]);const main=learned('MAIN',[30,30]);main.status='learning';main.completedAt=null;main.addedToReviewAt=null;
const currentRun=main.groups[0].runs.length;main.groups[0].runs.push({mode:'new',videoSkipped:true,videoCompleted:false,outputCompleted:false,startedAt:900,completedAt:null});
const reviewRun=oldB.groups[0].runs.length;oldB.groups[0].runs.push({mode:'material-review',videoSkipped:true,videoCompleted:false,outputCompleted:false,startedAt:800,completedAt:null});
const oldState={version:1,review:{lastReviewedAt:100},activeSessionType:'material-review',materials:[oldA,oldB,main],
  currentSession:{materialId:'MAIN',mode:'new',currentGroupIndex:0,currentRunIndex:currentRun,currentStep:'output',schedulerState:{phase:'new',newGroupIndex:0,reviewGroupIndex:0}},
  materialReviewSession:{materialIds:['OLD-A','OLD-B'],currentMaterialIndex:1,materialId:'OLD-B',sessionType:'material-review',mode:'material-review',
    currentGroupIndex:0,currentRunIndex:reviewRun,currentStep:'output',startedAt:700,materialStartedAt:800,completedAt:null,completedMaterials:[{materialId:'OLD-A',completedAt:750}]}};
data.clear();data.set('cognivex-pocket-state',JSON.stringify(oldState));app=boot();
assert.equal(saved().materialReviewSession.queueVersion,undefined);assert.equal(saved().materialReviewSession.currentRunIndex,reviewRun);
assert.deepEqual(saved().currentSession,oldState.currentSession);assert.equal(saved().materials[1].groups[0].runs.length,reviewRun+1);
const beforeResume=data.get('cognivex-pocket-state');app=boot();assert.equal(data.get('cognivex-pocket-state'),beforeResume);
click(app,'输出达标 → 下一步');assert.equal(saved().materialReviewSession.materialId,'OLD-B');assert.equal(saved().materialReviewSession.currentGroupIndex,1);
click(app,'输出达标 → 下一步');assert.equal(saved().materialReviewSession.currentStep,'queueComplete');
assert.deepEqual(saved().currentSession,oldState.currentSession);assert.equal(saved().materials[0].materialReviewHistory.length,oldA.materialReviewHistory.length);
assert.equal(saved().materials[1].materialReviewHistory.length,oldB.materialReviewHistory.length+1);
click(app,'返回当前学习');assert.ok(saved().review.archivedSessions.some(session=>session.materialIds[0]==='OLD-A'));
app.nodes['start-review-button'].fire('click');assert.equal(saved().materialReviewSession.queueVersion,2);assert.equal(saved().materialReviewSession.queue.length,4);
console.log('PASS: legacy active Material queue stays intact until completed; old histories and the main checkpoint survive, then the next round uses all sorted Groups.');
// A legacy draft is retained and may finish setup once; subsequent creation is gated.
const oldDraft={version:1,review:{lastReviewedAt:null},materials:[learned('KNOWN',[1])],currentSession:{materialId:'DRAFT',currentStep:'grouping',mode:'new',createdAt:12,
  draft:{subject:'化学',title:'旧草稿',questionRange:'1-2',groupSize:'1',groups:[]}}};
data.clear();data.set('cognivex-pocket-state',JSON.stringify(oldDraft));app=boot();submit(app);
assert.equal(saved().materials.length,2);assert.equal(saved().materials[1].id,'DRAFT');assert.equal(saved().review.grandfatheredDraftId,undefined);
assert.equal(app.context.PocketMaterialReview.canCreate(saved()),false);
console.log('PASS: one-time legacy setup reservation preserves an existing draft without opening a reusable gate bypass.');
// A snapshot cannot grant permission if new learned Groups appear before its completion.
const changedState={version:1,review:{lastReviewedAt:null},currentSession:null,materials:[learned('SNAP',[10,20])]};
data.clear();data.set('cognivex-pocket-state',JSON.stringify(changedState));app=boot();app.nodes['start-review-button'].fire('click');
click(app,'输出达标 → 下一步');const extra=saved();
extra.materials[0].groups.push({id:'SNAP-extra',start:3,end:3,appended:true,addedToReviewAt:30,runs:[],videoCompleted:false,outputCompleted:false,executionCompleted:false});
data.set('cognivex-pocket-state',JSON.stringify(extra));app=boot();click(app,'输出达标 → 下一步');
assert.equal(saved().materialReviewSession.currentStep,'queueComplete');assert.equal(app.context.PocketMaterialReview.canCreate(saved()),false);
assert.equal(app.context.PocketMaterialReview.counts(saved()).pending,3);
app.nodes['start-review-button'].fire('click');assert.equal(saved().materialReviewSession.queue.length,3);
// Reordering the physical array keeps the current Group identity and Run stable.
const reorder=saved();const identity=reorder.materialReviewSession.queue[0].groupId;
const beforeRuns=reorder.materials[0].groups.find(g=>g.id===identity).runs.length;
reorder.materials[0].groups.reverse();data.set('cognivex-pocket-state',JSON.stringify(reorder));app=boot();
assert.equal(saved().materials[0].groups[saved().materialReviewSession.currentGroupIndex].id,identity);
assert.equal(saved().materials[0].groups.find(g=>g.id===identity).runs.length,beforeRuns);
console.log('PASS: collection additions invalidate a completed snapshot unlock, and stable IDs survive Group array reordering without duplicate Runs.');
`;
vm.runInNewContext(source+checks,{require,__dirname,console,URL},{filename:__filename});
