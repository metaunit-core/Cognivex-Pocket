(function (global) {
  'use strict';
  const cards = [
    {
      title:'单题总结卡｜每做完一道重点题',
      goal:'掌握一条能够迁移到陌生题的解题路径。',
      actions:['对比自己与老师的解法，找到最初的卡点和关键突破口。','对照达标标准，发现哪里还不懂，就自主提问、分析、模仿、重做。','自己提炼一句心得：看到什么 → 想到什么 → 先做什么。','关掉答案独立重做，必要时找一道变式题验证。'],
      standards:['能独立做对原题，理解关键步骤为什么这样做。','知道什么题目特征会触发这个方法，以及适用条件。','能把这个方法迁移到同模型的新题。','能自主提出并解决自己的问题，独立写出一句可迁移的解题心得。']
    },
    {
      title:'组题总结卡｜每刷完一组题',
      goal:'学会识别题型，并判断不同情况应该选择什么方法。',
      actions:['翻看本组题目及单题心得。','自己按照核心解法分类，比较各类题的异同。','提炼每类题的识别特征、方法、适用条件和代表题号。','对比达标标准，自主提问补强，再用混合变式题验证。'],
      standards:['能独立把本组题按核心结构分类。','能说明每类题看到什么特征、想到什么方法。','能判断什么条件变化需要换方法，解释为什么。','面对本组模型的新题，不给题型提示，也能独立选路做对。']
    },
    {
      title:'章节总结卡｜每刷完一章题',
      goal:'把整章的知识、题型和方法连接成一张解题地图。',
      actions:['找到章节知识导图，按教材顺序核对知识点。','把各组题总结的题型、方法、选路条件补入导图，形成 A区：章节对标知识导图。','从整章题目中筛选典型题、边界题、易错题和特殊方法题，放入 B区：章节重点题目总结区。','在导图对应知识点旁标注重点题号，建立对应关系。','检查知识、题型和方法有没有遗漏，必要时自主提问补充。'],
      standards:['能说清整章主要知识及其联系。','每种主要题型都能找到对应知识、识别特征和解题路径。','能比较同章不同方法的适用条件，知道如何组合知识。','导图结构清晰，精选题目能够代表本章主要方法和关键难点。'],
      note:'这一阶段的重点是建立完整的对标资料，还不要求脱离资料全部回忆出来，那是下一阶段的任务。'
    },
    {
      title:'章节复现卡｜每次复现',
      goal:'脱离资料，在脑子里主动生成整章知识与解题地图。',
      actions:['只看教材目录，按知识顺序自己回忆、画出整章知识导图。','回忆每个知识点对应的题型、识别特征、方法和适用条件。','对照A区，标记遗漏、错误或不熟练的地方。','自主分析为什么遗漏，找到B区对应的重点题独立重做。','必要时找新变式题补强，最后合上资料再次回忆。'],
      standards:['只看教材目录，就能独立复现整章主要知识、题型和解题路径。','能主动回忆不同方法的识别特征与适用边界。','能自己定位回忆断点，提出问题并解决。','补强后能独立做对对应新题，间隔一段时间仍能回忆出来。']
    },
    {
      title:'综合验收卡｜定期混合刷题',
      goal:'在考场面对陌生题，快速找到合适路径，又快又对。',
      actions:['抽取跨章节、跨题型的陌生混合题。','不看任何提示，按照考试要求限时独立完成。','核对答案、用时和正确率，对比自己的目标。','对错题和超时题，定位问题出在识别、选路、执行还是检查。','回到对应章节和重点题补强，再用新题限时验证。'],
      standards:['能快速从陌生题中提取关键条件和数学结构。','能主动调用相关知识，比较并选择正确、稳妥的解题路径。','遇到没有现成模型的题，能尝试组合知识、构造路径，并及时止损换路。','在考试时间内达到设定的正确率和得分目标。']
    }
  ];
  let page;
  const element=(tag,text='',className='')=>{
    const node=document.createElement(tag);node.textContent=text;if(className)node.className=className;return node;
  };
  function labelled(tag,label,text) {
    const node=element(tag);
    if(label)node.append(element('strong',label+' '));
    node.append(element('span',text));return node;
  }
  function icon(index) {
    const namespace='http://www.w3.org/2000/svg',svg=document.createElementNS(namespace,'svg'),path=document.createElementNS(namespace,'path');
    svg.setAttribute('viewBox','0 0 24 24');svg.setAttribute('class','summary-level-icon');svg.setAttribute('aria-hidden','true');svg.setAttribute('focusable','false');
    path.setAttribute('d',[
      'M5 4h10l4 4v12H5ZM14 4v5h5M8 13h8M8 16h5',
      'M4 4h6v6H4ZM14 4h6v6h-6ZM4 14h6v6H4ZM14 14h6v6h-6Z',
      'M12 3v6M5 14V9h14v5M2 14h6v6H2ZM9 14h6v6H9ZM16 14h6v6h-6Z',
      'M4 10a8 8 0 1 1 1 8M4 4v6h6M12 7v5l3 2',
      'M12 3 4 6v6c0 4 4 7 8 9 4-2 8-5 8-9V6ZM8 12l3 3 5-6'
    ][index]);svg.append(path);return svg;
  }
  function open() {
    if(!page){page=element('main','','practice-tool summary-cards-page');page.id='summary-cards';document.body.append(page);}
    global.PocketNavigation.hideTools();document.getElementById('pocket-main').hidden=true;
    page.hidden=false;page.replaceChildren();
    const back=element('button','← 返回当前任务','practice-back');back.type='button';back.addEventListener('click',()=>global.PocketNavigation.back());
    const title=element('h1','构建解题体系');title.tabIndex=-1;page.append(back,title);
    const roadmap=global.PocketGuideRoadmap.create(['单题','组题','章节','复现','验收']);
    for(let index=0;index<5;index++){
      const number=document.createElementNS('http://www.w3.org/2000/svg','text');number.setAttribute('x',String(50+index*100));number.setAttribute('y','32');number.setAttribute('text-anchor','middle');number.setAttribute('class','summary-roadmap-number');number.setAttribute('aria-hidden','true');number.textContent=String(index+1).padStart(2,'0');roadmap.children[0].append(number);
    }
    page.append(roadmap);
    const diagnosis=element('section','','summary-fixed-flow'),loop=element('div','','summary-diagnosis-loop');
    ['明确本层达标标准','独立尝试，对比当前水平','发现差距，自主提出问题','查资料、对比、练习、解决问题','独立检测是否达到标准','未达标继续补强，达标后进入下一层'].forEach((text,index)=>{
      if(index){const arrow=element('p','↓');arrow.setAttribute('aria-hidden','true');loop.append(arrow);}loop.append(element('p',text));
    });
    diagnosis.append(element('h2','所有层次统一使用一个自我诊断循环'),loop);page.append(diagnosis);
    cards.forEach((card,index)=>{
      const details=element('details','','summary-question-card');details.id='summary-question-card-'+(index+1);
      const body=element('div','','summary-question-body'),actions=element('ol'),standards=element('ul');
      card.actions.forEach(text=>actions.append(element('li',text)));
      card.standards.forEach(text=>standards.append(element('li',text)));
      body.append(element('h2','目标：'),element('p',card.goal),element('h2','操作：'),actions,element('h2','达标标准：'),standards);
      if(card.note)body.append(labelled('p','注意：',card.note));
      const summary=element('summary'),heading=element('span','','guide-card-heading'),parts=card.title.split('｜');
      const level=element('span','LEVEL '+String(index+1).padStart(2,'0'),'guide-level');level.setAttribute('aria-hidden','true');
      heading.append(level,element('span',parts[0],'guide-card-name'),element('span','｜'+parts[1],'guide-card-timing'));
      summary.append(icon(index),heading);details.append(summary,body);page.append(details);
    });
    const final=element('section','','summary-fixed-flow'),table=element('table','','summary-levels'),head=element('thead'),header=element('tr'),rows=element('tbody');
    ['层次','最终必须具备的能力','留下什么'].forEach(text=>{const cell=element('th',text);cell.setAttribute('scope','col');header.append(cell);});head.append(header);
    [['单题','独立理解、找到突破口、迁移方法','一句话心得'],['组题','分类、识别特征、判断选路条件','组题规律'],['章节','把整章知识和解题方法连接起来','A区导图＋B区重点题'],['复现','脱离资料主动回忆，发现断点并补强','完整脑内地图'],['验收','陌生题快速选路，限时准确解答','考试得分能力']].forEach(values=>{const row=element('tr');values.forEach(text=>row.append(element('td',text)));rows.append(row);});table.append(head,rows);
    const tableTitle=element('h2','五个层次的核心区别'),tableScroll=element('div','','summary-table-scroll');tableTitle.id='summary-levels-heading';
    tableScroll.tabIndex=0;tableScroll.setAttribute('role','region');tableScroll.setAttribute('aria-labelledby',tableTitle.id);tableScroll.append(table);final.append(tableTitle,tableScroll);
    const principleCard=element('section','','summary-fixed-flow summary-principle'),insightCard=element('section','','summary-fixed-flow summary-insight');
    const principle=element('p','达标不是「我感觉自己懂了」，而是「我不看提示，能独立做出目标要求的表现」。'),quote='我不看提示，能独立做出目标要求的表现',parts=principle.textContent.split(quote);
    principle.replaceChildren(element('span',parts[0]),element('strong',quote),element('span',parts[1]));
    principleCard.append(element('h2','核心原则：'),principle);
    const insightTitle=element('h2','一句话心得：');insightTitle.append(icon(0));
    insightCard.append(insightTitle,element('p','单题练会找一条路，组题练会选路，章节建立整张地图，复习练不看地图也能找到路，综合验收练到面对真正陌生的题也能快速找路、又快又对。'));
    page.append(final,principleCard,insightCard);global.PocketNavigation.remember({page:'summary-cards'});global.scrollTo?.(0,0);title.focus({preventScroll:true});return true;
  }
  global.PocketSummaryCards=Object.freeze({open});
  global.PocketNavigation.register('summary-cards',open);
})(globalThis);
