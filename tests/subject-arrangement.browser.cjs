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
      await context.addInitScript(({key,initial})=>{
        if(!localStorage.getItem(key)){localStorage.setItem(key,JSON.stringify(initial));localStorage.setItem('pocket-development-v1:pocket-last-view-v1',JSON.stringify({page:'home'}));}
      },{key,initial:seed(2)});
      const page=await context.newPage(),errors=[];page.on('pageerror',error=>errors.push(error.message));
      await page.goto(origin,{waitUntil:'networkidle'});
      assert.equal(await page.locator('#environment-banner').textContent(),'测试环境｜不会连接 Firebase');
      assert.deepEqual(await page.locator('#home-shortcuts button span').allTextContents(),['已学内容','今日复习','视频学习','新增资料分组']);
      await page.locator('#home-learned-shortcut').click();
      const section=page.locator('#home-learned-panel #subject-arrangement'),summary=section.locator(':scope > summary');
      assert.equal(await section.count(),1);assert.equal(await summary.textContent(),'学科安排');
      assert.equal(await section.getAttribute('open'),null);
      const before=await page.evaluate(key=>localStorage.getItem(key),key);
      await summary.click();
      assert.equal(await section.getAttribute('open'),'');
      assert.deepEqual(await section.locator('h3').allTextContents(),['第一阶段：集中完成理科新课','第二阶段：多科穿插学习']);
      assert.deepEqual(await section.locator('p').allTextContents(),[
        '按学科推进','集中学习数学新课，英语作为搭配科目。','数学新课完成后，集中学习物理新课。',
        '物理新课完成后，集中学习化学新课。','最后集中完成生物新课。','四门理科新课全部完成',
        '四组搭配每天轮换，进入综合复习、刷题、补漏与能力训练。','检查本周学习情况']);
      assert.deepEqual(await section.locator('h4').allTextContents(),[
        '1、数学 + 英语','2、物理 + 语文','3、化学 + 英语','4、生物 + 语文',
        '周一｜第 1 组｜数学 + 英语','周二｜第 2 组｜物理 + 语文','周三｜第 3 组｜化学 + 英语','周四｜第 4 组｜生物 + 语文',
        '周五｜数学 + 英语','周六｜物理 + 语文','周日 · 检测']);
      assert.equal(await section.locator('.subject-arrangement-check').count(),1);
      assert.equal(await page.locator('#pocket-main').isVisible(),true);
      assert.equal(await section.locator('button,a').count(),0);
      assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
      await summary.click();assert.equal(await section.getAttribute('open'),null);
      await summary.focus();await page.keyboard.press('Enter');assert.equal(await section.getAttribute('open'),'');
      await page.locator('#home-review-shortcut').click();assert.equal(await section.isVisible(),false);
      await page.locator('#home-learned-shortcut').click();assert.equal(await section.getAttribute('open'),'');
      for(const id of ['start-review-button','practice-readiness-button','learned-material-details','device-principles-entry'])assert.equal(await page.locator('#'+id).count(),1);
      assert.equal(await page.evaluate(key=>localStorage.getItem(key),key),before);
      await page.reload({waitUntil:'networkidle'});await page.locator('#home-learned-shortcut').click();
      assert.equal(await section.getAttribute('open'),'');assert.deepEqual(errors,[]);
      await context.close();console.log(`PASS ${width}px: exact content, independent fold/keyboard, four shortcuts, existing navigation restore, unchanged learning data, no overflow/errors`);
    }
  }finally{await browser?.close();await new Promise(resolve=>server.close(resolve));}
})().catch(error=>{console.error(error);process.exitCode=1;});
