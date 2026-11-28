'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),http=require('node:http');
const {seed}=require('./helpers/pocket-learning-ui.cjs');
const playwright=require(path.join(path.dirname(process.execPath),'node_modules/playwright'));
const root=path.resolve(__dirname,'..'),key='pocket-development-v1:cognivex-pocket-state',at=Date.now(),screens=path.join(root,'artifacts/video-dual-modes');
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
    for(const width of [320,390,430,768,1440]){
      const state=seed(2);require('./helpers/original-learning-fixture.cjs')(state,at);
      const group=state.materials[0].groups[0];group.runs.push({mode:'new',videoSkipped:true,outputCompleted:false,startedAt:at,completedAt:null});
      state.currentSession={materialId:'m1',currentGroupIndex:0,currentRunIndex:group.runs.length-1,currentStep:'output',mode:'new',schedulerState:{phase:'new',newGroupIndex:0,reviewGroupIndex:0}};
      state.videoLearning={version:1,records:[],guidance:{intro:1,continuous:3,question:4,currentQuestion:17,questionStepVersion:4}};
      const context=await browser.newContext({viewport:{width,height:900}});await context.route('**/*',route=>route.request().url().startsWith(origin+'/')?route.continue():route.abort());
      await context.addInitScript(({state,key})=>{if(!localStorage.getItem(key)){localStorage.setItem(key,JSON.stringify(state));localStorage.setItem('pocket-development-v1:pocket-last-view-v1',JSON.stringify({page:'home'}));}},{state,key});
      const page=await context.newPage(),errors=[];page.setDefaultTimeout(8000);page.on('pageerror',error=>{errors.push(error.message);console.error(error.message);});await page.goto(origin,{waitUntil:'networkidle'});
      const read=()=>page.evaluate(key=>JSON.parse(localStorage.getItem(key)),key),before=await read(),view=page.locator('#video-learning-system'),landing=page.locator('#video-learning-modes');
      async function inspect(name){assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),name+' overflow');if([390,1440].includes(width)){fs.mkdirSync(screens,{recursive:true});await page.evaluate(()=>{document.activeElement?.blur();scrollTo(0,0);});await page.screenshot({path:path.join(screens,`${name}-${width}.png`),fullPage:true});}}
      async function next(){await view.locator('.video-learning-step-actions > button').last().click();}
      async function selection(){await page.locator('#pocket-home-button').click();await page.locator('#home-video-shortcut').click();}
      await page.evaluate(()=>PocketVideoLearningUI.open({view:'continuous'}));assert.ok(await view.getByText('看完并且回忆当前分段视频内容，开始尝试一口气完整从第一道题开始做到分段看的最后一道题。',{exact:false}).first().isVisible());assert.deepEqual(await read(),before);
      await selection();assert.ok(await landing.isVisible());assert.equal(await landing.locator(':scope > .video-path-card').count(),2);assert.ok(await landing.locator('.video-note-test').isVisible());assert.ok(await landing.locator('.video-path-auxiliary svg').evaluateAll(nodes=>nodes.every(item=>item.getBoundingClientRect().width<=20)));await inspect('selection');
      const modeCards=landing.locator(':scope > .video-path-card');
      assert.deepEqual(await modeCards.first().locator('strong,.video-path-muted').allTextContents(),['逐题构建模式','从局部到整体 · 按需深化','适用场景','知识陌生、基础不熟练、连续看课容易遗忘，需要学一道、消化一道。']);
      assert.deepEqual(await modeCards.last().locator('strong,.video-path-muted').allTextContents(),['整体推进模式','从整体到局部 · 快速学习','适用场景','已有知识基础，能够快速理解老师的讲解，并且可以独立完成多数题目。']);
      assert.equal(await modeCards.locator('.video-path-sub,.video-path-arrow').count(),0);assert.equal(await modeCards.locator('hr').count(),2);
      await landing.locator('.video-note-test > summary').click();await landing.locator('.video-note-test-tabs').getByRole('button',{name:'阶段2',exact:true}).click();await landing.locator('.video-note-test-answers > summary').click();await inspect('notes-expanded');await landing.locator('.video-note-test > summary').click();
      for(const name of ['.video-stage-instructions','.video-low-pressure','.video-use-guide']){await landing.locator(name+' > summary').click();assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));await landing.locator(name+' > summary').click();}
      await landing.getByRole('button',{name:/逐题构建模式/}).click();await inspect('bottom-up');
      assert.equal((await read()).videoLearning.guidance.learningMode,'bottomUp');await landing.locator('button.video-path-card').filter({has:page.locator('strong',{hasText:'逐题突破'})}).click();
      assert.equal(await view.locator('.video-learning-operation > p').textContent(),'当前步骤 5/6');assert.equal(await view.locator('#video-current-question').inputValue(),'17');
      for(let cycle=0;cycle<3;cycle++){await view.getByRole('button',{name:'回到标注问题',exact:true}).click();for(let step=0;step<3;step++)await next();assert.equal(await view.locator('#video-current-question').inputValue(),'17');}
      await view.locator('.question-success-next').click();assert.equal(await view.locator('.video-learning-operation > h2').textContent(),'第6步：逐道题目都能独立重做');await inspect('question-completion');
      await page.reload({waitUntil:'networkidle'});assert.equal(await view.locator('.video-path-completion').count(),1);assert.equal(await view.locator('#video-current-question').inputValue(),'17');
      const reopened=await context.newPage();await reopened.goto(origin,{waitUntil:'networkidle'});assert.equal(await reopened.locator('#video-current-question').inputValue(),'17');assert.ok(await reopened.locator('.video-path-completion').isVisible());await reopened.close();
      await view.getByRole('button',{name:'进入新增资料分组',exact:true}).click();assert.ok(await page.locator('#home-grouping-panel').isVisible());const grouping=await page.locator('#home-grouping-content').innerHTML();await page.locator('#pocket-home-button').click();await page.locator('#home-grouping-shortcut').click();assert.equal(await page.locator('#home-grouping-content').innerHTML(),grouping);
      for(const optional of ['continuous','intro']){
        await page.evaluate(()=>PocketVideoLearningUI.open({view:'question',learningMode:'bottomUp'}));
        await view.locator('.video-path-optional button').nth(optional==='continuous'?0:1).click();
        assert.equal((await page.evaluate(()=>PocketNavigation.current())).learningMode,'bottomUp');
        if(optional==='continuous'){
          assert.equal(await view.locator('.video-learning-operation > p').textContent(),'当前步骤 3/4');assert.deepEqual(await view.locator('.video-path-completion > *').evaluateAll(nodes=>nodes.map(item=>item.className)),['video-path-card video-path-gold','video-path-segment-options','video-path-new']);await inspect('segment-completion');
          await view.locator('.practice-back').click();assert.equal(await view.locator('.video-learning-operation > p').textContent(),'当前步骤 6/6');assert.equal(await view.locator('#video-current-question').inputValue(),'17');await view.locator('.video-path-optional button').first().click();
          await view.getByRole('button',{name:'进入新增资料分组',exact:true}).click();assert.ok(await page.locator('#home-grouping-panel').isVisible());await page.evaluate(()=>PocketVideoLearningUI.open({view:'continuous',learningMode:'bottomUp'}));
          await view.getByRole('button',{name:'上一步',exact:true}).click();assert.ok(await view.getByText('找到逐题突破及当前分段学习中标记的问题，以及值得进一步理解的知识笔记。',{exact:true}).isVisible());
          for(const label of ['② 重新出题','③ 深入理解','④ 保存题目'])await view.getByRole('button',{name:label,exact:true}).click();await next();
          await view.getByRole('button',{name:'完整观看视频（可选）',exact:true}).click();
        }
        assert.equal(await view.locator('.video-learning-operation > p').textContent(),'当前步骤 2/3');
        await view.getByRole('button',{name:'有问题',exact:true}).click();assert.ok(await view.locator('.video-intro-selection-panel').getByText('暂时不影响理解的问题 → 简单标记，后续通过分组训练或返回对应学习模块处理。',{exact:true}).isVisible());await next();
        assert.ok(await view.getByText('完成当前知识模块的完整视频重看后，可以将资料推进分组训练，按照原有学习机制完成新旧内容的循环训练，再继续学习新视频。',{exact:true}).isVisible());await inspect('overview-completion');
        await view.getByRole('button',{name:'进入新增资料分组',exact:true}).click();assert.ok(await page.locator('#home-grouping-panel').isVisible());
        await page.evaluate(()=>PocketVideoLearningUI.open({view:'intro',learningMode:'bottomUp'}));await view.getByRole('button',{name:'上一步',exact:true}).click();
      }
      await selection();await landing.getByRole('button',{name:/整体推进模式/}).click();await inspect('top-down');await landing.getByRole('button',{name:/知识模块速通/}).click();
      await view.getByRole('button',{name:'上一步',exact:true}).click();assert.ok(await view.getByText('如何判断观看的视频数量？',{exact:true}).isVisible());await next();await next();await view.getByRole('button',{name:'进入视频分段＋重做学习',exact:true}).click();
      assert.equal(await view.locator('.video-learning-operation > p').textContent(),'当前步骤 1/4');await next();await next();assert.equal(await view.getByRole('button',{name:'进入新增资料分组',exact:true}).count(),1);await next();await view.getByRole('button',{name:'进入逐题突破',exact:true}).click();
      assert.equal(await view.locator('#video-current-question').inputValue(),'1');
      for(let step=0;step<4;step++)await next();for(let cycle=0;cycle<3;cycle++){await view.getByRole('button',{name:'回到标注问题',exact:true}).click();for(let step=0;step<3;step++)await next();assert.equal(await view.locator('#video-current-question').inputValue(),'1');}
      await view.locator('.question-success-next').click();assert.equal(await view.locator('.video-path-optional').count(),0);
      await page.evaluate(()=>PocketNavigation.navigate({page:'learning'}));await page.locator('.current-task > .output-entries > button:visible').first().click();await page.locator('#output-video-assistance').getByRole('button',{name:/逐题突破/}).click();assert.equal(await view.locator('.video-path-optional').count(),0);await view.locator('.practice-back').click();assert.ok(await page.locator('#output-video-assistance').isVisible());
      const after=await read();delete before.videoLearning;delete after.videoLearning;assert.deepEqual(after,before);assert.deepEqual(errors,[]);await context.close();console.log(`PASS dual modes ${width}px: paths A/B/C/D, both failure loops, refresh, shared grouping form, legacy top-down, OUTPUT preservation, no overflow.`);
    }
  }finally{await browser?.close();await new Promise(resolve=>server.close(resolve));}
})().catch(error=>{console.error(error);process.exitCode=1;});
