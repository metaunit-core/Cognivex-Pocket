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
    for(const width of [320,1440])for(const mode of ['normal','daily','reverse','relearning','focus','empty']){
      const context=await browser.newContext({viewport:{width,height:900}});
      await context.route('**/*',route=>route.request().url().startsWith(origin+'/')?route.continue():route.abort());
      const initial=seed(mode==='empty'?0:2);require('./helpers/original-learning-fixture.cjs')(initial,Date.now());
      if(mode==='normal'){
        const group=initial.materials[0].groups[0];group.runs.push({mode:'review',videoSkipped:true,outputCompleted:false,startedAt:Date.now(),completedAt:null});
        initial.currentSession={materialId:'m1',currentGroupIndex:0,currentRunIndex:group.runs.length-1,currentStep:'output',mode:'review',schedulerState:{phase:'review',newGroupIndex:0,reviewGroupIndex:0}};
      }
      await context.addInitScript(({key,initial})=>{if(!localStorage.getItem(key)){localStorage.setItem(key,JSON.stringify(initial));localStorage.setItem('pocket-development-v1:pocket-last-view-v1',JSON.stringify({page:'home'}));}},{key,initial});
      const page=await context.newPage(),errors=[];page.on('pageerror',error=>errors.push(error.message));await page.goto(origin,{waitUntil:'networkidle'});
      assert.equal(await page.locator('#environment-banner').textContent(),'测试环境｜不会连接 Firebase');
      if(mode==='daily'){await page.locator('#home-review-shortcut').click();await page.locator('#daily-reverse-review-entry').click();}
      if(mode==='reverse'){await page.locator('#home-learned-shortcut').click();await page.locator('#start-review-button').click();}
      if(mode==='relearning'){await page.locator('#home-learned-shortcut').click();await page.locator('#learned-material-details').click();await page.locator('#materials-dialog input[data-material-id="m1"]').check();await page.locator('#relearn-selected-materials').click();}
      if(mode==='focus'){
        const id=await page.evaluate(()=>{let id;const state=PocketStorage.loadState();PocketStorage.updateState(state,next=>{PocketFocusReview.add(next,'m1',0,'1');const subject=next.materials[0].subject;id=PocketFocusReview.create(next,subject,1,PocketFocusReview.available(next,subject).map(question=>question.id));PocketFocusReview.start(next,id);});return id;});
        await page.reload({waitUntil:'networkidle'});await page.evaluate(id=>PocketFocusReviewUI.open({subject:PocketStorage.loadState().materials[0].subject,focusGroup:id}),id);
      }
      await page.locator('#pocket-home-button').click();await page.locator('#home-video-shortcut').click();
      const host=page.locator('#video-learning-entry');assert.equal(await host.locator('button').count(),3);
      const read=()=>page.evaluate(key=>JSON.parse(localStorage.getItem(key)),key),before=await read();
      await host.getByRole('button',{name:/^分阶段视频学习/}).click();
      const video=page.locator('#video-learning-view');
      if(mode==='empty'){
        assert.ok(await page.getByText(/当前没有可进入的有效 Group\/Run/).isVisible());assert.deepEqual(await read(),before);
      }else{
        assert.ok(await video.isVisible(),mode);assert.equal(await video.locator('h1').textContent(),'VIDEO｜分阶段视频学习');
        const stages=video.locator('details.video-stage');assert.equal(await stages.count(),3);assert.equal(await video.locator('.video-step').count(),7);
        assert.equal(await video.locator('.video-stage:visible').count(),2);
        assert.equal(await video.locator('.video-step:visible').count(),0);
        await stages.nth(1).locator(':scope > summary').click();await stages.nth(2).locator(':scope > summary').click();
        assert.deepEqual(await read(),before);
        assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
        await page.reload({waitUntil:'networkidle'});assert.ok(await video.isVisible());assert.equal(await video.locator('.video-stage:visible').count(),2);
        await video.locator(':scope > .practice-back').click();assert.ok(await host.isVisible());
        await host.getByRole('button',{name:'连续看课',exact:true}).click();await page.locator('#video-learning-system > .practice-back').click();
        const progress=JSON.stringify((await read()).videoStageProgress);
        await host.getByRole('button',{name:/^分阶段视频学习/}).click();assert.ok(await video.isVisible());assert.equal(JSON.stringify((await read()).videoStageProgress),progress);
        await video.locator(':scope > .output-task-complete').click();assert.equal(await video.isVisible(),false);
        const source=page.locator(mode==='relearning'?'#relearning':mode==='focus'?'#focus-review':'#pocket-main');
        assert.equal(await source.locator('.current-task > .output-entries > button:visible > strong').getByText('分阶段视频学习',{exact:true}).count(),0);
        const completed=await read();delete completed.videoStageProgress;assert.notDeepEqual(completed,before);
      }
      assert.deepEqual(errors,[]);await context.close();console.log(`PASS staged VIDEO ${width}px ${mode}: same task, stages 2/3, preserved state/reload/back and original completion; no visible task duplicate.`);
    }
  }finally{await browser?.close();await new Promise(resolve=>server.close(resolve));}
})().catch(error=>{console.error(error);process.exitCode=1;});
