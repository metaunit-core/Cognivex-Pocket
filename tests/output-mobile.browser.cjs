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
    for(const width of [320,390,1440])for(const mode of ['new','normal','daily','reverse','relearning','focus']){
      const context=await browser.newContext({viewport:{width,height:900}});
      await context.route('**/*',route=>route.request().url().startsWith(origin+'/')?route.continue():route.abort());
      const initial=seed(2);require('./helpers/original-learning-fixture.cjs')(initial,Date.now());
      if(mode==='new'){
        initial.materials[0].status='learning';initial.materials[0].groups[0].runs=[{mode:'new',videoCompleted:true,outputCompleted:false,startedAt:Date.now(),completedAt:null}];
        initial.currentSession={materialId:'m1',currentGroupIndex:0,currentRunIndex:0,currentStep:'output',mode:'new',schedulerState:{phase:'new',newGroupIndex:0,reviewGroupIndex:0}};
      }
      if(mode==='normal'){
        const group=initial.materials[0].groups[0];group.runs.push({mode:'review',videoSkipped:true,outputCompleted:false,startedAt:Date.now(),completedAt:null});
        initial.currentSession={materialId:'m1',currentGroupIndex:0,currentRunIndex:group.runs.length-1,currentStep:'output',mode:'review',schedulerState:{phase:'review',newGroupIndex:0,reviewGroupIndex:0}};
      }
      await context.addInitScript(({key,initial})=>{if(!localStorage.getItem(key)){localStorage.setItem(key,JSON.stringify(initial));localStorage.setItem('pocket-development-v1:pocket-last-view-v1',JSON.stringify({page:initial.currentSession?'learning':'home'}));}},{key,initial});
      const page=await context.newPage(),errors=[];page.on('pageerror',error=>errors.push(error.message));await page.goto(origin,{waitUntil:'networkidle'});
      assert.equal(await page.locator('#environment-banner').textContent(),'测试环境｜不会连接 Firebase');
      assert.ok(await page.locator('#environment-banner').isVisible());
      if(mode==='daily'){await page.locator('#home-review-shortcut').click();await page.locator('#daily-reverse-review-entry').click();}
      if(mode==='reverse'){await page.locator('#home-learned-shortcut').click();await page.locator('#start-review-button').click();}
      if(mode==='relearning'){await page.locator('#home-learned-shortcut').click();await page.locator('#learned-material-details').click();await page.locator('#materials-dialog input[data-material-id="m1"]').check();await page.locator('#relearn-selected-materials').click();}
      if(mode==='focus'){
        const id=await page.evaluate(()=>{const state=PocketStorage.loadState();let id;PocketStorage.updateState(state,next=>{PocketFocusReview.add(next,'m1',0,'1');const subject=next.materials[0].subject;id=PocketFocusReview.create(next,subject,1,PocketFocusReview.available(next,subject).map(question=>question.id));PocketFocusReview.start(next,id);});return id;});
        await page.reload({waitUntil:'networkidle'});await page.evaluate(id=>PocketFocusReviewUI.open({subject:PocketStorage.loadState().materials[0].subject,focusGroup:id}),id);
      }
      const source=page.locator(mode==='relearning'?'#relearning':mode==='focus'?'#focus-review':'#pocket-main');
      const read=()=>page.evaluate(key=>localStorage.getItem(key),key),before=await read();
      const entries=source.locator('.current-task > .output-entries > button:visible');
      assert.deepEqual(await entries.locator(':scope > strong').allTextContents(),['逐题突破','训练内化','构建解题体系','自主刷题与实战']);
      assert.equal(await entries.first().locator('span').textContent(),'遇到一个有视频讲解的题目的学习（此操作仅供辅助参考，主要操作看下面的）');
      const taskView=await page.evaluate(()=>PocketNavigation.current());
      await page.evaluate(()=>{
        window.originalReviewUI=PocketReviewUI;
        window.PocketReviewUI={...PocketReviewUI,firstStageSteps:()=>{
          const steps=originalReviewUI.firstStageSteps();steps[0].querySelector('.video-step-body p').textContent='共享内容同步测试';return steps;
        }};
      });
      await entries.first().click();
      const questionView=page.locator('#video-learning-system');
      assert.equal(await questionView.locator('h1').textContent(),'逐题突破');
      assert.ok(await questionView.getByText('共享内容同步测试',{exact:true}).isVisible());
      const auxiliaryContent=await questionView.locator('.video-learning-description').innerHTML();
      await questionView.locator('.practice-back').click();assert.ok(await source.isVisible());assert.equal(await read(),before);
      await page.locator('#pocket-home-button').click();
      if(!(await page.locator('#video-learning-entry').isVisible()))await page.locator('#home-video-shortcut').click();
      await page.locator('#video-learning-entry').getByRole('button',{name:'逐题突破',exact:true}).click();
      assert.equal(await questionView.locator('.video-learning-description').innerHTML(),auxiliaryContent);
      assert.ok(await questionView.getByText('共享内容同步测试',{exact:true}).isVisible());
      await questionView.locator('.practice-back').click();
      await page.evaluate(view=>{window.PocketReviewUI=window.originalReviewUI;delete window.originalReviewUI;PocketNavigation.navigate(view);},taskView);
      assert.ok(await source.isVisible());assert.equal(await read(),before);
      assert.equal(await entries.evaluateAll(nodes=>nodes.every(node=>node.scrollWidth<=node.clientWidth&&node.getBoundingClientRect().height>=44)),true);
      assert.ok(await source.locator('.output-task-complete').isVisible());
      if(['new','normal','daily','reverse'].includes(mode)){
        assert.ok(await source.locator('#group-latest-accuracy').isVisible());
        assert.ok(await source.locator('#group-latest-duration').isVisible());
        assert.equal(await source.locator('#group-key-questions-panel').getAttribute('open'),null);
      }
      await page.evaluate(()=>PocketLearning.openStagedVideo());assert.ok(await page.locator('#video-learning-view').isVisible());
      await page.locator('#video-learning-view > .practice-back').click();assert.ok(await source.isVisible());assert.equal(await read(),before);
      for(const [index,target] of [[2,'#summary-cards'],[3,'#independent-practice']]){
        await entries.nth(index).click();const guide=page.locator(target);assert.ok(await guide.isVisible());
        assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
        if(index===3){await page.reload({waitUntil:'networkidle'});assert.ok(await guide.isVisible());}
        await guide.locator('.practice-back').first().click();assert.ok(await source.isVisible());assert.equal(await read(),before);
      }
      await entries.nth(1).click();assert.ok(await source.getByText('请选择本次输出内容',{exact:true}).isVisible());
      await source.locator('.current-task > .practice-back:visible').click();assert.equal(await entries.count(),4);
      assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));assert.equal(await read(),before);assert.deepEqual(errors,[]);
      if(mode==='normal'&&process.env.POCKET_OUTPUT_SCREENSHOTS){
        fs.mkdirSync(process.env.POCKET_OUTPUT_SCREENSHOTS,{recursive:true});
        await page.screenshot({path:path.join(process.env.POCKET_OUTPUT_SCREENSHOTS,`output-${width}.png`),fullPage:true});
      }
      if(mode==='new'||mode==='normal'){
        await source.locator('#group-latest-accuracy').fill('8/10');await source.locator('#group-latest-duration').fill('12');
        const saved=JSON.parse(await read());assert.equal(saved.currentSession.currentStep,'output');
        await source.locator('.output-task-complete').click();
        const advanced=JSON.parse(await read());assert.notEqual(advanced.currentSession?.currentStep,'output');
        assert.equal(advanced.materials[0].groups[0].runs.at(-1).outputCompleted,true);
      }
      await context.close();console.log(`PASS OUTPUT ${width}px ${mode}: entries, metrics, navigation, no overflow/state writes.`);
    }
  }finally{await browser?.close();await new Promise(resolve=>server.close(resolve));}
})().catch(error=>{console.error(error);process.exitCode=1;});
