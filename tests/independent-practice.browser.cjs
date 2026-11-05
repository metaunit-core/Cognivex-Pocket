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
    for(const width of [320,1440])for(const mode of ['normal','daily','reverse','relearning','focus']){
      const context=await browser.newContext({viewport:{width,height:900}});
      await context.route('**/*',route=>route.request().url().startsWith(origin+'/')?route.continue():route.abort());
      const initial=seed(2);require('./helpers/original-learning-fixture.cjs')(initial,Date.now());
      if(mode==='normal'){
        const group=initial.materials[0].groups[0];group.runs.push({mode:'review',videoSkipped:true,outputCompleted:false,startedAt:Date.now(),completedAt:null});
        initial.currentSession={materialId:'m1',currentGroupIndex:0,currentRunIndex:group.runs.length-1,currentStep:'output',mode:'review',schedulerState:{phase:'review',newGroupIndex:0,reviewGroupIndex:0}};
      }
      await context.addInitScript(({key,initial})=>{if(!localStorage.getItem(key)){localStorage.setItem(key,JSON.stringify(initial));localStorage.setItem('pocket-development-v1:pocket-last-view-v1',JSON.stringify({page:initial.currentSession?'learning':'home'}));}},{key,initial});
      const page=await context.newPage(),errors=[];page.on('pageerror',error=>errors.push(error.message));await page.goto(origin,{waitUntil:'networkidle'});
      if(mode==='daily')await page.locator('#daily-reverse-review-entry').click();
      if(mode==='reverse')await page.locator('#start-review-button').click();
      if(mode==='relearning'){await page.locator('#learned-material-details').click();await page.locator('#materials-dialog input[data-material-id="m1"]').check();await page.locator('#relearn-selected-materials').click();}
      if(mode==='focus'){
        const id=await page.evaluate(()=>{const state=PocketStorage.loadState();let id;PocketStorage.updateState(state,next=>{PocketFocusReview.add(next,'m1',0,'1');id=PocketFocusReview.create(next,'数学',1,PocketFocusReview.available(next,'数学').map(question=>question.id));PocketFocusReview.start(next,id);});return id;});
        await page.reload({waitUntil:'networkidle'});await page.evaluate(id=>PocketFocusReviewUI.open({subject:'数学',focusGroup:id}),id);
      }
      const source=page.locator(mode==='relearning'?'#relearning':mode==='focus'?'#focus-review':'#pocket-main');
      const read=()=>page.evaluate(key=>localStorage.getItem(key),key),before=await read();
      const entries=source.locator('.current-task > .output-entries > button');
      assert.deepEqual(await entries.locator(':scope > strong').allTextContents(),['视频模仿','训练内化','构建解题体系','自主刷题与实战']);
      assert.deepEqual(await entries.locator(':scope > .output-entry-emphasis').allTextContents(),['核心方法 · 必读','核心目标 · 必练']);
      assert.equal(await entries.nth(0).locator('.output-entry-emphasis').count(),0);
      assert.equal(await entries.nth(1).locator('.output-entry-emphasis').count(),0);
      assert.deepEqual(await entries.nth(2).locator(':scope > span:not(.output-entry-emphasis)').allTextContents(),['单题 → 组题 → 章节 → 回忆补漏 → 综合验收']);
      assert.deepEqual(await entries.nth(3).locator(':scope > span:not(.output-entry-emphasis)').allTextContents(),['自主筛题 → 脱离视频 → 大量刷题 → 全真模考 → 专题补强']);
      assert.equal(await entries.evaluateAll(nodes=>nodes.every(node=>node.scrollWidth<=node.clientWidth)),true);
      const dimensions=await entries.evaluateAll(nodes=>nodes.map(node=>{const rect=node.getBoundingClientRect();return [rect.width,rect.height];}));
      assert.deepEqual(dimensions[0],dimensions[3]);
      await entries.nth(3).click();const guide=page.locator('#independent-practice');
      assert.ok(await guide.isVisible());assert.equal(await source.isVisible(),false);assert.equal(await guide.locator('h1').textContent(),'自主刷题与实战');
      assert.equal(await guide.locator('details').count(),2);assert.equal(await guide.locator('details[open]').count(),0);
      await guide.locator('details').nth(0).locator(':scope > summary').click();await guide.locator('details').nth(1).locator(':scope > summary').click();
      assert.equal(await guide.locator('details[open]').count(),2);
      assert.ok(await guide.getByText('补强后使用新的陌生试卷重新模拟检测。',{exact:true}).isVisible());
      assert.equal(await guide.locator('button').count(),1);assert.equal(await guide.locator('input,textarea,select').count(),0);
      assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));assert.equal(await read(),before);
      await page.reload({waitUntil:'networkidle'});assert.ok(await guide.isVisible(),mode+' reload');assert.equal(await read(),before);
      await guide.getByRole('button',{name:'← 返回当前任务',exact:true}).click();assert.ok(await source.isVisible());assert.equal(await guide.isVisible(),false);assert.equal(await read(),before);
      await source.getByRole('button',{name:/^自主刷题与实战/}).click();await page.locator('#pocket-back-button').click();assert.ok(await source.isVisible());assert.equal(await read(),before);
      assert.deepEqual(errors,[]);await context.close();console.log(`PASS independent guidance ${width}px ${mode}: layout/collapse/reload/back, no state writes.`);
    }
  }finally{await browser?.close();await new Promise(resolve=>server.close(resolve));}
})().catch(error=>{console.error(error);process.exitCode=1;});
