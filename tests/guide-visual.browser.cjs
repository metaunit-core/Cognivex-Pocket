'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),http=require('node:http'),os=require('node:os');
const {seed}=require('./helpers/pocket-learning-ui.cjs');
const playwright=require(path.join(path.dirname(process.execPath),'node_modules/playwright'));
const root=path.resolve(__dirname,'..'),key='pocket-development-v1:cognivex-pocket-state';
const baselines={'summary-cards':process.env.POCKET_SUMMARY_BASELINE,'independent-practice':process.env.POCKET_PRACTICE_BASELINE};
const server=http.createServer((request,response)=>{
  const pathname=new URL(request.url,'http://localhost').pathname;
  const baseline=baselines[pathname.replace('/__baseline/','')];
  if(pathname.startsWith('/__baseline/')&&baseline){response.setHeader('Content-Type','text/javascript');return response.end(fs.readFileSync(baseline));}
  const file=path.resolve(root,'.'+pathname.replace(/\/$/,'/index.html'));
  if(!file.startsWith(root+path.sep))return response.writeHead(403).end();
  try{response.setHeader('Content-Type',({'.js':'text/javascript','.css':'text/css','.html':'text/html'})[path.extname(file)]||'text/plain');response.end(fs.readFileSync(file));}catch(_){response.writeHead(404).end();}
});
const text=async(page,id)=>page.locator('#'+id).evaluate(node=>{
  const clone=node.cloneNode(true);clone.querySelectorAll('.guide-roadmap,.guide-level,.guide-subtitle,.guide-practice-cycle > h2').forEach(item=>item.remove());
  return clone.textContent;
});
(async()=>{
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));let browser;
  const screenshots=fs.mkdtempSync(path.join(os.tmpdir(),'pocket-guides-'));
  try{
    const origin=`http://127.0.0.1:${server.address().port}`;
    browser=await playwright.chromium.launch({executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',headless:true});
    for(const width of [320,390,1440]){
      const context=await browser.newContext({viewport:{width,height:1000}});
      await context.route('**/*',route=>route.request().url().startsWith(origin+'/')?route.continue():route.abort());
      const initial=seed(2);require('./helpers/original-learning-fixture.cjs')(initial,Date.now());
      const group=initial.materials[0].groups[0];group.runs.push({mode:'review',videoSkipped:true,outputCompleted:false,startedAt:Date.now(),completedAt:null});
      initial.currentSession={materialId:'m1',currentGroupIndex:0,currentRunIndex:group.runs.length-1,currentStep:'output',mode:'review',schedulerState:{phase:'review',newGroupIndex:0,reviewGroupIndex:0}};
      await context.addInitScript(({key,initial})=>{if(!localStorage.getItem(key)){localStorage.setItem(key,JSON.stringify(initial));localStorage.setItem('pocket-development-v1:pocket-last-view-v1',JSON.stringify({page:'learning'}));}},{key,initial});
      const page=await context.newPage(),errors=[];page.on('pageerror',error=>errors.push(error.message));await page.goto(origin,{waitUntil:'networkidle'});
      const before=await page.evaluate(key=>localStorage.getItem(key),key);
      for(const [id,api,count] of [['summary-cards','PocketSummaryCards',5],['independent-practice','PocketIndependentPractice',2]]){
        await page.locator('.current-task > .output-entries > .output-entry').nth(id==='summary-cards'?2:3).click();
        const original=await text(page,id);
        if(baselines[id]){
          await page.locator('#'+id).evaluate(node=>node.remove());
          await page.addScriptTag({url:`${origin}/__baseline/${id}`});await page.evaluate(api=>globalThis[api].open(),api);
          assert.equal(await text(page,id),original,`${id}: every original character retained`);
          await page.locator('#'+id).evaluate(node=>node.remove());
          await page.addScriptTag({url:`${origin}/js/${id}.js`});await page.evaluate(api=>globalThis[api].open(),api);
        }
        const panel=page.locator('#'+id),cards=panel.locator('details');assert.equal(await cards.count(),count);
        assert.equal(await panel.locator('.guide-roadmap circle').count(),id==='summary-cards'?5:3);
        if(id==='summary-cards'){
          assert.equal(await panel.locator('.summary-roadmap-number').count(),5);
          assert.equal(await panel.locator('details > summary > svg').count(),5);
          assert.equal(await panel.locator('.summary-table-scroll table tbody tr').count(),5);
          assert.equal(await panel.locator('.summary-principle strong').textContent(),'我不看提示，能独立做出目标要求的表现');
          assert.equal(await panel.locator('.summary-insight').count(),1);
        }
        if(id==='independent-practice'){
          assert.deepEqual(await panel.locator('.practice-roadmap-number').allTextContents(),['01','02','03']);
          assert.deepEqual(await panel.locator('.practice-roadmap-caption').allTextContents(),['网课辅助','自主刷题','全真模考']);
          const nodes=await panel.locator('.practice-roadmap circle').evaluateAll(items=>items.map(node=>{const rect=node.getBoundingClientRect(),style=getComputedStyle(node);return {center:rect.x+rect.width/2,top:rect.top,width:rect.width,fill:style.fill,stroke:style.stroke};}));
          assert.ok(nodes.every(node=>Math.abs(node.width-nodes[0].width)<.1&&Math.abs(node.top-nodes[0].top)<.1));
          assert.ok(Math.abs((nodes[1].center-nodes[0].center)-(nodes[2].center-nodes[1].center))<.1);
          assert.equal(nodes[0].fill,'rgb(35, 67, 101)');assert.equal(nodes[0].stroke,'rgb(125, 181, 255)');
          assert.equal(nodes[2].fill,'rgb(75, 59, 35)');assert.equal(nodes[2].stroke,'rgb(226, 182, 108)');
          assert.equal(await panel.locator('.practice-roadmap-line').getAttribute('d'),'M120 52H210M290 52H380');
          await panel.locator('.practice-roadmap').screenshot({path:path.join(screenshots,`roadmap-${width}.png`)});
        }
        assert.equal(await cards.evaluateAll(nodes=>nodes.every(node=>!node.open)),true);
        for(let index=0;index<count;index++)await cards.nth(index).locator('summary').click();
        assert.equal(await cards.evaluateAll(nodes=>nodes.every(node=>node.open)),true);
        assert.equal(await panel.locator('input,textarea,select').count(),0);
        assert.equal(await panel.locator('button').count(),1);
        assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
        await page.screenshot({path:path.join(screenshots,`${id}-${width}.png`),fullPage:true});
        await cards.first().locator('summary').click();assert.equal(await cards.first().evaluate(node=>node.open),false);
        assert.equal(await cards.nth(1).evaluate(node=>node.open),true);
        assert.equal(await page.evaluate(key=>localStorage.getItem(key),key),before);
        await page.reload({waitUntil:'networkidle'});assert.equal(await page.locator('#'+id).isVisible(),true);
        await page.locator('#'+id+' .practice-back').click();assert.equal(await page.locator('.current-task > .output-entries > .output-entry').count(),4);
        assert.equal(await page.evaluate(key=>localStorage.getItem(key),key),before);
      }
      assert.deepEqual(errors,[]);await context.close();console.log(`PASS ${width}px: content, folds, reload, return, no overflow or data writes`);
    }
    console.log('Screenshots: '+screenshots);
  }finally{await browser?.close();await new Promise(resolve=>server.close(resolve));}
})().catch(error=>{console.error(error);process.exitCode=1;});
