(function (global) {
  'use strict';
  let page;
  const element=(tag,text='',className='')=>{
    const node=document.createElement(tag);node.textContent=text;if(className)node.className=className;return node;
  };
  function labelled(label,text) {
    const node=element('li');node.append(element('strong',label+' '),element('span',text));return node;
  }
  function card(title,id) {
    const details=element('details','','summary-question-card'),body=element('div','','summary-question-body');details.id=id;
    details.append(element('summary',title),body);page.append(details);return body;
  }
  function roadmap() {
    const labels=['网课辅助','自主刷题','全真模考'],wrapper=global.PocketGuideRoadmap.create(labels),svg=wrapper.children[0];
    wrapper.className='guide-roadmap practice-roadmap';
    const header=element('div','','practice-roadmap-header');header.append(element('span','学习进阶路线'),element('span','两大核心训练'));
    svg.setAttribute('viewBox','0 0 500 160');svg.replaceChildren();
    const namespace='http://www.w3.org/2000/svg',line=document.createElementNS(namespace,'path');
    line.setAttribute('d','M120 52H210M290 52H380');line.setAttribute('class','practice-roadmap-line');svg.append(line);
    labels.forEach((label,index)=>{
      const position=80+index*170,group=document.createElementNS(namespace,'g'),circle=document.createElementNS(namespace,'circle'),number=document.createElementNS(namespace,'text'),caption=document.createElementNS(namespace,'text');
      group.setAttribute('class',index===2?'practice-roadmap-node practice-roadmap-goal':'practice-roadmap-node');
      circle.setAttribute('cx',String(position));circle.setAttribute('cy','52');circle.setAttribute('r','40');
      number.setAttribute('x',String(position));number.setAttribute('y','52');number.setAttribute('text-anchor','middle');number.setAttribute('dominant-baseline','central');number.setAttribute('class','practice-roadmap-number');number.textContent=String(index+1).padStart(2,'0');
      caption.setAttribute('x',String(position));caption.setAttribute('y','128');caption.setAttribute('text-anchor','middle');caption.setAttribute('class','practice-roadmap-caption');caption.textContent=label;
      group.append(circle,number,caption);svg.append(group);
    });
    wrapper.replaceChildren(header,svg);return wrapper;
  }
  function open() {
    if(!page){page=element('main','','practice-tool summary-cards-page');page.id='independent-practice';document.body.append(page);}
    global.PocketNavigation.hideTools();document.getElementById('pocket-main').hidden=true;
    page.hidden=false;page.replaceChildren();
    const back=element('button','← 返回当前任务','practice-back');back.type='button';back.addEventListener('click',()=>global.PocketNavigation.back());
    const title=element('h1','自主刷题与实战');title.tabIndex=-1;page.append(back,title);
    page.append(element('p','从网课辅助学习，到独立应对高考陌生题','guide-subtitle'),roadmap());
    const practice=card('A｜自主刷题：逐步脱离视频','independent-practice-a');
    const actions=element('ol'),split=labelled('题目分流：',''),types=element('ul'),standards=element('ul');
    [['简单题：','限时独立做对，重点练速度与准确率。'],['边界题：','重点深做，试做 → 看答案 → 模仿 → 关答案重做 → 新题验证。'],['很难题：','暂时跳过并标记，必要时以后再学。']].forEach(([label,text])=>types.append(labelled(label,text)));split.append(types);
    actions.append(labelled('独立试做：','自己拿题目先做，判断当前掌握程度。'),split,
      labelled('自主突破：','对边界题自己分析答案，定位卡点、提出问题，必要时借助资料或 AI。'),
      labelled('独立验证：','关掉答案重做，尝试迁移到同模型新题。'),
      labelled('逐步过渡：','根据实际表现，逐渐提高脱离做网课题，听视频对标复盘，自己可以不听，独立刷题的比例。'));
    ['能独立判断哪些题练速度、哪些题深做、哪些题暂时跳过。','能主要依靠答案解析和自主提问，学会大部分值得投入的边界题。','能独立重做并迁移方法到同模型新题。','能合理分配时间，避免长期卡在收益过低的难题上。'].forEach(text=>standards.append(element('li',text)));
    practice.append(element('h2','目标：'),element('p','从依赖网课讲义和老师示范，逐渐过渡到能够自己筛题、看答案、自主学习和大量刷题。'),element('h2','操作：'),actions,element('h2','达标标准：'),standards);
    const exam=card('B｜全真模考：检验考场能力','independent-practice-b'),questions=element('ul');
    ['当时怎么想？','哪里卡住？','为什么换路？','为什么没有换路？'].forEach(text=>questions.append(element('li',text)));
    exam.append(element('h2','01｜全真限时模拟'),element('p','按高考规定时间和真实答题环境，独立完成第一次见到的试卷。'),
      element('h2','02｜考场思维复盘'),element('p','写小作文，还原：'),questions,element('p','同时关注做对但耗时过长的题。'),
      element('h2','03｜对标解题体系'),element('p','把题目、作答和思维复盘交给 AI，对照「构建解题体系」五层模型的达标标准，定位知识、识别、选路、执行或检查环节的断点。'),
      element('p','AI 不应在证据不足时强行判断断点。'),element('h2','04｜专题突破'),element('p','根据暴露的断点，返回对应分组或章节进行专项训练。'),
      element('p','补强后使用新的陌生试卷重新模拟检测。'));
    const cycle=element('section','','summary-fixed-flow guide-practice-cycle');
    cycle.append(element('h2','持续进步闭环'),element('h3','循环：'),element('p','自主刷题 → 全真模考 → 思维复盘 → 定位断点 → 专题补强 → 再次模考。'));page.append(cycle);
    global.PocketNavigation.remember({page:'independent-practice'});global.scrollTo?.(0,0);title.focus({preventScroll:true});return true;
  }
  global.PocketIndependentPractice=Object.freeze({open});global.PocketNavigation.register('independent-practice',open);
})(globalThis);
