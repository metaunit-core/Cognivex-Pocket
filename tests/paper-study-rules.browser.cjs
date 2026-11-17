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
      await context.addInitScript(({key,initial})=>{if(!localStorage.getItem(key)){localStorage.setItem(key,JSON.stringify(initial));localStorage.setItem('pocket-development-v1:pocket-last-view-v1',JSON.stringify({page:'home'}));}},{key,initial});
      const page=await context.newPage(),errors=[];page.on('pageerror',error=>errors.push(error.message));
      await page.goto(origin,{waitUntil:'networkidle'});
      assert.equal(await page.locator('#environment-banner').textContent(),'测试环境｜不会连接 Firebase');
      const before=await page.evaluate(key=>localStorage.getItem(key),key);
      async function check(card){
        assert.equal(await card.getAttribute('open'),null);assert.equal(await card.locator('summary').textContent(),'纸质资料做题规则');
        assert.equal(await card.locator('svg[aria-hidden="true"]').count(),1);
        await card.locator('summary').click();assert.equal(await card.getAttribute('open'),'');
        assert.deepEqual(await card.locator('p').allTextContents(),['✏️ 铅笔： 先写过程','✓ 红勾： 快速做对 → 水笔写答案、红笔打勾','☆ 五角星： 值得重做 → 画星、擦掉过程','↻ 循环： 只重做五角星题，过关后打红勾']);
        assert.deepEqual(await card.locator('p strong').allTextContents(),['铅笔：','红勾：','五角星：','循环：']);
        assert.equal(await card.locator('input,button,a').count(),0);
        assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
        await card.locator('summary').click();assert.equal(await card.getAttribute('open'),null);
        await card.locator('summary').focus();await page.keyboard.press('Enter');assert.equal(await card.getAttribute('open'),'');
        await page.keyboard.press('Enter');assert.equal(await card.getAttribute('open'),null);
      }
      const homeCard=page.locator('.learning-card #paper-study-home > .paper-study-rules');await check(homeCard);
      assert.equal(await page.locator('#paper-study-home').evaluate(node=>node.nextElementSibling.id),'learning-content');
      const sharedMarkup=await homeCard.innerHTML();await page.evaluate(()=>PocketLearning.resume());
      await page.locator('#learning-content .output-entry').filter({has:page.locator('strong',{hasText:/^训练内化$/})}).click();
      await page.locator('#learning-content .output-entry').filter({has:page.locator('strong',{hasText:/^做题$/})}).click();
      const groupCard=page.locator('#output-sop > .paper-study-rules');await check(groupCard);
      assert.equal(await groupCard.innerHTML(),sharedMarkup);
      assert.ok(await page.locator('#output-model-home').isVisible());
      await page.locator('#output-model-home .output-operational-entry').click();
      assert.ok(await groupCard.isVisible());assert.ok(await page.locator('#output-operational-view').isVisible());
      await page.locator('#output-sop > .practice-back').click();
      for(let attempt=0;attempt<4 && !(await page.locator('#pocket-main').isVisible());attempt++)await page.locator('#output-sop > .practice-back').click();
      await page.locator('#learning-content .output-entry').filter({has:page.locator('strong',{hasText:/^知识点$/})}).click();
      assert.equal(await groupCard.isVisible(),false);
      await page.locator('#output-sop > .practice-back').click();
      for(let attempt=0;attempt<4 && !(await page.locator('#pocket-main').isVisible());attempt++)await page.locator('#output-sop > .practice-back').click();
      assert.equal(await page.evaluate(key=>localStorage.getItem(key),key),before);
      await page.locator('#group-latest-accuracy').fill('8/10');await page.locator('#group-latest-duration').fill('12');
      await page.locator('.output-task-complete').click();
      assert.equal(await page.evaluate(key=>JSON.parse(localStorage.getItem(key)).materials[0].groups[0].runs.at(-1).outputCompleted,key),true);
      assert.deepEqual(errors,[]);await context.close();console.log(`PASS ${width}px: shared rules, exact text, independent folds, unchanged navigation/data and original OUTPUT completion`);
    }
  }finally{await browser?.close();await new Promise(resolve=>server.close(resolve));}
})().catch(error=>{console.error(error);process.exitCode=1;});
