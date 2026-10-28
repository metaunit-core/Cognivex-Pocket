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
    for(const width of [390,1440])for(const mode of ['normal','relearning']){
      const context=await browser.newContext({viewport:{width,height:900}});
      await context.route('**/*',route=>route.request().url().startsWith(origin+'/')?route.continue():route.abort());
      const initial=seed(1),group=initial.materials[0].groups[0];
      group.runs.push({mode:'review',videoSkipped:true,videoCompleted:false,outputCompleted:false,startedAt:Date.now(),completedAt:null});
      initial.currentSession={materialId:'m1',currentGroupIndex:0,currentRunIndex:group.runs.length-1,currentStep:'output',mode:'review',schedulerState:{phase:'review',newGroupIndex:0,reviewGroupIndex:0}};
      initial.activeSessionType='learning';
      await context.addInitScript(({key,initial})=>{
        if(!localStorage.getItem(key)){localStorage.setItem(key,JSON.stringify(initial));localStorage.setItem('pocket-development-v1:pocket-last-view-v1',JSON.stringify({page:'learning'}));}
      },{key,initial});
      const page=await context.newPage();await page.goto(origin,{waitUntil:'networkidle'});
      if(mode==='relearning'){
        await page.locator('#learned-material-details').click();await page.locator('#materials-dialog input[data-material-id="m1"]').check();await page.locator('#relearn-selected-materials').click();
      }
      const source=page.locator(mode==='normal'?'#pocket-main':'#relearning');
      await source.getByRole('button',{name:'输出',exact:true}).click();
      const entries=source.locator('.output-entry').filter({has:page.locator('strong')});
      assert.deepEqual(await entries.locator('strong').allTextContents(),['教学法','做题','知识点']);
      const saved=await page.evaluate(key=>localStorage.getItem(key),key);
      for(let attempt=0;attempt<2;attempt++){
        await page.evaluate(()=>scrollTo(0,document.body.scrollHeight));
        await entries.filter({has:page.locator('strong',{hasText:'教学法'})}).click();
        assert.equal(await source.isVisible(),false,`${mode} source must hide instead of stacking above teaching`);
        assert.ok(await page.locator('#output-sop').isVisible());
        const top=await page.locator('#output-methodology-view h1').boundingBox();assert.ok(top.y>=0&&top.y<220);
        assert.equal(await page.evaluate(()=>scrollY),0);
        assert.equal(await page.locator('.output-entry:visible').count(),0);
        assert.equal(await page.locator('.teaching-step').count(),5);
        assert.ok(await page.locator('.teaching-notes').isVisible());
        assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
        await page.locator('#output-sop > .practice-back').click();
        assert.ok(await source.isVisible());assert.equal(await entries.count(),3);
      }
      if(mode==='normal')for(const title of ['做题','知识点']){
        await entries.filter({has:page.locator('strong',{hasText:title})}).click();
        assert.ok(await page.locator('#output-model-home').isVisible());assert.equal(await source.isVisible(),false);
        await page.locator('#output-sop > .practice-back').click();assert.ok(await source.isVisible());
      }
      assert.equal(await page.evaluate(key=>localStorage.getItem(key),key),saved,'navigation never changes learning data');
      await context.close();
    }
    console.log('PASS localhost teaching navigation: normal/relearning, mobile/desktop, exclusive view/top scroll, return/reopen, original content, other entries and unchanged learning data.');
  }finally{await browser?.close();await new Promise(resolve=>server.close(resolve));}
})().catch(error=>{console.error(error);process.exitCode=1;});
