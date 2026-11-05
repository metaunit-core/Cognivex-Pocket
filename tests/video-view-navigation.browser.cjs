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
  const origin=`http://127.0.0.1:${server.address().port}`;
  try{
    browser=await playwright.chromium.launch({executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',headless:true});
    for(const width of [320,390,1440])for(const mode of ['normal','daily','reverse','relearning','focus']){
      const context=await browser.newContext({viewport:{width,height:900}});
      await context.route('**/*',route=>route.request().url().startsWith(origin+'/')?route.continue():route.abort());
      const initial=seed(2);require('./helpers/original-learning-fixture.cjs')(initial,Date.now());
      if(mode==='normal'){
        const group=initial.materials[0].groups[0];
        group.runs.push({mode:'review',videoSkipped:true,videoCompleted:false,outputCompleted:false,startedAt:Date.now(),completedAt:null});
        initial.currentSession={materialId:'m1',currentGroupIndex:0,currentRunIndex:group.runs.length-1,currentStep:'output',mode:'review',schedulerState:{phase:'review',newGroupIndex:0,reviewGroupIndex:0}};
      }
      await context.addInitScript(({key,initial})=>{
        if(!localStorage.getItem(key)){localStorage.setItem(key,JSON.stringify(initial));localStorage.setItem('pocket-development-v1:pocket-last-view-v1',JSON.stringify({page:initial.currentSession?'learning':'home'}));}
        const set=Storage.prototype.setItem;
        Storage.prototype.setItem=function(name,value){if(window.failVideoSave&&name===key)throw Error('isolated save failure');return set.call(this,name,value);};
      },{key,initial});
      const page=await context.newPage();await page.goto(origin,{waitUntil:'networkidle'});
      if(mode==='daily')await page.locator('#daily-reverse-review-entry').click();
      if(mode==='reverse')await page.locator('#start-review-button').click();
      if(mode==='relearning'){
        await page.locator('#learned-material-details').click();await page.locator('#materials-dialog input[data-material-id="m1"]').check();await page.locator('#relearn-selected-materials').click();
      }
      if(mode==='focus'){
        const id=await page.evaluate(()=>{
          const state=PocketStorage.loadState();let id;
          PocketStorage.updateState(state,next=>{PocketFocusReview.add(next,'m1',0,'1');id=PocketFocusReview.create(next,'数学',1,PocketFocusReview.available(next,'数学').map(question=>question.id));PocketFocusReview.start(next,id);});
          return id;
        });
        await page.reload({waitUntil:'networkidle'});await page.evaluate(id=>PocketFocusReviewUI.open({subject:'数学',focusGroup:id}),id);
      }
      const source=page.locator(mode==='relearning'?'#relearning':mode==='focus'?'#focus-review':'#pocket-main');
      const read=()=>page.evaluate(key=>localStorage.getItem(key),key),before=await read();
      const entries=source.locator('.current-task > .output-entries > button');
      assert.deepEqual(await entries.locator(':scope > strong').allTextContents(),['视频模仿','训练内化','能力检测']);
      assert.deepEqual(await entries.locator(':scope > span').allTextContents(),['初次接触陌生题目，边做边模仿，对标视频学习高手思路。','每次复习深化操作，自由选择训练方式，把学过的方法练成自己的能力。','单题 → 组题 → 章节 → 回忆补漏，训练考场快速选路、准确解题的能力。']);
      const typography=await entries.first().evaluate(node=>{const title=getComputedStyle(node.querySelector('strong')),description=getComputedStyle(node.querySelector('span'));return {titleColor:title.color,descriptionColor:description.color,titleSize:parseFloat(title.fontSize),descriptionSize:parseFloat(description.fontSize)};});
      assert.ok(typography.descriptionSize<typography.titleSize);assert.notEqual(typography.titleColor,typography.descriptionColor);
      const entrySizes=await entries.evaluateAll(nodes=>nodes.map(node=>{const bounds=node.getBoundingClientRect();return [bounds.width,bounds.height,getComputedStyle(node).borderRadius];}));
      assert.deepEqual(entrySizes[0],entrySizes[2]);
      await source.getByRole('button',{name:/^能力检测/}).click();
      const cardsPage=page.locator('#summary-cards');
      assert.ok(await cardsPage.isVisible());assert.equal(await source.isVisible(),false);
      assert.equal(await cardsPage.locator('h1').textContent(),'能力检测');
      assert.equal(await cardsPage.locator('details').count(),5);assert.equal(await cardsPage.locator('details[open]').count(),0);
      assert.equal(await cardsPage.locator('input,textarea,select').count(),0);assert.equal(await cardsPage.locator('button').count(),1);
      const cards=cardsPage.locator('details');
      for(let index=0;index<5;index++)await cards.nth(index).locator(':scope > summary').click();
      assert.equal(await cardsPage.locator('details[open]').count(),5);
      await cards.first().locator(':scope > summary').click();assert.equal(await cardsPage.locator('details[open]').count(),4);
      await cards.first().locator(':scope > summary').click();assert.equal(await cardsPage.locator('details[open]').count(),5);
      assert.equal(await cardsPage.locator('.summary-question-body h2').count(),15);
      assert.deepEqual(await cardsPage.locator('.summary-question-body ol').evaluateAll(nodes=>nodes.map(node=>node.children.length)),[4,4,5,5,5]);
      assert.deepEqual(await cardsPage.locator('.summary-question-body ul').evaluateAll(nodes=>nodes.map(node=>node.children.length)),[4,4,4,4,4]);
      assert.ok(await cardsPage.getByText('五个层次的核心区别',{exact:true}).isVisible());
      assert.equal(await cardsPage.locator('table tbody tr').count(),5);
      assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
      assert.equal(await read(),before);
      await page.reload({waitUntil:'networkidle'});assert.ok(await cardsPage.isVisible(),mode+' summary reload');assert.equal(await read(),before);
      await cardsPage.getByRole('button',{name:'← 返回当前任务',exact:true}).click();
      assert.ok(await source.isVisible());assert.equal(await cardsPage.isVisible(),false);assert.equal(await read(),before);
      await source.getByRole('button',{name:/^视频模仿/}).scrollIntoViewIfNeeded();
      const sourceScroll=await page.evaluate(()=>scrollY);
      await source.getByRole('button',{name:/^视频模仿/}).click();
      const video=page.locator('#video-learning-view');
      assert.ok(await video.isVisible(),mode);assert.equal(await source.isVisible(),false,mode);
      assert.equal(await page.evaluate(()=>scrollY),0);
      assert.equal(await video.locator('.video-stage').count(),3);
      assert.deepEqual(await video.locator('.video-stage').evaluateAll(nodes=>nodes.map(node=>[...node.children].filter(child=>/^\d+、/.test(child.textContent)).length)),[7,3,2]);
      assert.ok(await video.locator('a[target="_blank"]').count());
      const link=video.locator('a[target="_blank"]').first(),href=await link.getAttribute('href');
      await link.evaluate(node=>{for(let parent=node.parentElement;parent;parent=parent.parentElement)if(parent.tagName==='DETAILS')parent.open=true;});
      assert.match(href,/^https:\/\/example\.test\/video\/[01]$/);await link.click({trial:true});
      assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
      assert.equal(await read(),before);
      await page.reload({waitUntil:'networkidle'});
      assert.ok(await video.isVisible(),mode+' reload');assert.equal(await source.isVisible(),false);
      assert.equal(await read(),before);
      await video.locator(':scope > .practice-back').click();
      assert.ok(await source.isVisible());assert.equal(await video.isVisible(),false);
      assert.equal(await page.evaluate(()=>scrollY),sourceScroll,'return restores original source scroll after reload');
      await source.getByRole('button',{name:/^训练内化/}).click();
      assert.deepEqual(await source.locator('.output-entry:visible > strong').allTextContents(),['教学法','做题','知识点']);
      await source.locator('.current-task > .practice-back').click();
      await source.getByRole('button',{name:/^视频模仿/}).click();await page.locator('#pocket-back-button').click();
      assert.ok(await source.isVisible());assert.equal(await video.isVisible(),false);
      await source.getByRole('button',{name:/^视频模仿/}).click();
      if(mode==='normal'){
        await page.evaluate(()=>{window.failVideoSave=true;});
        await video.getByRole('button',{name:'输出达标 → 下一步',exact:true}).click();
        assert.equal(await read(),before,'failed completion preserves original checkpoint');
        await page.evaluate(()=>{window.failVideoSave=false;});
        await source.getByRole('button',{name:/^视频模仿/}).click();
      }
      await video.getByRole('button',{name:'输出达标 → 下一步',exact:true}).click();
      assert.ok(await source.isVisible());assert.equal(await video.isVisible(),false);
      const after=JSON.parse(await read());assert.notEqual(JSON.stringify(after),JSON.stringify(JSON.parse(before)),mode+' original completion executes');
      if(mode==='daily')assert.equal(after.dailyReverseReview.round.taskIndex,1);
      if(mode==='reverse')assert.equal(after.materialReviewSession.currentQueueIndex,1);
      if(mode==='relearning')assert.equal(after.materials[0].relearningCount,1);
      if(mode==='focus')assert.ok(after.focusReview.groups.some(group=>group.runs.some(run=>run.completedAt!==null)));
      await context.close();
    }
    console.log('PASS localhost VIDEO in normal/daily/reverse/relearning/focus: mobile/desktop, 7/3/2 cards, links, isolated source, reload/top/back/global-back, unchanged reads, failed save and original completion.');
  }finally{await browser?.close();await new Promise(resolve=>server.close(resolve));}
})().catch(error=>{console.error(error);process.exitCode=1;});
