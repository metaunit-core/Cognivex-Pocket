'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const {boot,seed}=require('./helpers/pocket-learning-ui.cjs');
const app=boot(),source=fs.readFileSync(path.join(__dirname,'../js/video-learning.js'),'utf8');vm.runInContext(source,app.context);
const model=app.context.PocketVideoLearning;
for(const [version,mapping] of [[undefined,[0,1,2,2,3,4,5]],[2,[0,1,2,2,4,3,4,5]],[3,[0,1,2,4,3,4,5]],[4,[0,1,2,3,4,5]]]){
  mapping.forEach((expected,index)=>{
    const state=seed(0);state.videoLearning={version:1,records:[],guidance:{intro:2,continuous:4,question:index,currentQuestion:37,future:{preserve:true}}};
    if(version!==undefined)state.videoLearning.guidance.questionStepVersion=version;
    const bytes=JSON.stringify(state),guidance=model.progress(state);
    assert.equal(guidance.question,expected);assert.equal(guidance.currentQuestion,37);assert.equal(guidance.continuous,3);assert.equal(JSON.stringify(state),bytes);
    for(let count=0;count<3;count++){
      model.saveProgress(state,'question','step',expected);assert.equal(state.videoLearning.guidance.questionStepVersion,4);
      assert.equal(model.progress(state).question,expected);assert.equal(model.progress(state).currentQuestion,37);
      assert.deepEqual(state.videoLearning.guidance.future,{preserve:true});assert.equal(state.videoLearning.records.length,0);
      assert.deepEqual(state.materials,[]);assert.equal(state.currentSession,null);
    }
    for(let count=0;count<3;count++){
      model.saveProgress(state,'question','step',4);model.saveProgress(state,'question','step',1);
      assert.equal(model.progress(state).question,1);assert.equal(model.progress(state).currentQuestion,37);
    }
    assert.throws(()=>model.saveProgress(state,'question','step',6),/步骤/);
  });
}
console.log('PASS six-step question model: all legacy versions and seven-to-six semantic mappings, read-only restore, version-4 exact-once saves, repeated 5→2 loop, unchanged question/material/task/records and unknown fields.');
