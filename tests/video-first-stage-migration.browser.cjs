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
      initial.videoStageProgress={version:1,entries:[{key:JSON.stringify(['m1',group.id]),states:['done','doing','idle','stuck','idle','idle','idle'],cycles:4,revision:9}]};
      await context.addInitScript(({key,initial})=>{if(!localStorage.getItem(key)){localStorage.setItem(key,JSON.stringify(initial));localStorage.setItem('pocket-development-v1:pocket-last-view-v1',JSON.stringify({page:'home'}));}},{key,initial});
      const page=await context.newPage(),errors=[];page.on('pageerror',error=>errors.push(error.message));await page.goto(origin,{waitUntil:'networkidle'});
      assert.equal(await page.locator('#environment-banner').textContent(),'测试环境｜不会连接 Firebase');
      const read=()=>page.evaluate(key=>JSON.parse(localStorage.getItem(key)),key),before=await read();
      const expected=await page.evaluate(()=>PocketReviewUI.firstStageSteps().map(node=>({title:node.querySelector('.video-step-title').textContent,paragraphs:Array.from(node.querySelectorAll('.video-step-body p')).map(paragraph=>paragraph.textContent)})));
      assert.equal(expected.length,7);
      await page.locator('#home-video-shortcut').click();await page.locator('#video-learning-entry').getByRole('button',{name:'逐题突破',exact:true}).click();
      const view=page.locator('#video-learning-system');
      for(let index=0;index<7;index++){
        assert.equal(await view.locator('.video-learning-operation h2').textContent(),expected[index].title);
        assert.deepEqual(await view.locator('.video-learning-description p').allTextContents(),expected[index].paragraphs);
        if(index===1 || index===3 || index===4 || index===5){
          const folds=view.locator('.video-learning-description .video-instruction-fold'),count=index===4?2:index===5?3:4;
          assert.equal(await folds.count(),count);assert.equal(await view.locator('.video-instruction-fold[open]').count(),0);
          const savedBeforeFolding=await read();
          if(index===4)assert.deepEqual(await folds.locator(':scope > summary').allTextContents(),['1、处理课前问题','2、回忆+空白写解析笔记']);
          if(index===3)assert.deepEqual(await folds.locator(':scope > summary').allTextContents(),['优先检查课前问题','（1）百度网盘：标记位置','（2）OneNote：录音速记收获','（3）答案讲义：符号速记']);
          if(index===5)assert.deepEqual(await folds.locator(':scope > summary').allTextContents(),['（1）对标老师','（2）标注进步','（3）重做或者重新回忆，写笔记']);
          for(let fold=0;fold<count;fold++)await folds.nth(fold).locator(':scope > summary').click();
          assert.equal(await view.locator('.video-instruction-fold[open]').count(),count);
          await folds.first().locator(':scope > summary').click();assert.equal(await view.locator('.video-instruction-fold[open]').count(),count-1);
          await folds.first().locator(':scope > summary').click();assert.equal(await view.locator('.video-instruction-fold[open]').count(),count);
          assert.deepEqual(await read(),savedBeforeFolding);
          assert.deepEqual(await view.locator('.video-learning-description p').allTextContents(),expected[index].paragraphs);
        }
        assert.equal(await view.locator('.video-learning-preview h2').textContent(),index===6?'重新循环':expected[index+1].title);
        assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
        if(index<6)await view.getByRole('button',{name:'进入下一步',exact:true}).click();
      }
      await view.getByLabel('当前题号',{exact:true}).fill('12');await view.getByLabel('当前题号',{exact:true}).press('Tab');
      await page.reload({waitUntil:'networkidle'});assert.ok(await view.getByText('当前步骤 7/7',{exact:true}).isVisible());assert.equal(await view.getByLabel('当前题号',{exact:true}).inputValue(),'12');
      await view.getByRole('button',{name:'上一步',exact:true}).click();await view.getByRole('button',{name:'进入下一步',exact:true}).click();await view.getByRole('button',{name:'进入下一步',exact:true}).click();
      assert.ok(await view.getByText('当前步骤 1/7',{exact:true}).isVisible());
      assert.deepEqual((await read()).videoStageProgress,before.videoStageProgress);
      const preserved=await read();delete preserved.videoLearning;assert.deepEqual(preserved,before);
      await view.locator(':scope > .practice-back').click();if(!await page.locator('#video-learning-entry').isVisible())await page.locator('#home-video-shortcut').click();
      await page.locator('#video-learning-entry').getByRole('button',{name:/^分阶段视频学习/}).click();
      const video=page.locator('#video-learning-view');assert.ok(await video.isVisible());assert.equal(await video.locator('.video-stage:visible').count(),2);assert.equal(await video.locator('.video-step:visible').count(),0);
      const expectedFurther=await page.evaluate(()=>{const container=document.createElement('div');PocketReviewUI.videoFurtherStages(container);return Array.from(container.children).map(node=>node.textContent);});
      const visible=video.locator('.video-stage:visible');const actual=[];
      for(let index=0;index<2;index++){
        actual.push(await visible.nth(index).locator(':scope > summary').textContent());await visible.nth(index).locator(':scope > summary').click();
        actual.push(...await visible.nth(index).locator('.task-guidance:not(summary)').allTextContents());
      }
      assert.deepEqual(actual,expectedFurther);
      assert.deepEqual((await read()).videoStageProgress,before.videoStageProgress);
      await video.locator(':scope > .output-task-complete').click();assert.equal((await read()).materials[0].groups[0].runs.at(-1).outputCompleted,true);
      assert.deepEqual(errors,[]);await context.close();console.log(`PASS first-stage migration ${width}px: exact seven-step paragraphs, navigation/question/reload, legacy cycles preserved, only unchanged stages 2/3 visible, original OUTPUT.`);
    }
  }finally{await browser?.close();await new Promise(resolve=>server.close(resolve));}
})().catch(error=>{console.error(error);process.exitCode=1;});
