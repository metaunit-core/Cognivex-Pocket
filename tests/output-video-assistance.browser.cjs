'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),http=require('node:http');
const {seed}=require('./helpers/pocket-learning-ui.cjs');
const playwright=require(path.join(path.dirname(process.execPath),'node_modules/playwright'));
const root=path.resolve(__dirname,'..'),key='pocket-development-v1:cognivex-pocket-state',at=Date.now();
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
    for(const width of [320,390,430,768,1440]){
      const state=seed(2);require('./helpers/original-learning-fixture.cjs')(state,at);
      const group=state.materials[0].groups[0];group.runs.push({mode:'new',videoSkipped:true,outputCompleted:false,startedAt:at,completedAt:null});
      state.currentSession={materialId:'m1',currentGroupIndex:0,currentRunIndex:group.runs.length-1,currentStep:'output',mode:'new',schedulerState:{phase:'new',newGroupIndex:0,reviewGroupIndex:0}};
      const context=await browser.newContext({viewport:{width,height:900}});
      await context.route('**/*',route=>route.request().url().startsWith(origin+'/')?route.continue():route.abort());
      await context.addInitScript(({state,key})=>{if(!localStorage.getItem(key)){localStorage.setItem(key,JSON.stringify(state));localStorage.setItem('pocket-development-v1:pocket-last-view-v1',JSON.stringify({page:'learning'}));}},{state,key});
      const page=await context.newPage(),errors=[];page.on('pageerror',error=>errors.push(error.message));await page.goto(origin,{waitUntil:'networkidle'});
      const read=()=>page.evaluate(key=>JSON.parse(localStorage.getItem(key)),key),entries=page.locator('.current-task > .output-entries > button:visible');
      assert.deepEqual(await entries.locator('strong').allTextContents(),['视频辅助学习','训练内化','构建解题体系','自主刷题与实战']);
      const accuracy=page.locator('#group-latest-accuracy'),duration=page.locator('#group-latest-duration');
      await accuracy.fill('8/10');await accuracy.dispatchEvent('change');await duration.fill('12');await duration.dispatchEvent('change');
      const before=await read(),otherEntries=await entries.evaluateAll(nodes=>nodes.slice(1).map(node=>node.outerHTML));
      const screenshots=path.join(root,'artifacts/output-video-assistance');fs.mkdirSync(screenshots,{recursive:true});
      async function inspect(name){assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));if([390,1440].includes(width))await page.screenshot({path:path.join(screenshots,`${name}-${width}.png`),fullPage:true});}
      await inspect('output');await entries.first().click();
      const view=page.locator('#output-video-assistance');assert.ok(await view.isVisible());assert.equal(await view.locator('.assistance-entry').count(),2);await inspect('selection');
      await view.getByRole('button',{name:/完整重看已学视频/}).click();
      assert.deepEqual(await view.locator('.assistance-operation strong').allTextContents(),['完整、连续地观看视频','有新收获就简单记录','继续原有学习与复习']);
      assert.deepEqual(await view.locator('.assistance-principle p').allTextContents(),['不必频繁暂停，不必逐题分析，不必强制记录，不必重新执行视频学习三个阶段。','有收获就吸收，没有新收获也可以直接看完。']);
      assert.equal(await view.locator('video,iframe,input').count(),0);assert.equal(await view.locator('button').count(),1);await inspect('rewatch');
      await page.reload({waitUntil:'networkidle'});assert.ok(await view.locator('.assistance-rewatch').isVisible());
      await view.locator('.practice-back').click();await view.getByRole('button',{name:/逐题突破/}).click();
      assert.ok(await page.locator('#video-learning-system').isVisible());assert.equal(await page.locator('#video-learning-route li').count(),6);
      await page.locator('#video-learning-system .practice-back').click();assert.ok(await view.locator('.assistance-entry').first().isVisible());
      await view.locator('.practice-back').click();assert.ok(await entries.first().isVisible());
      assert.equal(await accuracy.inputValue(),'8/10');assert.equal(await duration.inputValue(),'12');assert.deepEqual(await read(),before);
      assert.deepEqual(await entries.evaluateAll(nodes=>nodes.slice(1).map(node=>node.outerHTML)),otherEntries);
      await entries.nth(1).click();assert.equal(await page.getByRole('button',{name:/完整重看已学视频/}).count(),0);
      assert.ok(await page.getByText('请选择本次输出内容',{exact:true}).isVisible());assert.deepEqual(errors,[]);
      await context.close();console.log(`PASS ${width}px: navigation/reload, six shared steps, unchanged task/metrics/other entries, static rewatch, no overflow.`);
    }
  }finally{await browser?.close();await new Promise(resolve=>server.close(resolve));}
})().catch(error=>{console.error(error);process.exitCode=1;});
