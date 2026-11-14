'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),http=require('node:http');
const {seed}=require('./helpers/pocket-learning-ui.cjs');
const playwright=require(path.join(path.dirname(process.execPath),'node_modules/playwright'));
const root=path.resolve(__dirname,'..'),key='pocket-development-v1:cognivex-pocket-state';
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
    for(const width of [320,390,1440]){
      const context=await browser.newContext({viewport:{width,height:900}});
      await context.route('**/*',route=>route.request().url().startsWith(origin+'/')?route.continue():route.abort());
      const initial=seed(2);require('./helpers/original-learning-fixture.cjs')(initial,Date.now());
      const group=initial.materials[0].groups[0];group.runs.push({mode:'review',videoSkipped:true,outputCompleted:false,startedAt:Date.now(),completedAt:null});
      initial.currentSession={materialId:'m1',currentGroupIndex:0,currentRunIndex:group.runs.length-1,currentStep:'output',mode:'review',schedulerState:{phase:'review',newGroupIndex:0,reviewGroupIndex:0}};
      initial.videoLearning={version:1,records:[],guidance:{continuous:3,question:4,currentQuestion:12,questionStepVersion:3}};
      await context.addInitScript(({key,initial})=>{if(!localStorage.getItem(key)){localStorage.setItem(key,JSON.stringify(initial));localStorage.setItem('pocket-development-v1:pocket-last-view-v1',JSON.stringify({page:'home'}));}},{key,initial});
      const page=await context.newPage(),errors=[];page.on('pageerror',error=>errors.push(error.message));
      await page.goto(origin,{waitUntil:'networkidle'});
      assert.equal(await page.locator('#environment-banner').textContent(),'测试环境｜不会连接 Firebase');
      const read=()=>page.evaluate(key=>JSON.parse(localStorage.getItem(key)),key),before=await read();
      await page.locator('#home-video-shortcut').click();
      const entries=page.locator('#video-learning-entry > .video-learning-actions');
      assert.deepEqual(await entries.locator('button > .video-mode-heading strong').allTextContents(),['连续看课','视频分段看','逐题突破']);
      assert.equal(await page.locator('#video-learning-entry > h3').textContent(),'视频学习');
      assert.equal(await entries.locator('button svg[aria-hidden="true"]').count(),3);
      assert.deepEqual(await entries.locator('button > .video-mode-description').allTextContents(),[
        '阶段一：完整不暂停观看➡️截图录音➡️不重做',
        '阶段二：视频分段看➡️截图录音➡️自己重做',
        '阶段三：逐道题目重做➡️看视频讲解对标理解➡️复盘➡️进入到分组循环训练']);
      assert.ok(await entries.locator('button').evaluateAll(nodes=>nodes.every(node=>node.scrollWidth<=node.clientWidth)));
      const cards=await entries.locator('button').evaluateAll(nodes=>nodes.map(node=>{
        const box=node.getBoundingClientRect(),style=getComputedStyle(node);
        return {left:box.left,top:box.top,bottom:box.bottom,width:box.width,background:style.backgroundColor,radius:style.borderRadius};
      }));
      assert.ok(cards.every(card=>card.background==='rgb(23, 27, 34)'&&card.radius==='16px'&&card.left===cards[0].left&&card.width===cards[0].width));
      assert.equal(cards[1].top-cards[0].bottom,16);assert.equal(cards[2].top-cards[1].bottom,16);
      assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
      if(process.env.POCKET_VIDEO_PREVIEW){fs.mkdirSync(process.env.POCKET_VIDEO_PREVIEW,{recursive:true});await page.locator('#home-video-panel').screenshot({path:path.join(process.env.POCKET_VIDEO_PREVIEW,`video-home-${width}.png`)});}
      await entries.getByRole('button',{name:'视频分段看',exact:true}).click();
      const view=page.locator('#video-learning-system'),operation=view.locator('.video-learning-operation');
      assert.equal(await view.locator('h1').textContent(),'视频分段看');
      assert.equal(await operation.locator(':scope > p').textContent(),'当前步骤 4/5');
      await view.locator('.practice-back').click();
      await entries.getByRole('button',{name:'连续看课',exact:true}).click();
      const titles=['完整观看视频','截图 + OneNote 录音','完成 0 基础学习'];
      const texts=['完整不暂停看完一个视频，不分段，不重做。\n零碎时间可以重复不暂停完整看视频，当做背景音。','截图有疑问的页面或者收获，添加到 OneNote，并录音记录疑问或收获。','已完成0基础学习，进入到视频分段＋重做学习。'];
      for(let index=0;index<3;index++){
        assert.equal(await operation.locator('h2').textContent(),titles[index]);
        assert.equal(await operation.locator(':scope > p').textContent(),`当前步骤 ${index+1}/3`);
        assert.equal(await view.locator('.video-learning-description').textContent(),texts[index]);
        if(index===0)assert.equal(await view.locator('.video-learning-description > .video-inline-highlight').evaluate(node=>getComputedStyle(node).color),'rgb(232, 191, 98)');
        assert.equal(await view.locator('.video-learning-preview h2').textContent(),titles[index+1] || '重新循环');
        assert.equal(await view.getByRole('button',{name:'进入视频分段＋重做学习',exact:true}).isVisible(),index===2);
        const state=await read();assert.equal(state.videoLearning.guidance.continuous,3);assert.equal(state.videoLearning.guidance.question,4);assert.equal(state.videoLearning.guidance.currentQuestion,12);
        if(index<2)await view.getByRole('button',{name:'进入下一步',exact:true}).click();
      }
      await page.reload({waitUntil:'networkidle'});
      assert.equal(await operation.locator(':scope > p').textContent(),'当前步骤 3/3');
      assert.equal(await view.locator('.video-learning-finished strong').textContent(),'已完成0基础学习');
      await view.getByRole('button',{name:'进入视频分段＋重做学习',exact:true}).click();
      assert.equal(await view.locator('h1').textContent(),'视频分段看');
      assert.equal(await operation.locator(':scope > p').textContent(),'当前步骤 1/5');
      assert.equal(await operation.locator('h2').textContent(),'视频分段看');
      assert.equal(await view.locator('.video-instruction-fold').getAttribute('open'),null);
      await view.locator('.practice-back').click();assert.equal(await view.locator('h1').textContent(),'连续看课');
      assert.equal(await operation.locator(':scope > p').textContent(),'当前步骤 3/3');
      await page.locator('#pocket-home-button').click();
      if(!(await entries.isVisible()))await page.locator('#home-video-shortcut').click();
      await entries.getByRole('button',{name:'逐题突破',exact:true}).click();
      assert.equal(await operation.locator('h2').textContent(),'5、复盘');assert.equal(await view.locator('#video-current-question').inputValue(),'12');
      const questionContent=await view.locator('.video-learning-description').innerHTML();
      await page.locator('#pocket-home-button').click();await page.evaluate(()=>PocketLearning.resume());
      assert.equal(await page.locator('.current-task > .output-entries > button').filter({has:page.locator('strong',{hasText:'逐题突破'})}).locator('span').textContent(),'遇到一个有视频讲解的题目的学习（此操作仅供辅助参考，主要操作看下面的）');
      await page.locator('.current-task > .output-entries > button').filter({has:page.locator('strong',{hasText:'逐题突破'})}).click();
      assert.equal(await view.locator('.video-learning-description').innerHTML(),questionContent);
      await view.locator('.practice-back').click();assert.ok(await page.locator('.output-task-complete').isVisible());
      const after=await read();assert.equal(after.videoLearning.guidance.intro,2);
      delete before.videoLearning;delete after.videoLearning;assert.deepEqual(after,before);
      assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));assert.deepEqual(errors,[]);
      await context.close();console.log(`PASS ${width}px: three modes, intro text/reload/handoff, original positions, shared question entry and unchanged Group/Run`);
    }
  }finally{await browser?.close();await new Promise(resolve=>server.close(resolve));}
})().catch(error=>{console.error(error);process.exitCode=1;});
