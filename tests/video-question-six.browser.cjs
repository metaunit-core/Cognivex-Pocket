'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),http=require('node:http'),{execFileSync}=require('node:child_process');
const {seed}=require('./helpers/pocket-learning-ui.cjs');
const playwright=require(path.join(path.dirname(process.execPath),'node_modules/playwright'));
const root=path.resolve(__dirname,'..'),key='pocket-development-v1:cognivex-pocket-state',at=Date.now();
const baselineScripts=Object.fromEntries(['video-learning.js','video-learning-ui.js'].map(name=>[name,execFileSync('git',['show','HEAD:js/'+name],{cwd:root,encoding:'utf8'})]));
const server=http.createServer((request,response)=>{
  const file=path.resolve(root,'.'+new URL(request.url,'http://localhost').pathname.replace(/\/$/,'/index.html'));
  if(!file.startsWith(root+path.sep))return response.writeHead(403).end();
  try{response.setHeader('Content-Type',({'.js':'text/javascript','.css':'text/css','.html':'text/html'})[path.extname(file)]||'text/plain');response.end(fs.readFileSync(file));}catch(_){response.writeHead(404).end();}
});
function fixture(question=0,version=4){
  const state=seed(2);require('./helpers/original-learning-fixture.cjs')(state,at);
  const group=state.materials[0].groups[0];group.runs.push({mode:'new',videoSkipped:true,outputCompleted:false,startedAt:at,completedAt:null});
  state.currentSession={materialId:'m1',currentGroupIndex:0,currentRunIndex:group.runs.length-1,currentStep:'output',mode:'new',schedulerState:{phase:'new',newGroupIndex:0,reviewGroupIndex:0}};
  state.videoLearning={version:1,records:[],guidance:{intro:1,continuous:3,question,currentQuestion:17,questionStepVersion:version}};return state;
}
(async()=>{
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));let browser;
  try{
    const origin=`http://127.0.0.1:${server.address().port}`;
    browser=await playwright.chromium.launch({executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',headless:true});
    async function contextFor(initial,width,baseline=false){
      const context=await browser.newContext({viewport:{width,height:900}});
      await context.route('**/*',route=>{
        const url=route.request().url();if(!url.startsWith(origin+'/'))return route.abort();
        const name=url.split('/').pop();if(baseline&&baselineScripts[name])return route.fulfill({contentType:'text/javascript',body:baselineScripts[name]});return route.continue();
      });
      await context.addInitScript(({key,initial})=>{if(!localStorage.getItem(key)){localStorage.setItem(key,JSON.stringify(initial));localStorage.setItem('pocket-development-v1:pocket-last-view-v1',JSON.stringify({page:'home'}));}},{key,initial});return context;
    }
    const preserved=[];
    for(const step of [1,6]){
      const context=await contextFor(fixture(step,3),390,true),page=await context.newPage();await page.goto(origin,{waitUntil:'networkidle'});
      await page.locator('#home-video-shortcut').click();await page.locator('#video-learning-entry').getByRole('button',{name:'逐题突破',exact:true}).click();
      preserved.push(await page.locator('#video-learning-system').evaluate(node=>({body:node.querySelector('.video-learning-description').innerHTML,handoff:node.querySelector('.video-module-handoff').innerHTML,operation:((css)=>[css.backgroundColor,css.borderLeftColor,css.padding])(getComputedStyle(node.querySelector('.video-learning-operation')))})));await context.close();
    }
    for(const width of [320,390,430,768,1440]){
      const context=await contextFor(fixture(),width),page=await context.newPage(),errors=[];page.on('pageerror',error=>errors.push(error.message));await page.goto(origin,{waitUntil:'networkidle'});
      const read=()=>page.evaluate(key=>JSON.parse(localStorage.getItem(key)),key),before=await read();
      await page.locator('#home-video-shortcut').click();await page.locator('#video-learning-entry').getByRole('button',{name:'逐题突破',exact:true}).click();
      const view=page.locator('#video-learning-system'),description=view.locator('.video-learning-description');
      const titles=['第1步：独立重做','2、标注问题（课前）','第3步：看视频','第4步：复盘','第5步：再次独立重做','6、逐道题目都能独立重做→进入分组学习'];
      const expected={0:['自己尝试独立重做本道题','看标准答案','自己模仿答案重做'],2:['01定位视频片段','拉视频进度条到只讲这一道题或者这一部分的小段进度条。','对应讲解片段','02带着问题看讲解','看老师是否讲到了第2步中自己标注的问题。','老师讲到了标注的问题','记下笔记到答案讲义'],3:['01解决额外问题','向AI提出并解决额外提出的问题。','02手写解析','交给AI整理','问题','答案','整理成问题＋答案的形式','自己尝试手写答案','简单的口述即可。','核对，对了就行'],4:['再次独立重做本道题','重做结果','重做失败','标注问题，重新循环。','标注问题','看视频','复盘','再次独立重做','重做成功','能够独立重做本道题。']};
      async function advance(index){if(index===4)await view.locator('.question-success-next').click();else await view.locator('.video-learning-step-actions > button').last().click();}
      for(let index=0;index<6;index++){
        assert.equal(await view.locator('.video-learning-operation > p').textContent(),`当前步骤 ${index+1}/6`);assert.equal(await view.locator('.video-learning-operation > h2').textContent(),titles[index]);
        assert.equal(await view.locator('#video-current-question').inputValue(),'17');assert.equal(await view.locator('#video-learning-route li').count(),6);
        assert.deepEqual(await view.locator('.video-question-progress > span').evaluateAll(nodes=>nodes.map(node=>getComputedStyle(node).backgroundColor)),Array.from({length:6},(_,position)=>position<=index?'rgb(157, 187, 227)':'rgb(48, 59, 74)'));
        if(expected[index])assert.deepEqual(await description.locator('h3,h4,p,.question-small > strong,.question-center > strong').allTextContents(),expected[index]);
        if(index===0){assert.equal(await view.locator('.video-learning-step-actions > button:visible').count(),1);assert.ok(await view.getByRole('button',{name:'下一步：标注问题',exact:true}).isVisible());}
        if(index===1||index===5){
          const expectedPreserved=preserved[index===1?0:1];
          assert.equal(await description.innerHTML(),expectedPreserved.body);assert.equal(await view.locator('.video-module-handoff').innerHTML(),expectedPreserved.handoff);
          assert.deepEqual(await view.locator('.video-learning-operation').evaluate(node=>{const css=getComputedStyle(node);return [css.backgroundColor,css.borderLeftColor];}),expectedPreserved.operation.slice(0,2));
          assert.equal(await view.locator('.video-learning-operation').evaluate(node=>getComputedStyle(node).padding),width<=400?'12px':'16px');
        }
        if(index===2){assert.equal(await description.locator('video,iframe,[role="slider"],input').count(),0);assert.ok(await description.locator('.question-video-highlight').isVisible());}
        if(index===3)assert.ok(await description.locator('.question-pair').evaluate(node=>{const [left,right]=Array.from(node.children).map(child=>child.getBoundingClientRect());return left.top===right.top&&left.height===right.height&&Math.abs(left.width-right.width)<1&&left.right<right.left;}));
        if(index===4){assert.equal(await description.locator('button').count(),2);assert.equal(await view.locator('.video-learning-step-actions').isVisible(),false);}
        assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
        assert.ok(await description.locator('section,div,p,h3,h4').evaluateAll(nodes=>nodes.every(node=>node.scrollWidth<=node.clientWidth)));
        if(process.env.POCKET_QUESTION_SCREENSHOTS&&[390,1440].includes(width)){fs.mkdirSync(process.env.POCKET_QUESTION_SCREENSHOTS,{recursive:true});await page.evaluate(()=>scrollTo(0,0));await page.screenshot({path:path.join(process.env.POCKET_QUESTION_SCREENSHOTS,`question-${width}-step-${index+1}.png`),fullPage:true});}
        if(index<5)await advance(index);
      }
      await view.getByRole('button',{name:'上一步',exact:true}).click();
      for(let cycle=0;cycle<3;cycle++){
        await view.getByRole('button',{name:'回到标注问题',exact:true}).click();
        assert.equal(await view.locator('.video-learning-operation > p').textContent(),'当前步骤 2/6');assert.equal(await view.locator('#video-current-question').inputValue(),'17');
        await page.reload({waitUntil:'networkidle'});assert.equal(await view.locator('.video-learning-operation > p').textContent(),'当前步骤 2/6');
        for(let index=1;index<4;index++)await advance(index);
        assert.equal(await view.locator('.video-learning-operation > p').textContent(),'当前步骤 5/6');
      }
      await view.locator('.question-success-next').click();assert.equal(await view.locator('.video-learning-operation > p').textContent(),'当前步骤 6/6');
      await view.getByRole('button',{name:'下一题',exact:true}).click();assert.equal(await view.locator('#video-current-question').inputValue(),'18');await view.getByRole('button',{name:'上一题',exact:true}).click();
      const after=await read();assert.equal(after.videoLearning.guidance.questionStepVersion,4);assert.equal(after.videoLearning.guidance.question,5);assert.equal(after.videoLearning.guidance.currentQuestion,17);
      const originalVideo=before.videoLearning;delete before.videoLearning;delete after.videoLearning;assert.deepEqual(after,before);assert.deepEqual(originalVideo.records,[]);
      await view.getByRole('button',{name:'进入新增资料分组',exact:true}).click();assert.ok(await page.locator('#home-grouping-panel').isVisible());
      const grouping=await page.locator('#home-grouping-content').innerHTML();await page.locator('#home-grouping-shortcut').click();await page.locator('#home-grouping-shortcut').click();assert.equal(await page.locator('#home-grouping-content').innerHTML(),grouping);
      await page.evaluate(()=>PocketLearning.resume());await page.locator('.current-task > .output-entries > button').filter({has:page.locator('strong',{hasText:'逐题突破'})}).click();
      assert.equal(await view.locator('.video-learning-operation > p').textContent(),'当前步骤 6/6');assert.equal(await description.innerHTML(),preserved[1].body);
      await view.locator('.practice-back').click();assert.ok(await page.locator('.output-task-complete').isVisible());assert.deepEqual(errors,[]);
      await context.close();console.log(`PASS question six ${width}px: exact four redesigned steps, preserved steps 2/6 against pre-change UI, six segments, 3 failure cycles/reloads, same question/task/material, shared entry and grouping.`);
    }
  }finally{await browser?.close();await new Promise(resolve=>server.close(resolve));}
})().catch(error=>{console.error(error);process.exitCode=1;});
