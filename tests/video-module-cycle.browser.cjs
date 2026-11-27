'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),http=require('node:http');
const {seed}=require('./helpers/pocket-learning-ui.cjs');
const playwright=require(path.join(path.dirname(process.execPath),'node_modules/playwright'));
const root=path.resolve(__dirname,'..'),key='pocket-development-v1:cognivex-pocket-state';
const text='完成当前知识模块的视频学习后，将资料推进分组训练，按照原有学习机制完成新旧内容的循环训练，再继续学习新视频。';
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
    for(const [width,scenario] of [[320,'fresh'],[390,'busy'],[1440,'legacy']]){
      const context=await browser.newContext({viewport:{width,height:900}});
      await context.route('**/*',route=>route.request().url().startsWith(origin+'/')?route.continue():route.abort());
      const initial=seed(scenario==='busy'?2:0);
      if(scenario==='busy'){
        require('./helpers/original-learning-fixture.cjs')(initial,Date.now());
        const group=initial.materials[0].groups[0];group.runs.push({mode:'review',videoSkipped:true,outputCompleted:false,startedAt:Date.now(),completedAt:null});
        initial.currentSession={materialId:'m1',currentGroupIndex:0,currentRunIndex:group.runs.length-1,currentStep:'output',mode:'review',schedulerState:{phase:'review',newGroupIndex:0,reviewGroupIndex:0}};
      }
      if(scenario==='legacy')initial.videoLearning={version:1,records:[],moduleCycle:{id:'old-module',status:'grouped',sourceStage:'question',startedAt:1,groupedAt:2,materialId:'old-material'}};
      await context.addInitScript(({key,initial})=>{if(!localStorage.getItem(key)){localStorage.setItem(key,JSON.stringify(initial));localStorage.setItem('pocket-development-v1:pocket-last-view-v1',JSON.stringify({page:'home'}));}},{key,initial});
      const page=await context.newPage(),errors=[];page.on('pageerror',error=>errors.push(error.message));await page.goto(origin,{waitUntil:'networkidle'});
      const read=()=>page.evaluate(key=>JSON.parse(localStorage.getItem(key)),key),original=await read();
      const homeVideo=async()=>{await page.locator('#pocket-home-button').click();if(!await page.locator('#video-learning-entry').isVisible())await page.locator('#home-video-shortcut').click();assert.equal(await page.locator('#video-learning-entry .video-module-completion').count(),0);};
      const mode=title=>page.locator('#video-learning-entry').getByRole('button',{name:title,exact:true});
      const view=page.locator('#video-learning-system');
      for(const [title,count] of [['分段看＋独立重做',3],['逐题突破',6]]){
        await homeVideo();await mode(title).click();
        for(let index=0;index<count-1;index++){
          assert.equal(await view.locator('.video-module-completion').count(),0);
          if(title==='逐题突破' && index===4)await view.locator('.question-success-next').click();
          else await view.locator('.video-learning-step-actions > button').last().click();
        }
        const reminder=view.locator('.video-module-completion');assert.ok(await reminder.isVisible());
        if(title==='分段看＋独立重做'){
          assert.equal(await view.locator('.video-learning-operation > p').textContent(),'当前步骤 3/4');
          assert.equal(await view.locator('.video-learning-preview h2').innerText(),'所有题目可独立重做的点击下方进入分组循环单条资料\n有卡住的题目进入逐题突破，暂不新增单条资料');
          await view.getByRole('button',{name:'进入下一步',exact:true}).click();
          assert.equal(await view.locator('.video-learning-operation > p').textContent(),'当前步骤 4/4');
          assert.equal(await reminder.count(),0);
          assert.equal(await view.locator('.video-module-grouping').count(),0);
          assert.equal(await view.getByRole('button',{name:'进入新增资料分组',exact:true}).count(),0);
          assert.ok(await view.getByRole('button',{name:'进入逐题突破',exact:true}).isVisible());
          await view.getByRole('button',{name:'上一步',exact:true}).click();
          assert.ok(await reminder.isVisible());
        }
        assert.equal(await view.getByText('步骤切换仅保存操作位置，不代表学习达标；题号仅由你手动调整。',{exact:true}).count(),0);
        assert.equal(await view.getByRole('button',{name:'进入题目分组',exact:true}).count(),0);
        assert.equal(await view.getByRole('button',{name:'进入新增资料分组',exact:true}).count(),1);
        assert.equal(await view.getByText('当前知识模块视频学习已完成，若不用进入逐道题突破，可自行选择推入到分组训练。',{exact:true}).count(),title==='分段看＋独立重做'?1:0);
        assert.equal(await reminder.locator('.video-mastery-card > p').textContent(),text);
        assert.equal(await reminder.locator('h2').textContent(),'当前资料内所有题目都可以独立重做，暂无大问题，点击进入分组循环复习');
        assert.equal(await view.getByText('当前知识模块学习已完成',{exact:true}).count(),0);
        assert.equal(await reminder.locator('.video-module-success').count(),0);
        assert.ok(await reminder.evaluate(node=>{const actions=node.parentElement.previousElementSibling;return actions.classList.contains('video-learning-step-actions')&&node.getBoundingClientRect().top>=actions.getBoundingClientRect().bottom;}));
        assert.equal(await reminder.locator('.video-mastery-card').evaluate(node=>getComputedStyle(node).backgroundColor),'rgb(48, 39, 25)');
        assert.equal(await reminder.locator('.video-mastery-card').evaluate(node=>getComputedStyle(node).borderTopColor),'rgb(169, 138, 76)');
        assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
        const beforeNavigation=await read();await reminder.getByRole('button',{name:'进入新增资料分组',exact:true}).click();
        assert.ok(await page.locator('#home-grouping-panel').isVisible());assert.deepEqual(await read(),beforeNavigation);
        await homeVideo();await mode(title).click();assert.ok(await reminder.isVisible());
        await page.reload({waitUntil:'networkidle'});assert.ok(await reminder.isVisible());
        const beforeNew=await read();await reminder.getByRole('button',{name:'开始新视频学习',exact:true}).click();
        assert.equal(await view.locator('h1').textContent(),'知识模块速通');assert.equal(await view.locator('.video-learning-operation > p').textContent(),'当前步骤 1/3');assert.equal(await reminder.count(),0);
        const afterNew=await read();assert.deepEqual(afterNew.materials,beforeNew.materials);assert.deepEqual(afterNew.currentSession,beforeNew.currentSession);assert.deepEqual(afterNew.review,beforeNew.review);
        assert.equal(afterNew.videoLearning.guidance.continuous,beforeNew.videoLearning.guidance.continuous);assert.equal(afterNew.videoLearning.guidance.question,beforeNew.videoLearning.guidance.question);assert.equal(afterNew.videoLearning.guidance.currentQuestion,beforeNew.videoLearning.guidance.currentQuestion);
        assert.deepEqual(afterNew.videoLearning.moduleCycle,original.videoLearning?.moduleCycle);
      }
      await homeVideo();await mode('分段看＋独立重做').click();const beforeGrouping=await read();
      await view.getByRole('button',{name:'进入新增资料分组',exact:true}).click();assert.deepEqual(await read(),beforeGrouping,'grouping entry does not write completion or source records');
      const host=page.locator('#home-grouping-content');await host.locator('#subject').fill('数学');await host.locator('#title').fill('普通分组仍受原规则保护');await host.getByRole('button',{name:'下一步：分组设置',exact:true}).click();await host.locator('#question-range').fill('1-2');await host.locator('#group-size').fill('2');
      await host.getByRole('button',{name:'确认分组，开始学习',exact:true}).click();const afterGrouping=await read();
      assert.deepEqual(afterGrouping.videoLearning,beforeGrouping.videoLearning,'formal creation does not write video completion state');
      if(scenario==='busy'){assert.deepEqual(afterGrouping,beforeGrouping);assert.ok(await page.locator('#home-grouping-notice').textContent().then(value=>value.includes('已有未完成的学习进度')));}
      else{assert.equal(afterGrouping.materials.length,1);assert.equal(afterGrouping.currentSession.currentStep,'output');assert.equal(afterGrouping.materials[0].groups[0].runs.length,1);}
      assert.deepEqual(errors,[]);await context.close();console.log(`PASS reminder ${width}px ${scenario}: stage 2 step 3 only, unchanged stage 3 last step, navigation/preview, original styles/buttons, reload and creation rules.`);
    }
  }finally{await browser?.close();await new Promise(resolve=>server.close(resolve));}
})().catch(error=>{console.error(error);process.exitCode=1;});
