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
  for(const [width,range] of [[320,'1-2'],[390,'3-7,10'],[768,'8'],[1440,'11-15']]){
   const context=await browser.newContext({viewport:{width,height:1024}});
   await context.route('**/*',route=>route.request().url().startsWith(origin+'/')?route.continue():route.abort());
   const initial=seed(2),material=initial.materials[0],group=material.groups[0];
   material.status='learning';group.questionRange=range;
   group.runs=[{mode:'new',startedAt:1,completedAt:null,videoSkipped:true,outputCompleted:false}];
   initial.currentSession={materialId:'m1',currentGroupIndex:0,currentRunIndex:0,currentStep:'output',mode:'new',schedulerState:{phase:'new',newGroupIndex:0,reviewGroupIndex:0}};
   await context.addInitScript(({key,initial})=>{if(!localStorage.getItem(key)){localStorage.setItem(key,JSON.stringify(initial));localStorage.setItem('pocket-development-v1:pocket-last-view-v1',JSON.stringify({page:'learning',outputPage:''}));}},{key,initial});
   const page=await context.newPage();await page.goto(origin,{waitUntil:'networkidle'});
   let before=await page.evaluate(key=>localStorage.getItem(key),key);
   await page.getByRole('button',{name:'视频',exact:true}).click();
   const video=page.locator('#video-learning-view .video-learning-content');
   assert.ok(await page.locator('#video-learning-view').isVisible());
   assert.equal(await page.locator('#pocket-main').isVisible(),false);
   assert.equal(await page.locator('#video-learning-view h1').textContent(),'VIDEO｜视频学习');
   assert.equal(await page.evaluate(()=>scrollY),0);
   assert.equal(await video.locator('.video-stage').count(),3);
   const stages=video.locator('details.video-stage');
   assert.equal(await stages.count(),3);assert.equal(await video.locator('.video-stage[open]').count(),0);
   for(let index=0;index<3;index++){
    await stages.nth(index).locator(':scope > summary').click();
    assert.equal(await video.locator('.video-stage[open]').count(),index+1,'stages expand independently');
    assert.equal(await stages.nth(index).locator(':scope > .task-guidance:visible').evaluateAll(nodes=>nodes.filter(node=>/^\d+、/.test(node.textContent)).length),[7,3,2][index]);
   }
   await stages.first().locator(':scope > summary').click();
   assert.equal(await video.locator('.video-stage[open]').count(),2,'clicking the same title closes only that stage');
   await stages.first().locator(':scope > summary').click();
   assert.equal(await video.locator('.task-title').textContent(),'看视频的三个阶段');
   assert.deepEqual(await stages.first().locator('.video-step-title').allTextContents(),['1、自己尝试','2、标注问题（课前）','3、看视频','4、边看边速记（一个字：快！）','5、关视频，主动回忆','6、对标补漏','7、循环复习']);
   const steps=stages.first().locator('.video-step');
   for(let index=0;index<7;index++)await steps.nth(index).locator(':scope > summary').click();
   assert.equal(await steps.locator('summary > .operational-status-control').count(),7);
   assert.equal(await steps.locator(':scope > .operational-status-menu').count(),0);
   for(const text of ['每次只参考答案的一步，然后遮住答案，从头尝试自己做。','将具体问题集中写进「课前问题笔记本」。','此时只标记 ✓ 或 ✗，不急着写答案。','我忘记了老师讲的什么？','我哪里理解错了，或者漏掉了关键步骤？','老师有哪些值得我以后模仿的思考方法？','根据再次重做或回忆的结果，补充必要的笔记。'])assert.ok(await stages.first().getByText(text,{exact:true}).isVisible());
   assert.deepEqual(await stages.first().locator('.video-stage-notes .task-guidance').allTextContents(),[`只看第${range}题对应的课程内容，不要超过当前组范围。`]);
   assert.deepEqual([...(await stages.nth(1).locator('.task-guidance').allTextContents()),...(await stages.nth(2).locator('.task-guidance').allTextContents())],[
    '二、能独立做对很多题：','1、倍速看，查漏补缺老师讲的不同做法。','2、有新的收获就行，重点标注自己没有想到的方法、思路或技巧。',
    '3、必要时暂停视频，尝试脱离视频独立复现老师的新方法。',
    '此时视频主要用于查漏补缺、学习不同做法、对比自己的思路与老师的思路、补充有价值的新经验。',
    '不要求像第一阶段一样，对所有已经熟练的内容反复执行完整四步闭环。已经熟练掌握的部分可以快速通过。',
    '三、已经进入大量刷题阶段：（选做）','1、快速回忆老师讲这个讲义网课的时候怎么讲的。','2、自己模仿老师去讲这堂课的思路、核对、反思。',
    '重点是脱离视频，快速复现已有知识和解题思路。不需要强制重新观看完整课程，不增加额外的必做步骤。']);
   assert.ok(!(await video.innerText()).includes('预习+看视频'));
   assert.ok(await stages.first().getByText('达标要求：',{exact:true}).isVisible());
   const link=video.locator('a[href="https://example.test/video/0"]');assert.equal(await link.count(),1);
   assert.equal(await link.getAttribute('target'),'_blank');
   assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
   const first=steps.first();await first.locator(':scope > summary').click();
   assert.equal(await first.getAttribute('open'),null);
   for(const label of ['! 卡住了','✓ 已完成','○ 未开始','◐ 进行中']){
    await first.locator('.operational-status-button').click();
    assert.equal(await first.getAttribute('open'),null,'status trigger must not expand details');
    await first.locator('.operational-status-menu').getByRole('button',{name:label,exact:true}).click();
    assert.equal(await first.getAttribute('open'),null,'status selection must not expand details');
    assert.equal(await first.locator('.operational-status-button').textContent(),label);
   }
   for(const row of await steps.locator(':scope > summary').all()){
    const bounds=await row.evaluate(node=>{const title=node.querySelector('.video-step-title').getBoundingClientRect(),state=node.querySelector('.operational-status-button').getBoundingClientRect(),row=node.getBoundingClientRect();return {titleRight:title.right,stateLeft:state.left,stateRight:state.right,rowRight:row.right};});
    assert.ok(bounds.titleRight<=bounds.stateLeft && bounds.stateRight<=bounds.rowRight);
   }
   const choose=async(index,label)=>{const step=steps.nth(index);await step.locator('.operational-status-button').click();await step.locator('.operational-status-menu').getByRole('button',{name:label,exact:true}).click();};
   for(let index=0;index<6;index++){
    await choose(index,'✓ 已完成');
    assert.ok((await steps.locator('.operational-status-button').allTextContents()).slice(0,index+1).every(value=>value==='✓ 已完成'));
   }
   for(const label of ['◐ 进行中','! 卡住了']){await choose(6,label);assert.ok((await steps.locator('.operational-status-button').allTextContents()).slice(0,6).every(value=>value==='✓ 已完成'));}
   await choose(6,'✓ 已完成');
   assert.ok((await steps.locator('.operational-status-button').allTextContents()).every(value=>value==='○ 未开始'));
   assert.equal(await video.locator('.video-cycle-count').textContent(),'已循环 1 次');
   await steps.nth(6).locator('.operational-status-menu > button').nth(2).evaluate(button=>{button.click();button.click();});
   assert.equal(await video.locator('.video-cycle-count').textContent(),'已循环 1 次');
   await choose(6,'✓ 已完成');assert.equal(await video.locator('.video-cycle-count').textContent(),'已循环 2 次');
   assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
   const saved=await page.evaluate(key=>localStorage.getItem(key),key),cleaned=JSON.parse(saved);delete cleaned.videoStageProgress;
   assert.equal(JSON.stringify(cleaned),JSON.stringify(JSON.parse(before)),'only VIDEO guidance state changes');before=saved;
   await page.reload({waitUntil:'networkidle'});
   assert.ok(await page.locator('#video-learning-view').isVisible());
   assert.equal(await video.locator('.video-stage[open]').count(),0,'reload starts with all stages collapsed');
   assert.equal(await page.locator('#pocket-main').isVisible(),false);
   assert.equal(await page.evaluate(key=>localStorage.getItem(key),key),before);
   await video.locator('.video-stage').first().locator(':scope > summary').click();
   assert.equal(await video.locator('.video-step').first().locator('.operational-status-button').textContent(),'○ 未开始');
   assert.equal(await video.locator('.video-cycle-count').textContent(),'已循环 2 次');
   const back=page.locator('#video-learning-view > .practice-back');
   assert.ok(await back.isVisible(),await page.locator('#learning-content button').allTextContents());
   await back.click();
   assert.ok(await page.locator('#pocket-main').isVisible());
   assert.equal(await page.locator('#video-learning-view').isVisible(),false);
   await page.getByRole('button',{name:'输出',exact:true}).click();
   assert.ok(await page.locator('#learning-content .output-entry strong').filter({hasText:'做题'}).isVisible());
   assert.equal(await page.evaluate(key=>localStorage.getItem(key),key),before);
   await page.locator('#learning-content .current-task > button').filter({hasText:'输出达标 → 下一步'}).click();
   assert.equal(await page.evaluate(key=>JSON.parse(localStorage.getItem(key)).currentSession.currentStep,key),'groupComplete');
   await context.close();
  }
  console.log('PASS localhost independent VIDEO: exact text, three cards, top/back/reload, dynamic ranges, original links/OUTPUT progression, 320/390/768/1440px and unchanged learning data.');
 }finally{await browser?.close();await new Promise(resolve=>server.close(resolve));}
})().catch(error=>{console.error(error);process.exitCode=1;});
