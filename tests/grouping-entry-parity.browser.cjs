'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),http=require('node:http');
const {seed}=require('./helpers/pocket-learning-ui.cjs');
const playwright=require(path.join(path.dirname(process.execPath),'node_modules/playwright'));
const root=path.resolve(__dirname,'..'),key='pocket-development-v1:cognivex-pocket-state',at=Date.now();
const server=http.createServer((request,response)=>{
  const file=path.resolve(root,'.'+new URL(request.url,'http://localhost').pathname.replace(/\/$/,'/index.html'));
  if(!file.startsWith(root+path.sep))return response.writeHead(403).end();
  try{response.setHeader('Content-Type',({'.js':'text/javascript','.css':'text/css','.html':'text/html'})[path.extname(file)]||'text/plain');response.end(fs.readFileSync(file));}catch(_){response.writeHead(404).end();}
});
(async()=>{
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));let browser;
  try{
    const origin=`http://127.0.0.1:${server.address().port}`;
    browser=await playwright.chromium.launch({executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',headless:true});
    for(const profile of ['empty','busy','draft','review-required']){
      const initial=seed(['busy','review-required'].includes(profile)?2:0);
      if(initial.materials.length)require('./helpers/original-learning-fixture.cjs')(initial,at);
      if(profile==='busy'){
        const group=initial.materials[0].groups[0];group.runs.push({mode:'review',videoSkipped:true,outputCompleted:false,startedAt:at,completedAt:null});
        initial.currentSession={materialId:'m1',currentGroupIndex:0,currentRunIndex:group.runs.length-1,currentStep:'output',mode:'review',schedulerState:{phase:'review',newGroupIndex:0,reviewGroupIndex:0}};
      }
      if(profile==='draft')initial.currentSession={materialId:'material-draft',currentStep:'basic',mode:'new',currentGroupIndex:0,createdAt:at,draft:{subject:'数学',title:'已有草稿',questionRange:'',groupSize:'',groups:[],videoModuleId:'legacy-unrelated-token'}};
      initial.videoLearning={version:1,records:[],guidance:{intro:0,continuous:3,question:6,currentQuestion:5,questionStepVersion:3}};
      const results=[];
      for(const entry of ['home','continuous','question']){
        const context=await browser.newContext({viewport:{width:390,height:900}});
        await context.route('**/*',route=>route.request().url().startsWith(origin+'/')?route.continue():route.abort());
        await context.addInitScript(({key,initial,at})=>{Date.now=()=>at;if(!localStorage.getItem(key)){localStorage.setItem(key,JSON.stringify(initial));localStorage.setItem('pocket-development-v1:pocket-last-view-v1',JSON.stringify({page:'home'}));}},{key,initial,at});
        const page=await context.newPage(),errors=[];page.on('pageerror',error=>errors.push(error.message));await page.goto(origin,{waitUntil:'networkidle'});
        const read=()=>page.evaluate(key=>JSON.parse(localStorage.getItem(key)),key),before=await read();
        const openEntry=async()=>{
          await page.locator('#pocket-home-button').click();
          if(entry==='home')await page.locator('#home-grouping-shortcut').click();
          else{
            await page.locator('#home-video-shortcut').click();await page.locator('#video-learning-entry').getByRole('button',{name:entry==='continuous'?'分段看＋独立重做':'逐题突破',exact:true}).click();
            assert.equal(await page.locator('#video-learning-system').getByRole('button',{name:'进入新增资料分组',exact:true}).count(),1);
            await page.locator('#video-learning-system .video-module-review').click();
          }
        };
        const train=()=>page.evaluate(()=>{
          let state=PocketStorage.loadState(),guard=0;const trace=[];
          while(state.currentSession.currentStep!=='materialComplete'){
            if(++guard>40)throw Error('training did not finish');
            const session=state.currentSession,expected={materialId:session.materialId,currentGroupIndex:session.currentGroupIndex,currentStep:session.currentStep,currentRunIndex:session.currentRunIndex,mode:session.mode,sessionType:'learning'};
            if(session.currentStep==='output')trace.push((session.mode==='new'?'新':'复')+(session.currentGroupIndex+1));
            state=PocketStorage.updateState(state,next=>PocketExecutor.transition(next,session.currentStep==='groupComplete'?'continue':'outputDone',expected));
            const restored=PocketStorage.loadState();if(JSON.stringify(restored)!==JSON.stringify(state))throw Error('checkpoint restore differs');state=restored;
            if(state.currentSession.currentStep!=='materialComplete' && PocketScheduler.isMaterialComplete(state))throw Error('material completed prematurely');
          }
          return trace;
        });
        await openEntry();
        assert.deepEqual(await read(),before,'opening an entry cannot write, replace or tag existing learning state');
        const panel=page.locator('#home-grouping-content');
        const opened={html:await panel.innerHTML(),notice:await page.locator('#home-grouping-notice').textContent()};
        let host=panel;
        if(profile==='draft'){await panel.getByRole('button',{name:'继续已有资料设置',exact:true}).click();host=page.locator('#learning-content');}
        const fields={subject:await host.locator('#subject').inputValue(),title:await host.locator('#title').inputValue()};
        await host.locator('#subject').fill('数学');await host.locator('#title').fill('同一资料');await host.getByRole('button',{name:'下一步：分组设置',exact:true}).click();await host.locator('#question-range').fill('1-6');await host.locator('#group-size').fill('2');
        await host.getByRole('button',{name:'确认分组，开始学习',exact:true}).click();
        const submitted=await read();
        const traces={};
        if(['busy','review-required'].includes(profile))assert.deepEqual(submitted,before);
        else{
          assert.equal(submitted.materials.length,1);assert.equal(submitted.currentSession.currentStep,'output');assert.equal(submitted.materials[0].groups.length,3);
          assert.deepEqual(submitted.materials[0].groups.map(group=>[group.start,group.end]),[[1,2],[3,4],[5,6]]);
          await page.reload({waitUntil:'networkidle'});assert.deepEqual(await read(),submitted,'reload restores the same task without duplicate creation');
          traces.A=await train();
          assert.deepEqual(traces.A,['新1','新2','复1','复2','新3','复1','复2','复3']);
          const trained=await read();assert.equal(trained.materials[0].status,'completed');assert.deepEqual(trained.materials[0].groups.map(group=>group.runs.map(run=>run.mode)),[['new','review','review'],['new','review','review'],['new','review']]);
          if(profile==='empty'){
            await page.evaluate(()=>{
              let state=PocketStorage.loadState();state=PocketStorage.updateState(state,next=>PocketDailyReverse.start(next));
              while(PocketDailyReverse.task(state)){
                const task=PocketDailyReverse.task(state),round=task.round;
                state=PocketStorage.updateState(state,next=>PocketDailyReverse.transition(next,'outputDone',{roundId:round.id,index:round.index,materialId:task.material.id,taskIndex:round.taskIndex,currentGroupIndex:task.groupIndex}));
              }
              if(!PocketMaterialReview.canCreate(state))throw Error('original gates did not permit B');
            });
            const createLater=async title=>{
              await page.reload({waitUntil:'networkidle'});await openEntry();const form=page.locator('#home-grouping-content');
              await form.locator('#subject').fill('数学');await form.locator('#title').fill(title);await form.getByRole('button',{name:'下一步：分组设置',exact:true}).click();await form.locator('#question-range').fill('1-6');await form.locator('#group-size').fill('2');await form.getByRole('button',{name:'确认分组，开始学习',exact:true}).click();
            };
            await createLater('第二份资料');assert.equal((await read()).materials.length,2);traces.B=await train();assert.deepEqual(traces.B,traces.A);
            traces.cross=await page.evaluate(()=>{
              let state=PocketStorage.loadState();if(PocketMaterialReview.canCreate(state))throw Error('cross-material review was bypassed');
              state=PocketStorage.updateState(state,next=>PocketMaterialReview.open(next));const trace=[];
              while(state.materialReviewSession.currentStep!=='queueComplete'){
                const session=state.materialReviewSession;
                if(session.currentStep==='materialCompletePending')state=PocketStorage.updateState(state,next=>PocketMaterialReview.advanceQueue(next));
                else{
                  const material=state.materials.find(item=>item.id===session.materialId);trace.push(material.title+':'+(session.currentGroupIndex+1));
                  const expected={materialId:session.materialId,currentGroupIndex:session.currentGroupIndex,currentStep:session.currentStep,currentRunIndex:session.currentRunIndex,mode:session.mode,sessionType:'material-review'};
                  state=PocketStorage.updateState(state,next=>PocketExecutor.transition(next,'outputDone',expected));
                }
              }
              state=PocketStorage.updateState(state,next=>PocketMaterialReview.returnToLearning(next));
              if(!PocketMaterialReview.canCreate(state))throw Error('original cross-material review did not unlock C');return trace;
            });
            assert.deepEqual(traces.cross,['同一资料:1','同一资料:2','同一资料:3']);await createLater('第三份资料');assert.equal((await read()).materials.length,3);assert.equal((await read()).currentSession.currentStep,'output');
          }
        }
        const final=await read();assert.deepEqual(final.videoLearning,before.videoLearning);assert.deepEqual(errors,[]);
        results.push({opened,fields,submitted,traces,final});await context.close();
      }
      assert.deepEqual(results[1],results[0],`${profile}: stage 2 entry must match homepage exactly`);
      assert.deepEqual(results[2],results[0],`${profile}: stage 3 entry must match homepage exactly`);
      console.log(`PASS grouping parity ${profile}: identical DOM/form, guards, saved state and full original Group/Run cycle across all three entries.`);
      if(profile==='empty')console.log('TRACE all entries: A/B 新1→新2→复1→复2→新3→复1→复2→复3; B后复习A1→A2→A3; then original gates permit C.');
    }
  }finally{await browser?.close();await new Promise(resolve=>server.close(resolve));}
})().catch(error=>{console.error(error);process.exitCode=1;});
