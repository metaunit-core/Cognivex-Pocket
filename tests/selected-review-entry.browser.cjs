'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),http=require('node:http'),os=require('node:os');
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
  const screenshots=fs.mkdtempSync(path.join(os.tmpdir(),'pocket-selected-review-'));
  try{
    const origin=`http://127.0.0.1:${server.address().port}`;
    browser=await playwright.chromium.launch({executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',headless:true});
    for(const width of [320,390,1440]){
      const context=await browser.newContext({viewport:{width,height:1000}});
      await context.route('**/*',route=>route.request().url().startsWith(origin+'/')?route.continue():route.abort());
      const initial=seed(2);require('./helpers/original-learning-fixture.cjs')(initial,Date.now());
      await context.addInitScript(({key,initial})=>{if(!localStorage.getItem(key)){localStorage.setItem(key,JSON.stringify(initial));localStorage.setItem('pocket-development-v1:pocket-last-view-v1',JSON.stringify({page:'home'}));}},{key,initial});
      const page=await context.newPage(),errors=[];page.on('pageerror',error=>errors.push(error.message));await page.goto(origin,{waitUntil:'networkidle'});
      const before=await page.evaluate(key=>localStorage.getItem(key),key),actions=page.locator('.today-review-actions');
      assert.deepEqual(await actions.locator('button').allTextContents(),['自主选择复习组合','正序复习全部','重点复习系统']);
      const buttons=await actions.locator('button').evaluateAll(nodes=>nodes.map(node=>{const rect=node.getBoundingClientRect();return {left:rect.left,top:rect.top,width:rect.width,height:rect.height};}));
      assert.equal(buttons.every(rect=>rect.height>=44),true);
      if(width===1440){assert.equal(buttons[0].top,buttons[1].top);assert.ok(buttons[0].left<buttons[1].left);assert.equal(buttons[0].width,buttons[1].width);}
      const animation=await page.evaluate(()=>['selected-review-entry','daily-reverse-review-entry','learned-material-details'].map(id=>{const node=document.getElementById(id),style=getComputedStyle(node);return {active:node.classList.contains('daily-review-attention'),name:style.animationName,duration:style.animationDuration,iterations:style.animationIterationCount};}));
      assert.equal(animation[0].active,true);assert.deepEqual(animation[0],animation[1]);assert.equal(animation[2].active,false);assert.equal(animation[2].name,'none');
      assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
      await page.screenshot({path:path.join(screenshots,`home-${width}.png`),fullPage:true});
      const lists=[];
      for(const id of ['selected-review-entry','learned-material-details','selected-review-entry']){
        await page.locator('#'+id).click();const dialog=page.locator('#materials-dialog');assert.equal(await dialog.isVisible(),true);
        lists.push(await dialog.locator('#material-list-items').textContent());
        assert.equal(await dialog.locator('input[data-material-id]').count(),2);
        await dialog.getByRole('button',{name:'关闭',exact:true}).click();assert.equal(await dialog.isVisible(),false);
        assert.equal(await page.evaluate(key=>localStorage.getItem(key),key),before);
      }
      assert.equal(lists.every(value=>value===lists[0]),true);
      await page.emulateMedia({reducedMotion:'reduce'});assert.equal(await page.locator('#selected-review-entry').evaluate(node=>getComputedStyle(node).animationName),'none');
      await page.reload({waitUntil:'networkidle'});assert.equal(await page.locator('#learned-material-details').evaluate(node=>node.classList.contains('daily-review-attention')),false);
      assert.deepEqual(errors,[]);await context.close();console.log(`PASS ${width}px: position, layout, same animation, shared modal, reload and unchanged data`);
    }
    console.log('Screenshots: '+screenshots);
  }finally{await browser?.close();await new Promise(resolve=>server.close(resolve));}
})().catch(error=>{console.error(error);process.exitCode=1;});
