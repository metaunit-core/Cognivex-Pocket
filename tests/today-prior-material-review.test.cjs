'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const {boot,seed}=require('./helpers/pocket-learning-ui.cjs');
const location=new URL('http://localhost:4173/'),key='pocket-development-v1:cognivex-pocket-state';
const internal={
  2:[['new',0],['new',1],['review',0],['review',1]],
  3:[['new',0],['new',1],['review',0],['review',1],['new',2],['review',0],['review',1],['review',2]],
  4:[['new',0],['new',1],['review',0],['review',1],['new',2],['review',0],['review',1],['review',2],['new',3],['review',0],['review',1],['review',2],['review',3]]
};
function run(sizes){
  const clock={now:new Date(2026,9,29,9).getTime()},initial=seed(3);
  initial.materials.forEach(material=>{material.groups=Array.from({length:3},(_,index)=>({...structuredClone(material.groups[0]),id:material.id+'-g'+index,start:index+1,end:index+1}));material.totalGroups=3;});
  require('./helpers/original-learning-fixture.cjs')(initial,clock.now-86400000);
  initial.materials[2].createdAt=clock.now-86400000;initial.materials[2].completedAt=clock.now;
  initial.materials[2].groups.forEach(group=>group.runs.forEach(record=>{record.completedAt=clock.now;}));
  const store=new Map([[key,JSON.stringify(initial)]]);
  let app=boot({location,clock,focusReview:true,store});
  const model=()=>app.context.PocketMaterialReview;
  const node=id=>app.document.getElementById(id);
  const fill=(id,value)=>{node(id).value=value;node(id).fire('input');};
  const submit=()=>app.content().find(item=>item.tag==='form').fire('submit');
  const daily=()=>{node('daily-reverse-review-entry').fire('click');let guard=0;while(!app.state().dailyReverseReview.round.completedAt){assert.ok(++guard<100);app.button('输出达标 → 下一步').fire('click');}};
  daily();
  const ids=[],traces=[];
  for(let materialIndex=0;materialIndex<sizes.length;materialIndex++){
    const size=sizes[materialIndex];
    assert.equal(model().canCreate(app.state()),true);
    app.context.PocketLearning.startNewMaterial();fill('subject','数学');fill('title',String.fromCharCode(65+materialIndex));submit();fill('question-range','1-'+size);fill('group-size','1');submit();
    const assignments=[];let guard=0;
    while(app.state().currentSession.currentStep!=='materialComplete'){
      assert.ok(++guard<100);const session=app.state().currentSession;
      if(session.currentStep==='output')assignments.push([session.mode,session.currentGroupIndex]);
      app.button(session.currentStep==='output'?'输出达标 → 下一步':'继续').fire('click');
    }
    assert.deepEqual(assignments,internal[size]);
    const current=app.state().materials.at(-1);ids.push(current.id);
    assert.equal(current.originalSavedDay,'2026-10-29');
    assert.equal(model().canCreate(app.state()),materialIndex===0);
    if(materialIndex===0){assert.equal(model().counts(app.state()).available,0);traces.push([]);continue;}
    app.button('开始下一份资料').fire('click');
    const expected=ids.slice(0,-1).reverse().flatMap(id=>Array.from({length:sizes[ids.indexOf(id)]},(_,index)=>[id,index]));
    assert.deepEqual(app.state().materialReviewSession.queue.map(item=>[item.materialId,item.groupIndex]),expected);
    const trace=[];let restored=false;
    while(app.state().materialReviewSession.currentStep!=='queueComplete'){
      assert.ok(++guard<180);assert.equal(model().canCreate(app.state()),false);
      const session=app.state().materialReviewSession;
      if(materialIndex===3 && session.materialId===ids[1] && session.currentGroupIndex===1 && !restored){
        const checkpoint=JSON.stringify(session);clock.now+=86400000;
        app=boot({location,clock,focusReview:true,store});
        assert.equal(JSON.stringify(app.state().materialReviewSession),checkpoint);
        assert.equal(app.state().review.requiredAfterLearning.day,'2026-10-29');
        assert.deepEqual(Array.from(model().todayGroups(app.state())),[]);
        restored=true;
      }
      trace.push([session.materialId,session.currentGroupIndex]);app.button('输出达标 → 下一步').fire('click');
    }
    assert.deepEqual(trace,expected);traces.push(trace);
    assert.ok(app.state().materials.every(material=>material.relearningCount===undefined));
    if(materialIndex===3){assert.equal(restored,true);assert.equal(model().canCreate(app.state()),false);daily();}
    assert.equal(model().canCreate(app.state()),true);if(materialIndex!==3)app.button('返回当前学习').fire('click');
  }
  const unknown=app.state();const sample=structuredClone(unknown.materials.find(material=>material.id===ids[0]));
  delete sample.originalSavedDay;delete sample.createdAt;sample.id='unknown-date';unknown.materials.push(sample);
  assert.equal(model().todayGroups(unknown).some(item=>item.materialId===sample.id),false,'unknown creation dates never guessed from completion');
  const numbered=structuredClone(sample);numbered.id='numeric-groups';
  numbered.groups=Array.from({length:10},(_,index)=>({...structuredClone(sample.groups[0]),id:'numeric-'+index,addedToReviewAt:100-index}));
  unknown.materials.push(numbered);
  assert.deepEqual(Array.from(model().groups(unknown).filter(item=>item.materialId===numbered.id),item=>item.groupIndex),[0,1,2,3,4,5,6,7,8,9],'numeric group order ignores timestamps');
  const state=app.context.PocketStorage.loadState();
  vm.runInContext(fs.readFileSync(path.join(__dirname,'../js/relearning.js'),'utf8'),app.context);
  const relearning=app.context.PocketRelearning,write=change=>{Object.assign(state,app.context.PocketStorage.updateState(state,change));};
  write(next=>relearning.start(next,['m3','m1','m2']));
  const trace=[];let guard=0;
  while(relearning.pending(state)){
    assert.ok(++guard<150);const active=relearning.current(state),checkpoint=relearning.checkpoint(state);
    assert.ok(!ids.includes(active.source.id),'normal materials never enter selected historical batch');
    assert.ok(state.materials.every(material=>!material.relearningCount));
    if(active.session.currentStep==='output')trace.push([active.source.id,active.session.mode,active.session.currentGroupIndex]);
    write(next=>relearning.transition(next,active.session.currentStep==='groupComplete'?'continue':'outputDone',checkpoint));
  }
  const expected=['m1','m2','m3'].flatMap(id=>[0,1,2].map(index=>[id,'review',index]));
  assert.deepEqual(trace,expected);
  ['m1','m2','m3'].forEach(id=>assert.equal(state.materials.find(material=>material.id===id).relearningCount,1));
  ids.forEach(id=>assert.equal(state.materials.find(material=>material.id===id).relearningCount,undefined));
  return traces.map(trace=>trace.map(([id,index])=>String.fromCharCode(65+ids.indexOf(id))+(index+1)));
}
assert.deepEqual(run([3,3,3,3]),[[],['A1','A2','A3'],['B1','B2','B3','A1','A2','A3'],['C1','C2','C3','B1','B2','B3','A1','A2','A3']]);
assert.deepEqual(run([2,4,3]).at(-1),['B1','B2','B3','B4','A1','A2']);
console.log('PASS localhost A:none; B:A1..3; C:B1..3,A1..3; D:C1..3,B1..3,A1..3; mixed sizes, history/unknown-date exclusion, B2 midnight reload, unchanged internal schedule and independent selected relearning.');
