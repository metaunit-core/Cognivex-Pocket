'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),http=require('node:http');
const {seed}=require('./helpers/pocket-learning-ui.cjs');
const playwright=require(path.join(path.dirname(process.execPath),'node_modules/playwright'));
const root=path.resolve(__dirname,'..'),prefix='pocket-development-v1:',key=prefix+'cognivex-pocket-state',legacyKey=prefix+'pocket-listening-start-v1',at=Date.now();
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
    for(const width of [320,390,1440])for(const profile of ['new','blank','running','paused','completed','corrupt','draft','review','history']){
      const context=await browser.newContext({viewport:{width,height:900}});
      await context.route('**/*',route=>route.request().url().startsWith(origin+'/')?route.continue():route.abort());
      const initial=seed(['new','blank','draft'].includes(profile)?0:2);
      if(initial.materials.length){
        require('./helpers/original-learning-fixture.cjs')(initial,at);
        const group=initial.materials[0].groups[0];group.runs.push({mode:'new',videoSkipped:true,outputCompleted:false,startedAt:at,completedAt:null});
        initial.currentSession={materialId:'m1',currentGroupIndex:0,currentRunIndex:group.runs.length-1,currentStep:'output',mode:'new',schedulerState:{phase:'new',newGroupIndex:0,reviewGroupIndex:0}};
      }
      if(profile==='draft')initial.currentSession={materialId:'legacy-draft',currentStep:'basic',mode:'new',currentGroupIndex:0,createdAt:at,draft:{subject:'生物',title:'保留中的设置',questionRange:'',groupSize:'',groups:[]}};
      if(profile==='review'){
        initial.currentSession=null;const group=initial.materials[0].groups[0];group.runs[group.runs.length-1].mode='review';
        initial.activeSessionType='material-review';initial.materialReviewSession={id:'review-fixture',queue:[{materialId:'m1',groupIndex:0}],currentIndex:0,materialId:'m1',currentGroupIndex:0,currentRunIndex:group.runs.length-1,currentStep:'output',mode:'review'};
      }
      const legacy=profile==='corrupt'?'invalid-json':JSON.stringify({old:{subject:'生物',localDate:'2026-10-09',status:['running','paused','completed'].includes(profile)?profile:'ready',startedAt:at-900000,endsAt:at+2700000,remainingMs:2700000,videoUrl:'https://example.test/old',future:{preserve:true}}});
      const view={page:['new','history'].includes(profile)?'home':'listening',subject:'生物',localDate:'2026-10-09'};
      await context.addInitScript(({key,legacyKey,initial,legacy,view,prefix})=>{
        if(!localStorage.getItem(key)){localStorage.setItem(key,JSON.stringify(initial));localStorage.setItem(legacyKey,legacy);localStorage.setItem(prefix+'pocket-last-view-v1',JSON.stringify(view));if(view.page==='home')localStorage.setItem(prefix+'pocket-view-history-v1',JSON.stringify([{page:'listening',subject:'生物',localDate:'2026-10-09'}]));}
        window.listeningIntervals=[];const original=setInterval;window.setInterval=(fn,delay,...args)=>{window.listeningIntervals.push({delay,source:String(fn)});return original(fn,delay,...args);};
      },{key,legacyKey,initial,legacy,view,prefix});
      const page=await context.newPage(),errors=[],requests=[];page.on('pageerror',error=>errors.push(error.message));page.on('request',request=>requests.push(request.url()));
      await page.goto(origin,{waitUntil:'networkidle'});
      const read=()=>page.evaluate(key=>localStorage.getItem(key),key);
      if(profile==='new'){
        await page.locator('#home-grouping-shortcut').click();const form=page.locator('#home-grouping-content');
        await form.locator('#subject').fill('生物');await form.locator('#title').fill('直接开始学习');await form.getByRole('button',{name:'下一步：分组设置',exact:true}).click();
        await form.locator('#question-range').fill('1-6');await form.locator('#group-size').fill('2');await form.getByRole('button',{name:'确认分组，开始学习',exact:true}).click();
        const created=JSON.parse(await read());assert.equal(created.materials.length,1);assert.equal(created.materials[0].groups.length,3);assert.equal(created.materials[0].groups[0].runs.length,1);assert.equal(created.currentSession.currentStep,'output');
      }
      if(profile==='history')await page.locator('#pocket-back-button').click();
      assert.equal(await page.locator('#listening-start-button,#listening-start-area,.listening-start,.listening-clock,[aria-label="泛听视频链接（可选）"]').count(),0);
      assert.equal(await page.getByText('泛听启动',{exact:true}).count(),0);assert.ok(!requests.some(url=>url.endsWith('/js/listening-start.js')));
      const before=await read(),current=JSON.parse(before);
      if(['blank','draft'].includes(profile)){
        assert.equal(current.currentSession.currentStep,'basic');assert.ok(await page.locator('#learning-content #subject').isVisible());
        if(profile==='draft')assert.equal(await page.locator('#learning-content #title').inputValue(),'保留中的设置');
      }else{
        assert.ok(await page.locator('.output-task-complete').isVisible());assert.equal(current[profile==='review'?'materialReviewSession':'currentSession'].currentStep,'output');
        if(profile!=='new')assert.deepEqual(current.currentSession,initial.currentSession);
      }
      assert.equal(await page.evaluate(key=>localStorage.getItem(key),legacyKey),legacy);
      for(let count=0;count<2;count++){
        await page.reload({waitUntil:'networkidle'});assert.equal(await read(),before);assert.equal(await page.evaluate(()=>PocketNavigation.current().page),'learning');
        await page.evaluate(()=>{window.dispatchEvent(new Event('focus'));window.dispatchEvent(new Event('pageshow'));document.dispatchEvent(new Event('visibilitychange'));});
        assert.equal(await read(),before);
      }
      await page.evaluate(()=>PocketNavigation.navigate({page:'listening',subject:'生物'}));assert.equal(await read(),before);
      await page.locator('#pocket-home-button').click();await page.locator('#start-button').click();assert.equal(await read(),before);
      assert.equal(await page.evaluate(key=>localStorage.getItem(key),legacyKey),legacy);
      assert.deepEqual(await page.evaluate(()=>window.listeningIntervals),[]);
      assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));assert.deepEqual(errors,[]);
      await context.close();console.log(`PASS listening removal ${width}px ${profile}: direct continuation, no timer/page, exact-once task, reload/back/focus and legacy data preservation.`);
    }
  }finally{await browser?.close();await new Promise(resolve=>server.close(resolve));}
})().catch(error=>{console.error(error);process.exitCode=1;});
