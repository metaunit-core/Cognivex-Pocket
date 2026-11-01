(function (global) {
  'use strict';
  let videoPage, videoSources=[];
  function element(tag, text, className) {
    const node = document.createElement(tag);
    if (text) node.textContent = text;
    if (className) node.className = className;
    return node;
  }
  function videoIntroduction(container) {
    container.append(element('p', '看视频的三个阶段', 'task-title'),
      element('p', '一、完全陌生和能做一些题：', 'task-guidance video-guidance-stage'),
      element('p', '1、自己尝试理解和重做讲义内容。', 'task-guidance'),
      element('p', '2、有问题的标注问题（不深入）。', 'task-guidance'),
      element('p', '3、开始看本组对应的视频内容，每看完一个完整的小知识块或例题就暂停，不必等整节课结束。', 'task-guidance'),
      element('p', '4、关掉视频，不看讲义，自己回忆并录音：「刚才老师到底讲了什么？为什么这么做？」哪怕只能回忆一点点，也先自己想。', 'task-guidance'));
    const note = element('p', '', 'task-guidance');
    note.append(element('span', '5、打开讲义，对标老师的讲解，找出自己忘记了什么、哪一步不会解释、哪个思路自己想不到。在'), element('strong', '有答案的讲义', 'video-guidance-highlight'), element('span', '上标注问题、错漏，以及自己觉得有收获的地方。'));
    const cycle = element('p', '', 'task-guidance');
    cycle.append(element('strong', '小段观看 → 关视频回忆 → 打开讲义对标补漏 → 独立讲解或重做。'));
    container.append(note,
      element('p', '6、脱离视频，尝试独立讲解知识点，或者独立重做例题。最后用一句话总结可以迁移到以后做题的经验。', 'task-guidance'),
      element('p', '7、完成本组视频学习后，点击进入下一阶段的 OUTPUT。', 'task-guidance'), cycle,
      element('p', '每完成一个完整的小知识块或例题，就尝试执行一次。不要等整节课结束才第一次回忆。如果能独立讲清楚或重做正确，就继续下一小段。', 'task-guidance'),
      element('p', '如果发现关键卡点：先标注问题，简单对标老师的讲解，能快速解决就继续。如果需要深入提问和反复教学，则留到 OUTPUT 的教学法中处理。', 'task-guidance'),
      element('p', '不要在 VIDEO 阶段强制执行完整的 OUTPUT 教学法。不要把每一个次要问题都变成必须立即解决的障碍。', 'task-guidance'));
  }
  function videoFurtherStages(container) {
    container.append(element('p', '二、能独立做对很多题：', 'task-guidance video-guidance-stage'),
      element('p', '1、倍速看，查漏补缺老师讲的不同做法。', 'task-guidance'),
      element('p', '2、有新的收获就行，重点标注自己没有想到的方法、思路或技巧。', 'task-guidance'),
      element('p', '3、必要时暂停视频，尝试脱离视频独立复现老师的新方法。', 'task-guidance'),
      element('p', '此时视频主要用于查漏补缺、学习不同做法、对比自己的思路与老师的思路、补充有价值的新经验。', 'task-guidance'),
      element('p', '不要求像第一阶段一样，对所有已经熟练的内容反复执行完整四步闭环。已经熟练掌握的部分可以快速通过。', 'task-guidance'),
      element('p', '三、已经进入大量刷题阶段：（选做）', 'task-guidance video-guidance-stage'),
      element('p', '1、快速回忆老师讲这个讲义网课的时候怎么讲的。', 'task-guidance'),
      element('p', '2、自己模仿老师去讲这堂课的思路、核对、反思。', 'task-guidance'),
      element('p', '重点是脱离视频，快速复现已有知识和解题思路。不需要强制重新观看完整课程，不增加额外的必做步骤。', 'task-guidance'));
  }
  function arrangeVideo(container) {
    const nodes=Array.from(container.children);
    container.replaceChildren();
    let stage, notes;
    nodes.forEach(node=>{
      if ((node.className || '').includes('video-guidance-stage')) {
        stage=element('details','','video-stage');notes=element('div','','video-stage-notes');
        stage.append(element('summary',node.textContent,node.className));container.append(stage);
      } else if (stage && (node.className || '').includes('task-guidance')) {
        if (/^\d+、/.test(node.textContent)) stage.append(node);
        else if (node.textContent.startsWith('小段观看')) {node.className+=' video-cycle';stage.append(node);}
        else {notes.append(node);if(notes.parentElement!==stage)stage.append(notes);}
      } else container.append(node);
    });
  }
  function output(task, options) {
    task.append(element('h3', '当前任务', 'task-eyebrow'), element('span', 'OUTPUT', 'step-badge'));
    const choices = element('div', '', 'output-entries'), video = element('section'), questions = element('section');
    questions.append(element('p', '请选择本次输出内容', 'task-title'),
      element('p', '根据自己当前的水平，在输出模型中选择一个合适阶段的操作执行，达到输出目标。', 'task-guidance'),
      global.PocketOutputSOP.createEntries(), options.outputLinks());
    const back = element('button', '← 返回 OUTPUT', 'practice-back'); back.type = 'button';
    const complete=options.complete();
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
        });
        const title=element('h1','VIDEO｜视频学习');title.tabIndex=-1;
        video.className='video-learning-content';video.hidden=false;
        videoPage.replaceChildren(videoBack,title,element('p','根据当前掌握程度，选择对应的视频学习方法。','practice-intro'),video,complete);
        global.PocketNavigation?.hideTools();
        sources.forEach(([node])=>{node.hidden=true;});videoPage.hidden=false;
        global.scrollTo?.(0,0);title.focus({preventScroll:true});
      }
      choices.hidden = !!name; questions.hidden = name !== 'questions'; back.hidden = !name;
      options.onView(name);
    }
    [['视频', 'video'], ['输出', 'questions']].forEach(([label, name]) => {
      const entry = element('button', label, 'output-entry'); entry.type = 'button';
      entry.addEventListener('click', () => show(name, true)); choices.append(entry);
    });
    complete.addEventListener('click',()=>{if(complete.parentElement===videoPage){restoreSource();show('');}},{capture:true});
    back.addEventListener('click', () => show(''));
    task.append(choices, back, questions, complete);show(options.view || '');
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
  global.PocketReviewUI = Object.freeze({ output, metrics, videoIntroduction, videoFurtherStages });
})(globalThis);
