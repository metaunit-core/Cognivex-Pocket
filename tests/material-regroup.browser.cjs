'use strict';
const assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path'), http = require('node:http');
const {seed} = require('./helpers/pocket-learning-ui.cjs');
const playwright = require(path.join(path.dirname(process.execPath),'node_modules/playwright'));
const root = path.resolve(__dirname,'..'), key = 'pocket-development-v1:cognivex-pocket-state';
const server = http.createServer((request,response) => {
  const file = path.resolve(root,'.'+new URL(request.url,'http://localhost').pathname.replace(/\/$/,'/index.html'));
  if (!file.startsWith(root+path.sep)) return response.writeHead(403).end();
  try {
    response.setHeader('Content-Type',({'.js':'text/javascript','.css':'text/css','.html':'text/html'})[path.extname(file)] || 'text/plain');
    response.end(fs.readFileSync(file));
  } catch (_) { response.writeHead(404).end(); }
});
(async () => {
  await new Promise(resolve => server.listen(0,'127.0.0.1',resolve));
  let browser;
  try {
    const origin = `http://127.0.0.1:${server.address().port}`;
    browser = await playwright.chromium.launch({executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',headless:true});
    for (const width of [320,390,1440]) {
      const context = await browser.newContext({viewport:{width,height:900}});
      await context.route('**/*',route => route.request().url().startsWith(origin+'/') ? route.continue() : route.abort());
      const initial = seed(2), material = initial.materials[0];
      material.groups = Array.from({length:3},(_,index) => ({...structuredClone(material.groups[0]),id:'original-'+index,start:index*10+1,end:index*10+10}));
      material.questionRange='1-30';material.groupSize=10;material.totalGroups=3;
      require('./helpers/original-learning-fixture.cjs')(initial,Date.now());
      await context.addInitScript(({key,initial}) => {
        if (!localStorage.getItem(key)) {
          localStorage.setItem(key,JSON.stringify(initial));
          localStorage.setItem('pocket-development-v1:pocket-last-view-v1',JSON.stringify({page:'home'}));
        }
      },{key,initial});
      const page=await context.newPage(), errors=[];page.on('pageerror',error=>errors.push(error.message));
      await page.goto(origin,{waitUntil:'networkidle'});
      const read=()=>page.evaluate(key=>JSON.parse(localStorage.getItem(key)),key);
      const original=JSON.stringify((await read()).materials[0].groups);
      await page.locator('#learned-material-details').click();
      await page.getByRole('button',{name:'查看「资料1」资料详情',exact:true}).click();
      await page.getByRole('button',{name:'更改资料',exact:true}).click();
      assert.equal(await page.locator('#material-question-summary-panel').isVisible(),false);
      await page.getByRole('button',{name:'重点题号总结',exact:true}).click();
      const note='  第3题、7题\n解题心得：先分类。\n口诀与任意文字  ';
      await page.locator('#material-question-summary').fill(note);
      assert.equal((await read()).materials[0].questionSummary,note);
      await page.getByRole('button',{name:'重点题号总结',exact:true}).click();
      assert.equal(await page.locator('#material-question-summary-panel').isVisible(),false);
      await page.getByRole('button',{name:'重点题号总结',exact:true}).click();
      assert.equal(await page.locator('#material-question-summary').inputValue(),note);
      const positions=await page.locator('.material-summary-actions > button').evaluateAll(buttons=>buttons.map(button=>button.getBoundingClientRect().top));
      assert.equal(positions[0],positions[1]);
      const buttons=await page.locator('.material-summary-actions > button').evaluateAll(nodes=>nodes.map(node=>{
        const rect=node.getBoundingClientRect(),style=getComputedStyle(node),icon=getComputedStyle(node,'::before');
        return {width:rect.width,height:rect.height,top:rect.top,left:rect.left,color:style.color,iconColor:icon.backgroundColor,mask:icon.maskImage,iconWidth:icon.width};
      }));
      assert.equal(buttons.length,3);
      assert.ok(buttons.every(button=>Math.abs(button.width-buttons[0].width)<1 && button.height===buttons[0].height));
      assert.ok(buttons.every(button=>button.color==='rgb(232, 191, 98)' && button.iconColor===button.color && button.mask!=='none' && button.iconWidth==='20px'));
      if(width===1440){assert.ok(buttons.every(button=>button.top===buttons[0].top));assert.ok(Math.abs((buttons[1].left-buttons[0].left-buttons[0].width)-(buttons[2].left-buttons[1].left-buttons[1].width))<1);}
      assert.equal(await page.locator('#append-groups-panel').isVisible(),false);
      assert.equal(await page.locator('#review-regroup-panel').isVisible(),false);
      await page.getByRole('button',{name:'追加题目与分组',exact:true}).click();
      await page.locator('#append-question-range').fill('31-40');
      await page.locator('#append-group-size').fill('2');
      await page.getByRole('button',{name:'改分组情况',exact:true}).click();
      assert.ok(await page.getByText('最新题目总数：30；当前复习分组数量：3',{exact:true}).isVisible());
      await page.locator('#review-group-size').fill('0');
      assert.ok(await page.getByRole('button',{name:'确认重新分组',exact:true}).isDisabled());
      await page.locator('#review-group-size').fill('5');
      await page.getByRole('button',{name:'追加题目与分组',exact:true}).click();
      assert.equal(await page.locator('#append-groups-panel').isVisible(),false);
      assert.equal(await page.locator('#review-regroup-panel').isVisible(),true);
      await page.getByRole('button',{name:'改分组情况',exact:true}).click();
      assert.equal(await page.locator('#review-regroup-panel').isVisible(),false);
      await page.getByRole('button',{name:'追加题目与分组',exact:true}).click();
      await page.getByRole('button',{name:'改分组情况',exact:true}).click();
      assert.equal(await page.locator('#append-question-range').inputValue(),'31-40');
      assert.equal(await page.locator('#append-group-size').inputValue(),'2');
      assert.equal(await page.locator('#review-group-size').inputValue(),'5');
      assert.ok(await page.getByText('预计新分组数量：6',{exact:true}).isVisible());
      assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
      await page.getByRole('button',{name:'确认重新分组',exact:true}).click();
      assert.equal(JSON.stringify((await read()).materials[0].groups),original);
      await page.reload({waitUntil:'networkidle'});
      assert.equal((await read()).materials[0].questionSummary,note);
      assert.equal((await read()).materials[0].reviewGrouping.layouts[0].groups.length,6);
      await page.locator('#pocket-home-button').click();
      await page.locator('#daily-reverse-review-entry').click();
      let state=await read(), guard=0;
      assert.equal(state.dailyReverseReview.round.tasks.filter(task=>task.materialId==='m1').length,6);
      await page.locator('#group-key-questions-panel > summary').click();
      await page.locator('#group-key-questions input[data-question-number="3"]').check();
      await page.getByRole('button',{name:'加入重点复习系统',exact:true}).click();
      assert.equal((await read()).focusReview.questions[0].groupId,'original-0');
      while (!(state=await read()).dailyReverseReview.round.completedAt) {
        assert.ok(++guard<12);
        if (guard===3) {
          const checkpoint=state.dailyReverseReview.round.taskIndex;
          await page.reload({waitUntil:'networkidle'});
          assert.equal((await read()).dailyReverseReview.round.taskIndex,checkpoint);
          if (!await page.locator('#learning-content .current-task > button').filter({hasText:'输出达标 → 下一步'}).isVisible()) await page.locator('#daily-reverse-review-entry').click();
        }
        const complete=page.locator('#learning-content .current-task > button').filter({hasText:'输出达标 → 下一步'});
        if (!await complete.isVisible()) throw Error(JSON.stringify({guard,taskIndex:(await read()).dailyReverseReview.round.taskIndex,errors,text:await page.locator('#learning-content').innerText()}));
        await complete.click();
      }
      assert.equal((await read()).materials[0].groups.length,3);
      assert.equal((await read()).materials[0].questionSummary,note);
      const verification=await page.evaluate(async()=>{
        const backup=await PocketLearningBackup.create();
        return (await PocketLearningBackup.verify(JSON.stringify(backup))).valid;
      });
      assert.equal(verification,true);assert.deepEqual(errors,[]);
      await context.close();console.log(`PASS localhost isolated regroup/daily review/focus mapping/reload/backup; ${width}px; no overflow.`);
    }
  } finally { await browser?.close();await new Promise(resolve=>server.close(resolve)); }
})().catch(error=>{console.error(error);process.exitCode=1;});
