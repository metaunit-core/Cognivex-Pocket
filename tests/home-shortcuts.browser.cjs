'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),http=require('node:http'),os=require('node:os');
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
  const screenshots=fs.mkdtempSync(path.join(os.tmpdir(),'pocket-home-shortcuts-'));
  try{
    const origin=`http://127.0.0.1:${server.address().port}`;
    browser=await playwright.chromium.launch({executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',headless:true});
    for(const width of [320,390,1440])for(const scenario of ['empty','active']){
      const context=await browser.newContext({viewport:{width,height:900}});
      await context.route('**/*',route=>route.request().url().startsWith(origin+'/')?route.continue():route.abort());
      const initial=seed(scenario==='empty'?0:2);
      if(scenario==='active'){
        require('./helpers/original-learning-fixture.cjs')(initial,Date.now());
        const group=initial.materials[0].groups[0];group.runs.push({mode:'review',videoSkipped:true,outputCompleted:false,startedAt:Date.now(),completedAt:null});
        initial.currentSession={materialId:'m1',currentGroupIndex:0,currentRunIndex:group.runs.length-1,currentStep:'output',mode:'review',schedulerState:{phase:'review',newGroupIndex:0,reviewGroupIndex:0}};
      }
      await context.addInitScript(({key,initial})=>{if(!localStorage.getItem(key)){localStorage.setItem(key,JSON.stringify(initial));localStorage.setItem('pocket-development-v1:pocket-last-view-v1',JSON.stringify({page:'home'}));}},{key,initial});
      const page=await context.newPage(),errors=[];page.on('pageerror',error=>errors.push(error.message));await page.goto(origin,{waitUntil:'networkidle'});
      assert.equal(await page.locator('#environment-banner').textContent(),'测试环境｜不会连接 Firebase');
      const read=()=>page.evaluate(key=>localStorage.getItem(key),key),before=await read();
      assert.equal(await page.locator('#home-panel-area').isVisible(),false);
      assert.equal(await page.locator('#home-shortcuts + #home-panel-area + .learning-card').count(),1);
      assert.deepEqual(await page.locator('#home-shortcuts button').evaluateAll(nodes=>nodes.map(node=>node.dataset.homePanel)),['video','learned','review','grouping']);
      assert.deepEqual(await page.locator('.home-section-heading').allTextContents(),['学习运行体系','日常学习操作']);
      assert.equal(await page.locator('#home-video-shortcut small').textContent(),'三阶段学习 · 笔记理解 · 逐题突破');
      const tips=page.locator('#learning-tips');assert.equal(await tips.getAttribute('open'),null);
      await tips.locator('summary').click();assert.ok(await tips.locator('.learning-tips-content').isVisible());
      assert.deepEqual(await tips.locator('.learning-tips-content p').allTextContents(),['平板或手写笔没电了？','可以直接拿出纸和笔，继续做题、打草稿，重做以前学过的题目。','需要用到图的地方多的，就打印出来纸质，不用的就不打印，直接看手机在纸上做题或在平板做题。','设备没电，学习不用暂停。','目的：题目印在脑子里而不是在平板、纸上或手机里。']);
      assert.equal(await tips.locator('.learning-tips-purpose').evaluate(node=>getComputedStyle(node).color),'rgb(232, 191, 98)');
      await tips.locator('summary').click();assert.equal(await tips.getAttribute('open'),null);
      const systemCards=await page.locator('.home-system-grid > *').evaluateAll(nodes=>nodes.map(node=>{const box=node.getBoundingClientRect();return {x:box.x,y:box.y,width:box.width,height:box.height};}));
      assert.equal(systemCards.length,4);
      if(width>=900){assert.equal(systemCards[0].y,systemCards[1].y);assert.equal(systemCards[2].y,systemCards[3].y);assert.ok(systemCards[2].y>systemCards[0].y);assert.equal(systemCards[0].height,systemCards[1].height);assert.equal(systemCards[2].height,systemCards[3].height);}
      else assert.ok(systemCards[1].y>=systemCards[0].y+systemCards[0].height&&systemCards[2].y>=systemCards[1].y+systemCards[1].height);
      const boxes=await page.locator('#home-shortcuts button').evaluateAll(nodes=>nodes.map(node=>({x:node.offsetLeft,y:node.offsetTop,width:node.offsetWidth,height:node.offsetHeight})));
      assert.ok(boxes[1].y>boxes[0].y);assert.equal(boxes[1].y,boxes[2].y);
      assert.ok(Math.abs(boxes[1].width-boxes[2].width)<1);assert.equal(boxes[1].height,boxes[2].height);
      if(width>=900){assert.equal(boxes[2].y,boxes[3].y);assert.ok(Math.abs(boxes[3].width-boxes[1].width)<1);}
      else {assert.ok(boxes[3].y>boxes[2].y);assert.equal(boxes[0].width,boxes[3].width);}
      const topAttention=()=>page.locator('#home-review-shortcut').evaluate(node=>node.className.includes('daily-review-attention'));
      const checkBorders=()=>page.locator('#home-review-shortcut,#selected-review-entry,#daily-reverse-review-entry,#focus-review-home-button').evaluateAll(nodes=>nodes.every(node=>(getComputedStyle(node).borderTopColor===(node.id==='home-review-shortcut'?'rgb(245, 197, 66)':'rgb(232, 191, 98)'))===(node.className.includes('daily-review-attention')&&!node.disabled)));
      assert.equal(await topAttention(),scenario==='active');
      assert.equal(await checkBorders(),true);
      await page.screenshot({path:path.join(screenshots,`home-${scenario}-${width}.png`),fullPage:true});
      for(const name of ['learned','review','video','grouping']){
        await page.locator('#home-'+name+'-shortcut').click();assert.equal(await page.locator('#home-panel-area > .home-panel:visible').count(),1);
        await page.locator('#home-'+name+'-shortcut').click();assert.equal(await page.locator('#home-panel-area').isVisible(),false);
      }
      assert.equal(await read(),before);assert.equal(await topAttention(),scenario==='active');
      assert.equal(await checkBorders(),true);
      await page.locator('#home-grouping-shortcut').click();await page.locator('#home-grouping-content #subject').fill('数学');await page.locator('#home-grouping-content #title').fill('保留中的资料');
      await page.locator('#home-grouping-content form').evaluate(node=>{node.savedForm=node;window.originalHomeForm=node;});
      await page.locator('#home-video-shortcut').click();await page.locator('#video-learning-entry').getByRole('button',{name:'整章速通',exact:true}).click();
      await page.locator('#video-learning-system').getByRole('button',{name:'进入题目分组',exact:true}).click();
      assert.ok(await page.locator('#home-grouping-panel').isVisible());assert.equal(await page.locator('#home-grouping-content #title').inputValue(),'保留中的资料');
      assert.equal(await page.locator('#home-grouping-content form').evaluate(node=>node===window.originalHomeForm),true);
      await page.locator('#home-grouping-content').getByRole('button',{name:'下一步：分组设置',exact:true}).click();
      await page.locator('#home-grouping-content #question-range').fill('1-3');await page.locator('#home-grouping-content #group-size').fill('3');
      await page.locator('#home-review-shortcut').click();assert.equal(await page.locator('#focus-review-entry .today-review-actions > button').count(),3);
      await page.locator('#home-grouping-shortcut').click();assert.equal(await page.locator('#home-grouping-content #question-range').inputValue(),'1-3');
      assert.equal(await read(),before);assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
      await page.evaluate(()=>scrollTo(0,0));await page.screenshot({path:path.join(screenshots,`${scenario}-${width}.png`),fullPage:true});
      await page.locator('#home-grouping-content').getByRole('button',{name:'确认分组，开始学习',exact:true}).click();
      if(scenario==='empty'){
        const saved=JSON.parse(await read());assert.equal(saved.materials.length,1);assert.equal(saved.materials[0].groups.length,1);assert.equal(saved.currentSession.currentStep,'output');
        const skip=page.getByRole('button',{name:'跳过泛听，直接开始学习',exact:true});if(await skip.isVisible())await skip.click();
        assert.ok(await page.locator('#learning-content .output-task-complete').isVisible());
      }else{
        assert.equal(await read(),before);await page.locator('#home-panel-close').click();
        await page.locator('#home-review-shortcut').click();await page.locator('#daily-reverse-review-entry').click();
        for(let step=0;step<2;step++)await page.locator('#learning-content .output-task-complete').click();
        assert.equal(await topAttention(),false);
        await page.waitForTimeout(350);
        assert.equal(await checkBorders(),true);
        await page.locator('#pocket-home-button').click();await page.reload({waitUntil:'networkidle'});assert.equal(await topAttention(),false);
        assert.equal(await page.locator('#home-panel-area').isVisible(),false);
        await page.locator('#home-review-shortcut').click();
        assert.equal(await page.locator('#daily-reverse-review-entry .focus-review-entry-title').textContent(),'正序复习全部');
        assert.equal(await page.locator('#daily-reverse-review-entry .focus-review-entry-count').textContent(),'1次');
        for(let click=1;click<=2;click++){
          await page.locator('#focus-review-home-button').click();
          await page.locator('#pocket-home-button').click();
          if(!await page.locator('#focus-review-home-button').isVisible())await page.locator('#home-review-shortcut').click();
          assert.equal(await page.locator('#focus-review-home-button .focus-review-entry-title').textContent(),'重点复习系统');
          assert.equal(await page.locator('#focus-review-home-button .focus-review-entry-count').textContent(),`${click}次`);
          assert.ok(await page.locator('#focus-review-home-button').evaluate(node=>node.scrollWidth<=node.clientWidth));
        }
        await page.reload({waitUntil:'networkidle'});await page.locator('#home-review-shortcut').click();
        assert.equal(await page.locator('#focus-review-home-button .focus-review-entry-count').textContent(),'2次');
        await page.evaluate(key=>{const state=JSON.parse(localStorage.getItem(key));state.reviewAdmission.entryStats.focusClicks=128;localStorage.setItem(key,JSON.stringify(state));},key);
        await page.reload({waitUntil:'networkidle'});await page.locator('#home-review-shortcut').click();
        assert.equal(await page.locator('#focus-review-home-button .focus-review-entry-count').textContent(),'128次');
        assert.ok(await page.locator('#focus-review-home-button').evaluate(node=>node.scrollWidth<=node.clientWidth));
        await page.evaluate(key=>{const state=JSON.parse(localStorage.getItem(key));state.reviewAdmission.entryStats.selectedBatchIds=['display-fixture'];localStorage.setItem(key,JSON.stringify(state));},key);
        await page.reload({waitUntil:'networkidle'});await page.locator('#home-review-shortcut').click();
        assert.equal(await page.locator('#selected-review-entry .focus-review-entry-count').textContent(),'1次');
        for(const id of ['selected-review-entry','daily-reverse-review-entry','focus-review-home-button'])assert.ok(await page.locator('#'+id).evaluate(node=>node.scrollWidth<=node.clientWidth));
      }
      assert.deepEqual(errors,[]);await context.close();console.log(`PASS home shortcuts ${width}px ${scenario}: responsive groups, single panel, preserved form, mode/back, attention and original creation/review.`);
    }
    console.log('Screenshots: '+screenshots);
  }finally{await browser?.close();await new Promise(resolve=>server.close(resolve));}
})().catch(error=>{console.error(error);process.exitCode=1;});
