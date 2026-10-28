'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),http=require('node:http');
const {seed}=require('./helpers/pocket-learning-ui.cjs');
const playwright=require(path.join(path.dirname(process.execPath),'node_modules/playwright'));
const root=path.resolve(__dirname,'..'),key='pocket-development-v1:cognivex-pocket-state';
const expected=[
 '我的训练体系','能力链模型｜明确练什么','根据不同学科、领域的目标，拆解需要的具体能力，明确薄弱表现与达标标准。',
 'OUTPUT｜明确怎么练','通过通用的做题 OUTPUT 和知识点 OUTPUT 思考框架，训练独立思考、理解、输出、内化和迁移能力。',
 '刷题与检测｜验证是否达标','在真实任务中训练和检测，发现具体能力断点，针对性补强，直到达到目标标准。',
 '核心原则｜通用框架 × 专项能力','OUTPUT｜通用思考框架','提供跨学科通用的思考、学习、内化与输出训练方法，解决「怎么练」。','＋',
 '能力链模型｜学科领域专项适配','根据不同学科、领域的目标，明确需要的具体能力及达标标准，解决「练什么、练到什么程度」。',
 '通用思考框架 × 领域专项能力','针对性训练 → 实际检测 → 定位断点 → 补强至达标'];
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
  for(const width of [320,390,768,1440]){
   const context=await browser.newContext({viewport:{width,height:1024}});
   await context.route('**/*',route=>route.request().url().startsWith(origin+'/')?route.continue():route.abort());
   await context.addInitScript(({key,initial})=>{localStorage.setItem(key,JSON.stringify(initial));localStorage.setItem('pocket-development-v1:pocket-last-view-v1',JSON.stringify({page:'home'}));},{key,initial:seed(2)});
   const page=await context.newPage();await page.goto(origin,{waitUntil:'networkidle'});
   const before=await page.evaluate(key=>localStorage.getItem(key),key);
   assert.equal(await page.locator('#practice-readiness-button').textContent(),'学习训练总纲-是否可以进入大量刷题和阶段测试？');
   assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
   await page.locator('#practice-readiness-button').click();
   assert.equal(await page.locator('#training-overview-title').textContent(),'学习训练总纲');
   const overview=page.locator('#training-overview'),card=overview.locator('.training-system-explanation');
   assert.deepEqual(await overview.locator(':scope > *').evaluateAll(nodes=>nodes.map(n=>n.tagName)),['H1','SECTION','SECTION','SECTION','SECTION']);
   assert.deepEqual(await card.locator('h2,h3,h4,p,strong').allTextContents(),expected);
   assert.equal(await card.locator('button,input,a').count(),0,'static explanation introduces no operations');
   const originals=overview.locator(':scope > .practice-condition');
   assert.deepEqual(await originals.locator('h2').allTextContents(),['构建学科能力链模型','大量刷题','模拟检测']);
   assert.deepEqual(await originals.locator('p').allTextContents(),['给后续刷题和检测建立能力锚点','简单 / 边界 / 难题分组训练','全真检测 → 找断点 → 专题突破']);
   assert.deepEqual(await originals.locator('button').allTextContents(),['开始构建 →','进入大量刷题 →','查看检测 SOP →']);
   const boxes=await overview.locator(':scope > *').evaluateAll(nodes=>nodes.map(n=>{const r=n.getBoundingClientRect();return {top:r.top,bottom:r.bottom,width:r.width};}));
   for(let i=1;i<boxes.length;i++)assert.ok(boxes[i].top>=boxes[i-1].bottom,'no card/module overlap');
   assert.equal(boxes[2].width,boxes[3].width);assert.equal(boxes[3].width,boxes[4].width);
   assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
   if(width===390||width===768)await page.screenshot({path:path.join(__dirname,'artifacts',`training-system-explanation-${width}.png`),fullPage:true});
   await page.locator('#training-build').click();assert.ok(await page.locator('#training-model').isVisible());
   await page.locator('#training-back').click();assert.ok(await overview.isVisible());
   await page.locator('#training-practice').click();assert.ok(await page.locator('#practice-tool').isVisible());
   await page.locator('#pocket-back-button').click();assert.ok(await overview.isVisible());
   await page.locator('#training-simulation').click();assert.ok(await page.locator('#training-detection').isVisible());
   await page.locator('#training-detection-overview').click();assert.ok(await overview.isVisible());
   await page.locator('#pocket-home-button').click();assert.ok(await page.locator('#pocket-main').isVisible());
   assert.equal(await page.evaluate(key=>localStorage.getItem(key),key),before);await context.close();
  }
  console.log('PASS localhost training explanation: exact static text/order, original three modules/buttons/navigation, 320/390/768/1440px wrapping and no overlaps, unchanged learning state.');
 }finally{await browser?.close();await new Promise(resolve=>server.close(resolve));}
})().catch(error=>{console.error(error);process.exitCode=1;});
