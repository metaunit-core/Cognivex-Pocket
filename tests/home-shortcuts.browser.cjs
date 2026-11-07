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
      assert.deepEqual(await page.locator('#home-shortcuts button span').allTextContents(),['已学内容','今日复习','视频学习','新增资料分组']);
      const boxes=await page.locator('#home-shortcuts button').evaluateAll(nodes=>nodes.map(node=>({x:node.offsetLeft,y:node.offsetTop,width:node.offsetWidth,height:node.offsetHeight})));
      assert.equal(boxes[0].y,boxes[1].y);assert.equal(boxes[2].y,boxes[3].y);assert.ok(boxes[2].y>boxes[0].y);
      assert.equal(boxes[0].x,boxes[2].x);assert.ok(boxes.every(box=>Math.abs(box.width-boxes[0].width)<1&&box.height===boxes[0].height));
      const topAttention=()=>page.locator('#home-review-shortcut').evaluate(node=>node.className.includes('daily-review-attention'));
      const checkBorders=()=>page.locator('#home-review-shortcut,#selected-review-entry,#daily-reverse-review-entry,#focus-review-home-button').evaluateAll(nodes=>nodes.every(node=>(getComputedStyle(node).borderTopColor==='rgb(232, 191, 98)')===(node.className.includes('daily-review-attention')&&!node.disabled)));
      assert.equal(await topAttention(),scenario==='active');
      assert.equal(await checkBorders(),true);
      for(const name of ['learned','review','video','grouping']){
        await page.locator('#home-'+name+'-shortcut').click();assert.equal(await page.locator('#home-panel-area > .home-panel:visible').count(),1);
        await page.locator('#home-'+name+'-shortcut').click();assert.equal(await page.locator('#home-panel-area').isVisible(),false);
      }
      assert.equal(await read(),before);assert.equal(await topAttention(),scenario==='active');
      assert.equal(await checkBorders(),true);
      await page.locator('#home-grouping-shortcut').click();await page.locator('#home-grouping-content #subject').fill('数学');await page.locator('#home-grouping-content #title').fill('保留中的资料');
      await page.locator('#home-grouping-content form').evaluate(node=>{node.savedForm=node;window.originalHomeForm=node;});
      await page.locator('#home-video-shortcut').click();await page.locator('#video-learning-entry').getByRole('button',{name:'连续看课',exact:true}).click();
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
        assert.equal(await checkBorders(),true);
        await page.locator('#pocket-home-button').click();await page.reload({waitUntil:'networkidle'});assert.equal(await topAttention(),false);
        assert.equal(await page.locator('#home-panel-area').isVisible(),false);
      }
      assert.deepEqual(errors,[]);await context.close();console.log(`PASS home shortcuts ${width}px ${scenario}: 2x2, single panel, preserved form, mode/back, attention and original creation/review.`);
    }
    console.log('Screenshots: '+screenshots);
  }finally{await browser?.close();await new Promise(resolve=>server.close(resolve));}
})().catch(error=>{console.error(error);process.exitCode=1;});
