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
      const initial=seed(2);
      await context.addInitScript(({key,initial})=>{
        if(!localStorage.getItem(key)){localStorage.setItem(key,JSON.stringify(initial));localStorage.setItem('pocket-development-v1:pocket-last-view-v1',JSON.stringify({page:'home'}));}
      },{key,initial});
      const page=await context.newPage(),errors=[];page.on('pageerror',error=>errors.push(error.message));
      await page.goto(origin,{waitUntil:'networkidle'});
      assert.equal(await page.locator('#environment-banner').textContent(),'测试环境｜不会连接 Firebase');
      const original=await page.evaluate(()=>{
        const host=document.createElement('div');PocketReviewUI.videoIntroduction(host);
        return Array.from(host.querySelectorAll('.video-step'))[1].querySelector('.video-step-body').textContent;
      });
      await page.locator('#home-video-shortcut').click();
      await page.locator('#video-learning-entry').getByRole('button',{name:'连续看课',exact:true}).click();
      const continuous=page.locator('#video-learning-system'),operation=continuous.locator('.video-learning-operation');
      assert.equal(await operation.locator('h2').textContent(),'视频分段看');
      assert.equal(await operation.locator(':scope > p').textContent(),'当前步骤 1/5');
      assert.equal(await continuous.locator('.video-learning-description').evaluate(node=>node.firstChild.textContent),'把一个视频，分成几部分，看一部分过程，结束后进入后面步骤。');
      const segment=continuous.locator('.video-learning-description details');
      assert.equal(await segment.getAttribute('open'),null);
      assert.equal(await segment.locator('summary').textContent(),'视频分段的简单判断');
      const segmentBefore=await page.evaluate(key=>localStorage.getItem(key),key);
      await segment.locator('summary').click();
      assert.deepEqual(await segment.locator('li').allTextContents(),[
        '看内容： 老师讲完一个完整知识点或解题方法，就可以暂停。',
        '看题量： 一般连续看 3～5 道相关题目，再尝试独立重做。达标标准能独立重做出来，并且自己可以像老师一样教清楚思路。',
        '看效果： 如果前面的内容已经记不清，就缩短；如果频繁暂停太麻烦，就延长。']);
      assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
      await segment.locator('summary').click();
      assert.equal(await page.evaluate(key=>localStorage.getItem(key),key),segmentBefore);
      const remainingSteps=await page.evaluate(()=>PocketVideoLearning.guideSteps.continuous.slice(1));
      for(const [index,step] of remainingSteps.entries()){
        await continuous.getByRole('button',{name:'进入下一步',exact:true}).click();
        assert.equal(await operation.locator('h2').textContent(),step.title);
        assert.equal(await continuous.locator('.video-learning-description').textContent(),step.text+(index===2?'达标标准能独立重做出来，并且自己可以像老师一样教清楚思路。':''));
        if(index===2){
          const card=continuous.locator('.video-mastery-card');assert.equal(await card.count(),1);
          assert.equal(await card.locator('svg[aria-hidden="true"]').count(),1);
          assert.equal(await card.locator('.video-mastery-heading').textContent(),'达标标准');
          assert.equal(await card.locator('p').textContent(),'能独立重做出来，并且自己可以像老师一样教清楚思路。');
          assert.equal(await card.evaluate(node=>getComputedStyle(node).backgroundColor),'rgb(48, 39, 25)');
          assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
        }
        assert.equal(await continuous.locator('.video-learning-description details').count(),0);
        assert.equal(await operation.locator(':scope > p').textContent(),`当前步骤 ${index+2}/5`);
      }
      await continuous.getByRole('button',{name:'← 返回',exact:true}).click();
      await page.locator('#video-learning-entry').getByRole('button',{name:'逐题突破',exact:true}).click();
      const view=page.locator('#video-learning-system');
      assert.equal(await view.locator('.video-learning-description .video-mastery-card').count(),1);
      assert.deepEqual(await page.evaluate(()=>PocketReviewUI.firstStageSteps().map(node=>Array.from(node.querySelectorAll('.video-step-body p')).filter(paragraph=>paragraph.textContent==='达标标准：能独立重做出来，并且自己可以像老师一样教清楚思路。').length)),[1,0,0,1,0,0,0]);
      assert.equal(await page.evaluate(()=>PocketReviewUI.firstStageSteps()[5].querySelector('.video-body-standard').textContent),'达标要求：能独立重做出来，并且自己可以像老师一样教清楚思路。');
      await view.getByRole('button',{name:'进入下一步',exact:true}).click();
      const folds=view.locator('.video-instruction-fold');
      assert.equal(await folds.count(),5);
      assert.equal(await view.locator('.video-instruction-fold[open]').count(),0);
      assert.deepEqual(await folds.locator(':scope > summary').allTextContents(),['（1）标注卡点','（2）记录问题','（3）训练精准提问','（4）带着问题听课','（5）拆分笔记问答']);
      const before=await page.evaluate(key=>localStorage.getItem(key),key);
      await folds.nth(4).locator('summary').click();
      assert.deepEqual(await folds.nth(4).locator('.video-instruction-content p').allTextContents(),['把笔记交给 AI，提问：','请根据我的笔记内容，生成问题，要求我能看到问题，自己回答出笔记的内容。','你的参考答案格式：原笔记内容 + 举例子。','截图回答到答案讲义，用自由笔记的贴纸马赛克答案','自己一边抄写笔记，一边想象自己是老师去讲解笔记内容，或者朗读笔记。']);
      await folds.first().locator('summary').click();
      assert.equal(await view.locator('.video-instruction-fold[open]').count(),2);
      await folds.nth(4).locator('summary').click();
      assert.equal(await folds.first().getAttribute('open'),'');
      for(let index=1;index<5;index++)await folds.nth(index).locator('summary').click();
      assert.equal(await view.locator('.video-instruction-fold[open]').count(),5);
      assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
      const remaining=await view.locator('.video-learning-description').evaluate(node=>{
        const clone=node.cloneNode(true);clone.querySelectorAll('summary').forEach(summary=>summary.replaceWith(...summary.childNodes));
        clone.querySelectorAll('.video-instruction-fold')[4].remove();return clone.textContent;
      });
      assert.equal(remaining,original);
      assert.equal(await page.evaluate(key=>localStorage.getItem(key),key),before);
      assert.equal(await view.locator('.video-learning-operation h2').textContent(),'2、标注问题（课前）');
      for(let index=0;index<3;index++)await view.getByRole('button',{name:'进入下一步',exact:true}).click();
      assert.equal(await view.locator('.video-learning-operation h2').textContent(),'5、复盘');
      const outer=view.locator('.video-learning-description > .video-step-body > .video-instruction-fold');
      assert.deepEqual(await outer.locator(':scope > summary').allTextContents(),['1、处理课前问题','2、复盘']);
      await outer.nth(1).locator(':scope > summary').click();
      const nested=outer.nth(1).locator('details');assert.equal(await nested.count(),2);
      assert.equal(await nested.nth(0).getAttribute('open'),null);
      assert.equal(await nested.nth(1).getAttribute('open'),null);
      assert.deepEqual(await nested.locator('summary').allTextContents(),['1、整理onenote笔记','2、回答笔记问题']);
      const recapBefore=await page.evaluate(key=>localStorage.getItem(key),key);
      await nested.nth(1).locator('summary').click();
      assert.deepEqual(await nested.nth(1).locator('p').allTextContents(),[
        '1、回答课前拆分的笔记问题并且对标参考答案，看自己问题出在哪里',
        '2、告诉AI自己的答案，分析与正确理解差距在哪里',
        '3、让AI用一个简短段落总结：我的最初理解、我的问题、正确理解，以及解决什么问题才能纠正理解、独立做对题目。',
        '4、回答笔记问题时，自己一边抄写相关笔记，一边想象自己是老师去讲解笔记内容，或者朗读笔记。']);
      await outer.first().locator(':scope > summary').click();
      await nested.nth(0).locator('summary').click();
      assert.equal(await nested.nth(1).getAttribute('open'),'');
      await nested.nth(1).locator('summary').click();
      assert.equal(await nested.nth(0).getAttribute('open'),'');
      assert.equal(await outer.first().getAttribute('open'),'');
      assert.equal(await outer.nth(1).getAttribute('open'),'');
      assert.equal(await page.evaluate(key=>localStorage.getItem(key),key),recapBefore);
      const originalRecap=await page.evaluate(()=>PocketReviewUI.firstStageSteps()[4].querySelector('.video-step-body').textContent);
      const remainingRecap=await view.locator('.video-learning-description').evaluate(node=>{
        const clone=node.cloneNode(true);clone.querySelectorAll('details details')[1].remove();
        clone.querySelectorAll('summary').forEach(summary=>summary.remove());return clone.textContent;
      });
      assert.equal(remainingRecap,originalRecap);
      await nested.nth(1).locator('summary').click();
      assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
      await view.getByRole('button',{name:'进入下一步',exact:true}).click();
      assert.equal(await view.locator('.video-learning-operation h2').textContent(),'6、再次独立重做');
      assert.equal(await view.locator('.video-mastery-card').count(),1);
      assert.equal(await view.locator('.video-mastery-card p').textContent(),'能独立重做出来，并且自己可以像老师一样教清楚思路。');
      assert.deepEqual(errors,[]);await context.close();
      console.log(`PASS ${width}px: five independent folds, exact text, original content/state unchanged, no overflow/errors`);
    }
  }finally{await browser?.close();await new Promise(resolve=>server.close(resolve));}
})().catch(error=>{console.error(error);process.exitCode=1;});
