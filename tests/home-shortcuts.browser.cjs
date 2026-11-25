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
    for(const width of [320,390,430,1440])for(const scenario of ['empty','active']){
      const context=await browser.newContext({viewport:{width,height:900}});
      await context.route('**/*',route=>route.request().url().startsWith(origin+'/')?route.continue():route.abort());
      const initial=seed(scenario==='empty'?0:2);
      initial.videoLearning={version:1,records:[],guidance:{intro:0,continuous:3,question:0,currentQuestion:1,questionStepVersion:3}};
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
      const tips=page.locator('#learning-tips');assert.equal(await tips.evaluate(node=>node.tagName),'BUTTON');
      assert.equal(await tips.textContent(),'学习方式与习惯');assert.equal(await page.locator('.learning-tips-content').count(),0);
      await tips.click();const habits=page.locator('#training-learning-habits');assert.ok(await habits.isVisible());
      assert.equal(await page.locator('#pocket-main').isVisible(),false);
      assert.deepEqual(await habits.locator('h1,h2,h3,p,li').allTextContents(),[
        '学习方式与习惯','学习媒介与能力内化','① 学习的本质','不论用平板、手机还是纸质资料做题，目的都是将知识、解题方法和思维能力刻在脑子里，而不是留在学习工具上。',
        '② 灵活选择学习媒介','平板或手写笔没电了，直接拿出纸笔继续学习。','图形较多的题目，按需打印。','其他题目，可以看手机在纸上做，也可以直接在平板上做。',
        '③ 电子笔记：积累重点题目','利用电子笔记本积累重点题目、解题心得，方便随时调取、反复重做。',
        '④ 平板学习：培养思维习惯','利用平板的绘图、标注功能，将抽象思维形象化。通过反复训练，直到脱离平板，也能在脑海中独立想象和分析问题。',
        '⑤ 纸质做题：检验真实能力','购买纸质模拟题，通过大量刷题和限时模考，适应真实考试环境，检验脱离电子工具后的解题能力。',
        '核心原则','学习媒介可以不同，但最终的能力必须存在于自己的大脑中。','一句话心得','用平板培养思维，用电子笔记积累能力，用纸质试卷检验能力。设备没电，学习不用暂停。']);
      assert.equal(await habits.locator('details,button').count(),0);
      assert.equal(await habits.locator('.learning-habits-sections > section:visible').count(),5);
      assert.deepEqual(await habits.locator('.learning-habits-principle').evaluate(node=>{const css=getComputedStyle(node);return [css.backgroundColor,css.borderTopColor,css.borderRadius];}),['rgb(48, 39, 25)','rgb(169, 138, 76)','12px']);
      assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
      assert.ok(await habits.locator('section').evaluateAll(nodes=>nodes.every(node=>node.scrollWidth<=node.clientWidth)));
      assert.equal(await read(),before);await page.screenshot({path:path.join(screenshots,`habits-${scenario}-${width}.png`),fullPage:true});
      await page.reload({waitUntil:'networkidle'});assert.ok(await habits.isVisible());
      await page.locator('#training-back').click();assert.ok(await page.locator('#pocket-main').isVisible());assert.equal(await habits.isVisible(),false);
      await tips.click();await page.locator('#pocket-back-button').click();assert.ok(await page.locator('#pocket-main').isVisible());
      assert.equal(await read(),before);
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
      await page.locator('#home-video-shortcut').click();await page.locator('#video-learning-entry').getByRole('button',{name:'分段看＋独立重做',exact:true}).click();
      await page.locator('#video-learning-system').getByRole('button',{name:'进入新增资料分组',exact:true}).click();
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
