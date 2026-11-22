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
      const initial=seed(2);require('./helpers/original-learning-fixture.cjs')(initial,Date.now());
      const group=initial.materials[0].groups[0];group.runs.push({mode:'review',videoSkipped:true,outputCompleted:false,startedAt:Date.now(),completedAt:null});
      initial.currentSession={materialId:'m1',currentGroupIndex:0,currentRunIndex:group.runs.length-1,currentStep:'output',mode:'review',schedulerState:{phase:'review',newGroupIndex:0,reviewGroupIndex:0}};
      initial.videoLearning={version:1,records:[],guidance:{continuous:3,question:4,currentQuestion:12,questionStepVersion:3}};
      await context.addInitScript(({key,initial})=>{if(!localStorage.getItem(key)){localStorage.setItem(key,JSON.stringify(initial));localStorage.setItem('pocket-development-v1:pocket-last-view-v1',JSON.stringify({page:'home'}));}},{key,initial});
      const page=await context.newPage(),errors=[];page.on('pageerror',error=>errors.push(error.message));
      await page.goto(origin,{waitUntil:'networkidle'});
      assert.equal(await page.locator('#environment-banner').textContent(),'测试环境｜不会连接 Firebase');
      const read=()=>page.evaluate(key=>JSON.parse(localStorage.getItem(key)),key),before=await read();
      await page.locator('#home-video-shortcut').click();
      const notes=page.locator('#video-learning-entry > .video-note-test');
      assert.equal(await notes.count(),1);assert.equal(await notes.getAttribute('open'),null);
      assert.equal(await notes.evaluate(node=>node.previousElementSibling.tagName),'H3');
      assert.equal(await notes.locator(':scope > summary strong').textContent(),'笔记理解—自测机制');
      await notes.locator(':scope > summary').click();
      const notePanels=notes.locator('.video-note-test-panel'),noteTabs=notes.locator('.video-note-test-tabs button');
      assert.ok(await notePanels.nth(0).isVisible());
      assert.deepEqual(await notePanels.nth(0).locator('li > strong').allTextContents(),['AI 解释','当场出题','标记笔记','继续看课']);
      assert.equal(await notePanels.nth(0).locator('.video-note-test-tip p').textContent(),'当场出的题能够口述正确、说明理由和举出有效反例即可。不要复制检测题到笔记，也不要求在这一阶段深入理解。');
      for(let stage=0;stage<3;stage++){
        await noteTabs.nth(stage).click();
        assert.equal(await noteTabs.nth(stage).getAttribute('aria-pressed'),'true');
        assert.equal(await notePanels.filter({visible:true}).count(),1);
        assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
      }
      await noteTabs.nth(1).click();
      assert.deepEqual(await notePanels.nth(1).locator('li > strong').allTextContents(),['找到标记','重新出题','深入理解','保存题目']);
      const answers=notes.locator('.video-note-test-answers');assert.equal(await answers.getAttribute('open'),null);
      await answers.locator('summary').click();assert.ok(await answers.locator('p').isVisible());
      assert.equal(await answers.locator('p').textContent(),'A1–A3：由 AI 根据实际笔记生成对应答案。');
      await answers.locator('summary').click();assert.equal(await answers.getAttribute('open'),null);
      await noteTabs.nth(2).click();
      assert.deepEqual(await notePanels.nth(2).locator('li > strong').allTextContents(),['反复检测','核对答案','深入补强','一句话心得']);
      await notes.locator(':scope > summary').click();assert.equal(await notes.getAttribute('open'),null);
      assert.deepEqual(await read(),before,'guide interactions do not change learning state');
      const instructions=page.locator('#video-learning-entry > .video-stage-instructions'),instructionsSummary=instructions.locator(':scope > summary');
      assert.equal(await instructions.count(),1);assert.equal(await instructions.getAttribute('open'),null);
      assert.equal(await instructionsSummary.textContent(),'三阶段使用说明');
      assert.equal(await instructionsSummary.locator('svg[aria-hidden="true"]').count(),1);
      assert.equal(await instructions.evaluate(node=>node.previousElementSibling.className),'video-note-test');
      assert.equal(await instructions.evaluate(node=>node.nextElementSibling.textContent),'三个学习阶段');
      await instructionsSummary.click();assert.equal(await instructions.getAttribute('open'),'');
      assert.deepEqual(await instructions.locator('p').allTextContents(),[
        '① 连续看课：速通当前章节的视频，先了解整体内容。',
        '② 视频分段看：回到当前章节第一个视频，分段学习并独立重做',
        '③ 逐题突破：遇到卡题时进入，解决后继续阶段二解决当前章节第二个视频。',
        '完成规则','本章节视频学习完成后，进入分组循环训练。当前章节视频过多可分一批看完几个视频后进入阶段2/3，又回到阶段一解决当前章节的下一批视频。']);
      assert.deepEqual(await instructions.locator('p > strong').allTextContents(),['① 连续看课：','② 视频分段看：','③ 逐题突破：','完成规则']);
      const rule=instructions.locator('.video-stage-completion-rule');
      assert.equal(await rule.evaluate(node=>getComputedStyle(node).backgroundColor),'rgb(32, 38, 49)');
      assert.equal(await instructions.locator('button,details,a').count(),0);
      assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
      await instructionsSummary.click();assert.equal(await instructions.getAttribute('open'),null);
      await instructionsSummary.focus();await page.keyboard.press('Enter');assert.equal(await instructions.getAttribute('open'),'');
      await page.keyboard.press('Enter');assert.equal(await instructions.getAttribute('open'),null);
      assert.deepEqual(await read(),before);
      const entries=page.locator('#video-learning-entry > .video-learning-actions');
      const transition=page.locator('#video-learning-entry > .video-low-pressure'),transitionSummary=transition.locator(':scope > summary');
      assert.equal(await transition.count(),1);assert.equal(await transition.getAttribute('open'),null);
      assert.equal(await transitionSummary.textContent(),'低压力学习过渡（可选）');
      assert.equal(await transitionSummary.locator('svg[aria-hidden="true"]').count(),1);
      assert.equal(await transition.evaluate(node=>node.previousElementSibling.className),'video-learning-actions');
      assert.deepEqual(await entries.locator(':scope > button > .video-mode-number').allTextContents(),['01','02','03']);
      const transitionBefore=await read();
      await transitionSummary.click();assert.equal(await transition.getAttribute('open'),'');
      assert.deepEqual(await transition.locator('p').allTextContents(),['✏️ 抄写： 抄写笔记，先轻松动笔。','复述： 边抄边用自己的话讲出来。','思考： 边抄边想为什么这样做。','不要求抄完全部内容，进入状态后即可开始阶段二。']);
      assert.deepEqual(await transition.locator('p > strong').allTextContents(),['抄写：','复述：','思考：','不要求抄完全部内容，进入状态后即可开始阶段二。']);
      assert.equal(await transition.locator('button,input,textarea,a').count(),0);
      assert.equal(await transition.evaluate(node=>getComputedStyle(node).backgroundColor),'rgb(21, 27, 36)');
      assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
      await transitionSummary.click();assert.equal(await transition.getAttribute('open'),null);
      await transitionSummary.focus();await page.keyboard.press('Enter');assert.equal(await transition.getAttribute('open'),'');
      await page.keyboard.press('Enter');assert.equal(await transition.getAttribute('open'),null);
      assert.deepEqual(await read(),transitionBefore);
      assert.deepEqual(await entries.locator('button > .video-mode-heading strong').allTextContents(),['整章速通','分段看＋独立重做','逐题突破']);
      assert.equal(await page.locator('#video-learning-entry > h3').textContent(),'视频学习');
      assert.equal(await entries.locator('button svg[aria-hidden="true"]').count(),3);
      assert.deepEqual(await entries.locator('button > .video-mode-description').allTextContents(),[
        '阶段一：完整不暂停看完当前章节视频➡️截图录音➡️不重做',
        '阶段二：视频分段看➡️截图录音➡️自己重做',
        '阶段三：逐道题目重做➡️看视频讲解对标理解➡️复盘➡️进入到分组循环训练']);
      assert.ok(await entries.locator('button').evaluateAll(nodes=>nodes.every(node=>node.scrollWidth<=node.clientWidth)));
      const cards=await entries.locator('button').evaluateAll(nodes=>nodes.map(node=>{
        const box=node.getBoundingClientRect(),style=getComputedStyle(node);
        return {left:box.left,top:box.top,bottom:box.bottom,width:box.width,background:style.backgroundColor,radius:style.borderRadius};
      }));
      assert.ok(cards.every(card=>card.background==='rgb(25, 35, 49)'&&card.radius==='12px'&&card.left===cards[0].left&&card.width===cards[0].width));
      const actionBoxes=await entries.locator(':scope > *').evaluateAll(nodes=>nodes.map(node=>{const box=node.getBoundingClientRect();return {top:box.top,bottom:box.bottom,left:box.left,width:box.width};}));
      assert.equal(actionBoxes.length,3);assert.ok(actionBoxes.every(box=>box.left===cards[0].left&&box.width===cards[0].width));
      for(let index=1;index<actionBoxes.length;index++)assert.equal(actionBoxes[index].top-actionBoxes[index-1].bottom,8);
      assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
      if(process.env.POCKET_VIDEO_PREVIEW){fs.mkdirSync(process.env.POCKET_VIDEO_PREVIEW,{recursive:true});await page.locator('#home-video-panel').screenshot({path:path.join(process.env.POCKET_VIDEO_PREVIEW,`video-home-${width}.png`)});}
      await entries.getByRole('button',{name:'分段看＋独立重做',exact:true}).click();
      const view=page.locator('#video-learning-system'),operation=view.locator('.video-learning-operation');
      assert.equal(await view.locator('h1').textContent(),'分段看＋独立重做');
      assert.equal(await operation.locator(':scope > p').textContent(),'当前步骤 4/5');
      await view.locator('.practice-back').click();
      await entries.getByRole('button',{name:'整章速通',exact:true}).click();
      const titles=['第一步：完整观看视频','截图 + OneNote 录音','完成 0 基础学习'];
      const texts=['连续看完当前章节的视频，尽量不暂停、不重做，先了解本章节的知识和题型。\n\n视频过多时\n\n当前章节视频过多可分一批看完几个视频后进入阶段2/3，又回到阶段一解决当前章节的下一批视频。','截图有疑问的页面或者收获，添加到 OneNote，并录音记录疑问或收获。','当前章节的所有视频（多的分批）已经速通完成，马上进入阶段2分段看＋重做本章节的第一个视频。'];
      for(let index=0;index<3;index++){
        assert.equal(await operation.locator('h2').textContent(),titles[index]);
        assert.equal(await operation.locator(':scope > p').textContent(),`当前步骤 ${index+1}/3`);
        if(index===0){
          assert.deepEqual(await view.locator('.video-learning-description p').allTextContents(),texts[index].split('\n\n'));
          assert.equal(await view.locator('.video-learning-description > p').count(),1);
          const batch=view.locator('.video-learning-description > .video-intro-batch-note');
          assert.equal(await batch.count(),1);assert.ok(await batch.isVisible());
          assert.equal(await batch.locator('p > strong').textContent(),'视频过多时');
          assert.deepEqual(await batch.evaluate(node=>{const css=getComputedStyle(node);return [css.backgroundColor,css.borderRadius,css.padding];}),['rgb(32, 38, 49)','12px','12px']);
          assert.equal(await batch.locator('p').last().evaluate(node=>getComputedStyle(node).color),'rgb(165, 175, 190)');
          assert.equal(await operation.evaluate(node=>getComputedStyle(node).borderRadius),'16px');
          assert.equal(await batch.locator('button,details').count(),0);
          assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
        }else{
          assert.equal(await view.locator('.video-learning-description').textContent(),texts[index]);
          assert.equal(await view.locator('.video-intro-first-step,.video-intro-batch-note').count(),0);
        }
        assert.equal(await view.locator('.video-learning-preview h2').textContent(),titles[index+1] || '重新循环');
        assert.equal(await view.getByRole('button',{name:'进入视频分段＋重做学习',exact:true}).isVisible(),index===2);
        const state=await read();assert.equal(state.videoLearning.guidance.continuous,3);assert.equal(state.videoLearning.guidance.question,4);assert.equal(state.videoLearning.guidance.currentQuestion,12);
        if(index<2)await view.getByRole('button',{name:'进入下一步',exact:true}).click();
      }
      await page.reload({waitUntil:'networkidle'});
      assert.equal(await operation.locator(':scope > p').textContent(),'当前步骤 3/3');
      assert.equal(await view.locator('.video-learning-finished strong').textContent(),'当前章节的所有视频（多的分批）已经速通完成，马上进入阶段2分段看＋重做本章节的第一个视频。');
      await view.getByRole('button',{name:'进入视频分段＋重做学习',exact:true}).click();
      assert.equal(await view.locator('h1').textContent(),'分段看＋独立重做');
      assert.equal(await operation.locator(':scope > p').textContent(),'当前步骤 1/5');
      assert.equal(await operation.locator('h2').textContent(),'视频分段看');
      assert.equal(await view.locator('.video-instruction-fold').getAttribute('open'),null);
      await view.locator('.practice-back').click();assert.equal(await view.locator('h1').textContent(),'整章速通');
      assert.equal(await operation.locator(':scope > p').textContent(),'当前步骤 3/3');
      await page.locator('#pocket-home-button').click();
      if(!(await entries.isVisible()))await page.locator('#home-video-shortcut').click();
      await entries.getByRole('button',{name:'逐题突破',exact:true}).click();
      assert.equal(await operation.locator('h2').textContent(),'5、复盘');assert.equal(await view.locator('#video-current-question').inputValue(),'12');
      const questionContent=await view.locator('.video-learning-description').innerHTML();
      await page.locator('#pocket-home-button').click();await page.evaluate(()=>PocketLearning.resume());
      assert.equal(await page.locator('.current-task > .output-entries > button').filter({has:page.locator('strong',{hasText:'逐题突破'})}).locator('span').textContent(),'遇到一个有视频讲解的题目的学习（此操作仅供辅助参考，主要操作看下面的）');
      await page.locator('.current-task > .output-entries > button').filter({has:page.locator('strong',{hasText:'逐题突破'})}).click();
      assert.equal(await view.locator('.video-learning-description').innerHTML(),questionContent);
      await view.locator('.practice-back').click();assert.ok(await page.locator('.output-task-complete').isVisible());
      const after=await read();assert.equal(after.videoLearning.guidance.intro,2);
      delete before.videoLearning;delete after.videoLearning;assert.deepEqual(after,before);
      assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));assert.deepEqual(errors,[]);
      await context.close();console.log(`PASS ${width}px: three modes, intro text/reload/handoff, original positions, shared question entry and unchanged Group/Run`);
    }
  }finally{await browser?.close();await new Promise(resolve=>server.close(resolve));}
})().catch(error=>{console.error(error);process.exitCode=1;});
