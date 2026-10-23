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
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  const origin=`http://127.0.0.1:${server.address().port}`;let browser;
  try{
    browser=await playwright.chromium.launch({executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',headless:true});
    for(const width of [320,390,768,1440]){
      const context=await browser.newContext({viewport:{width,height:1024}});
      await context.route('**/*',route=>route.request().url().startsWith(origin+'/')?route.continue():route.abort());
      const initial=seed(2);initial.materials[0].status='learning';
      initial.currentSession={materialId:'m1',currentGroupIndex:0,currentRunIndex:0,currentStep:'output',mode:'new',schedulerState:{phase:'new',newGroupIndex:0,reviewGroupIndex:0}};
      await context.addInitScript(({key,initial})=>{
        localStorage.setItem(key,JSON.stringify(initial));
        localStorage.setItem('pocket-development-v1:pocket-last-view-v1',JSON.stringify({page:'learning',outputPage:'questions'}));
      },{key,initial});
      const page=await context.newPage();await page.goto(origin,{waitUntil:'networkidle'});
      const before=await page.evaluate(key=>localStorage.getItem(key),key);
      for(const name of ['做题','知识点']){
        await page.locator('#learning-content .output-entry').filter({has:page.locator('strong',{hasText:new RegExp('^'+name+'$')})}).click();
        assert.equal(await page.locator('#output-model-home .output-version-entry').first().evaluate(el=>getComputedStyle(el).backgroundImage),'none','other entry styles remain unchanged');
        await page.locator('.output-operational-entry').click();
        const entry=page.locator('#output-operational-view .output-situations-entry');
        await page.mouse.move(0,100);
        await page.waitForFunction(()=>getComputedStyle(document.querySelector('#output-operational-view .output-situations-entry')).borderTopColor==='rgb(189, 135, 29)');
        assert.equal(await entry.locator('strong').textContent(),'当前情况导航 →');
        assert.equal(await entry.locator('.situations-entry-text > span').textContent(),'按遇到的情况，快速找到对应操作');
        assert.equal(await entry.locator('svg').count(),2);assert.equal(await entry.locator('img,button,a').count(),0);
        const style=await entry.evaluate(el=>{
          const css=getComputedStyle(el),title=getComputedStyle(el.querySelector('strong'));
          const parts=[...el.children].map(n=>{const r=n.getBoundingClientRect();return {left:r.left,right:r.right,top:r.top,bottom:r.bottom};});
          return {display:css.display,padding:css.padding,gap:css.gap,border:css.borderTopColor,radius:css.borderRadius,minHeight:css.minHeight,titleSize:title.fontSize,titleColor:title.color,parts};
        });
        assert.equal(style.display,'flex');assert.equal(style.border,'rgb(189, 135, 29)');assert.equal(style.titleColor,'rgb(255, 218, 118)');
        assert.equal(style.titleSize,width<=600?'18px':'27px');assert.equal(style.padding,width<=600?'14px':'20px 24px');
        assert.equal(style.gap,width<=600?'12px':'22px');assert.equal(style.radius,width<=600?'15px':'18px');assert.equal(style.minHeight,width<=600?'90px':'116px');
        assert.ok(style.parts[0].right<=style.parts[1].left&&style.parts[1].right<=style.parts[2].left);
        assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
        if(name==='做题'&&(width===390||width===768))await page.screenshot({path:path.join(__dirname,'artifacts',`output-situations-gold-${width}.png`),fullPage:true});
        await entry.focus();await page.keyboard.press('Tab');await page.keyboard.press('Shift+Tab');
        assert.ok(await entry.evaluate(el=>document.activeElement===el));
        assert.notEqual(await entry.evaluate(el=>getComputedStyle(el).outlineStyle),'none');
        await page.keyboard.press('Enter');
        assert.ok(await page.locator('#output-situations-view').isVisible());
        assert.equal(await page.locator('#output-situations-view h1').textContent(),'当前情况导航');
        await page.locator('#output-sop > .practice-back').click();
        assert.ok(await entry.isVisible());
        await page.emulateMedia({reducedMotion:'reduce'});
        await entry.hover();assert.equal(await entry.evaluate(el=>getComputedStyle(el).transform),'none');
        assert.equal(await entry.evaluate(el=>getComputedStyle(el).transitionDuration),'0s');
        await page.emulateMedia({reducedMotion:'no-preference'});
        await page.locator('#pocket-home-button').click();await page.evaluate(()=>PocketLearning.resume());
      }
      assert.equal(await page.evaluate(key=>localStorage.getItem(key),key),before);await context.close();
    }
    console.log('PASS localhost gold entry: exact labels/colors/sizes, inline SVGs, single keyboard-accessible navigation, 320/390/768/1440px non-overlap, reduced motion, other cards and learning state unchanged.');
  }finally{await browser?.close();await new Promise(resolve=>server.close(resolve));}
})().catch(error=>{console.error(error);process.exitCode=1;});
