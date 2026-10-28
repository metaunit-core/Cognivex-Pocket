'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const {boot,seed}=require('./helpers/pocket-learning-ui.cjs');
const location=new URL('http://localhost:4173/'),key='pocket-development-v1:cognivex-pocket-state';
for(const sizes of [[2,4,3],[3],[1,2]]){
  const initial=seed(4),clock={now:new Date(2026,9,29,9).getTime()};
  sizes.forEach((size,index)=>{
    const material=initial.materials[index];
    material.groups=Array.from({length:size},(_,groupIndex)=>({...structuredClone(material.groups[0]),id:material.id+'-g'+groupIndex,start:groupIndex+1,end:groupIndex+1}));
    material.totalGroups=size;
  });
  initial.dailyReverseReview={version:1,saveOrder:['m1','m2','m3','m4'],history:[]};
  const ids=sizes.map((_,index)=>'m'+(index+1)),store=new Map([[key,JSON.stringify(initial)]]);
  let app=boot({location,clock,focusReview:true,store});
  const install=()=>{vm.runInContext(fs.readFileSync(path.join(__dirname,'../js/relearning.js'),'utf8'),app.context);return app.context.PocketRelearning;};
  let model=install(),state=app.context.PocketStorage.loadState();
  const write=change=>{state=app.context.PocketStorage.updateState(state,change);};
  const original=JSON.stringify(state.materials),trace=[];
  write(next=>model.start(next,[...ids].reverse()));
  let guard=0;
  while(model.pending(state)){
    assert.ok(++guard<30);const active=model.current(state),checkpoint=model.checkpoint(state);
    assert.equal(active.session.mode,'review');assert.equal(active.session.schedulerState,undefined);
    assert.equal(active.batch.engine.materialReviewSession,undefined);
    assert.equal(app.context.PocketReviewAdmission.status(state).unlocked,false);
    assert.ok(state.materials.every(material=>!material.relearningCount));
    trace.push([active.source.id,active.session.currentGroupIndex]);
    const saved=JSON.stringify(state.relearning);
    app=boot({location,clock,focusReview:true,store});model=install();state=app.context.PocketStorage.loadState();
    assert.equal(JSON.stringify(state.relearning),saved,'every unfinished review checkpoint resumes exactly');
    write(next=>model.transition(next,'outputDone',checkpoint));
    const after=JSON.stringify(state);write(next=>assert.equal(model.transition(next,'outputDone',checkpoint),false));assert.equal(JSON.stringify(state),after);
  }
  assert.deepEqual(trace,ids.flatMap((id,index)=>Array.from({length:sizes[index]},(_,groupIndex)=>[id,groupIndex])));
  assert.equal(state.relearning.reviewRounds.length,0);
  ids.forEach(id=>{const source=state.materials.find(material=>material.id===id);assert.equal(source.relearningCount,1);assert.ok(source.relearningHistory[0].groups.every(group=>group.runs.length===1&&group.runs[0].mode==='review'));});
  const cleaned=structuredClone(state.materials);cleaned.forEach(material=>{delete material.relearningCount;delete material.relearningHistory;});
  assert.equal(JSON.stringify(cleaned),original);
  assert.equal(app.context.PocketReviewAdmission.status(state).unlocked,true);
}
for(const version of [1,2]){
  const store=new Map([[key,JSON.stringify(seed(2))]]),clock={now:new Date(2026,9,29,9).getTime()};
  let app=boot({location,clock,focusReview:true,store});
  const install=()=>{vm.runInContext(fs.readFileSync(path.join(__dirname,'../js/relearning.js'),'utf8'),app.context);return app.context.PocketRelearning;};
  let model=install(),state=app.context.PocketStorage.loadState();
  const write=change=>{state=app.context.PocketStorage.updateState(state,change);};
  write(next=>{
    model.start(next,['m1','m2']);const batch=next.relearning,engine=batch.engine;
    batch.version=version;engine.relearningScheduleVersion=version;
    engine.materials[0].groups[0].runs=[];
    engine.currentSession={materialId:'m1',currentStep:'output',mode:'new'};
    app.context.PocketExecutor.startRun(engine,{groupIndex:0,mode:'new',schedulerState:{phase:'new',newGroupIndex:0,reviewGroupIndex:0}});
  });
  const saved=JSON.stringify(state.relearning);
  app=boot({location,clock,focusReview:true,store});model=install();state=app.context.PocketStorage.loadState();
  assert.equal(JSON.stringify(state.relearning),saved);
  let guard=0;
  while(model.pending(state)){assert.ok(++guard<40);const active=model.current(state),checkpoint=model.checkpoint(state);write(next=>model.transition(next,active.session.currentStep==='groupComplete'?'continue':'outputDone',checkpoint));}
  assert.ok(state.materials.every(material=>material.relearningCount===1));
}
console.log('PASS localhost forward-only 2/4/3 groups, singleton and 1/2 groups; exact-once runs, every-step reload, originals/unlock isolation, duplicate-event safety and legacy v1/v2 checkpoint compatibility.');
