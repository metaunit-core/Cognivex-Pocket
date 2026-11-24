(function (global) {
  'use strict';
  const model=global.PocketVideoLearning;
  let api,page,segmentSelection=0;
  const element=(tag,text='',className='')=>{const node=document.createElement(tag);node.textContent=text;if(className)node.className=className;return node;};
  const button=(text,action,className='secondary')=>{const node=element('button',text,className);node.type='button';node.addEventListener('click',action);return node;};
  const recallTemplateEntry=()=>button('查看 AI 提问模板',()=>global.PocketNavigation.navigate({page:'training',view:'recall-template'}),'secondary video-recall-template-entry');
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
  function moduleAdvice(text) {
    const content=element('section','','video-module-advice'),parts=text.split('\n\n');
    const situations=element('div','','video-module-situations'),criteria=element('section','','video-mastery-card');
    const paths=['M8 5l11 7-11 7z','M3 7l9-4 9 4-9 4zM3 12l9 4 9-4M3 17l9 4 9-4','M12 3v6M12 9l-7 7m7-7 7 7M5 12v4h4m6 0h4v-4'];
    content.append(element('h3',parts[0]));
    for(let index=0;index<5;index++){
      const heading=element('p','','video-module-advice-heading'),paragraph=element('p',parts[index*2+2]);
      if(index<3){
        const icon=document.createElementNS('http://www.w3.org/2000/svg','svg');icon.setAttribute('viewBox','0 0 24 24');icon.setAttribute('aria-hidden','true');
        const path=document.createElementNS('http://www.w3.org/2000/svg','path');path.setAttribute('d',paths[index]);icon.append(path);heading.append(icon);
      }
      heading.append(element('strong',parts[index*2+1]));
      if(index<3){
        const card=element('section','','video-module-situation');card.append(heading,paragraph);
        (index===0?content:situations).append(card);
      }else{
        heading.classList.add('video-mastery-heading');
        if(index===4)criteria.append(element('hr'));
        criteria.append(heading,paragraph);
      }
    }
    content.append(situations,criteria);return content;
  }
  function moduleReminder() {
    const area=element('section','','video-module-completion');
    const reminder=element('section','','video-mastery-card');
    reminder.append(element('h2','当前资料内所有题目都可以独立重做，暂无大问题，点击进入分组循环复习','video-mastery-heading'),element('p','完成当前知识模块的视频学习后，将资料推进分组训练，按照原有学习机制完成新旧内容的循环训练，再继续学习新视频。'));
    const notice=element('p','','video-learning-notice');notice.setAttribute('role','status');
    reminder.append(button('进入新增资料分组',()=>{
      try{global.PocketLearning.openHomeGrouping();}catch(error){notice.textContent=error.message;}
    },'video-module-review'));
    area.append(reminder,button('开始新视频学习',()=>{
      try{api.save(next=>model.saveProgress(next,'intro','step',0));segmentSelection=0;open({view:'intro'});}
      catch(error){notice.textContent=error.message;}
    }),notice);return area;
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
  function noteSelfTest() {
    const card=element('details','','video-note-test'),summary=element('summary');
    const icon=document.createElementNS('http://www.w3.org/2000/svg','svg');icon.setAttribute('viewBox','0 0 24 24');icon.setAttribute('aria-hidden','true');
    const path=document.createElementNS('http://www.w3.org/2000/svg','path');path.setAttribute('d','M6 3h14v18H6zM3 7h5M3 12h5M3 17h5M11 8h5m-5 4h5m-5 4h3');icon.append(path);
    const heading=element('span');heading.append(element('strong','笔记理解—自测机制'),element('small','当场理解 · 深入出题 · 口述复习'));summary.append(icon,heading);
    const body=element('div','','video-note-test-body'),tabs=element('div','','video-note-test-tabs');tabs.setAttribute('role','group');tabs.setAttribute('aria-label','笔记理解阶段');
    const stages=[
      {title:'阶段1｜知识模块速通',subtitle:'当场理解 · 口述检测 · 标记',steps:[['AI 解释','遇到不理解的老师笔记，提供给 AI，让 AI 帮助理解。'],['当场出题','AI 针对笔记出题，自己口述回答、解释为什么正确，并举反例，让 AI 判断。'],['标记笔记','理解并回答正确后，在讲义对应位置标记：','「阶段2重新出题检测理解」'],['继续看课','不复制题目，不深入拓展，继续观看视频。']],tip:'当场出的题能够口述正确、说明理由和举出有效反例即可。不要复制检测题到笔记，也不要求在这一阶段深入理解。'},
      {title:'阶段2｜视频分段看',subtitle:'重新检测 · 深入出题 · 保存',steps:[['找到标记','重点查看阶段1标记了需要重新检测的讲义笔记。'],['重新出题','再次复制对应笔记给 AI，让 AI 直接出题，自己口述回答并接受判断。'],['深入理解','向 AI 提问：','「根据笔记内容，出几道关键的题目让我可以透彻理解笔记的。」'],['保存题目','将 AI 生成的题目与答案复制到对应讲义笔记旁边。']],tip:'题目集中放在上方，参考答案集中放在最下方，方便以后遮住答案独立检测。'},
      {title:'阶段3｜逐题突破',subtitle:'反复口述 · 核对答案 · 补强',steps:[['反复检测','查看笔记中的题目，遮住答案，自己尝试口述。'],['核对答案','对照参考答案，或交给 AI 判断是否正确。'],['深入补强','对回答错误或不理解的问题，继续通过 AI 提问和口述检测。'],['一句话心得','只在对应的问题区记录一句学习心得，不抄写长篇解释。']],tip:'所有理解和检测以口述为主，只留下必要的一句话心得。'}
    ];
    const panels=[],controls=[];
    stages.forEach((stage,index)=>{
      const panel=element('section','','video-note-test-panel');panel.hidden=index!==0;panel.append(element('h4',stage.title),element('p',stage.subtitle,'video-note-test-muted'));
      const steps=element('ol');stage.steps.forEach(([title,...paragraphs])=>{const item=element('li');item.append(element('strong',title));paragraphs.forEach(text=>item.append(element('p',text)));if(index===1&&title==='重新出题')item.append(recallTemplateEntry());steps.append(item);});panel.append(steps);
      const tip=element('div','','video-note-test-tip');tip.append(element('strong','重点提示：'),element('p',stage.tip));panel.append(tip);
      if(index===1){
        const preview=element('div','','video-note-test-preview');preview.append(element('h4','笔记保存格式预览'),element('strong','题目区'));
        ['Q1. 为什么这个结论成立？','Q2. 它适用于什么条件？','Q3. 能否举出一个反例？'].forEach(text=>preview.append(element('p',text)));
        const answers=element('details','','video-note-test-answers');answers.append(element('summary','答案区（位于最下方）'),element('p','A1–A3：由 AI 根据实际笔记生成对应答案。'));preview.append(answers,element('p','注意：这些只是格式示例，不是真正的 AI 出题功能。实际出题数量和内容应根据具体笔记决定，不要求每次必须包含反例题。','video-note-test-muted'));panel.append(preview);
      }
      const control=button('阶段'+(index+1),()=>{panels.forEach((node,position)=>{node.hidden=position!==index;controls[position].setAttribute('aria-pressed',String(position===index));});});control.setAttribute('aria-pressed',String(index===0));controls.push(control);panels.push(panel);tabs.append(control);
    });
    body.append(tabs,...panels);card.append(summary,body);return card;
  }
  function home() {
    const host=document.getElementById('video-learning-entry');if(!host || !api)return;
    const guideOpen=host.querySelector?.('.video-use-guide')?.open || false;
    const instructionsOpen=host.querySelector?.('.video-stage-instructions')?.open || false;
    const notes=host.querySelector?.('.video-note-test') || noteSelfTest();
    host.replaceChildren();
    const modeIcon=mode=>{
      const namespace='http://www.w3.org/2000/svg',icon=document.createElementNS(namespace,'svg');
      icon.setAttribute('viewBox','0 0 24 24');icon.setAttribute('aria-hidden','true');icon.setAttribute('focusable','false');
      const path=document.createElementNS(namespace,'path');
      path.setAttribute('d',mode==='question'?'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18Zm0 5a4 4 0 1 0 0 8 4 4 0 0 0 0-8Zm0 4h.01':mode==='continuous'?'M3 9h18v11H3ZM3 9V4h18v5M7 4l3 5m4-5 3 5M10 12l5 3-5 3Z':'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18ZM10 8l6 4-6 4Z');
      icon.append(path);return icon;
    };
    const heading=element('h3');heading.append(modeIcon('intro'),document.createTextNode('视频学习'));host.append(heading);
    host.append(notes);
    const instructions=element('details','','video-stage-instructions');instructions.open=instructionsOpen;
    const instructionsTitle=element('summary'),bookIcon=modeIcon('intro'),instructionsBody=element('div','','video-stage-instructions-body');
    bookIcon.firstChild.setAttribute('d','M12 5c-3-2-6-2-9-1v15c3-1 6-1 9 1 3-2 6-2 9-1V4c-3-1-6-1-9 1Zm0 0v15');
    instructionsTitle.append(bookIcon,element('strong','三阶段使用说明'));
    [['① 连续看课：','速通当前知识模块（视频个数具体决定），先了解整体内容。'],
      ['② 视频分段看：','马上进入第一个分段学习并独立重做'],
      ['③ 逐题突破：','遇到卡题时进入，所有解决后，当前资料进入到分组循环。']].forEach(([label,text])=>{
      const paragraph=element('p');paragraph.append(element('strong',label),document.createTextNode(text));instructionsBody.append(paragraph);
    });
    instructions.append(instructionsTitle,instructionsBody);host.append(instructions);
    const actions=element('div','','video-learning-actions');
    const descriptions={
      intro:'阶段一：完整不暂停看完当前知识模块视频➡️截图录音➡️不重做',
      continuous:'阶段二：视频分段看➡️截图录音➡️自己重做',
      question:'阶段三：逐道题目重做➡️看视频讲解对标理解➡️复盘➡️进入到分组循环训练'
    };
    Object.entries(model.modes).forEach(([mode,title],index)=>{
      const buttonTitle=title;
      const entry=button('',()=>{segmentSelection=0;global.PocketNavigation.checkpoint();open({view:mode});});
      const titleRow=element('span','','video-mode-heading');titleRow.append(modeIcon(mode),element('strong',buttonTitle));
      entry.setAttribute('aria-label',buttonTitle);entry.append(element('span',String(index+1).padStart(2,'0'),'video-mode-number'),titleRow,element('span',descriptions[mode],'video-mode-description'));actions.append(entry);
      if(mode==='intro'){
        const transition=element('details','','video-low-pressure'),summary=element('summary'),icon=modeIcon('intro'),content=element('div','','video-low-pressure-body');
        icon.firstChild.setAttribute('d','m16 3 5 5-12 12-6 1 1-6ZM13 6l5 5M4 15l5 5');
        summary.append(icon,element('strong','低压力学习过渡（可选）'));
        [['✏️ ','抄写：',' 抄写笔记，先轻松动笔。'],['','复述：',' 边抄边用自己的话讲出来。'],['','思考：',' 边抄边想为什么这样做。']].forEach(([symbol,label,text])=>{
          const paragraph=element('p',symbol);paragraph.append(element('strong',label),document.createTextNode(text));content.append(paragraph);
        });
        const note=element('p','','video-low-pressure-note');note.append(element('strong','不要求抄完全部内容，进入状态后即可开始阶段二。'));
        content.append(note);transition.append(summary,content);actions.append(transition);
      }
    });
    const guide=element('details','','video-use-guide');guide.open=guideOpen;
    const guideBody=element('div');global.PocketReviewUI.videoFurtherStages(guideBody);
    guide.append(element('summary','熟练后的视频使用指南'),guideBody);
    const transition=actions.querySelector('.video-low-pressure');
    host.append(element('h4','三个学习阶段','video-modes-label'),actions,transition,guide);
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
    const segmentedEntry=button('进入视频分段＋重做学习',()=>{
      try{
        segmentSelection=0;
        api.save(next=>model.saveProgress(next,'continuous','step',0));
        global.PocketNavigation.checkpoint();open({view:'continuous'});
      }catch(error){notice.textContent=error.message;}
    });
    segmentedEntry.hidden=true;current.append(segmentedEntry);
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
    const handoff=element('div','','video-module-handoff');
    card.append(current,preview,details,notice,actions,handoff);
    function refresh() {
      const progress=model.progress(api.get()),index=progress[mode];
      position.textContent=`当前步骤 ${index+1}/${steps.length}`;stepTitle.textContent=steps[index].title;
      current.classList.toggle('video-intro-first-step',mode==='intro' && index===0);
      if(originalSteps)description.replaceChildren(steps[index].body);else description.textContent=steps[index].text;
      if(mode==='intro' && index===0){
        description.replaceChildren(moduleAdvice(steps[index].text));
      }
      if(mode==='intro' && index===1){
        const content=element('div','','video-intro-selection');
        steps[index].text.split('\n\n').forEach((text,position)=>{
          if(position===0){content.append(element('h3',text));return;}
          if(text.startsWith('- ')){
            const list=element('ul');text.split('\n').forEach(line=>{
              const item=element('li'),value=line.slice(2),split=value.indexOf(' → ');
              item.append(element('strong',value.slice(0,split)),document.createTextNode(value.slice(split)));list.append(item);
            });content.append(list);return;
          }
          const paragraph=element('p');
          if(text.startsWith('①')||text.startsWith('②'))paragraph.append(element('strong',text));
          else if(text.startsWith('问自己：'))paragraph.append(document.createTextNode('问自己：'),element('strong',text.slice(4)));
          else {const split=text.indexOf('：')+1;paragraph.append(element('strong',text.slice(0,split)),document.createTextNode(text.slice(split)));}
          content.append(paragraph);
        });
        const tabs=element('div','','video-intro-selection-tabs');tabs.setAttribute('role','group');tabs.setAttribute('aria-label','收获与问题');
        const panels=[element('section','','video-intro-selection-panel'),element('section','','video-intro-selection-panel')];
        const footer=element('div','','video-intro-selection-footer');let selectedPanel;
        Array.from(content.children).slice(1).forEach(node=>{
          if(node.textContent.startsWith('①'))selectedPanel=panels[0];
          else if(node.textContent.startsWith('②'))selectedPanel=panels[1];
          else if(node.textContent.startsWith('阶段一原则：')||node.textContent.startsWith('一句话心得：'))selectedPanel=footer;
          selectedPanel.append(node);
        });
        const controls=['有收获','有问题'].map((title,selected)=>{
          const control=button(title,()=>{panels.forEach((panel,position)=>{panel.hidden=position!==selected;controls[position].setAttribute('aria-pressed',String(position===selected));});});
          control.setAttribute('aria-pressed',String(selected===0));return control;
        });
        panels[1].hidden=true;tabs.append(...controls);content.append(tabs,...panels,footer);description.replaceChildren(content);
      }
      if(mode==='intro' && index===2){
        const completion=element('p','','video-learning-finished');
        completion.append(element('strong',steps[index].text));description.replaceChildren(completion);
      }
      if(segmentGuide && index===0){
        const highlight='当前知识模块的视频',parts=steps[index].text.split(highlight);
        description.replaceChildren(document.createTextNode(parts[0]),element('span',highlight,'video-inline-highlight'),document.createTextNode(parts.slice(1).join(highlight)),segmentGuide);
      }
      if(mode==='continuous' && index===1){
        const content=element('div','','video-segment-detection');
        steps[index].text.split('\n\n').forEach(text=>{
          if(text.startsWith('- ')){const list=element('ul');text.split('\n').forEach(line=>list.append(element('li',line.slice(2))));content.append(list);}
          else if(/^[①②③④]/.test(text)||['重点提示：','完成标准：','补充说明：'].includes(text))content.append(element('h3',text));
          else content.append(element(text.startsWith('「')?'blockquote':'p',text));
        });
        const panels=[],cards=[],tabs=element('div','','video-segment-tabs');let group;
        tabs.setAttribute('role','group');tabs.setAttribute('aria-label','出题检测操作');
        Array.from(content.children).forEach(node=>{
          if(node.tagName==='H3'){
            if(/^[①②③④]/.test(node.textContent)){group=element('section','','video-segment-panel');panels.push(group);}
            else {group=element('section','','video-segment-info video-segment-info-'+cards.length);cards.push(group);}
          }
          if(node.tagName==='P'){
            const parts=node.textContent.split(/(「阶段2重新检测」|独立解释|值得保留)/g);node.replaceChildren();
            parts.forEach((part,index)=>node.append(index%2?element('span',part,'video-segment-emphasis'):document.createTextNode(part)));
          }
          group.append(node);
        });
        const controls=panels.map((panel,index)=>{
          panel.hidden=index!==segmentSelection;
          const control=button(panel.querySelector('h3').textContent,()=>{segmentSelection=index;panels.forEach((node,selected)=>{node.hidden=selected!==index;controls[selected].setAttribute('aria-pressed',String(selected===index));});});
          control.setAttribute('aria-pressed',String(index===segmentSelection));return control;
        });
        panels[1].append(recallTemplateEntry());
        tabs.append(...controls);content.replaceChildren(tabs,...panels,...cards);description.replaceChildren(content);
      }
      if(mode==='continuous' && index===2)description.append(masteryCard());
      questionEntry.hidden=mode!=='continuous' || index!==steps.length-1;
      segmentedEntry.hidden=mode!=='intro' || index!==steps.length-1;
      handoff.replaceChildren();
      if((mode==='continuous' && index===2) || (mode==='question' && index===steps.length-1)){
        if(mode==='continuous'){
          const grouping=element('section','','video-module-grouping');
          grouping.append(element('p','当前知识模块视频学习已完成，若不用进入逐道题突破，可自行选择推入到分组训练。','video-learning-muted'));handoff.append(grouping);
        }
        handoff.append(moduleReminder());
      }
      if(mode==='continuous' && index===2){
        nextTitle.replaceChildren(document.createTextNode('所有题目可独立重做的点击下方进入分组循环单条资料'),element('br'),document.createTextNode('有卡住的题目进入逐题突破，暂不新增单条资料'));
      }else nextTitle.textContent=index===steps.length-1?'重新循环':steps[index+1].title;
      previous.disabled=index===0;
      if(question){question.value=String(progress.currentQuestion);previousQuestion.disabled=progress.currentQuestion===1;}
    }
    try{refresh();}catch(error){notice.textContent=error.message;previous.disabled=true;next.disabled=true;}
    page.append(card);global.PocketNavigation.remember({page:'video-learning',view:mode});global.scrollTo?.(0,0);title.focus({preventScroll:true});return true;
  }
  global.PocketVideoLearningUI=Object.freeze({attach:bridge=>{api=bridge;},home,open});
  global.PocketNavigation.register('video-learning',open);
})(globalThis);
