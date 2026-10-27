(function (global) {
  'use strict';
  function element(tag, text, className) {
    const node = document.createElement(tag);
    if (text) node.textContent = text;
    if (className) node.className = className;
    return node;
  }
  function videoIntroduction(container) {
    container.append(element('p', '看视频的三个阶段', 'task-title'),
      element('p', '一、完全陌生和能做一些题：', 'task-guidance video-guidance-stage'),
      element('p', '1、自己尝试理解和重做讲义内容', 'task-guidance'),
      element('p', '2、有问题的标注问题（不深入）', 'task-guidance'),
      element('p', '3、开始看本组对应的视频内容', 'task-guidance'));
    const note = element('p', '', 'task-guidance');
    note.append(element('span', '4、过程中在'), element('strong', '有答案的讲义', 'video-guidance-highlight'), element('span', '标注做笔记自己觉得有收获的地方'));
    container.append(note, element('p', '5、点击进入下一阶段的输出', 'task-guidance'));
  }
  function videoFurtherStages(container) {
    container.append(element('p', '二、能独立做对很多题：', 'task-guidance video-guidance-stage'),
      element('p', '1、倍速看，查漏补缺老师讲的不同的做法', 'task-guidance'),
      element('p', '2、有新的收获就行', 'task-guidance'),
      element('p', '三、已经进入大量刷题阶段：（选做）', 'task-guidance video-guidance-stage'),
      element('p', '1、快速回忆老师讲这个讲义网课的时候怎么讲的', 'task-guidance'),
      element('p', '2、自己模仿老师去讲这堂课的思路、核对、反思', 'task-guidance'));
  }
  function output(task, options) {
    task.append(element('h3', '当前任务', 'task-eyebrow'), element('span', 'OUTPUT', 'step-badge'));
    const choices = element('div', '', 'output-entries'), video = element('section'), questions = element('section');
    questions.append(element('p', '请选择本次输出内容', 'task-title'),
      element('p', '根据自己当前的水平，在输出模型中选择一个合适阶段的操作执行，达到输出目标。', 'task-guidance'),
      global.PocketOutputSOP.createEntries(), options.outputLinks());
    const back = element('button', '← 返回 OUTPUT', 'practice-back'); back.type = 'button';
    function show(name) {
      if (name === 'video' && !video.children.length) options.video(video);
      choices.hidden = !!name; video.hidden = name !== 'video'; questions.hidden = name !== 'questions'; back.hidden = !name;
      options.onView(name);
    }
    [['视频', 'video'], ['输出', 'questions']].forEach(([label, name]) => {
      const entry = element('button', label, 'output-entry'); entry.type = 'button';
      entry.addEventListener('click', () => show(name)); choices.append(entry);
    });
    back.addEventListener('click', () => show('')); show(options.view || '');
    task.append(choices, back, video, questions, options.complete());
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
