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
   await context.addInitScript(({key,initial})=>{localStorage.setItem(key,JSON.stringify(initial));localStorage.setItem('pocket-development-v1:pocket-last-view-v1',JSON.stringify({page:'learning',outputPage:''}));},{key,initial});
   const page=await context.newPage();await page.goto(origin,{waitUntil:'networkidle'});
   const before=await page.evaluate(key=>localStorage.getItem(key),key);
   await page.getByRole('button',{name:'视频',exact:true}).click();
   const video=page.locator('#learning-content .current-task > section:visible');
   assert.equal(await video.locator('.task-title').textContent(),'看视频的三个阶段');
   assert.deepEqual(await video.locator(':scope > .task-guidance').allTextContents(),[
    '一、完全陌生和能做一些题：','1、自己尝试理解和重做讲义内容','2、有问题的标注问题（不深入）','3、开始看本组对应的视频内容',
    '4、过程中在有答案的讲义标注做笔记自己觉得有收获的地方','5、点击进入下一阶段的输出',
    `只看第${range}题对应的课程内容，不要超过当前组范围。`,
    '二、能独立做对很多题：','1、倍速看，查漏补缺老师讲的不同的做法','2、有新的收获就行',
    '三、已经进入大量刷题阶段：（选做）','1、快速回忆老师讲这个讲义网课的时候怎么讲的','2、自己模仿老师去讲这堂课的思路、核对、反思']);
   assert.ok(!(await video.innerText()).includes('预习+看视频'));
   const highlight=video.locator('.video-guidance-highlight');
   assert.equal(await highlight.textContent(),'有答案的讲义');
   assert.deepEqual(await highlight.evaluate(el=>({color:getComputedStyle(el).color,weight:getComputedStyle(el).fontWeight,size:getComputedStyle(el).fontSize,parentSize:getComputedStyle(el.parentElement).fontSize})),{color:'rgb(255, 213, 79)',weight:'700',size:'14px',parentSize:'14px'});
   assert.equal(await highlight.evaluate(el=>getComputedStyle(el.previousElementSibling).color===getComputedStyle(el).color),false);
   const link=video.locator('a[href="https://example.test/video/0"]');assert.equal(await link.count(),1);
   assert.equal(await link.getAttribute('target'),'_blank');
   assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
   if(width===390||width===768)await page.screenshot({path:path.join(__dirname,'artifacts',`video-guidance-${width}.png`),fullPage:true});
   const back=page.locator('#learning-content .current-task > .practice-back');
   assert.ok(await back.isVisible(),await page.locator('#learning-content button').allTextContents());
   await back.click();
   await page.getByRole('button',{name:'输出',exact:true}).click();
   assert.ok(await page.locator('#learning-content .output-entry strong').filter({hasText:'做题'}).isVisible());
   assert.equal(await page.evaluate(key=>localStorage.getItem(key),key),before);
   await page.locator('#learning-content .current-task > button').filter({hasText:'输出达标 → 下一步'}).click();
   assert.equal(await page.evaluate(key=>JSON.parse(localStorage.getItem(key)).currentSession.currentStep,key),'groupComplete');
   await context.close();
  }
  console.log('PASS localhost VIDEO: exact three-stage guidance, unchanged dynamic 1-2 / 3-7,10 / 8 / 11-15 reminders, isolated yellow bold same-size phrase, original video links/OUTPUT progression, 320/390/768/1440px, no learning writes from viewing.');
 }finally{await browser?.close();await new Promise(resolve=>server.close(resolve));}
})().catch(error=>{console.error(error);process.exitCode=1;});
