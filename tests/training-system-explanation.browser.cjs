'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),http=require('node:http');
const {seed}=require('./helpers/pocket-learning-ui.cjs');
const playwright=require(path.join(path.dirname(process.execPath),'node_modules/playwright'));
const root=path.resolve(__dirname,'..'),key='pocket-development-v1:cognivex-pocket-state';
const expected=`核心目标：通过针对性训练与持续检测，将知识和方法转化为长期稳定、能够独立迁移的实际能力。
一、能力链模型｜明确练什么
根据不同学科、领域的最终目标，拆解需要掌握的知识、思维方法和具体能力。
明确：
目标能力： 最终需要独立完成什么？
达标标准： 达到什么水平才算掌握？
当前表现： 已经具备哪些能力，哪些仍然薄弱？
能力断点： 是知识、理解、方法选择、执行、熟练度还是迁移存在问题？
核心作用：明确练什么、为什么练、练到什么程度。
二、OUTPUT｜明确怎么练
OUTPUT 是 Cognivex 的完整训练执行体系。
通过视频学习、分组循环、构建解题体系和实战操作，实现从模仿学习到独立解决陌生问题的能力发展。
① 视频三阶段｜学会
通过连续看课、视频分段看和逐题突破，反复尝试、琢磨老师的思路、对标理解、独立重做。
目标：从不会做，到能够不看答案独立做对原题，并解释关键思路。
② 分组循环训练｜巩固与深化
将视频阶段已经学会的题目纳入分组循环，通过反复独立重做、间隔复习和今日复习，减少遗忘，提高熟练度。
在训练过程中，结合训练内化和逐题突破，继续研究已学题目，发现理解断点并针对性补强。
目标：从刚刚会做，到长期记得、熟练做对、深入理解。
③ 构建解题体系｜提炼与贯通
从已学知识和题目中提炼：
题目结构与识别特征
解题突破口
方法选择依据
最优解题路径
方法适用条件与局限
不同题目之间的联系与迁移规律
通过主动回忆、总结、对标和变式训练，将零散的解题经验组织成能够独立调用的体系。
目标：从会做一道题，到理解一类题的解题规律。
④ 实战操作｜独立迁移
面对陌生题、综合题和真实任务，独立完成：
观察结构 → 寻找突破口 → 选择方法 → 执行验证 → 监控修正。
通过限时训练和实际任务检验解题能力。
目标：面对没见过的问题，也能够快速、准确地找到正确路径并独立解决。
三、检测反馈｜判断是否达标
通过 OUTPUT 各环节中的实际表现和专项检测，判断当前能力是否达到能力链模型规定的标准。
发现断点后，选择对应的 OUTPUT 操作：
原题不会 → 视频学习、逐题突破。
原题容易忘或不熟练 → 分组循环、今日复习。
理解不深入 → 训练内化、对标复盘。
方法不会提炼 → 构建解题体系。
陌生题不会迁移 → 实战分析、变式训练、针对性补强。
补强后重新检测，直至达到相应能力标准。
四、核心原则｜通用 OUTPUT × 领域专项能力
能力链模型：领域专项适配
根据不同学科和领域，定义需要训练的具体能力、薄弱表现和达标标准。
解决：
练什么？练到什么程度？
OUTPUT：通用训练框架
提供从学习、模仿、独立重做、循环巩固、深入理解、构建体系到实战迁移的完整训练方法。
根据领域特点与当前能力断点，选择和调整具体操作，不要求所有领域机械执行相同流程。
解决：
怎么练？
检测反馈：闭环优化
通过实际表现检验能力，定位断点，针对性补强，并重新检测。
解决：
练得怎么样？下一步应该补什么？
Cognivex 核心训练闭环
能力链模型：明确目标与达标标准
↓
OUTPUT：视频三阶段 → 分组循环 → 构建解题体系 → 实战操作
↓
实际检测：判断是否达标
↓
定位断点 → 选择对应 OUTPUT 操作 → 针对性补强
↓
再次检测，直到达标
最终目标
从模仿老师到独立做对，从重复练习到长期熟练，从深入理解到构建解题体系，最终能够面对陌生问题，独立识别结构、寻找突破口、选择正确方法并快速准确地解决。
核心公式：
能力链模型（练什么、练到什么程度） × OUTPUT（怎么练） × 检测反馈（是否达标）＝持续发展的独立解决问题能力。`.split('\n');
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
   await context.addInitScript(({key,initial})=>{if(!localStorage.getItem(key)){localStorage.setItem(key,JSON.stringify(initial));localStorage.setItem('pocket-development-v1:pocket-last-view-v1',JSON.stringify({page:'home'}));}},{key,initial:seed(2)});
   const page=await context.newPage(),errors=[];page.on('pageerror',error=>errors.push(error.message));await page.goto(origin,{waitUntil:'networkidle'});
   assert.equal(await page.locator('#environment-banner').textContent(),'测试环境｜不会连接 Firebase');
   const before=await page.evaluate(key=>localStorage.getItem(key),key);
   assert.equal(await page.locator('#practice-readiness-button .mechanism-entry-title').textContent(),'Cognivex 核心运行机制');
   assert.equal(await page.locator('#practice-readiness-button .mechanism-entry-subtitle').textContent(),'能力链模型 · OUTPUT · 检测反馈');
   assert.equal(await page.locator('#practice-readiness-button').count(),1);
   assert.ok(await page.locator('#practice-readiness-button').isVisible(),'entry is visible without opening a home panel');
   assert.ok(await page.evaluate(()=>{
    const entry=document.getElementById('practice-readiness-button');
    const header=document.querySelector('#pocket-main > .app-header');
    const navigation=document.getElementById('home-shortcuts');
    return entry.parentElement.className==='home-system-grid'&&header.nextElementSibling.id==='home-system-group'&&entry.getBoundingClientRect().bottom<=navigation.getBoundingClientRect().top;
   }),'entry follows the home header and precedes the four shortcuts');
   assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
   await page.locator('#home-learned-shortcut').click();
   const externalEntry=page.locator('#external-information-entry');
   assert.equal(await externalEntry.count(),1);
   assert.equal(await externalEntry.evaluate(node=>node.previousElementSibling.id),'practice-readiness-button');
   assert.deepEqual(await externalEntry.locator('.mechanism-entry-copy > span').allTextContents(),['外部信息补强机制','主动检索 · 辅助理解 · 继续学习']);
   await externalEntry.click();
   const external=page.locator('#training-external-information');
   assert.ok(await external.isVisible());
   const externalText=['外部信息补强机制','核心目标： 当自己和 AI 都无法解决问题时，主动寻找外部资料，辅助理解，继续推进学习。','一、执行流程','明确问题： 找出自己不理解的知识或解题步骤。','提问 AI： 先让 AI 尝试解释和解决。','外部检索： AI 无法解决时，通过小红书、微信公众号、搜索引擎等渠道寻找相关资料。','AI 辅助理解： 将找到的资料提供给 AI，让 AI 帮助分析、解释，并核对正确性。','一句话总结： 自己暂时理解关键道理后，用一句话记录学习心得。','继续学习： 停止搜索，返回原来的学习任务。','二、停止深入原则','暂时理解关键道理后，用一句话总结心得，停止搜索，继续学习；后续逐步深化，遇到反复卡点再补强。','三、核心原则','不依赖单一老师、资料或 AI。','AI 无法解决，不代表问题无法解决。','外部资料和 AI 的解释都需要判断、核对。','不追求一次性彻底理解，允许随着后续学习逐步深化。','如果问题反复出现或阻碍后续学习，再针对性深入研究。','四、核心理念','遇到问题不停止，理解到位不过度深入，通过持续学习逐步深化认知。'];
   assert.deepEqual(await external.locator('h1,h2,p,li,.external-information-goal').allTextContents(),externalText);
   assert.equal(await external.locator('button,input,textarea,details').count(),0);
   assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
   await page.reload({waitUntil:'networkidle'});assert.ok(await external.isVisible());
   assert.deepEqual(await external.locator('h1,h2,p,li,.external-information-goal').allTextContents(),externalText);
   await page.locator('#training-back').click();assert.ok(await page.locator('#pocket-main').isVisible());
   assert.equal(await external.isVisible(),false);
   assert.equal(await page.evaluate(key=>localStorage.getItem(key),key),before);
   if(!await page.locator('#home-learned-panel').isVisible())await page.locator('#home-learned-shortcut').click();
   const materialsEntry=page.locator('#learned-material-details');
   assert.equal(await materialsEntry.locator('.mechanism-entry-title').textContent(),'查看资料');
   assert.equal(await materialsEntry.locator('.mechanism-entry-subtitle').textContent(),'浏览已添加的学习资料');
   assert.ok(await materialsEntry.evaluate(button=>{
    const copy=button.querySelector('.mechanism-entry-copy').getBoundingClientRect();
    const arrow=button.querySelector('.mechanism-entry-arrow').getBoundingClientRect();
    return copy.right<=arrow.left&&button.getBoundingClientRect().width<=button.parentElement.getBoundingClientRect().width&&button.getBoundingClientRect().height>=70;
   }),'materials entry uses shared dimensions without overlapping text');
   await materialsEntry.locator('.mechanism-entry-icon').click();
   assert.ok(await page.locator('#materials-dialog').isVisible(),'icon click opens original materials dialog');
   await page.locator('#materials-dialog .materials-dialog-header button').click();
   assert.equal(await page.locator('#materials-dialog').isVisible(),false);
   await materialsEntry.locator('.mechanism-entry-arrow').click();
   assert.ok(await page.locator('#materials-dialog').isVisible(),'arrow click opens the same materials dialog');
   await page.locator('#materials-dialog .materials-dialog-header button').click();
   assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'learned panel entry does not overflow');
   assert.ok(await page.locator('#practice-readiness-button').evaluate(button=>{
    const copy=button.querySelector('.mechanism-entry-copy').getBoundingClientRect();
    const arrow=button.querySelector('.mechanism-entry-arrow').getBoundingClientRect();
    return copy.right<=arrow.left&&button.getBoundingClientRect().height>=44;
   }),'entry copy and arrow have separate touch-safe layout');
   await page.locator('#practice-readiness-button').click();
   assert.equal(await page.locator('#training-overview-title').textContent(),'核心运行机制');
   assert.deepEqual(await page.locator('.training-overview-header > *').allTextContents(),['COGNIVEX · CORE MECHANISM','核心运行机制','定义能力目标 · 执行 OUTPUT · 检测反馈 · 持续补强']);
   const overview=page.locator('#training-overview'),card=overview.locator('.training-system-explanation');
   assert.deepEqual(await overview.locator(':scope > *').evaluateAll(nodes=>nodes.map(n=>n.tagName)),['HEADER','SECTION','SECTION','SECTION']);
   assert.deepEqual(await card.evaluate(node=>{
    const copy=node.cloneNode(true);
    copy.querySelectorAll('.training-overview-phase').forEach(fold=>fold.querySelector('.training-overview-content').append(fold.querySelector('.training-overview-goal')));
    copy.querySelectorAll('summary').forEach(summary=>summary.remove());
    return Array.from(copy.querySelectorAll('h2,h3,p,li'),element=>element.textContent);
   }),expected.filter(text=>text!=='二、OUTPUT｜明确怎么练'),'all original body wording remains intact except the explicitly removed duplicate heading');
   assert.equal(await card.locator('h2').count(),5);assert.equal(await card.locator('h3').count(),7);
   assert.equal(await card.locator('li').count(),15);assert.equal(await card.locator('hr').count(),1);
   assert.equal(await card.locator('strong').count(),20);
   assert.equal(await overview.locator('.training-system-explanation').count(),1);
   assert.equal(await card.locator('details').count(),8);
   assert.equal(await card.locator(':scope > details').count(),4);
   assert.equal(await card.locator('details[open]').count(),1);
   assert.equal(await card.locator('.training-overview-output').getAttribute('open'),'');
   assert.equal(await card.locator('.training-overview-tags').count(),0);
   const folds=card.locator('details');
   for(const index of [0,2,3,4,5,6,7]){
    await folds.nth(index).locator(':scope > summary').click();
    assert.equal(await folds.nth(index).getAttribute('open'),'');
    assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'expanded content does not overflow');
   }
   assert.equal(await card.locator('details[open]').count(),8,'all modules and phases open independently');
   for(const index of [0,2,3,4,5,6,7])await folds.nth(index).locator(':scope > summary').click();
   await folds.nth(1).locator(':scope > summary').click();
   assert.equal(await card.locator('details[open]').count(),0);
   await folds.nth(1).locator(':scope > summary').click();
   assert.equal(await card.locator('details[open]').count(),1);
   assert.equal(await card.locator('button,input,a').count(),0,'static explanation introduces no operations');
   const originals=overview.locator(':scope > .practice-condition');
   assert.deepEqual(await originals.locator('h2').allTextContents(),['构建学科能力链模型','OUTPUT｜训练执行体系']);
   assert.deepEqual(await originals.locator(':scope > .practice-number').allTextContents(),['01','02']);
   assert.deepEqual(await originals.first().locator('p').allTextContents(),['给后续刷题和检测建立能力锚点']);
   assert.deepEqual(await originals.locator('button').allTextContents(),['开始构建 →','查看 OUTPUT 执行说明 →']);
   assert.equal(await overview.locator('#training-practice,#training-simulation').count(),0);
   assert.deepEqual(await originals.nth(1).locator('h3').allTextContents(),['01 视频三阶段','02 分组循环','03 构建解题体系','04 实战操作']);
   assert.deepEqual(await originals.nth(1).locator('p').allTextContents(),['从模仿学习到独立解决陌生问题','模仿、琢磨、独立重做 → 学会','循环巩固、训练内化 → 熟练与深化','提炼规律、贯通方法 → 迁移','陌生题独立解题 → 检验能力']);
   const boxes=await overview.locator(':scope > *').evaluateAll(nodes=>nodes.map(n=>{const r=n.getBoundingClientRect();return {top:r.top,bottom:r.bottom,width:r.width};}));
   for(let i=1;i<boxes.length;i++)assert.ok(boxes[i].top>=boxes[i-1].bottom,'no card/module overlap');
   assert.equal(boxes[2].width,boxes[3].width);
   assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
   if(process.env.POCKET_TRAINING_PREVIEW){fs.mkdirSync(process.env.POCKET_TRAINING_PREVIEW,{recursive:true});await page.locator('#training-overview').screenshot({path:path.join(process.env.POCKET_TRAINING_PREVIEW,`training-system-explanation-${width}.png`)});}
   await page.locator('#training-build').click();assert.ok(await page.locator('#training-model').isVisible());
   await page.locator('#training-back').click();assert.ok(await overview.isVisible());
   await page.locator('#training-output-guide-entry').click();
   const outputGuide=page.locator('#training-output-guide');assert.ok(await outputGuide.isVisible());assert.equal(await overview.isVisible(),false);
   assert.equal(await outputGuide.locator('h1').textContent(),'OUTPUT｜训练执行体系');
   const expectedOutput=expected.slice(expected.indexOf('二、OUTPUT｜明确怎么练')+1,expected.indexOf('三、检测反馈｜判断是否达标'));
   expectedOutput[1]='通过视频三阶段、分组循环、构建解题体系和实战操作，实现从模仿学习到独立解决陌生问题的能力发展。';
   const expectedLoop=['训练闭环',...expected.slice(expected.indexOf('Cognivex 核心训练闭环')+1,expected.indexOf('最终目标'))];
   assert.deepEqual(await outputGuide.locator('h2,h3,p,li').allTextContents(),[...expectedOutput,...expectedLoop]);
   assert.equal(await outputGuide.locator('input,textarea,button').count(),0);
   assert.equal(await outputGuide.locator('li').count(),6);
   assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
   await page.reload({waitUntil:'networkidle'});assert.ok(await outputGuide.isVisible());
   assert.deepEqual(await outputGuide.locator('h2,h3,p,li').allTextContents(),[...expectedOutput,...expectedLoop]);
   await page.locator('#training-back').click();assert.ok(await overview.isVisible());
   await page.evaluate(()=>PocketNavigation.navigate({page:'practice',view:'check'}));assert.ok(await page.locator('#practice-tool').isVisible());
   await page.locator('#pocket-back-button').click();assert.ok(await overview.isVisible());
   await page.evaluate(()=>PocketNavigation.navigate({page:'training',view:'detection'}));assert.ok(await page.locator('#training-detection').isVisible());
   await page.locator('#training-detection-overview').click();assert.ok(await overview.isVisible());
   await page.locator('#pocket-home-button').click();assert.ok(await page.locator('#pocket-main').isVisible());
   assert.equal(await page.evaluate(key=>localStorage.getItem(key),key),before);assert.deepEqual(errors,[]);await context.close();
  }
  console.log('PASS localhost training: exact overview and OUTPUT guide, two entry cards, refresh/back, legacy practice/detection routes, 320/390/768/1440px wrapping, unchanged learning state.');
 }finally{await browser?.close();await new Promise(resolve=>server.close(resolve));}
})().catch(error=>{console.error(error);process.exitCode=1;});
