(function (global) {
  'use strict';
  let videoPage, videoSources=[], videoStateApi;
  const videoStates = [['idle','○ 未开始'],['doing','◐ 进行中'],['done','✓ 已完成'],['stuck','! 卡住了']];
  function videoProgress(state) {
    const data=state.videoStageProgress;
    if(data===undefined)return {version:1,entries:[]};
    if(!data || data.version!==1 || !Array.isArray(data.entries) || new Set(data.entries.map(item=>item?.key)).size!==data.entries.length ||
      data.entries.some(item=>!item || typeof item.key!=='string' || !Array.isArray(item.states) || item.states.length!==7 ||
        ['cycles','revision'].some(field=>item[field]!==undefined && (!Number.isSafeInteger(item[field]) || item[field]<0)) ||
        item.states.some(value=>!videoStates.some(([key])=>key===value))))throw Error('VIDEO 环节状态异常，原数据已保留。');
    return data;
  }
  function element(tag, text, className) {
    const node = document.createElement(tag);
    if (text) node.textContent = text;
    if (className) node.className = className;
    return node;
  }
  function videoIntroduction(container, context = null) {
    const progressKey=context ? JSON.stringify([context.materialId,context.groupKey]) : null;
    const counter=element('span','已循环 0 次','video-cycle-count'), updates=[];
    const refresh=()=>{
      const record=progressKey && videoStateApi ? videoProgress(videoStateApi.get()).entries.find(item=>item.key===progressKey) : null;
      counter.textContent=`已循环 ${record?.cycles ?? 0} 次`;
      updates.forEach(update=>update(record));
      return record;
    };
    const heading=element('p','一、完全陌生和能做一些题：','task-guidance video-guidance-stage');heading.append(counter);
    let stepIndex=0;
    const step=(title,paragraphs)=>{
      const index=stepIndex++, section=element('details','','task-guidance video-step');
      const summary=element('summary'), control=element('span','','operational-status-control');
      const status=element('button','','operational-status-button');status.type='button';
      status.setAttribute('aria-expanded','false');
      const menu=element('span','','operational-status-menu');menu.hidden=true;
      const notice=element('p','','field-error');notice.setAttribute('role','status');
      let saved='idle', selection=null;
      const update=()=>{status.textContent=videoStates.find(([key])=>key===saved)[1];status.setAttribute('data-state',saved);status.setAttribute('aria-label',title+'：'+status.textContent+'，选择步骤状态');};
      updates.push(record=>{saved=record?.states[index] || 'idle';update();});
      try {if(progressKey && videoStateApi)saved=videoProgress(videoStateApi.get()).entries.find(item=>item.key===progressKey)?.states[index] || 'idle';}
      catch(error){notice.textContent=error.message;status.disabled=true;}
      if(!progressKey || !videoStateApi)status.disabled=true;
      control.addEventListener('click',event=>{event.preventDefault();event.stopPropagation?.();});
      status.addEventListener('click',()=>{
        try {
          if(menu.hidden){const record=refresh();selection={revision:record?.revision ?? 0,used:false};}
          menu.hidden=!menu.hidden;status.setAttribute('aria-expanded',String(!menu.hidden));
        }catch(error){notice.textContent='状态未读取：'+error.message;}
      });
      videoStates.forEach(([value,label])=>{
        const option=element('button',label);option.type='button';
        option.addEventListener('click',()=>{
          if(!selection || selection.used || menu.hidden)return;
          try {
            videoStateApi.save(next=>{
              if(context.materialId!=='@focus' && !next.materials.some(material=>material.id===context.materialId))throw Error('资料已不存在，未修改环节状态。');
              const data=JSON.parse(JSON.stringify(videoProgress(next)));
              let record=data.entries.find(item=>item.key===progressKey);
              if(!record){record={key:progressKey,states:Array(7).fill('idle')};data.entries.push(record);}
              if((record.revision ?? 0)!==selection.revision)throw Error('本组状态已变化，请重新选择状态。');
              if(record.states[index]!==value){
                const revision=(record.revision ?? 0)+1;
                if(!Number.isSafeInteger(revision))throw Error('状态版本超出有效范围，未修改。');
                if(index===6 && value==='done'){
                  const cycles=(record.cycles ?? 0)+1;
                  if(!Number.isSafeInteger(cycles))throw Error('循环次数超出有效范围，未修改。');
                  record.cycles=cycles;record.states=Array(7).fill('idle');
                }else record.states[index]=value;
                record.revision=revision;
              }
              next.videoStageProgress=data;
            });
            selection.used=true;refresh();notice.textContent='';menu.hidden=true;status.setAttribute('aria-expanded','false');
          }catch(error){notice.textContent='状态未保存：'+error.message;}
        });menu.append(option);
      });
      control.append(status,menu);summary.append(element('span',title,'video-step-title'),control);
      section.append(summary);
      const body=element('div','','video-step-body');let paragraphGroup=body;
      paragraphs.forEach(([label,text,highlight])=>{
        if(label){
          if(['格式：','AI 提问模板：','录音格式：'].includes(label)){
            paragraphGroup=element('section','','video-body-inset');body.append(paragraphGroup);
          }else if(['完成标准：','达标要求：'].includes(label)){
            paragraphGroup=element('section','','video-body-standard');body.append(paragraphGroup);
          }else if(/^（\d+）/.test(label))paragraphGroup=body;
          const color=['优先检查课前问题：','完成标准：'].includes(label) ? ' video-label-warning' : /^（[123]）/.test(label) || ['本质问题：（课前不要求一定提出，不拖慢进度）','（4）带着问题听课'].includes(label) ? ' video-label-section' : '';const caption=element('p','','video-step-label'+color);caption.append(element('strong',label));paragraphGroup.append(caption);
        }
        const paragraph=element('p',highlight ? '' : text);
        if(highlight){
          const position=text.indexOf(highlight);
          paragraph.append(element('span',text.slice(0,position)),element('span',highlight,'video-inline-highlight'),element('span',text.slice(position+highlight.length)));
        }
        paragraphGroup.append(paragraph);
      });
      section.append(body,notice);update();return section;
    };
    container.append(element('p', '看视频的三个阶段', 'task-title'),
      heading,
      step('1、自己尝试', [['','自己尝试理解和重做讲义内容。'],['操作：','先自己独立做题、尝试理解知识点。'],['','想不出来 → 看题目答案。'],['','每次只参考答案的一步，然后遮住答案，从头尝试自己做。'],['','反复模仿、独立重做，争取不听网课，仅靠参考答案就能自己做出来。','争取不听网课，仅靠参考答案就能自己做出来。'],['','暂时做不到的题目不必一直卡住，标记后进入下一步。','暂时做不到的题目不必一直卡住，标记后进入下一步。']]),
      step('2、标注问题（课前）', [
        ['（1）标注卡点','独立看答案讲义，遇到不懂、不会的地方直接标注，不深入解决。'],
        ['（2）记录问题','白板记录题号，具体问题集中写进「课前问题笔记本」。','白板记录题号，具体问题集中写进「课前问题笔记本」。'],
        ['格式：','第几题 → 哪个选项或步骤 → 两句话精准提问：'],
        ['表面问题：','这里为什么这样做？我具体哪里不懂？'],
        ['本质问题：（课前不要求一定提出，不拖慢进度）','我为什么想不到？缺少什么知识、判断依据或思考能力？'],
        ['（3）训练精准提问','先自己尝试把困惑压缩成两句话。'],
        ['','不会就把完整描述发给 AI，让 AI 教自己如何压缩，并分析从表面问题找到本质问题的思考路径。'],
        ['AI 提问模板：','「这是我的问题描述：。'],
        ['','请教我如何删掉多余信息、保留关键条件，把困惑压缩成两句话：一句表面问题，一句本质底层核心问题。'],
        ['','再还原你从表面问题找到本质问题的思考过程，教我以后如何独立完成。不要附和我，不确定就说明。」'],
        ['（4）带着问题听课','重点听老师有没有解决课前提出的问题。'],
        ['完成标准：','标注卡点，记录题号，尽量提出两个精准问题，进入听课。']]),
      step('3、看视频', [['看视频','']]),
step('4、边看边速记（一个字：快！）', [['优先检查课前问题：','边听课边对照「课前问题笔记本」，检查老师有没有解决自己课前提出的问题。','边听课边对照「课前问题笔记本」'],['','老师讲解后，自己已经大致理解：在答案讲义对应的课前提问位置打 ✓。'],['','老师没有解决，或者自己仍然不理解：打 ✗。'],['','此时只标记 ✓ 或 ✗，不急着写答案。','此时只标记 ✓ 或 ✗，不急着写答案。'],['（1）百度网盘：标记位置','遇到不会的题、重要思路，直接在百度网盘视频的标记功能标注题号，不写长笔记，不反复暂停。','直接在百度网盘视频的标记功能标注题号'],['（2）OneNote：录音速记收获','发现新思路、疑问或关键步骤，截图此时网课页面＋直接在 OneNote 录音，不深入整理。','截图此时网课页面＋直接在 OneNote 录音'],['录音格式：','开头提问： 先提出一个能帮助自己以后回忆这里的理解或收获的问题。'],['','自由讲述： 接着把当时想到的思路、疑问、理解和收获直接讲出来，不要求组织得完整。'],['（3）答案讲义：符号速记','边看视频，边在答案讲义上用波浪线、圈画、箭头、问号等符号标记重点，不专门暂停写笔记。'],['完成标准：','课前问题已标记 ✓ 或 ✗，重要视频位置标好了，截图，收获和问题录下了，讲义重点圈好了。']]),
      step('5、关视频，主动回忆', [['先处理课前问题：','打开「课前问题笔记本」。'],['','打 ✓ 的问题： 不看视频+自己写问题答案'],['','打 ✗ 的问题： 提问 AI，复述，抄写默写，一句话问题答案'],['（1）看标记，整理onenote笔记','关掉视频，看百度视频标记和答案讲义。'],['','看onenote的截图和录音，自己提纯并写下录音中的问题，有收获的直接写收获在答案讲义上'],['（2）分析总结','1、自己尝试回答问题，然后截图和说一遍提纯后的问题发给AI，让AI分析'],['','2、告诉AI自己的答案，分析与正确理解差距在哪里'],['','3、让AI用一个简短段落总结：我的最初理解、我的问题、正确理解，以及解决什么问题才能纠正理解、独立做对题目。'],['完成标准：','能大致回忆重点，自己写出主要收获即可，不必完全理解。']]),
      step('6、再次独立重做', [['','重做题目→发现问题和收获→补充标注笔记→直到成功重做'],['达标要求：','能重做出来或者模糊说出来是什么即可，不用完全深入思考到没有疑问。']]),
      step('7、进入分组学习', [['','按1-6步逐题突破视频中有问题的题目后'],['','新增资料分组每组题目多少道题'],['','根据当前能力，自主选择训练内化、构建解题体系、自主刷题和实战操作','训练内化、构建解题体系、自主刷题和实战']]));
    try {refresh();}catch(error){counter.textContent='循环状态无法读取';}
  }
  function videoFurtherStages(container) {
    const instruction=(number,title,text)=>{
      const paragraph=element('p','','task-guidance');
      if(number)paragraph.append(element('span',number,'video-guide-step-number'));
      paragraph.append(element('strong',title,'video-guide-step-label'),document.createTextNode(text));return paragraph;
    };
    container.append(element('p', '二、能独立做对很多题', 'task-guidance video-guidance-stage'),
      instruction('1. ','倍速查漏：',' 快速看视频，重点关注老师与自己不同的思路、方法和技巧。'),
      instruction('2. ','标注收获：',' 记录自己没想到的新方法，必要时暂停并独立复现。'),
      instruction('','原则：',' 已熟练的内容快速跳过，只学习有价值的新经验。'),
      element('p', '三、已经进入大量刷题阶段（选做）', 'task-guidance video-guidance-stage'),
      instruction('1. ','主动回忆：',' 脱离视频，回忆老师讲课的知识和解题思路。'),
      instruction('2. ','模仿讲解：',' 自己尝试讲出来，再核对、反思、补漏。'),
      instruction('','原则：',' 以独立复现为主，不强制重新看视频。'));
  }
  function firstStageSteps() {
    const container=element('div');videoIntroduction(container);
    const steps=Array.from(container.children).filter(node=>(node.className || '').split(' ').includes('video-step'));
    const added=element('details','','task-guidance video-step'),summary=element('summary'),body=element('div','','video-step-body');
    summary.append(element('span','5、独立重做','video-step-title'));
    body.append(element('p','尝试自己再次独立重做'));added.append(summary,body);steps.splice(4,0,added);
    steps.splice(2,1);
    const watchingBody=Array.from(steps[2].children).find(node=>node.className==='video-step-body');
    watchingBody.prepend(element('h3','边看边速记（一个字：快！）'));
    steps.forEach((node,index)=>{
      const title=node.children[0].children[0];
      title.textContent=index===2?'3、看视频':index===4?'5、复盘':index===6?'7、逐道题目都能独立重做→进入分组学习':title.textContent.replace(/^\d+、/,`${index+1}、`);
    });
    return steps;
  }
  function arrangeVideo(container) {
    const nodes=Array.from(container.children);
    container.replaceChildren();
    let stage, notes;
    nodes.forEach(node=>{
      if((node.className || '').includes('task-title') && node.textContent==='看视频的三个阶段')node.hidden=true;
      if ((node.className || '').includes('video-guidance-stage')) {
        stage=element('details','','video-stage');notes=element('div','','video-stage-notes');
        stage.hidden=node.textContent.startsWith('一、');
        const summary=element('summary',node.childNodes?.[0]?.textContent || node.textContent,node.className);
        summary.append(...Array.from(node.children));stage.append(summary);container.append(stage);
      } else if (stage && (node.className || '').includes('task-guidance')) {
        if ((node.className || '').includes('video-step') || /^\d+、/.test(node.textContent)) stage.append(node);
        else if (node.textContent.startsWith('小段观看')) {node.className+=' video-cycle';stage.append(node);}
        else {notes.append(node);if(notes.parentElement!==stage)stage.append(notes);}
      } else container.append(node);
    });
  }
  function output(task, options) {
    task.setAttribute('data-output-task','true');
    task.append(element('h3', '当前任务', 'task-eyebrow'), element('span', 'OUTPUT', 'step-badge'));
    const choices = element('div', '', 'output-entries'), video = element('section'), questions = element('section');
    questions.append(element('p', '请选择本次输出内容', 'task-title'),
      element('p', '根据自己当前的水平，在输出模型中选择一个合适阶段的操作执行，达到输出目标。', 'task-guidance'),
      global.PocketOutputSOP.createEntries(), options.outputLinks());
    const back = element('button', '← 返回 OUTPUT', 'practice-back'); back.type = 'button';
    const complete=options.complete();
    complete.className=((complete.className || '')+' output-task-complete').trim();
    let sources=[],sourceScroll=0;
    function restoreSource() {
      sources.forEach(([node,hidden])=>{node.hidden=hidden;});
      if(videoPage)videoPage.hidden=true;
      task.append(complete);
    }
    function show(name, opening = false) {
      if (name === 'video') {
        if(opening)global.PocketNavigation?.checkpoint?.();
        if (!video.children.length) {options.video(video);arrangeVideo(video);}
        Array.from(video.children).filter(node=>(node.className || '').includes('video-stage')).forEach(stage=>{stage.open=false;});
        sources=videoPage && !videoPage.hidden ? videoSources : ['pocket-main','relearning','focus-review'].map(id=>document.getElementById(id)).filter(Boolean).map(node=>[node,node.hidden]);
        videoSources=sources;
        sourceScroll=global.scrollY || 0;
        if (!videoPage) {videoPage=element('main','','practice-tool video-learning-view');videoPage.id='video-learning-view';document.body.append(videoPage);}
        const videoBack=element('button','← 返回 OUTPUT','practice-back');videoBack.type='button';
        videoBack.addEventListener('click',()=>{
          if(global.PocketNavigation)global.PocketNavigation.back();
          if(!videoPage.hidden){restoreSource();show('');global.scrollTo?.(0,sourceScroll);}
          if(global.PocketNavigation?.current?.().page==='home')global.PocketLearning?.openVideoPanel?.();
        });
        const title=element('h1','VIDEO｜分阶段视频学习');title.tabIndex=-1;
        video.className='video-learning-content';video.hidden=false;
        videoPage.replaceChildren(videoBack,title,element('p','根据当前掌握程度，选择对应的视频学习方法。','practice-intro'),video,complete);
        global.PocketNavigation?.hideTools();
        sources.forEach(([node])=>{node.hidden=true;});videoPage.hidden=false;
        global.scrollTo?.(0,0);title.focus({preventScroll:true});
      }
      choices.hidden = !!name; questions.hidden = name !== 'questions'; back.hidden = !name;
      options.onView(name);
    }
    [['分阶段视频学习', 'video', '初次接触陌生题目，边做边模仿，对标视频学习高手思路。'],
      ['训练内化', 'questions', '每次复习深化操作，自由选择训练方式，把学过的方法练成自己的能力。']].forEach(([label, name, description]) => {
      const entry = element('button', '', 'output-entry'); entry.type = 'button';
      entry.hidden=name==='video';
      entry.append(element('strong', label), element('span', description));
      entry.addEventListener('click', () => show(name, true)); choices.append(entry);
    });
    const summaryEntry=element('button','','output-entry');summaryEntry.type='button';
    summaryEntry.append(element('strong','构建解题体系'),element('span','核心方法 · 必读','output-entry-emphasis'),element('span','单题 → 组题 → 章节 → 回忆补漏 → 综合验收'));
    summaryEntry.addEventListener('click',()=>{global.PocketNavigation.checkpoint();global.PocketSummaryCards.open();});
    choices.append(summaryEntry);
    const practiceEntry=element('button','','output-entry');practiceEntry.type='button';
    practiceEntry.append(element('strong','自主刷题与实战'),element('span','核心目标 · 必练','output-entry-emphasis'),element('span','自主筛题 → 脱离视频 → 大量刷题 → 全真模考 → 专题补强'));
    practiceEntry.addEventListener('click',()=>{global.PocketNavigation.checkpoint();global.PocketIndependentPractice.open();});
    choices.append(practiceEntry);
    complete.addEventListener('click',()=>{if(complete.parentElement===videoPage){restoreSource();show('');}},{capture:true});
    back.addEventListener('click', () => show(''));
    task.append(choices, back, questions);
    if(options.records)task.append(options.records);
    if(options.videoLinks)task.append(options.videoLinks());
    task.append(complete);show(options.view || '');
  }
  function metrics(container, options) {
    const group = options.values, keyStatus = options.status;
    const inputs = {};
    for (const [field, id, label, maximum] of [
      ['latestAccuracyPercent', 'group-latest-accuracy', '本组题目最新正确率（答对题数/总题数）', 100],
      ['latestDurationMinutes', 'group-latest-duration', '本组题目最新用时（分钟）', null]
    ]) {
      const wrapper = element('div'), caption = element('label', label); caption.setAttribute('for', (options.idPrefix || '') + id);
      const ratioField = field === 'latestAccuracyPercent';
      const input = element('input'); input.id = (options.idPrefix || '') + id; input.type = ratioField ? 'text' : 'number';
      inputs[field] = input;
      input.min = '0'; input.step = 'any'; input.inputMode = 'decimal';
      if (maximum !== null) input.max = String(maximum);
      if (ratioField) { input.inputMode = 'text'; input.placeholder = '例如：8/10'; }
      input.value = ratioField ? group.latestAccuracyRatio || '' : group[field] == null ? '' : String(group[field]);
      const display = ratioField ? element('p', '', 'data-management-help') : null;
      const showPercent = (value, ratio) => { if (display) display.textContent = value == null ? '未填写' : Number(value.toFixed(2)) + '%' + (ratio ? '（' + ratio + '）' : '（旧记录）'); };
      if (ratioField) showPercent(typeof group[field] === 'number' ? group[field] : null, group.latestAccuracyRatio);
      input.addEventListener('input', () => {
        const raw = input.value.trim(), match = ratioField && raw !== '' ? /^(\d+)\s*\/\s*(\d+)$/.exec(raw) : null;
        const numerator = match ? Number(match[1]) : NaN, denominator = match ? Number(match[2]) : NaN;
        const ratio = match ? match[1] + '/' + match[2] : null, value = raw === '' ? null : ratioField ? numerator / denominator * 100 : Number(raw);
        if ((ratioField && raw !== '' && (!match || !Number.isSafeInteger(numerator) || !Number.isSafeInteger(denominator) || denominator <= 0 || numerator > denominator)) || input.validity?.badInput || (value !== null && (!Number.isFinite(value) || value < 0 || (maximum !== null && value > maximum)))) {
          keyStatus.textContent = ratioField ? '请填写答对题数/总题数，如 8/10；总题数须大于 0，答对题数不能超过总题数。' : '用时请填写非负数，或留空。'; return;
        }
        try { options.save(field, value, ratio); keyStatus.textContent = ''; if (ratioField) showPercent(value, ratio); }
        catch (_) { keyStatus.textContent = '保存失败，当前输入仍保留，请重试输入。'; }
      });
      wrapper.append(caption, input); if (display) wrapper.append(display); container.append(wrapper);
    }
    return inputs;
  }
  global.PocketReviewUI = Object.freeze({ output, metrics, videoIntroduction, videoFurtherStages, videoProgress, firstStageSteps, attachVideoState:api=>{videoStateApi=api;} });
})(globalThis);
