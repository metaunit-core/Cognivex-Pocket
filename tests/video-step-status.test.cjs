'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const {boot,seed}=require('./helpers/pocket-learning-ui.cjs');
const store=new Map([['cognivex-pocket-state',JSON.stringify(seed(2))]]);
let app=boot({store}),ui=app.context.PocketReviewUI;
const original=JSON.stringify(app.state());
function build(materialId,groupKey){const node=app.document.createElement('div');ui.videoIntroduction(node,{materialId,groupKey});return node.children.filter(child=>child.tag==='details');}
function status(step){return step.children[0].children[1].children[0];}
function choose(step,index){const menu=step.children[0].children[1].children[1];if(menu.hidden)status(step).fire('click');menu.children[index].fire('click');}
let steps=build('m1','g1');assert.equal(steps.length,7);assert.ok(steps.every(step=>status(step).textContent==='○ 未开始'));
choose(steps[0],3);choose(steps[1],1);choose(steps[2],2);
assert.equal(status(steps[0]).textContent,'! 卡住了');assert.equal(status(steps[1]).textContent,'◐ 进行中');assert.equal(status(steps[2]).textContent,'✓ 已完成');
const cleaned=app.state();delete cleaned.videoStageProgress;assert.equal(JSON.stringify(cleaned),original);
assert.ok(build('m1','g2').every(step=>status(step).textContent==='○ 未开始'));
assert.ok(build('m2','g1').every(step=>status(step).textContent==='○ 未开始'));
app=boot({store});ui=app.context.PocketReviewUI;steps=build('m1','g1');assert.equal(status(steps[0]).textContent,'! 卡住了');
const before=JSON.stringify(app.state());app.fail.enabled=true;choose(steps[0],2);app.fail.enabled=false;assert.equal(JSON.stringify(app.state()),before);assert.equal(status(steps[0]).textContent,'! 卡住了');
choose(steps[0],0);assert.equal(status(steps[0]).textContent,'○ 未开始');
const record=()=>app.state().videoStageProgress.entries.find(item=>item.key===JSON.stringify(['m1','g1']));
choose(build('m1','g2')[0],3);choose(build('m2','g1')[0],2);
const others=JSON.stringify(app.state().videoStageProgress.entries.filter(item=>item.key!==JSON.stringify(['m1','g1'])));
for(let index=0;index<6;index++){
 choose(steps[index],2);
 assert.ok(steps.slice(0,index+1).every(step=>status(step).textContent==='✓ 已完成'));
}
for(const value of [1,3,0]){choose(steps[6],value);assert.ok(record().states.slice(0,6).every(value=>value==='done'));assert.equal(record().cycles ?? 0,0);}
const beforeCycleWrites=app.writes.length;
choose(steps[6],2);assert.ok(steps.every(step=>status(step).textContent==='○ 未开始'));assert.equal(record().cycles,1);assert.equal(app.writes.length,beforeCycleWrites+1);
const settled=JSON.stringify(app.state()),writes=app.writes.length;
steps[6].children[0].children[1].children[1].children[2].fire('click');assert.equal(JSON.stringify(app.state()),settled);assert.equal(app.writes.length,writes);
choose(steps[6],2);assert.equal(record().cycles,2);assert.ok(record().states.every(value=>value==='idle'));
assert.equal(JSON.stringify(app.state().videoStageProgress.entries.filter(item=>item.key!==JSON.stringify(['m1','g1']))),others);
choose(steps[0],2);choose(steps[6],3);const failed=JSON.stringify(app.state());app.fail.enabled=true;choose(steps[6],2);app.fail.enabled=false;
assert.equal(JSON.stringify(app.state()),failed);assert.equal(record().cycles,2);assert.equal(status(steps[0]).textContent,'✓ 已完成');
choose(steps[6],2);assert.equal(record().cycles,3);assert.ok(steps.every(step=>status(step).textContent==='○ 未开始'));
app=boot({store});ui=app.context.PocketReviewUI;steps=build('m1','g1');assert.ok(steps.every(step=>status(step).textContent==='○ 未开始'));assert.equal(record().cycles,3);
const unchanged=app.state();delete unchanged.videoStageProgress;assert.equal(JSON.stringify(unchanged),original);
const staleSteps=build('m1','g1');status(staleSteps[6]).fire('click');
choose(steps[6],2);const afterFreshCycle=JSON.stringify(app.state());
staleSteps[6].children[0].children[1].children[1].children[2].fire('click');assert.equal(JSON.stringify(app.state()),afterFreshCycle);assert.equal(record().cycles,4);
{
 const legacy=seed(2);legacy.videoStageProgress={version:1,entries:[{key:JSON.stringify(['m1','g1']),states:Array(7).fill('done')}]};
 const older=boot({store:new Map([['cognivex-pocket-state',JSON.stringify(legacy)]])}),node=older.document.createElement('div');
 const beforeLegacy=JSON.stringify(older.state());older.context.PocketReviewUI.videoIntroduction(node,{materialId:'m1',groupKey:'g1'});
 assert.equal(JSON.stringify(older.state()),beforeLegacy);
 const last=node.children.filter(child=>child.tag==='details')[6];choose(last,2);
 const savedLegacy=older.state().videoStageProgress.entries[0];assert.equal(savedLegacy.cycles ?? 0,0);assert.ok(savedLegacy.states.every(value=>value==='done'));
}
(async()=>{
 app.context.TextEncoder=TextEncoder;vm.runInContext(fs.readFileSync(path.join(__dirname,'../js/learning-backup.js'),'utf8'),app.context);
 const backup=await app.context.PocketLearningBackup.create();assert.equal((await app.context.PocketLearningBackup.verify(JSON.stringify(backup))).valid,true);
 assert.equal(JSON.stringify(JSON.parse(backup.rawState).videoStageProgress),JSON.stringify(app.state().videoStageProgress));
 console.log('PASS independent VIDEO states and cycles: cumulative steps 1-6; only manual step-7 done resets; exact-once duplicate safety; atomic failure/retry; per-group isolation, reload, original progress and JSON.');
})().catch(error=>{console.error(error);process.exitCode=1;});
