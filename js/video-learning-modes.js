(function(global){
  'use strict';
  let api;
  const titles={bottomUp:'逐题构建模式',topDown:'整体推进模式'};
  const node=(tag,text='',className='')=>{const item=document.createElement(tag);item.textContent=text;item.className=className;return item;};
  function icon(name){
    const paths={blocks:'M3 3h7v7H3ZM14 3h7v7h-7ZM3 14h7v7H3ZM14 14h7v7h-7Z',layers:'m3 7 9-4 9 4-9 4ZM3 12l9 4 9-4M3 17l9 4 9-4',target:'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18M12 7a5 5 0 1 0 0 10 5 5 0 0 0 0-10M12 11v2',play:'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18M10 8l6 4-6 4Z',repeat:'M20 8a8 8 0 0 0-14-3L3 8m0-5v5h5M4 16a8 8 0 0 0 14 3l3-3m0 5v-5h-5',right:'m9 5 7 7-7 7',down:'M12 3v18m-6-6 6 6 6-6',check:'M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0M7 12l3 3 7-7'};
    const item=document.createElementNS('http://www.w3.org/2000/svg','svg'),path=document.createElementNS('http://www.w3.org/2000/svg','path');item.setAttribute('viewBox','0 0 24 24');item.setAttribute('aria-hidden','true');path.setAttribute('d',paths[name]);item.append(path);return item;
  }
  function card(title,subtitle,action,gold=false,graphic='layers'){
    const item=node(action?'button':'section','','video-path-card'+(gold?' video-path-gold':'')),heading=node('span','','video-path-heading');
    if(action){item.type='button';item.addEventListener('click',action);}
    heading.append(icon(graphic),node('strong',title));if(action)heading.append(icon('right'));item.append(heading);if(subtitle)item.append(node('span',subtitle,'video-path-muted'));return item;
  }
  const arrow=()=>{const item=node('div','','video-path-arrow');item.append(icon('down'));return item;};
  function enter(module,learningMode){global.PocketNavigation.checkpoint();global.PocketVideoLearningUI.open({view:module,learningMode});}
  function grouping(){global.PocketLearning.openHomeGrouping();}
  function groupCard(defaultNext=false){const item=card('进入新增资料分组',defaultNext?'默认下一步':'按照原有学习机制循环训练',grouping,true);item.classList.add('video-path-grouping');if(defaultNext)item.append(node('hr'),node('span','按照原有学习机制循环训练'));return item;}
  function optional(learningMode,short=false){
    const area=node('section','','video-path-optional'),heading=node('h3','可选深化操作');if(!short)heading.append(node('small','按需执行'));area.append(heading,node('p','根据实际掌握程度自主选择，不必全部执行。','video-path-muted'));
    area.append(card('分段看＋独立重做',short?'关联组题 · 深化理解 · 查漏补缺':'需要进一步理解一组题目之间的联系时使用。',()=>enter('continuous',learningMode)),card('知识模块速通',short?'完整重看 · 整体整合 · 模仿思维':'需要整体整合知识、深化理解、模仿老师思维时使用。',()=>enter('intro',learningMode),false,'repeat'));return area;
  }
  function newVideo(learningMode){const item=node('button','开始新视频学习','video-path-new');item.type='button';item.addEventListener('click',()=>{api.save(next=>global.PocketVideoLearning.saveProgress(next,'intro','step',0));enter('intro',learningMode);});return item;}
  function completion(text,learningMode,withOptional=false){const area=node('section','','video-path-completion'),item=card('新旧内容循环推进','',null,true,'check');item.append(node('p',text));const entry=node('button','进入新增资料分组','video-path-primary');entry.type='button';entry.addEventListener('click',grouping);item.append(entry);area.append(item);if(withOptional)area.append(optional(learningMode,true));area.append(newVideo(learningMode));return area;}
  function summary(mode){
    const bottom=mode==='bottomUp',item=card(titles[mode],bottom?'从局部到整体 · 按需深化':'从整体到局部 · 快速学习',()=>{global.PocketNavigation.checkpoint();open({view:mode});},bottom,bottom?'blocks':'layers');
    item.append(node('hr'),node('strong','适用场景'),node('span',bottom?'知识陌生、基础不熟练、连续看课容易遗忘，需要学一道、消化一道。':'已有知识基础，能够快速理解老师的讲解，并且可以独立完成多数题目。','video-path-muted'));return item;
  }
  function open(view={}){
    if(!api)return false;
    const mode=Object.hasOwn(titles,view.view)?view.view:'selection';
    if(mode!=='selection')api.save(next=>{const model=global.PocketVideoLearning;model.records(next);if(!next.videoLearning?.guidance)model.saveProgress(next,'intro','step',0);next.videoLearning.guidance.learningMode=mode;});
    global.PocketNavigation.hideTools();document.getElementById('pocket-main').hidden=true;
    let page=document.getElementById('video-learning-modes');if(!page){page=node('main','','practice-tool video-path-page');page.id='video-learning-modes';document.body.append(page);}page.hidden=false;
    const back=node('button','← 返回','practice-back');back.type='button';back.addEventListener('click',()=>global.PocketNavigation.back());const heading=node('h1',titles[mode]||'视频学习');heading.tabIndex=-1;page.replaceChildren(back,heading);
    if(mode==='selection'){
      page.append(node('h2','请选择视频学习模式'),node('p','根据当前的知识基础、理解能力及内容难度，选择适合自己的学习方式。','video-path-muted'),summary('bottomUp'),summary('topDown'));
      const auxiliary=node('section','','video-path-auxiliary');global.PocketVideoLearningUI.home(auxiliary,true);page.append(auxiliary);
    }else if(mode==='bottomUp'){
      page.append(node('p','从局部到整体 · 按需深化','video-path-muted'));
      const primary=card('逐题突破','',()=>enter('question',mode),false,'target');primary.querySelector('.video-path-heading').lastChild.replaceWith(node('small','主要操作','video-path-muted'));['01 独立重做','02 标注问题','03 看视频','04 复盘','05 再次独立重做'].forEach(text=>primary.append(node('span',text,'video-path-sub')));primary.append(node('hr'),node('strong','达标标准'),node('span','逐道题目都能够独立重做。'));page.append(primary,arrow(),groupCard(true),optional(mode));
    }else{
      const intro=card('从整体到局部','',null);intro.append(node('p','先建立整体认识，再分段深化，最后针对卡点进行突破。'));page.append(intro);
      [['intro','阶段一','完整观看视频，建立整体认识。'],['continuous','阶段二','分段理解，检测学习效果。'],['question','阶段三','针对卡住的题目，解决具体问题。']].forEach(([module,stage,text],index)=>{if(index)page.append(arrow());const entry=card(global.PocketVideoLearning.modes[module],text,()=>enter(module,mode));entry.classList.add('video-path-stage');const heading=entry.querySelector('.video-path-heading');heading.firstChild.remove();entry.insertBefore(node('span',stage,'video-path-stage-label'),heading);entry.prepend(node('span',String(index+1).padStart(2,'0'),'video-path-number'));page.append(entry);});page.append(arrow(),groupCard());
    }
    global.PocketNavigation.remember({page:'video-learning-modes',view:mode});global.scrollTo?.(0,0);heading.focus({preventScroll:true});return true;
  }
  global.PocketVideoModes=Object.freeze({attach:bridge=>{api=bridge;},open,enter,optional,completion,card,node,grouping});
  global.PocketNavigation.register('video-learning-modes',open);
})(globalThis);
