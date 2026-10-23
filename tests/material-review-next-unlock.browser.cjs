'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),http=require('node:http');
const {seed}=require('./helpers/pocket-learning-ui.cjs');
const playwright=require(path.join(path.dirname(process.execPath),'node_modules/playwright'));
const root=path.resolve(__dirname,'..'),key='pocket-development-v1:cognivex-pocket-state';
const server=http.createServer((request,response)=>{
  const file=path.resolve(root,'.'+new URL(request.url,'http://localhost').pathname.replace(/\/$/,'/index.html'));
  if(!file.startsWith(root+path.sep)){response.writeHead(403).end();return;}
  try{response.setHeader('Content-Type',({'.js':'text/javascript','.css':'text/css','.html':'text/html'})[path.extname(file)]||'text/plain');response.end(fs.readFileSync(file));}
  catch(_){response.writeHead(404).end();}
});
(async()=>{
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  const origin=`http://127.0.0.1:${server.address().port}`;
  const browser=await playwright.chromium.launch({executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',headless:true});
  try{
    for(const viewport of [{width:390,height:844},{width:768,height:1024},{width:1440,height:900}]){
      const context=await browser.newContext({viewport});
      await context.route('**/*',route=>route.request().url().startsWith(origin+'/')?route.continue():route.abort());
      const initial=seed(3);initial.materials[2].title='历史快捷资料';initial.materials[2].groups[0].runs=[];
      await context.addInitScript(({key,initial})=>{
        if(!localStorage.getItem(key)){localStorage.setItem(key,JSON.stringify(initial));localStorage.setItem('pocket-development-v1:pocket-last-view-v1',JSON.stringify({page:'home'}));}
      },{key,initial});
      const page=await context.newPage();await page.goto(origin,{waitUntil:'networkidle'});
      const read=()=>page.evaluate(key=>JSON.parse(localStorage.getItem(key)),key);
      const taskButton=text=>page.locator('#learning-content .current-task > button').filter({hasText:text});
      const canCreate=()=>page.evaluate(key=>window.PocketMaterialReview.canCreate(JSON.parse(localStorage.getItem(key))),key);
      const changeDay=offset=>page.evaluate(offset=>{const date=new Date();date.setDate(date.getDate()+offset);window.PocketDailyTestDate.set(`${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')}`);},offset);
      await changeDay(1);assert.equal(await canCreate(),false);
      await page.locator('#daily-reverse-review-entry').click();
      let limit=0;while(!(await read()).dailyReverseReview.round.completedAt){
        assert.ok(++limit<30);
        await taskButton('输出达标 → 下一步').click();
      }
      const learned=[];
      for(const title of ['不等式','减数分裂','运动']){
        if(!await page.locator('#subject').isVisible())await page.locator('#start-button').click();
        await page.locator('#subject').fill('数学');await page.locator('#title').fill(title);
        await page.getByRole('button',{name:'下一步：分组设置',exact:true}).click();
        await page.locator('#question-range').fill('1-6');await page.locator('#group-size').fill('2');
        await page.getByRole('button',{name:'确认分组，开始学习',exact:true}).click();
        const skip=page.getByRole('button',{name:'跳过泛听，直接开始学习',exact:true});if(await skip.isVisible())await skip.click();
        limit=0;const assignments=[];
        while((await read()).currentSession.currentStep!=='materialComplete'){
          assert.ok(++limit<50);const session=(await read()).currentSession;
          if(session.currentStep==='output')assignments.push([session.currentGroupIndex,session.mode]);
          await taskButton(session.currentStep==='output'?'输出达标 → 下一步':'继续').click();
        }
        assert.deepEqual(assignments,[[0,'new'],[1,'new'],[0,'review'],[1,'review'],[2,'new'],[0,'review'],[1,'review'],[2,'review']]);
        learned.push((await read()).materials.at(-1).id);assert.equal(await canCreate(),false);
        await page.getByRole('button',{name:'开始下一份资料',exact:true}).click();
        assert.deepEqual((await read()).materialReviewSession.materialIds,[...learned].reverse());
        await page.locator('#group-key-questions-panel > summary').click();
        await page.locator('#group-latest-accuracy').fill('2/3');await page.locator('#group-latest-duration').fill('8');
        await taskButton('输出达标 → 下一步').click();
        const frozen=JSON.stringify((await read()).materialReviewSession);
        if(learned.length===3)await changeDay(2);
        await page.reload({waitUntil:'networkidle'});assert.equal(JSON.stringify((await read()).materialReviewSession),frozen);assert.equal(await canCreate(),false);
        limit=0;while((await read()).materialReviewSession.currentStep!=='queueComplete'){
          assert.ok(++limit<30);assert.equal(await canCreate(),false);await taskButton('输出达标 → 下一步').click();
        }
        if(learned.length<3)assert.equal(await canCreate(),true);else assert.equal(await canCreate(),false);
        await page.getByRole('button',{name:'返回当前学习',exact:true}).click();
      }
      await page.locator('#daily-reverse-review-entry').click();
      assert.deepEqual((await read()).dailyReverseReview.round.ids,[...initial.materials.map(material=>material.id),...learned]);
      console.log(`PASS localhost Chromium ${viewport.width}: original three-Group learning, completion-button reverse handoff, D/E→D/F→E→D, whole-round lock, metrics, refresh/cross-day and all-history next-day daily.`);
      await context.close();
    }
  }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;}).finally(()=>server.close());
