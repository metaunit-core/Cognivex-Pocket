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
    for(const width of [280,320,390,1440]){
      const context=await browser.newContext({viewport:{width,height:900}});
      await context.route('**/*',route=>route.request().url().startsWith(origin+'/')?route.continue():route.abort());
      const initial=seed(2);require('./helpers/original-learning-fixture.cjs')(initial,Date.now());
      const group=initial.materials[0].groups[0];group.runs.push({mode:'review',videoSkipped:true,outputCompleted:false,startedAt:Date.now(),completedAt:null});
      delete group.latestAccuracyPercent;delete group.latestAccuracyRatio;delete group.latestDurationMinutes;
      initial.currentSession={materialId:'m1',currentGroupIndex:0,currentRunIndex:group.runs.length-1,currentStep:'output',mode:'review',schedulerState:{phase:'review',newGroupIndex:0,reviewGroupIndex:0}};
      await context.addInitScript(({key,initial})=>{if(!localStorage.getItem(key)){localStorage.setItem(key,JSON.stringify(initial));localStorage.setItem('pocket-development-v1:pocket-last-view-v1',JSON.stringify({page:'learning'}));}},{key,initial});
      const page=await context.newPage(),errors=[];page.on('pageerror',error=>errors.push(error.message));await page.goto(origin,{waitUntil:'networkidle'});
      const records=page.locator('#learning-content .output-records'),entries=page.locator('#learning-content .current-task > .output-entries > button:visible');
      assert.deepEqual(await entries.locator(':scope > strong').allTextContents(),['逐题突破','训练内化','构建解题体系','自主刷题与实战']);
      const boxes=await entries.evaluateAll(nodes=>nodes.map(node=>{const box=node.getBoundingClientRect();return {left:box.left,width:box.width,top:box.top,bottom:box.bottom};}));
      assert.ok(boxes.every((box,index)=>box.left===boxes[0].left&&box.width===boxes[0].width&&(!index||box.top>=boxes[index-1].bottom)));
      assert.ok(await records.locator('.group-latest-metrics > div').evaluateAll(nodes=>nodes.every(node=>{const style=getComputedStyle(node);return style.backgroundColor==='rgba(0, 0, 0, 0)'&&style.borderTopWidth==='0px'&&style.paddingTop==='0px';})));
      const accuracy=records.locator('#group-latest-accuracy'),duration=records.locator('#group-latest-duration');
      const accuracyBox=await accuracy.boundingBox(),durationBox=await duration.boundingBox();
      assert.equal(accuracyBox.height,durationBox.height);
      if(width>300){assert.equal(accuracyBox.y,durationBox.y);assert.ok(durationBox.x>accuracyBox.x);}
      assert.equal(await records.locator('.group-latest-metrics .data-management-help').textContent(),'未填写');
      const read=()=>page.evaluate(key=>localStorage.getItem(key),key),before=await read();
      const fold=records.locator('#group-key-questions-panel');
      assert.equal(await fold.getAttribute('open'),null);await fold.locator(':scope > summary').click();assert.notEqual(await fold.getAttribute('open'),null);
      await fold.locator(':scope > summary').click();assert.equal(await fold.getAttribute('open'),null);assert.equal(await read(),before);
      await accuracy.fill('8/10');await duration.fill('12');
      assert.equal(await records.locator('.group-latest-metrics .data-management-help').textContent(),'80%（8/10）');
      const saved=JSON.parse(await read());
      const expected=JSON.parse(before);expected.materials[0].groups[0].latestAccuracyPercent=80;expected.materials[0].groups[0].latestAccuracyRatio='8/10';expected.materials[0].groups[0].latestDurationMinutes=12;
      assert.deepEqual(saved,expected);
      await page.reload({waitUntil:'networkidle'});assert.equal(await accuracy.inputValue(),'8/10');assert.equal(await duration.inputValue(),'12');
      assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));assert.deepEqual(errors,[]);
      await context.close();console.log(`PASS OUTPUT records ${width}px: lightweight wrappers, aligned inputs, save/reload, independent fold, unchanged entries and state.`);
    }
  }finally{await browser?.close();await new Promise(resolve=>server.close(resolve));}
})().catch(error=>{console.error(error);process.exitCode=1;});
