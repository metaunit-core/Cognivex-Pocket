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
   const before=await page.evaluate(key=>localStorage.getItem(key),key);
   await page.getByRole('button',{name:'视频',exact:true}).click();
   const video=page.locator('#video-learning-view .video-learning-content');
   assert.ok(await page.locator('#video-learning-view').isVisible());
   assert.equal(await page.locator('#pocket-main').isVisible(),false);
   assert.equal(await page.locator('#video-learning-view h1').textContent(),'VIDEO｜视频学习');
   assert.equal(await page.evaluate(()=>scrollY),0);
   assert.equal(await video.locator('.video-stage').count(),3);
   const stages=video.locator('details.video-stage');
   assert.equal(await stages.count(),3);assert.equal(await video.locator('.video-stage[open]').count(),0);
   if(width===390||width===768)await page.screenshot({path:path.join(__dirname,'artifacts',`video-guidance-${width}.png`),fullPage:true});
   for(let index=0;index<3;index++){
    await stages.nth(index).locator('summary').click();
    assert.equal(await video.locator('.video-stage[open]').count(),index+1,'stages expand independently');
    assert.equal(await stages.nth(index).locator(':scope > .task-guidance:visible').evaluateAll(nodes=>nodes.filter(node=>/^\d+、/.test(node.textContent)).length),[8,3,2][index]);
   }
   await stages.first().locator('summary').click();
   assert.equal(await video.locator('.video-stage[open]').count(),2,'clicking the same title closes only that stage');
   await stages.first().locator('summary').click();
   assert.equal(await video.locator('.task-title').textContent(),'看视频的三个阶段');
   assert.deepEqual(await stages.first().locator('.video-step').evaluateAll(nodes=>nodes.map(node=>[node.querySelector('.video-step-title').textContent,...Array.from(node.querySelectorAll('p'),paragraph=>paragraph.textContent)])),[
    ['1、自已尝试','自己尝试理解和重做讲义内容。','自己做，想不出→看题目答案→看一步，自己从头做→争取自己看答案模仿、不听网课就能独立做出'],
    ['2、标注问题','看不懂答案和卡住的地方，答案讲义标注问题（不深入），最前面白板记录题号，进入听课重点听'],
    ['3、小段观看','开始看本组对应的视频内容，每看完一个完整的小知识块或例题就暂停，不必等整节课结束。'],
    ['4、边看边速记','看视频的过程中，对着老师的答案讲义做笔记标注，要速记，不要专门暂停下来做笔记。'],
    ['5、关掉视频，立即输出','知识点：','看着讲义的知识点笔记，自己回忆并录音：「刚才老师到底讲了什么？为什么这么做？」哪怕只能回忆一点点，也先自己想。','题目：','遮住老师的答案，自己马上独立重做题目，做到哪里算哪里。'],
    ['6、打开视频，对标补漏','对标老师的讲解，找出自己漏洞在哪里，以及自己觉得有收获的地方。','达标要求：','能重做出来或者模糊说出来是什么即可，不用完全深入思考到没有疑问。'],
    ['7、一句话心得','最后用一句话总结可以迁移到以后做题的经验。'],
    ['8、进入 OUTPUT','完成本组视频学习后，点击进入下一阶段的 OUTPUT。']]);
   assert.deepEqual(await stages.first().locator('.video-stage-notes .task-guidance').allTextContents(),['范围限制：','只看当前组对应的课程内容，不要超过当前组范围。',`只看第${range}题对应的课程内容，不要超过当前组范围。`]);
   assert.deepEqual([...(await stages.nth(1).locator('.task-guidance').allTextContents()),...(await stages.nth(2).locator('.task-guidance').allTextContents())],[
    '二、能独立做对很多题：','1、倍速看，查漏补缺老师讲的不同做法。','2、有新的收获就行，重点标注自己没有想到的方法、思路或技巧。',
    '3、必要时暂停视频，尝试脱离视频独立复现老师的新方法。',
    '此时视频主要用于查漏补缺、学习不同做法、对比自己的思路与老师的思路、补充有价值的新经验。',
    '不要求像第一阶段一样，对所有已经熟练的内容反复执行完整四步闭环。已经熟练掌握的部分可以快速通过。',
    '三、已经进入大量刷题阶段：（选做）','1、快速回忆老师讲这个讲义网课的时候怎么讲的。','2、自己模仿老师去讲这堂课的思路、核对、反思。',
    '重点是脱离视频，快速复现已有知识和解题思路。不需要强制重新观看完整课程，不增加额外的必做步骤。']);
   assert.ok(!(await video.innerText()).includes('预习+看视频'));
   assert.ok(await stages.first().getByText('知识点：',{exact:true}).isVisible());
   assert.ok(await stages.first().getByText('题目：',{exact:true}).isVisible());
   assert.ok(await stages.first().getByText('达标要求：',{exact:true}).isVisible());
   const link=video.locator('a[href="https://example.test/video/0"]');assert.equal(await link.count(),1);
   assert.equal(await link.getAttribute('target'),'_blank');
   assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
   await page.reload({waitUntil:'networkidle'});
   assert.ok(await page.locator('#video-learning-view').isVisible());
   assert.equal(await video.locator('.video-stage[open]').count(),0,'reload starts with all stages collapsed');
   assert.equal(await page.locator('#pocket-main').isVisible(),false);
   assert.equal(await page.evaluate(key=>localStorage.getItem(key),key),before);
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
