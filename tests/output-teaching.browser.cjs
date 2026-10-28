'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),http=require('node:http');
const {seed}=require('./helpers/pocket-learning-ui.cjs');
const playwright=require(path.join(path.dirname(process.execPath),'node_modules/playwright'));
const root=path.resolve(__dirname,'..'),key='pocket-development-v1:cognivex-pocket-state';
const expected=`复述教学-精准提问卡点-循环-可独立教学
1、复述教学
假设自己是老师教别人，怎么教会别人去思考
2、解决卡点
（1）精准提问：过程中，把卡住自己思考的地方精准拆分成不同小问题，并且能精准提出自己的问题（精准提问很重要）
（2）举例子深入理解：口语化举生活中或做题的例子深入理解并且解决问题
3、重新教学：重新复述教学，提问，举例子
5、循环123
6、教学结束：直到自己可以独立教对别人，独立做对就可以，没有关键问题
（注意：这里的关键问题指的是不解决自己就没办法独立重做对，如果可以独立重做对，还有问题，就先记录下来不用解决，后续复习再解决）
选做：根据自己所复述教学的内容，让AI找对应视频看的搜索关键词（动态过程思考尤其重要这一步）
总结成进步本笔记：
1、概括自己是怎么思考做对或者教对这道题的，举了什么例子
2、曾经哪里有问题卡住，用什么思考方式思考解决，对未来做题有什么经验心得
3、最后一句话总结前面
4、自己可以不靠AI，自己用一句话，口语化解释清楚（最终境界）
5、根据做题output的每个环节，每次复习读按照每个环节对应的深度去思考提问，然后标注问题和思考到进步本`.split('\n');
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
  for(const width of [320,390,768,1440]){
   const context=await browser.newContext({viewport:{width,height:1024}});
   await context.route('**/*',route=>route.request().url().startsWith(origin+'/')?route.continue():route.abort());
   const initial=seed(2);initial.materials[0].status='learning';
   initial.currentSession={materialId:'m1',currentGroupIndex:0,currentRunIndex:0,currentStep:'output',mode:'new',schedulerState:{phase:'new',newGroupIndex:0,reviewGroupIndex:0}};
   await context.addInitScript(({key,initial})=>{if(!localStorage.getItem(key)){localStorage.setItem(key,JSON.stringify(initial));localStorage.setItem('pocket-development-v1:pocket-last-view-v1',JSON.stringify({page:'learning',outputPage:'questions'}));}},{key,initial});
   const page=await context.newPage();await page.goto(origin,{waitUntil:'networkidle'});
   const before=await page.evaluate(key=>localStorage.getItem(key),key);
   const entries=page.locator('#learning-content .output-entry').filter({has:page.locator('strong')});
   assert.deepEqual(await entries.locator('strong').allTextContents(),['教学法','做题','知识点']);
   assert.equal(await entries.first().locator('span').textContent(),'适用于第一次接触完全陌生的知识点和题目的通用操作');
   assert.deepEqual(await entries.evaluateAll(nodes=>nodes.map(n=>getComputedStyle(n).borderRadius)),['13px','13px','13px']);
   await entries.first().click();
   const pageTitle=page.locator('#output-sop h1:visible');
   assert.equal(await pageTitle.textContent(),'教学法（适用于做题和知识点的第一次的完全陌生的理解）');
   const content=page.locator('.output-teaching-text'),cards=content.locator('.teaching-step');
   async function originalText(){return content.evaluate(node=>{
    const paragraphs=[node.querySelector('.teaching-intro').textContent];
    for(const card of node.querySelectorAll('.teaching-step')){
     const heading=card.querySelector('summary').textContent,body=[...card.querySelectorAll('.teaching-step-body > p')];
     paragraphs.push(heading+(body[0]?.classList.contains('teaching-inline-detail')?body.shift().textContent:''));
     paragraphs.push(...body.map(p=>p.textContent));
    }
    paragraphs.push(node.querySelector('.teaching-optional p').textContent,node.querySelector('.teaching-notes h2').textContent,...[...node.querySelectorAll('.teaching-notes p')].map(p=>p.textContent));
    return paragraphs;
   });}
   assert.deepEqual(await originalText(),expected);
   assert.equal(await cards.count(),5);
   assert.deepEqual(await cards.locator('.teaching-step-number').allTextContents(),['1、','2、','3、','5、','6、']);
   assert.equal(await content.locator('.teaching-step[open]').count(),1);assert.notEqual(await cards.first().getAttribute('open'),null);
   assert.equal(await content.locator('input[type=checkbox]').count(),5);
   assert.equal(await content.locator('button,textarea').count(),0);
   await page.evaluate(()=>{const scroll=window.scrollTo.bind(window);window.teachingScrolls=[];window.scrollTo=(...args)=>{if(typeof args[0]==='object')window.teachingScrolls.push(args[0]);scroll(...args);};});
   for(let round=0;round<3;round++)for(let i=0;i<5;i++){
    assert.equal(await content.locator('.teaching-step[open]').count(),1);
    assert.notEqual(await cards.nth(i).getAttribute('open'),null);
    // The final checkbox resets synchronously; click validates the user interaction without check() requiring it to remain checked.
    await cards.nth(i).getByRole('checkbox',{name:'本步已完成'}).click();
    assert.equal(await cards.nth(i).getAttribute('open'),null,'completed card collapses');
    if(i<4){
     assert.notEqual(await cards.nth(i+1).getAttribute('open'),null,'next card opens in original order');
     assert.ok(await cards.nth(i+1).locator('summary').evaluate(el=>document.activeElement===el));
    }else{
     assert.equal(await content.locator('.teaching-step[open]').count(),1);
     assert.notEqual(await cards.first().getAttribute('open'),null,'last completion restarts first step');
     assert.equal(await content.locator('input:checked').count(),0,'every temporary check is cleared');
    }
   }
   await cards.first().getByRole('checkbox').click();
   await cards.first().locator('summary').click();assert.ok(await cards.first().getByRole('checkbox').isChecked());
   await cards.first().getByRole('checkbox').uncheck();assert.notEqual(await cards.first().getAttribute('open'),null,'unchecking does not auto-advance');
   await cards.nth(3).locator('summary').click();assert.notEqual(await cards.nth(3).getAttribute('open'),null,'manual out-of-order browsing remains available');
   await cards.first().locator('summary').click();
   assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
   if(width===390||width===768)await page.screenshot({path:path.join(__dirname,'artifacts',`output-teaching-${width}.png`),fullPage:true});
   await page.reload({waitUntil:'networkidle'});
   assert.deepEqual(await originalText(),expected);
   assert.equal(await content.locator('.teaching-step[open]').count(),1);
   assert.equal(await content.locator('input:checked').count(),0,'temporary checks are not persisted');
   await page.locator('#output-sop > .practice-back').click();
   assert.ok(await entries.first().isVisible());
   await entries.first().click();
   assert.equal(await content.locator('input:checked').count(),0);
   assert.notEqual(await cards.first().getAttribute('open'),null);
   await page.locator('#output-sop > .practice-back').click();
   for(const [index,title] of [[1,'做题训练模型'],[2,'知识点训练模型']]){
    await entries.nth(index).click();assert.equal(await page.locator('#output-model-home h1').textContent(),title);
    await page.locator('#output-sop > .practice-back').click();assert.ok(await entries.first().isVisible());
   }
   assert.equal(await page.evaluate(key=>localStorage.getItem(key),key),before);
   await context.close();
  }
  console.log('PASS localhost teaching entry: three peer entries in order, exact subtitle/original paragraphs and numbering, read-only page/reload/back, unchanged original model entries and learning state, 320/390/768/1440px.');
 }finally{await browser?.close();await new Promise(resolve=>server.close(resolve));}
})().catch(error=>{console.error(error);process.exitCode=1;});
