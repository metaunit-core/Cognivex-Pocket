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
    for(const width of [320,390,430,768,1440])for(const scenario of ['empty','active']){
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
      assert.deepEqual(await habits.locator('h1,h2,h3,h4,p').allTextContents(),[
        '学习方式与习惯','正常学习','平板＋2026网课讲义','按以下顺序继续学习','先做柜子里的纸质题目',
        '找到当前学习内容对应的题型','将题目分组录入系统','按照原有学习机制完成训练','保持做题手感和学习状态。',
        '再重做2026网课旧讲义','重做讲义中已经学过、做过的题目。','一定先做纸质题目，再做旧讲义内容，保持学习状态不掉。',
        '自由选择学习媒介','进入状态后，不再受学习媒介影响。','手机＋纸笔','做网盘电子题目','继续使用平板','充电后恢复学习',
        '两项固定原则','模拟考试','必须使用纸质试卷','适应真实考试环境，检验自己的实际解题能力。','进步本','必须使用电子笔记本',
        '纸质题目','扫描／拍照','电子题目','截图／导入','统一电子进步本','积累 · 总结 · 重做 · 内化',
        '学习资料分类','网盘最新电子题目','新题训练、大量刷题','2026 网课讲义','新知识学习、旧题重做','柜子里的纸质题目','对应题型训练、维持学习状态','最新纸质模拟题','真实考试训练',
        '一句话心得','学习媒介可以切换，学习状态不能轻易中断。模拟卷固定用纸质，进步本统一用电子，最终让知识和解题能力刻在脑子里。']);
      assert.equal(await habits.getByText('学习媒介与能力内化',{exact:true}).count(),0);
      assert.equal(await habits.locator('details,input,a').count(),0);assert.equal(await habits.locator('button').count(),1);
      assert.equal(await page.locator('#training-back').isVisible(),false);
      assert.equal(await habits.locator('.habits-region:visible').count(),2);
      assert.deepEqual(await habits.locator(':scope > section').evaluateAll(nodes=>nodes.map(node=>node.className)),['habits-card habits-normal','habits-card habits-flow','habits-region','habits-region','habits-card habits-insight']);
      assert.deepEqual(await habits.locator('.habits-checklist li').allTextContents(),['1学习讲义中的新题目','2在平板上独立做题','3理解方法、整理笔记']);
      assert.equal(await habits.locator('.habits-normal-label > span').textContent(),'优先执行');
      assert.equal(await habits.locator('.habits-power > span').textContent(),'平板或手写笔没电');
      assert.deepEqual(await habits.locator('.habits-step-number').allTextContents(),['01','02','03']);
      assert.ok(await habits.locator('.habits-step-number').evaluateAll(nodes=>nodes.every(node=>{const box=node.getBoundingClientRect(),css=getComputedStyle(node);return box.width===36&&box.height===36&&css.backgroundColor==='rgb(213, 174, 91)'&&css.color==='rgb(33, 28, 20)';})));
      assert.ok(await habits.locator('.habits-checklist li > span').evaluateAll(nodes=>nodes.every(node=>{const box=node.getBoundingClientRect();return box.width===24&&box.height===24;})));
      assert.equal(await habits.locator('.habits-flow > .habits-step').count(),3);
      assert.equal(await habits.locator('.habits-flow > .habits-media').count(),1);
      assert.equal(await habits.locator('.habits-actions > svg').count(),2);
      assert.deepEqual(await habits.locator('.habits-material > span').allTextContents(),['01','02','03','04']);
      assert.ok(await habits.locator('svg').evaluateAll(nodes=>nodes.every(node=>{const box=node.getBoundingClientRect();return box.width===box.height&&getComputedStyle(node).stroke!=='none';})));
      assert.equal(await habits.locator('.habits-materials').count(),1);assert.equal(await habits.locator('.habits-materials > .habits-material').count(),4);
      assert.equal(await habits.locator('.habits-flow-arrow').count(),3);assert.equal(await habits.locator('.habits-stable').textContent(),'进入稳定学习状态');
      assert.equal(await habits.locator('.habits-pair').count(),2);
      assert.ok(await habits.locator('.habits-pair').evaluateAll(nodes=>nodes.every(node=>{const [left,right]=Array.from(node.children).map(child=>child.getBoundingClientRect());return left.top===right.top&&left.height===right.height&&Math.abs(left.width-right.width)<1&&left.right<right.left;})));
      assert.equal(await habits.locator('.habits-gold').count(),2);
      assert.ok(await habits.locator('.habits-gold').evaluateAll(nodes=>nodes.every(node=>{const css=getComputedStyle(node);return css.backgroundColor==='rgb(48, 39, 25)'&&css.borderTopColor==='rgb(184, 148, 72)'&&css.borderRadius==='12px';})));
      assert.deepEqual(await habits.locator('.habits-normal').evaluate(node=>{const css=getComputedStyle(node);return [css.backgroundColor,css.borderTopColor];}),['rgb(27, 38, 53)','rgb(82, 111, 147)']);
      assert.deepEqual(await habits.locator('.habits-flow').evaluate(node=>{const css=getComputedStyle(node);return [css.backgroundColor,css.borderTopColor];}),['rgb(33, 28, 20)','rgb(184, 148, 72)']);
      assert.ok(await habits.locator('.habits-media > .habits-subcard').evaluateAll(nodes=>nodes.every(node=>{const css=getComputedStyle(node);return css.backgroundColor==='rgb(27, 38, 53)'&&css.borderTopColor==='rgb(64, 86, 115)';})));
      assert.equal(await habits.evaluate(node=>getComputedStyle(node).backgroundColor),'rgb(13, 16, 21)');
      assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
      assert.ok(await habits.locator('section,.habits-card,.habits-subcard,h1,h2,h3,h4,p').evaluateAll(nodes=>nodes.every(node=>node.scrollWidth<=node.clientWidth)));
      assert.equal(await read(),before);await page.evaluate(()=>scrollTo(0,0));
      assert.ok(await habits.locator('.habits-header').evaluate(node=>node.getBoundingClientRect().top>=document.getElementById('pocket-back-button').getBoundingClientRect().bottom));
      await page.screenshot({path:path.join(screenshots,`habits-${scenario}-${width}.png`),fullPage:true});
      if(process.env.POCKET_HABITS_SCREENSHOTS&&scenario==='empty'){fs.mkdirSync(process.env.POCKET_HABITS_SCREENSHOTS,{recursive:true});await page.screenshot({path:path.join(process.env.POCKET_HABITS_SCREENSHOTS,`learning-habits-${width}.png`),fullPage:true});}
      await page.reload({waitUntil:'networkidle'});assert.ok(await habits.isVisible());
      await page.locator('#learning-habits-back').click();assert.ok(await page.locator('#pocket-main').isVisible());assert.equal(await habits.isVisible(),false);
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
