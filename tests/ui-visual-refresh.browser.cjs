'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os'),http=require('node:http'),crypto=require('node:crypto');
const {seed}=require('./helpers/pocket-learning-ui.cjs');
const root=path.resolve(__dirname,'..'),key='pocket-development-v1:cognivex-pocket-state';
const baselineFile=path.join(os.tmpdir(),'pocket-ui-refresh-baseline-20261106.json');
const digest=file=>crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
const sourceFiles=()=>['index.html',...fs.readdirSync(path.join(root,'js')).filter(name=>name.endsWith('.js')).map(name=>'js/'+name)];
if(process.argv.includes('--record')){
  const hashes=Object.fromEntries(sourceFiles().map(file=>[file,digest(path.join(root,file))]));
  fs.writeFileSync(baselineFile,JSON.stringify({css:fs.readFileSync(path.join(root,'css/style.css'),'utf8'),hashes}));
  console.log('Recorded CSS and production source hashes: '+baselineFile);process.exit(0);
}
const baseline=JSON.parse(fs.readFileSync(baselineFile,'utf8'));
for(const [file,hash] of Object.entries(baseline.hashes))assert.equal(digest(path.join(root,file)),hash,'Production content/logic changed: '+file);
const playwright=require(path.join(path.dirname(process.execPath),'node_modules/playwright'));
const folder=fs.mkdtempSync(path.join(os.tmpdir(),'pocket-ui-visual-'));
const server=http.createServer((request,response)=>{
 const file=path.resolve(root,'.'+new URL(request.url,'http://localhost').pathname.replace(/\/$/,'/index.html'));
 if(!file.startsWith(root+path.sep))return response.writeHead(403).end();
 try{response.setHeader('Content-Type',({'.js':'text/javascript','.css':'text/css','.html':'text/html'})[path.extname(file)]||'text/plain');response.end(fs.readFileSync(file));}catch(_){response.writeHead(404).end();}
});
const fixed=new Date('2026-11-06T09:00:00+08:00').getTime();
async function newDraft(page,grouping=false){
 await page.locator('#daily-reverse-review-entry').click();let guard=0;
 while(!await page.evaluate(key=>JSON.parse(localStorage.getItem(key)).dailyReverseReview.round.completedAt,key)){assert.ok(++guard<20);await page.locator('#learning-content .current-task > button').filter({hasText:'输出达标'}).click();}
 if(grouping){await page.locator('#subject').fill('数学');await page.locator('#title').fill('隔离模拟资料');await page.getByRole('button',{name:'下一步：分组设置',exact:true}).click();}
}
const scenarios=[
 ['home',false,'#pocket-main',async()=>{}],
 ['task',true,'#pocket-main',async()=>{}],
 ['materials',false,'#materials-dialog',async page=>{await page.locator('#learned-material-details').click();}],
 ['edit',false,'#learning-content',async page=>{await page.locator('#learned-material-details').click();await page.getByRole('button',{name:'查看「资料1」资料详情',exact:true}).click();await page.getByRole('button',{name:'更改资料',exact:true}).click();for(const name of ['追加题目与分组','改分组情况','重点题号总结'])await page.getByRole('button',{name,exact:true}).click();}],
 ['video',true,'#video-learning-view',async page=>{await page.locator('.current-task > .output-entries > button').nth(0).click();await page.locator('.video-stage').first().locator(':scope > summary').click();await page.locator('.video-step').first().locator(':scope > summary').click();}],
 ['video-menu',true,'#video-learning-view',async page=>{await page.locator('.current-task > .output-entries > button').nth(0).click();await page.locator('.video-stage').first().locator(':scope > summary').click();await page.locator('.video-step .operational-status-button').first().click();}],
 ['video-cycle',true,'#video-learning-view',async page=>{
  const original=await page.evaluate(key=>localStorage.getItem(key),key);
  await page.locator('.current-task > .output-entries > button').nth(0).click();await page.locator('.video-stage').first().locator(':scope > summary').click();
  const steps=page.locator('.video-step');
  const choose=async(index,label)=>{const step=steps.nth(index);await step.locator('.operational-status-button').click();await step.locator('.operational-status-menu').getByRole('button',{name:label,exact:true}).click();};
  await choose(0,'✓ 已完成');await choose(1,'✓ 已完成');
  for(const label of ['◐ 进行中','! 卡住了']){await choose(6,label);assert.equal(await steps.first().locator('.operational-status-button').textContent(),'✓ 已完成');}
  await choose(6,'✓ 已完成');assert.ok((await steps.locator('.operational-status-button').allTextContents()).every(text=>text==='○ 未开始'));
  assert.equal(await page.locator('.video-cycle-count').textContent(),'已循环 1 次');
  const saved=await page.evaluate(key=>localStorage.getItem(key),key);await steps.nth(6).locator('.operational-status-menu > button').nth(2).evaluate(node=>{node.click();node.click();});assert.equal(await page.evaluate(key=>localStorage.getItem(key),key),saved);
  await choose(6,'✓ 已完成');assert.equal(await page.locator('.video-cycle-count').textContent(),'已循环 2 次');
  const cleaned=await page.evaluate(key=>JSON.parse(localStorage.getItem(key)),key);delete cleaned.videoStageProgress;assert.deepEqual(cleaned,JSON.parse(original));
 }],
 ['teaching',true,'#output-sop',async page=>{await page.locator('.current-task > .output-entries > button').nth(1).click();await page.getByText('教学法',{exact:true}).click();}],
 ['problems',true,'#output-sop',async page=>{await page.locator('.current-task > .output-entries > button').nth(1).click();await page.getByText('做题',{exact:true}).click();await page.locator('.output-operational-entry').click();}],
 ['situations',true,'#output-sop',async page=>{await page.locator('.current-task > .output-entries > button').nth(1).click();await page.getByText('做题',{exact:true}).click();await page.locator('.output-operational-entry').click();await page.locator('.output-situations-entry').click();}],
 ['knowledge',true,'#output-sop',async page=>{await page.locator('.current-task > .output-entries > button').nth(1).click();await page.getByText('知识点',{exact:true}).click();await page.locator('.output-methodology-entry').click();}],
 ['system',true,'#summary-cards',async page=>{await page.locator('.current-task > .output-entries > button').nth(2).click();await page.locator('#summary-cards details > summary').first().click();}],
 ['independent',true,'#independent-practice',async page=>{await page.locator('.current-task > .output-entries > button').nth(3).click();for(const item of await page.locator('#independent-practice details > summary').all())await item.click();}],
 ['review',false,'#pocket-main',async page=>{await page.locator('#daily-reverse-review-entry').click();}],
 ['relearning',false,'#relearning',async page=>{await page.locator('#learned-material-details').click();await page.locator('#materials-dialog input[data-material-id="m1"]').check();await page.locator('#relearn-selected-materials').click();}],
 ['focus',false,'#focus-review',async page=>{await page.evaluate(()=>PocketFocusReviewUI.open());}],
 ['focus-task',false,'#focus-review',async page=>{const id=await page.evaluate(()=>{const state=PocketStorage.loadState();let id;PocketStorage.updateState(state,next=>{PocketFocusReview.add(next,'m1',0,'1');id=PocketFocusReview.create(next,'数学',1,PocketFocusReview.available(next,'数学').map(question=>question.id));PocketFocusReview.start(next,id);});return id;});await page.reload({waitUntil:'networkidle'});await page.evaluate(id=>PocketFocusReviewUI.open({subject:'数学',focusGroup:id}),id);}],
 ['training',false,'#training-sop',async page=>{await page.evaluate(()=>PocketTrainingSOP.show('overview'));}],
 ['readiness',false,'#practice-tool',async page=>{await page.evaluate(()=>PocketPracticeReadiness.show('check'));}],
 ['settings',false,'#pocket-settings',async page=>{await page.locator('#pocket-settings > summary').click();for(const id of ['daily-data-management-note','learning-backup-files','backup-advanced'])await page.locator('#'+id).evaluate(node=>{node.open=true;});}],
 ['device-principles',false,'#device-principles',async page=>{await page.locator('#device-principles-entry').click();}],
 ['cleanup-guide',false,'#storage-cleanup-guide',async page=>{await page.locator('#storage-cleanup-guide-entry').evaluate(node=>node.click());}],
 ['quick-material',false,'#quick-material',async page=>{await page.locator('#quick-material-entry').click();}],
 ['question-removal',false,'#learning-question-removal',async page=>{await page.evaluate(()=>PocketLearningQuestionRemoval.open());await page.locator('#learning-removal-material').selectOption('m1');}],
 ['new-material',false,'#learning-content',async page=>{await newDraft(page);}],
 ['grouping',false,'#learning-content',async page=>{await newDraft(page,true);}]
];
async function snapshot(page,selector){
 return page.locator(selector).evaluate(node=>{
  const visible=[];const walker=document.createTreeWalker(node,NodeFilter.SHOW_TEXT);
  while(walker.nextNode()){
   const text=walker.currentNode;if(!text.textContent.trim())continue;
   const range=document.createRange();range.selectNodeContents(text);
   if(getComputedStyle(text.parentElement).visibility!=='hidden' && [...range.getClientRects()].some(rect=>rect.width>0&&rect.height>0))visible.push(text.textContent);
  }
  return {text:node.textContent,visible,controls:[...node.querySelectorAll('button,input,textarea,select,a')].map(item=>[item.tagName,item.id,item.getAttribute('type'),item.getAttribute('placeholder'),item.getAttribute('href'),item.disabled,item.value])};
 });
}
(async()=>{
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));let browser;const results=[];
 try{
  const origin=`http://127.0.0.1:${server.address().port}`;
  browser=await playwright.chromium.launch({executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',headless:true});
  for(const width of [320,390,1440])for(const [name,task,selector,setup] of scenarios.filter(item=>!process.env.POCKET_UI_CASES || process.env.POCKET_UI_CASES.split(',').includes(item[0]))){
   const context=await browser.newContext({viewport:{width,height:940},reducedMotion:'reduce'});
   await context.route('**/*',route=>route.request().url().startsWith(origin+'/')?route.continue():route.abort());
   const initial=seed(3);require('./helpers/original-learning-fixture.cjs')(initial,fixed-86400000);
   if(task){const group=initial.materials[0].groups[0];group.runs.push({mode:'review',videoSkipped:true,outputCompleted:false,startedAt:fixed,completedAt:null});initial.currentSession={materialId:'m1',currentGroupIndex:0,currentRunIndex:2,currentStep:'output',mode:'review',schedulerState:{phase:'review',newGroupIndex:0,reviewGroupIndex:0}};}
   await context.addInitScript(({initial,key,fixed,task})=>{
    const OriginalDate=Date;window.Date=class extends OriginalDate{constructor(...args){super(...(args.length?args:[fixed]));}static now(){return fixed;}};
    if(!localStorage.getItem(key)){localStorage.setItem(key,JSON.stringify(initial));localStorage.setItem('pocket-development-v1:pocket-last-view-v1',JSON.stringify({page:task?'learning':'home'}));}
   },{initial,key,fixed,task});
   const page=await context.newPage(),errors=[];page.on('pageerror',error=>errors.push(error.message));
   try{
    await page.goto(origin,{waitUntil:'networkidle'});await setup(page);await page.locator(selector).waitFor({state:'visible'});await page.evaluate(()=>scrollTo(0,0));
    const state=await page.evaluate(key=>localStorage.getItem(key),key);
    await page.evaluate(css=>{document.querySelector('link[rel="stylesheet"]').disabled=true;const style=document.createElement('style');style.id='ui-baseline-css';style.textContent=css;document.head.append(style);},baseline.css);
    await page.evaluate(()=>document.fonts.ready);const before=await snapshot(page,selector);
    if(width!==320)await page.screenshot({path:path.join(folder,`${name}-${width}-before.png`),fullPage:true});
    await page.evaluate(()=>{document.getElementById('ui-baseline-css').remove();document.querySelector('link[rel="stylesheet"]').disabled=false;});
    await page.evaluate(()=>document.fonts.ready);const after=await snapshot(page,selector);
    assert.deepEqual(after,before,name+' changed text/controls/visibility');
    assert.equal(await page.evaluate(key=>localStorage.getItem(key),key),state,name+' changed learning data');
    const overflow=await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1);
    assert.equal(overflow,false,name+' horizontal overflow');assert.deepEqual(errors,[]);
    if(width!==320)await page.screenshot({path:path.join(folder,`${name}-${width}-after.png`),fullPage:true});
    results.push({name,width,passed:true});console.log(`PASS ${name} ${width}px: exact text, visible content, controls and state unchanged`);
   }catch(error){results.push({name,width,passed:false,error:error.message});console.log(`FAIL ${name} ${width}px: ${error.message}`);}
   await context.close();
  }
 }finally{
  await browser?.close();await new Promise(resolve=>server.close(resolve));fs.writeFileSync(path.join(folder,'report.json'),JSON.stringify(results,null,2));console.log('Visual artifacts: '+folder);
 }
 if(results.some(item=>!item.passed))process.exitCode=1;
})().catch(error=>{console.error(error);process.exitCode=1;});
