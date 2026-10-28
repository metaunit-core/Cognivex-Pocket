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
const clean=state=>{const copy=JSON.parse(JSON.stringify(state));delete copy.relearning;copy.materials.forEach(m=>{delete m.relearningCount;delete m.relearningHistory;});return JSON.stringify(copy);};
(async()=>{
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));let browser;const origin=`http://127.0.0.1:${server.address().port}`;
 try{
  browser=await playwright.chromium.launch({executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',headless:true});
  for(const width of [390,768,1440]){
   const context=await browser.newContext({viewport:{width,height:1024}});
   await context.route('**/*',route=>route.request().url().startsWith(origin+'/')?route.continue():route.abort());
   const initial=seed(3);initial.materials[0].title='同名资料';initial.materials[1].title='同名资料';
   initial.dailyReverseReview={version:1,saveOrder:['m1','m2','m3'],history:[]};
   initial.currentSession={materialId:'m3',currentGroupIndex:0,currentRunIndex:0,currentStep:'output',mode:'new',schedulerState:{phase:'new',newGroupIndex:0,reviewGroupIndex:0}};
   await context.addInitScript(({key,initial})=>{
    if(!localStorage.getItem(key)){localStorage.setItem(key,JSON.stringify(initial));localStorage.setItem('pocket-development-v1:pocket-last-view-v1',JSON.stringify({page:'home'}));}
    const write=Storage.prototype.setItem;
    Storage.prototype.setItem=function(k,v){if(window.failRelearningSave&&k===key)throw Error('mock quota failure');return write.call(this,k,v);};
   },{key,initial});
   const page=await context.newPage();await page.goto(origin,{waitUntil:'networkidle'});
   const read=()=>page.evaluate(key=>JSON.parse(localStorage.getItem(key)),key);
   const original=clean(await read());
   const openList=()=>page.locator('#learned-material-details').click();
   const select=id=>page.locator(`#materials-dialog input[data-material-id="${id}"]`).check();
   await openList();
   assert.ok(await page.locator('#relearn-selected-materials').isDisabled());
   assert.deepEqual(await page.locator('.material-relearning-count').allTextContents(),Array(3).fill('已选做学习 0 次'));
   await select('m2');await select('m1');
   const buttons=await page.locator('.materials-dialog-actions > button').evaluateAll(nodes=>nodes.map(n=>{const r=n.getBoundingClientRect();return {left:r.left,right:r.right,top:r.top};}));
   assert.ok(buttons[0].right<buttons[1].left);assert.equal(buttons[0].top,buttons[1].top);
   if(width===390||width===768)await page.screenshot({path:path.join(__dirname,'artifacts',`relearning-modal-${width}.png`)});
   await page.locator('#delete-selected-materials').click();
   assert.ok(!await page.locator('#relearn-selected-materials').isVisible());
   await page.locator('#materials-delete-confirm').getByRole('button',{name:'取消',exact:true}).click();
   assert.equal(clean(await read()),original);assert.ok(await page.locator('#relearn-selected-materials').isVisible());
   await page.evaluate(()=>{window.failRelearningSave=true;});await page.locator('#relearn-selected-materials').click();
   assert.match(await page.locator('#materials-dialog-status').textContent(),/未启动/);assert.ok(!(await read()).relearning);
   await page.evaluate(()=>{window.failRelearningSave=false;});await page.locator('#relearn-selected-materials').click();
   assert.ok(await page.locator('#relearning').isVisible());
   assert.deepEqual((await read()).relearning.queue.map(q=>q.materialId),['m1','m2']);
   const batchId=(await read()).relearning.id;
   await page.evaluate(()=>document.getElementById('relearn-selected-materials').click());assert.equal((await read()).relearning.id,batchId);
   await page.locator('#relearning #relearning-group-latest-accuracy').fill('1/2');
   await page.locator('#relearning #relearning-group-latest-duration').fill('8');
   await page.locator('#relearning').getByRole('button',{name:'视频',exact:true}).click();
   assert.ok(await page.locator('#relearning .video-link-area a').isVisible());
   assert.match(await page.locator('#relearning').innerText(),/看视频的三个阶段/);
   await page.locator('#relearning .current-task > .practice-back').click();
   await page.locator('#relearning').getByRole('button',{name:'输出',exact:true}).click();
   await page.locator('#relearning .output-entry').filter({has:page.locator('strong',{hasText:'教学法'})}).click();
   await page.reload({waitUntil:'networkidle'});assert.ok(await page.locator('.output-teaching-text').isVisible());
   await page.locator('#output-sop > .practice-back').click();assert.ok(await page.locator('#relearning').isVisible());
   await page.locator('#pocket-home-button').click();await openList();await select('m3');
   await page.locator('#relearn-selected-materials').click();assert.equal((await read()).relearning.id,batchId,'selection resumes existing batch');
   let reloaded=false,guard=0;const reverse=[];
   while((await read()).relearning.completedAt===null){
    assert.ok(++guard<35);
    const state=await read(),batch=state.relearning,engine=batch.engine;
    const session=batch.phase==='reverse'?engine.materialReviewSession:engine.currentSession;
    assert.ok(state.materials.every(m=>(m.relearningCount||0)===0),'no early count');
    if(batch.phase==='reverse'&&!reverse.some(r=>r.id===session.roundId))reverse.push({id:session.roundId,ids:session.materialIds});
    if(batch.phase==='reverse'&&!reloaded){const snapshot=JSON.stringify(batch);await page.reload({waitUntil:'networkidle'});assert.equal(JSON.stringify((await read()).relearning),snapshot);assert.ok(await page.locator('#relearning').isVisible());reloaded=true;}
    if(width===768&&guard===1)await page.screenshot({path:path.join(__dirname,'artifacts','relearning-active-768.png'),fullPage:true});
    await page.locator('#relearning .current-task > button').filter({hasText:session.currentStep==='groupComplete'?'继续':'输出达标 → 下一步'}).click();
   }
   assert.deepEqual(reverse.map(r=>r.ids),[['m1'],['m2','m1']]);
   const finished=await read();assert.equal(finished.materials[0].relearningCount,1);assert.equal(finished.materials[1].relearningCount,1);assert.ok(!finished.materials[2].relearningCount);
   assert.equal(clean(finished),original);assert.match(await page.locator('#relearning').innerText(),/本次重学任务已完成/);
   await page.reload({waitUntil:'networkidle'});assert.equal((await read()).materials[0].relearningCount,1);
   await page.locator('#pocket-home-button').click();await openList();
   assert.deepEqual(await page.locator('.material-relearning-count').allTextContents(),['已选做学习 1 次','已选做学习 1 次','已选做学习 0 次']);
   assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
   await context.close();
  }
  console.log('PASS localhost relearning UI: shared selection/same-name IDs, footer/counts, delete cancel, save failure/double click, real VIDEO/OUTPUT + teaching reload, original-task isolation, resume frozen reverse, whole-batch counts, 390/768/1440px.');
 }finally{await browser?.close();await new Promise(resolve=>server.close(resolve));}
})().catch(error=>{console.error(error);process.exitCode=1;});
