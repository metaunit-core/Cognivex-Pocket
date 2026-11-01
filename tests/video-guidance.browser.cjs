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
    assert.equal(await stages.nth(index).locator(':scope > p.task-guidance:visible').evaluateAll(nodes=>nodes.filter(node=>/^\d+、/.test(node.textContent)).length),[7,3,2][index]);
   }
   await stages.first().locator('summary').click();
   assert.equal(await video.locator('.video-stage[open]').count(),2,'clicking the same title closes only that stage');
   await stages.first().locator('summary').click();
   assert.equal(await video.locator('.task-title').textContent(),'看视频的三个阶段');
   assert.deepEqual(await video.locator('.task-guidance').allTextContents(),[
    '一、完全陌生和能做一些题：','1、自己尝试理解和重做讲义内容。','2、有问题的标注问题（不深入）。',
    '3、开始看本组对应的视频内容，每看完一个完整的小知识块或例题就暂停，不必等整节课结束。',
    '4、关掉视频，不看讲义，自己回忆并录音：「刚才老师到底讲了什么？为什么这么做？」哪怕只能回忆一点点，也先自己想。',
    '5、打开讲义，对标老师的讲解，找出自己忘记了什么、哪一步不会解释、哪个思路自己想不到。在有答案的讲义上标注问题、错漏，以及自己觉得有收获的地方。',
    '6、脱离视频，尝试独立讲解知识点，或者独立重做例题。最后用一句话总结可以迁移到以后做题的经验。',
    '7、完成本组视频学习后，点击进入下一阶段的 OUTPUT。',
    '小段观看 → 关视频回忆 → 打开讲义对标补漏 → 独立讲解或重做。',
    '每完成一个完整的小知识块或例题，就尝试执行一次。不要等整节课结束才第一次回忆。如果能独立讲清楚或重做正确，就继续下一小段。',
    '如果发现关键卡点：先标注问题，简单对标老师的讲解，能快速解决就继续。如果需要深入提问和反复教学，则留到 OUTPUT 的教学法中处理。',
    '不要在 VIDEO 阶段强制执行完整的 OUTPUT 教学法。不要把每一个次要问题都变成必须立即解决的障碍。',
    `只看第${range}题对应的课程内容，不要超过当前组范围。`,
    '二、能独立做对很多题：','1、倍速看，查漏补缺老师讲的不同做法。','2、有新的收获就行，重点标注自己没有想到的方法、思路或技巧。',
    '3、必要时暂停视频，尝试脱离视频独立复现老师的新方法。',
    '此时视频主要用于查漏补缺、学习不同做法、对比自己的思路与老师的思路、补充有价值的新经验。',
    '不要求像第一阶段一样，对所有已经熟练的内容反复执行完整四步闭环。已经熟练掌握的部分可以快速通过。',
    '三、已经进入大量刷题阶段：（选做）','1、快速回忆老师讲这个讲义网课的时候怎么讲的。','2、自己模仿老师去讲这堂课的思路、核对、反思。',
    '重点是脱离视频，快速复现已有知识和解题思路。不需要强制重新观看完整课程，不增加额外的必做步骤。']);
   assert.ok(!(await video.innerText()).includes('预习+看视频'));
   const highlight=video.locator('.video-guidance-highlight');
   assert.equal(await highlight.textContent(),'有答案的讲义');
   assert.deepEqual(await highlight.evaluate(el=>({color:getComputedStyle(el).color,weight:getComputedStyle(el).fontWeight,sameSize:getComputedStyle(el).fontSize===getComputedStyle(el.parentElement).fontSize})),{color:'rgb(255, 213, 79)',weight:'700',sameSize:true});
   assert.equal(await highlight.evaluate(el=>getComputedStyle(el.previousElementSibling).color===getComputedStyle(el).color),false);
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
