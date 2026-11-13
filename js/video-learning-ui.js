(function (global) {
  'use strict';
  const model=global.PocketVideoLearning;
  let api,page;
  const element=(tag,text='',className='')=>{const node=document.createElement(tag);node.textContent=text;if(className)node.className=className;return node;};
  const button=(text,action,className='secondary')=>{const node=element('button',text,className);node.type='button';node.addEventListener('click',action);return node;};
  function masteryCard() {
    const card=element('section','','video-mastery-card'),heading=element('div','','video-mastery-heading');
    const icon=document.createElementNS('http://www.w3.org/2000/svg','svg');
    icon.setAttribute('viewBox','0 0 24 24');icon.setAttribute('aria-hidden','true');
    [9,5,1].forEach(radius=>{
      const circle=document.createElementNS('http://www.w3.org/2000/svg','circle');
      circle.setAttribute('cx','12');circle.setAttribute('cy','12');circle.setAttribute('r',String(radius));icon.append(circle);
    });
    heading.append(icon,element('strong','达标标准'));
    card.append(heading,element('p','能独立重做出来，并且自己可以像老师一样教清楚思路。'));return card;
  }
  function foldStepContent(body,recall=false,rapid=false,compare=false) {
    const nodes=Array.from(body.children);body.replaceChildren();let content;
    function fold(title) {
      const section=element('details','','video-instruction-fold'),summary=element('summary');
      if(typeof title==='string')summary.textContent=title;else summary.append(title);
      content=element('div','','video-instruction-content');section.append(summary,content);body.append(section);
    }
    nodes.forEach(node=>{
      if(rapid && node.textContent==='优先检查课前问题：'){fold('优先检查课前问题');content.append(node);}
      else if(!recall && /^（[1-5]）/.test(node.textContent) && (node.className || '').includes('video-step-label'))fold(node);
      else if(recall && node.textContent==='先处理课前问题：'){fold('1、处理课前问题');content.append(node);}
      else if(recall && node.textContent==='（1）看标记，整理onenote笔记'){fold('2、复盘');content.append(node);}
      else if((node.className || '').includes('video-body-standard'))body.append(node);
      else (content || body).append(node);
    });
    if(recall && content){
      const notes=element('details','','video-instruction-fold'),noteContent=element('div','','video-instruction-content');
      noteContent.append(...Array.from(content.childNodes));
      notes.append(element('summary','1、整理onenote笔记'),noteContent);content.append(notes);
      const section=element('details','','video-instruction-fold'),instructions=element('div','','video-instruction-content');
      instructions.append(
        element('p','1、回答课前拆分的笔记问题并且对标参考答案，看自己问题出在哪里'),
        element('p','2、告诉AI自己的答案，分析与正确理解差距在哪里'),
        element('p','3、让AI用一个简短段落总结：我的最初理解、我的问题、正确理解，以及解决什么问题才能纠正理解、独立做对题目。'),
        element('p','4、回答笔记问题时，自己一边抄写相关笔记，一边想象自己是老师去讲解笔记内容，或者朗读笔记。'));
      section.append(element('summary','2、回答笔记问题'),instructions);content.append(section);
    }
  }
  function home() {
    const host=document.getElementById('video-learning-entry');if(!host || !api)return;
    const guideOpen=host.querySelector?.('.video-use-guide')?.open || false;
    host.replaceChildren();
    host.append(element('h3','视频学习系统'));
    const actions=element('div','','video-learning-actions');
    Object.entries(model.modes).forEach(([mode,title])=>actions.append(button(title,()=>{global.PocketNavigation.checkpoint();open({view:mode});})));
    const guide=element('details','','video-use-guide');guide.open=guideOpen;
    const guideBody=element('div');global.PocketReviewUI.videoFurtherStages(guideBody);
    guide.append(element('summary','熟练后的视频使用指南'),guideBody);
    host.append(actions,guide);
  }
  function open(view={}) {
    if(!api)return false;
    let mode=Object.hasOwn(model.modes,view.view)?view.view:'continuous';
    if(view.videoId){try{mode=model.find(api.get(),view.videoId).mode;}catch(_) {}}
    global.PocketNavigation.hideTools();document.getElementById('pocket-main').hidden=true;
    if(!page){page=element('main','','practice-tool');page.id='video-learning-system';document.body.append(page);}
    page.hidden=false;page.replaceChildren(button('← 返回',()=>global.PocketNavigation.back(),'practice-back'));
    const title=element('h1',model.modes[mode]);title.tabIndex=-1;page.append(title);
    const notice=element('p','','video-learning-notice');notice.setAttribute('role','status');
    const card=element('section','','video-learning-card');
    const current=element('section','','video-learning-operation');current.setAttribute('aria-live','polite');
    const position=element('p','','video-learning-muted'),stepTitle=element('h2'),description=element('div','','video-learning-description');current.append(position,stepTitle,description);
    const preview=element('section','','video-learning-preview'),nextTitle=element('h2');preview.append(element('p','下一步','video-learning-muted'),nextTitle);
    const originalSteps=mode==='question'?global.PocketReviewUI.firstStageSteps():null;
    const questionEntry=button('进入逐题突破',()=>{
      try{
        api.save(next=>{
          model.saveProgress(next,'question','step',0);
          model.saveProgress(next,'question','question',1);
        });
        global.PocketNavigation.checkpoint();open({view:'question'});
      }catch(error){notice.textContent=error.message;}
    });
    questionEntry.hidden=true;current.append(questionEntry);
    const steps=originalSteps?originalSteps.map(node=>({title:node.children[0].children[0].textContent,body:Array.from(node.children).find(child=>child.className==='video-step-body')})):model.guideSteps[mode];
    if(originalSteps)steps.forEach(step=>{
      step.body.querySelectorAll('p').forEach(paragraph=>{
        if(paragraph.textContent==='达标标准：能独立重做出来，并且自己可以像老师一样教清楚思路。')paragraph.replaceWith(masteryCard());
        else if(paragraph.textContent==='能独立重做出来，并且自己可以像老师一样教清楚思路。' && paragraph.parentElement.classList.contains('video-body-standard')){
          paragraph.parentElement.replaceWith(masteryCard());
        }
      });
    });
    if(originalSteps){foldStepContent(steps[1].body);foldStepContent(steps[2].body,false,true);foldStepContent(steps[4].body,true);foldStepContent(steps[5].body,false,false,true);}
    let segmentGuide;
    if(mode==='continuous'){
      segmentGuide=element('details','','video-instruction-fold');
      const content=element('div','','video-instruction-content'),list=element('ul');
      [['看内容：',' 老师讲完一个完整知识点或解题方法，就可以暂停。'],
        ['看题量：',' 一般连续看 3～5 道相关题目，再尝试独立重做。'],
        ['看效果：',' 如果前面的内容已经记不清，就缩短；如果频繁暂停太麻烦，就延长。']].forEach(([label,text])=>{
        const item=element('li');item.append(element('strong',label),document.createTextNode(text));list.append(item);
      });
      content.append(list);segmentGuide.append(element('summary','视频分段的简单判断'),content);
      list.children[1].append(masteryCard());
    }
    let question,previousQuestion;
    function save(action,value) {
      try{
        api.save(next=>model.saveProgress(next,mode,action,value));notice.textContent='';refresh();
      }catch(error){notice.textContent=error.message;}
    }
    if(mode==='question'){
      const controls=element('div','','video-learning-questions'),label=element('label','当前题号');label.htmlFor='video-current-question';
      question=element('input');question.id='video-current-question';question.type='number';question.min='1';question.step='1';
      question.addEventListener('change',()=>save('question',Number(question.value)));
      const actions=element('div','','video-learning-actions');
      previousQuestion=button('上一题',()=>save('question',model.progress(api.get()).currentQuestion-1));
      actions.append(previousQuestion,button('下一题',()=>save('question',model.progress(api.get()).currentQuestion+1)));
      controls.append(label,question,actions);card.append(controls);
    }
    const details=element('details');details.id='video-learning-route';details.append(element('summary','查看完整操作路线'));
    const route=element('ol');steps.forEach(step=>route.append(element('li',originalSteps?step.title:step.text)));details.append(route);
    const actions=element('div','','video-learning-actions video-learning-step-actions');
    const previous=button('上一步',()=>save('step',model.progress(api.get())[mode]-1));
    const next=button('进入下一步',()=>save('step',(model.progress(api.get())[mode]+1)%steps.length));actions.append(previous,next);
    card.append(current,preview,details,element('p','步骤切换仅保存操作位置，不代表学习达标；题号仅由你手动调整。','video-learning-muted'));
    card.append(button('进入题目分组',()=>global.PocketLearning.openHomeGrouping()),notice,actions);
    function refresh() {
      const progress=model.progress(api.get()),index=progress[mode];
      position.textContent=`当前步骤 ${index+1}/${steps.length}`;stepTitle.textContent=steps[index].title;
      if(originalSteps)description.replaceChildren(steps[index].body);else description.textContent=steps[index].text;
      if(segmentGuide && index===0)description.append(segmentGuide);
      if(mode==='continuous' && index===3)description.append(masteryCard());
      questionEntry.hidden=mode!=='continuous' || index!==steps.length-1;
      nextTitle.textContent=index===steps.length-1?'重新循环':steps[index+1].title;
      previous.disabled=index===0;
      if(question){question.value=String(progress.currentQuestion);previousQuestion.disabled=progress.currentQuestion===1;}
    }
    try{refresh();}catch(error){notice.textContent=error.message;previous.disabled=true;next.disabled=true;}
    page.append(card);global.PocketNavigation.remember({page:'video-learning',view:mode});global.scrollTo?.(0,0);title.focus({preventScroll:true});return true;
  }
  global.PocketVideoLearningUI=Object.freeze({attach:bridge=>{api=bridge;},home,open});
  global.PocketNavigation.register('video-learning',open);
})(globalThis);
