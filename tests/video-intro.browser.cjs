'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),http=require('node:http');
const {seed}=require('./helpers/pocket-learning-ui.cjs');
const playwright=require(path.join(path.dirname(process.execPath),'node_modules/playwright'));
const root=path.resolve(__dirname,'..'),key='pocket-development-v1:cognivex-pocket-state';
async function assertDynamicCard(panel){
  assert.deepEqual(await panel.evaluate(node=>{const css=getComputedStyle(node);return [css.backgroundColor,css.borderTopColor,css.borderTopWidth,css.borderRadius,css.padding,css.color,css.boxShadow];}),['rgb(48, 39, 25)','rgb(169, 138, 76)','1px','12px','16px','rgb(245, 247, 252)','none']);
  assert.ok(await panel.locator('h3,p:first-child > strong').evaluateAll(nodes=>nodes.every(node=>getComputedStyle(node).color==='rgb(232, 191, 98)')));
  assert.ok(await panel.locator('blockquote,p:not(:first-child)').evaluateAll(nodes=>nodes.filter(node=>node.tagName==='BLOCKQUOTE'||node.parentElement.classList.contains('video-intro-selection-panel')).every(node=>{const css=getComputedStyle(node);return css.backgroundColor==='rgb(38, 43, 51)'&&css.borderLeftColor==='rgb(232, 198, 107)';})));
}
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
      const noteTemplate=notePanels.nth(1).locator('li').nth(1).getByRole('button',{name:'查看 AI 提问模板',exact:true});
      assert.equal(await noteTemplate.evaluate(node=>node.previousElementSibling.textContent),'再次复制对应笔记给 AI，让 AI 直接出题，自己口述回答并接受判断。');
      await noteTemplate.click();assert.ok(await page.locator('#training-recall-template').isVisible());
      const sharedRecallTemplate=await page.locator('#active-recall-template').inputValue();
      await page.locator('#training-back').click();assert.ok(await notePanels.nth(1).isVisible());
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
        '① 连续看课：速通当前知识模块（视频个数具体决定），先了解整体内容。',
        '② 视频分段看：马上进入第一个分段学习并独立重做',
        '③ 逐题突破：遇到卡题时进入，所有解决后，当前资料进入到分组循环。']);
      assert.deepEqual(await instructions.locator('p > strong').allTextContents(),['① 连续看课：','② 视频分段看：','③ 逐题突破：']);
      assert.equal(await instructions.locator('.video-stage-completion-rule').count(),0);
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
      assert.deepEqual(await entries.locator('button > .video-mode-heading strong').allTextContents(),['知识模块速通','分段看＋独立重做','逐题突破']);
      assert.equal(await page.locator('#video-learning-entry > h3').textContent(),'视频学习');
      assert.equal(await entries.locator('button svg[aria-hidden="true"]').count(),3);
      assert.deepEqual(await entries.locator('button > .video-mode-description').allTextContents(),[
        '阶段一：完整不暂停看完当前知识模块视频➡️截图录音➡️不重做',
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
      assert.equal(await operation.locator(':scope > p').textContent(),'当前步骤 3/4');
      assert.equal(await operation.locator('h2').textContent(),'独立重做');
      assert.equal(await operation.locator('.video-mastery-card p').textContent(),'能独立重做出来，并且自己可以像老师一样教清楚思路。');
      assert.equal(await view.locator('#video-learning-route li').count(),4);
      await view.getByRole('button',{name:'上一步',exact:true}).click();
      assert.equal(await operation.locator(':scope > p').textContent(),'当前步骤 2/4');
      assert.equal(await operation.locator('h2').textContent(),'出题检测与解决标记');
      assert.deepEqual(await view.locator('.video-segment-detection h3').allTextContents(),['① 找到标记','② 重新出题','③ 深入理解','④ 保存题目','重点提示：','完成标准：','补充说明：']);
      assert.deepEqual(await view.locator('.video-segment-detection p,.video-segment-detection blockquote,.video-segment-detection li').allTextContents(),['重点查看阶段一标记了「阶段2重新检测」的讲义笔记，以及尚未解决的疑问。','再次复制对应笔记给 AI，让 AI 直接出题。','自己先口述回答、解释理由，再让 AI 判断是否真正理解。','向 AI 提问：','「根据笔记内容，出几道关键的题目让我可以透彻理解笔记的。」','自己尝试回答，遇到不理解的地方，继续向 AI 提问，直到能够独立解释。','将值得保留的 AI 检测题目与答案解析复制到对应讲义笔记旁边。','题目集中放在上方。','参考答案与解析集中放在最下方。','方便以后遮住答案，独立检测和复习重做。','阶段一标记的问题已经重新检测；重要疑问能够独立解释；值得复习的关键问题已保存。','如果当前分段没有需要重新检测的标记，也没有值得深入理解的关键笔记，可以直接跳过本步骤，进入独立重做。']);
      assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
      const detection=view.locator('.video-segment-detection'),detectionTabs=detection.locator('.video-segment-tabs button'),detectionPanels=detection.locator('.video-segment-panel');
      const detectionText=await detection.locator('h3,p,blockquote,li').allTextContents(),detectionState=await read();
      assert.deepEqual(await detectionTabs.allTextContents(),['① 找到标记','② 重新出题','③ 深入理解','④ 保存题目']);
      assert.deepEqual(await detectionTabs.evaluateAll(nodes=>nodes.map(node=>node.getAttribute('aria-pressed'))),['true','false','false','false']);
      assert.ok(await detectionPanels.nth(0).isVisible());
      await assertDynamicCard(detectionPanels.nth(0));
      for(const chosen of [1,2,3,0]){
        await detectionTabs.nth(chosen).click();
        assert.ok(await detectionPanels.nth(chosen).isVisible());assert.equal(await detectionPanels.filter({visible:true}).count(),1);
        await assertDynamicCard(detectionPanels.nth(chosen));
        assert.equal(await detectionTabs.nth(chosen).getAttribute('aria-pressed'),'true');
        assert.equal(await detection.locator('.video-segment-info:visible').count(),3);
        assert.deepEqual(await detection.locator('h3,p,blockquote,li').allTextContents(),detectionText);
        assert.deepEqual(await read(),detectionState,'operation switching is UI-only');
        if(chosen===2)assert.ok(await detectionPanels.nth(2).locator('blockquote').isVisible());
        assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
      }
      assert.ok(await detectionTabs.evaluateAll(nodes=>{const boxes=nodes.map(node=>node.getBoundingClientRect());return boxes[0].top===boxes[1].top&&boxes[2].top===boxes[3].top&&boxes[2].top>boxes[0].top&&boxes.every(box=>Math.abs(box.width-boxes[0].width)<1&&box.height===boxes[0].height);}));
      assert.deepEqual(await detection.locator('.video-segment-info').evaluateAll(nodes=>nodes.map(node=>getComputedStyle(node).backgroundColor)),['rgb(25, 47, 67)','rgb(36, 48, 47)','rgb(35, 44, 56)']);
      await detectionTabs.nth(1).click();
      await detectionPanels.nth(1).getByRole('button',{name:'查看 AI 提问模板',exact:true}).click();
      assert.ok(await page.locator('#training-recall-template').isVisible());
      assert.equal(await page.locator('#active-recall-template').inputValue(),sharedRecallTemplate);
      await page.locator('#training-back').click();
      assert.equal(await operation.locator(':scope > p').textContent(),'当前步骤 2/4');
      assert.equal(await detectionTabs.nth(1).getAttribute('aria-pressed'),'true');
      assert.ok(await detectionPanels.nth(1).isVisible());
      assert.deepEqual(await read(),detectionState);
      await page.reload({waitUntil:'networkidle'});
      assert.equal(await operation.locator(':scope > p').textContent(),'当前步骤 2/4');
      assert.equal(await detectionTabs.first().getAttribute('aria-pressed'),'true');
      if(process.env.POCKET_VIDEO_PREVIEW)await page.screenshot({path:path.join(process.env.POCKET_VIDEO_PREVIEW,`video-segment-detection-${width}.png`),fullPage:true});
      await view.getByRole('button',{name:'进入下一步',exact:true}).click();
      await view.getByRole('button',{name:'进入下一步',exact:true}).click();
      assert.equal(await operation.locator(':scope > p').textContent(),'当前步骤 4/4');
      assert.equal(await operation.locator('h2').textContent(),'卡住的题目进入逐题突破');
      await view.getByRole('button',{name:'上一步',exact:true}).click();
      await view.locator('.practice-back').click();
      if(!await entries.isVisible())await page.locator('#home-video-shortcut').click();
      await entries.getByRole('button',{name:'知识模块速通',exact:true}).click();
      const titles=['第一步：完整观看视频','收获速记与问题筛选','完成速通学习'];
      const texts=['如何判断观看的视频数量？\n\n默认：\n\n看完一个视频，立即进入阶段二。\n\n内容较少且相互关联：\n\n可以连续看几个视频。\n\n内容较多、难度较大：\n\n一个视频也可以拆分学习。\n\n判断标准：\n\n关掉视频，能否大致回忆刚才老师讲的知识和解题思路？如果已经开始模糊，就停止速通，进入阶段二。\n\n核心原则：\n\n学多少取决于能消化多少，而不是能看多少。','截图有疑问的页面或者收获，添加到 OneNote，并录音记录疑问或收获。','当前知识模块已经速通完成，立即进入阶段二，进行分段看＋独立重做。'];
      for(let index=0;index<3;index++){
        assert.equal(await operation.locator('h2').textContent(),titles[index]);
        assert.equal(await operation.locator(':scope > p').textContent(),`当前步骤 ${index+1}/3`);
        if(index===0){
          assert.deepEqual(await view.locator('.video-learning-description h3,.video-learning-description p').allTextContents(),texts[index].split('\n\n'));
          assert.equal(await view.locator(':scope > .video-module-advice').count(),0);
          assert.equal(await view.locator('.video-intro-batch-note').count(),0);
          assert.equal(await view.locator('.video-learning-description .video-module-advice').count(),1);
          assert.deepEqual(await view.locator('.video-module-advice strong').allTextContents(),['默认：','内容较少且相互关联：','内容较多、难度较大：','判断标准：','核心原则：']);
          assert.equal(await operation.evaluate(node=>getComputedStyle(node).borderRadius),'16px');
          assert.equal(await view.locator('.video-module-advice button,.video-module-advice details').count(),0);
          const advice=view.locator('.video-module-advice');
          const boxes=await advice.locator('.video-module-situation').evaluateAll(nodes=>nodes.map(node=>{const box=node.getBoundingClientRect();return {left:box.left,right:box.right,top:box.top,bottom:box.bottom,width:box.width,height:box.height};}));
          assert.equal(boxes.length,3);assert.ok(boxes[0].bottom<=boxes[1].top);
          assert.equal(boxes[1].top,boxes[2].top);assert.equal(boxes[1].width,boxes[2].width);assert.equal(boxes[1].height,boxes[2].height);
          assert.ok(boxes[1].right<boxes[2].left);assert.ok(Math.abs(boxes[0].width-(boxes[2].right-boxes[1].left))<1);
          assert.equal(await advice.locator('.video-mastery-card').count(),1);
          assert.equal(await advice.locator('.video-mastery-card hr').count(),1);
          assert.deepEqual(await advice.locator('.video-mastery-card').evaluate(node=>{const css=getComputedStyle(node);return [css.backgroundColor,css.borderTopColor,css.borderRadius];}),['rgb(48, 39, 25)','rgb(169, 138, 76)','12px']);
          assert.ok(await advice.locator('.video-module-situation,.video-mastery-card').evaluateAll(nodes=>nodes.every(node=>node.scrollWidth<=node.clientWidth)));
          assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
        }else if(index===1){
          assert.deepEqual(await view.locator('.video-intro-selection h3,.video-intro-selection p,.video-intro-selection li').allTextContents(),[
            '阶段一｜收获速记与问题筛选','① 有收获 → 判断是否值得记录','值得记录 → 网盘视频快速标记进度条、截图＋OneNote 简短录音，继续看课。','不需要记录 → 直接跳过，继续看课。','② 有问题 → 判断是否影响继续听课','问自己：不解决这个问题，会不会影响我听懂老师后面的讲解？','会影响，而且重要 → 截图问 AI → AI 出题 → 口述回答并解释理由 → AI 判断 → 标记「阶段2重新检测」→ 继续看课。','不影响，或只是小疑问 → 简单标记，阶段二再处理 → 继续看课。','阶段一原则：不保存 AI 检测题，不深入研究，尽量保持连续看课。','一句话心得：有收获就判断值不值得记，有问题就判断影不影响继续听课；该记就记，该问才问，其余快速通过。']);
          const selection=view.locator('.video-intro-selection'),selectionTabs=selection.locator('.video-intro-selection-tabs button'),selectionPanels=selection.locator('.video-intro-selection-panel');
          const selectionBefore=await read(),selectionText=await selection.locator('h3,p,li').allTextContents();
          assert.deepEqual(await selectionTabs.allTextContents(),['有收获','有问题']);
          assert.deepEqual(await selectionTabs.evaluateAll(nodes=>nodes.map(node=>node.getAttribute('aria-pressed'))),['true','false']);
          assert.ok(await selectionPanels.nth(0).isVisible());assert.equal(await selectionPanels.nth(1).isVisible(),false);
          assert.deepEqual(await selection.locator('.video-intro-selection-footer > p').evaluateAll(nodes=>nodes.map(node=>{const css=getComputedStyle(node);return [css.backgroundColor,css.borderRadius,css.padding,css.color,getComputedStyle(node.querySelector('strong')).color,getComputedStyle(node.querySelector('strong')).display];})),[
            ['rgb(25, 47, 67)','12px','12px','rgb(245, 247, 252)','rgb(155, 198, 255)','block'],
            ['rgb(36, 48, 47)','12px','12px','rgb(245, 247, 252)','rgb(200, 219, 154)','block']]);
          await assertDynamicCard(selectionPanels.nth(0));
          assert.ok(await selection.locator('.video-intro-selection-panel > p:first-child > strong').evaluateAll(nodes=>nodes.every(node=>getComputedStyle(node).color==='rgb(232, 191, 98)')));
          assert.ok(await selection.locator('.video-intro-selection-panel li > strong').evaluateAll(nodes=>nodes.every(node=>getComputedStyle(node).color==='rgb(240, 210, 138)')));
          for(const chosen of [1,0,1]){
            await selectionTabs.nth(chosen).click();
            assert.ok(await selectionPanels.nth(chosen).isVisible());assert.equal(await selectionPanels.nth(1-chosen).isVisible(),false);
            await assertDynamicCard(selectionPanels.nth(chosen));
            assert.equal(await selectionTabs.nth(chosen).getAttribute('aria-pressed'),'true');
            assert.equal(await selection.locator('.video-intro-selection-footer p:visible').count(),2);
            assert.deepEqual(await selection.locator('h3,p,li').allTextContents(),selectionText);
            assert.deepEqual(await read(),selectionBefore,'selection is UI-only');
          }
          assert.ok(await selectionTabs.evaluateAll(nodes=>{const boxes=nodes.map(node=>node.getBoundingClientRect());return boxes[0].top===boxes[1].top&&boxes[0].right<=boxes[1].left;}));
          if(process.env.POCKET_VIDEO_PREVIEW)await page.screenshot({path:path.join(process.env.POCKET_VIDEO_PREVIEW,`video-intro-selection-${width}.png`),fullPage:true});
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
      assert.equal(await view.locator('.video-learning-finished strong').textContent(),'当前知识模块已经速通完成，立即进入阶段二，进行分段看＋独立重做。');
      await view.getByRole('button',{name:'进入视频分段＋重做学习',exact:true}).click();
      assert.equal(await view.locator('h1').textContent(),'分段看＋独立重做');
      assert.equal(await operation.locator(':scope > p').textContent(),'当前步骤 1/4');
      assert.equal(await operation.locator('h2').textContent(),'视频分段看');
      assert.equal(await view.locator('.video-instruction-fold').getAttribute('open'),null);
      await view.locator('.practice-back').click();assert.equal(await view.locator('h1').textContent(),'知识模块速通');
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
      await page.locator('#pocket-home-button').click();
      if(!await entries.isVisible())await page.locator('#home-video-shortcut').click();
      await entries.getByRole('button',{name:'分段看＋独立重做',exact:true}).click();
      for(let step=0;step<3;step++)await view.getByRole('button',{name:'进入下一步',exact:true}).click();
      assert.equal(await operation.locator(':scope > p').textContent(),'当前步骤 4/4');
      await view.getByRole('button',{name:'进入逐题突破',exact:true}).click();
      assert.equal(await operation.locator('h2').textContent(),'1、自己尝试');
      assert.equal(await view.locator('#video-current-question').inputValue(),'1');
      const afterShortcut=await read();delete afterShortcut.videoLearning;assert.deepEqual(afterShortcut,before);
      assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));assert.deepEqual(errors,[]);
      await context.close();console.log(`PASS ${width}px: three modes, intro text/reload/handoff, original positions, shared question entry and unchanged Group/Run`);
    }
  }finally{await browser?.close();await new Promise(resolve=>server.close(resolve));}
})().catch(error=>{console.error(error);process.exitCode=1;});
