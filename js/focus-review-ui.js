(function (global) {
  'use strict';
  const model = global.PocketFocusReview;
  let api, page, view = {}, busy = false;
  const filterDrafts = new Map();
  const collectionDrafts = new Map();
  const element = (tag, text, className) => {
    const node = document.createElement(tag);
    if (text) node.textContent = text;
    if (className) node.className = className;
    return node;
  };
  function button(text, action, className = 'secondary') {
    const node = element('button', text, className); node.type = 'button';
    node.addEventListener('click', () => {
      if (busy || node.disabled) return;
      try { action(); } catch (error) { status(error.message); }
    });
    return node;
  }
  function status(message) {
    const node = page && !page.hidden ? document.getElementById('focus-review-status') : document.getElementById('message');
    if (node) { node.textContent = message; node.hidden = false; }
  }
  function save(change) {
    if (busy) throw Error('正在保存，请稍候。');
    busy = true;
    try { api.save(change); refreshStatistics(); } finally { busy = false; }
  }
  function field(parent, label, value = '', multiline = false) {
    const wrapper = element('label', label, 'focus-field'), input = element(multiline ? 'textarea' : 'input');
    input.value = value; if (multiline) input.rows = 3;
    wrapper.append(input); parent.append(wrapper); return input;
  }
  function confirmInline(parent, title, action) {
    const section = element('section', '', 'focus-confirm'); section.setAttribute('role', 'group');
    section.append(element('p', title), button('取消', () => section.remove()), button('确认', () => {
      action(); section.remove();
    })); parent.append(section);
  }
  function questionList(parent, questions, kind = '') {
    if (['library', 'group'].includes(kind)) questions = questions.filter(question => isEffective(model.root(api.get()), question));
    const byMaterial = new Map();
    questions.forEach(question => {
      if (!byMaterial.has(question.materialId)) byMaterial.set(question.materialId, []);
      byMaterial.get(question.materialId).push(question);
    });
    for (const items of byMaterial.values()) {
      const names = model.names(api.get(), items[0]), row = element('section', '', 'focus-question focus-strip');
      row.setAttribute('data-list-kind', kind);
      row.append(element('p', names.subject + ' · ' + names.title, 'focus-strip-title'),
        element('p', '第 ' + [...new Set(items.map(question => question.number))].join('、') + ' 题', 'focus-strip-numbers'));
      const found = model.locate(api.get(), items[0]), material = found?.material;
      const links = material ? (kind === 'video' ? material.videoLinks || [] : kind === 'output' ? material.outputLinks || [] :
        [...(material.videoLinks || []), ...(material.outputLinks || [])]).filter(link => global.PocketExternalLinks.canNavigate(link.url)) : [];
      if (links.length && ['video', 'output'].includes(kind)) {
        const sources = element('details'); sources.append(element('summary', '查看原资料'));
        links.forEach(link => {
          const anchor = element('a', link.title || '查看原资料'); anchor.href = link.url; anchor.target = '_blank'; anchor.rel = 'noopener noreferrer'; sources.append(anchor);
        }); row.append(sources);
      }
      parent.append(row);
    }
  }
  function open(next = {}) {
    if (!api) return false;
    view = { page: 'focus-review', subject: next.subject || '', focusGroup: next.focusGroup || '', outputPage: next.outputPage || '', questionList: next.questionList === true };
    if (!page) {
      page = element('main', '', 'practice-tool focus-review'); page.id = 'focus-review'; document.body.append(page);
    }
    global.PocketNavigation.hideTools(); document.getElementById('pocket-main').hidden = true;
    page.hidden = false; page.replaceChildren();
    page.append(button('← 返回', () => global.PocketNavigation.back(), 'practice-back'));
    if (view.questionList) page.append(element('h1', '重点题列表'));
    else if (!view.focusGroup && !view.subject) page.append(element('h1', '重点复习系统'));
    const notice = element('p'); notice.id = 'focus-review-status'; notice.setAttribute('role', 'status'); page.append(notice);
    global.PocketNavigation.remember(view);
    try {
      const data = model.root(api.get());
      if (view.focusGroup) renderGroup(data);
      else if (view.questionList && view.subject) {
        const questions = model.ordered(api.get(), view.subject);
        questionList(page, questions, 'library');
        if (!questions.length) page.append(element('p', '暂无有效重点题。'));
      }
      else if (view.subject) renderSubject(data);
      else renderSubjects(data);
    } catch (error) { status(error.message); }
    return true;
  }
  function renderSubjects(data) {
    page.append(element('p', '独立重点题库与训练记录，不进入原资料间倒序或每日正序复习。'));
    if (!data.questions.length) page.append(element('p', '重点题库为空。请在原 Group 的「本组重点题目」中收集。'));
    const subjects = [...new Set(data.questions.map(question => question.subjectKey))];
    for (const subject of subjects) {
      const section = element('section', '', 'practice-condition'), questions = data.questions.filter(question => question.subjectKey === subject);
      section.append(element('h2', subjectTitle(questions)), element('p', subjectStatistics(data, subject)),
        button('进入学科 →', () => open({ subject })),
        button('重点题列表 →', () => {
          global.PocketNavigation.remember({ ...view, scrollY: global.scrollY || 0 });
          open({ subject, questionList: true });
          global.scrollTo?.(0, 0);
        }));
      page.append(section);
    }
    const active = model.active(api.get());
    if (active) page.append(button('继续正在进行的重点 Group →', () => open({ subject: active.group.subjectKey, focusGroup: active.group.id })));
  }
  function subjectTitle(questions) {
    return [...new Set(questions.map(question => model.names(api.get(), question).subject))].join('、') || '来源不可用';
  }
  function isEffective(data, question) {
    const current = data.questions.find(item => item.id === question.id);
    return current?.status === 'active' && !!model.locate(api.get(), current) && !!model.locate(api.get(), question);
  }
  function effectiveGroups(data, subject) {
    return data.groups.filter(group => (subject === undefined || group.subjectKey === subject) && !group.retiredAt &&
      group.members.some(member => isEffective(data, member)));
  }
  function subjectStatistics(data, subject, compact = false) {
    const questions = model.ordered(api.get(), subject);
    const groups = effectiveGroups(data, subject);
    return `重点题：${questions.length}道 · ${compact ? '' : '待分组：' + model.available(api.get(), subject).length + '道 · '}重点 Group：${groups.length}组`;
  }
  function renderSubject(data) {
    const subject = view.subject, plan = model.groupingPlan(api.get(), subject);
    page.append(element('h2', subjectTitle(data.questions.filter(question => question.subjectKey === subject))));
    page.append(element('p', subjectStatistics(data, subject, true), 'focus-subject-statistics'));
    const creation = element('section', '', 'focus-create');
    const filterDraft = filterDrafts.get(subject) || {};
    creation.append(element('h3', '筛选重点题'));
    const filterFields = element('div', '', 'focus-filter-fields');
    function filterField(label, name, selectedLabel, maximum) {
      const wrapper = element('label', label, 'focus-field'), select = element('select');
      select.id = 'focus-filter-' + name + '-mode';
      for (const [value, title] of [['none', '无要求'], ['limit', selectedLabel]]) {
        const option = element('option', title); option.value = value; select.append(option);
      }
      select.value = filterDraft[name] === undefined || filterDraft[name] === null ? 'none' : 'limit';
      const input = element('input'); input.id = 'focus-filter-' + name; input.type = 'number'; input.min = '0'; input.step = 'any'; input.disabled = select.value === 'none'; input.value = filterDraft[name] ?? '';
      input.setAttribute('aria-label', label + '阈值');
      if (maximum !== undefined) input.max = String(maximum);
      select.addEventListener('change', () => { input.disabled = select.value === 'none'; updatePreview(); });
      input.addEventListener('input', updatePreview);
      wrapper.append(select, input); filterFields.append(wrapper);
      return () => select.value === 'none' ? null : input.value;
    }
    const accuracyFilter = filterField('正确率', 'accuracy', '低于指定百分比', 100);
    const durationFilter = filterField('用时', 'duration', '超过指定分钟数');
    const result = element('p', '', 'focus-subject-statistics'); result.setAttribute('role', 'status');
    const filters = () => ({ accuracy: accuracyFilter(), duration: durationFilter() });
    function updatePreview() {
      try {
        const conditions = filters(); filterDrafts.set(subject, conditions);
        const preview = model.groupingPlan(api.get(), subject, conditions);
        result.textContent = `筛选结果：${preview.questions.length}道`;
      } catch (error) { result.textContent = error.message; }
    }
    creation.append(filterFields, result); updatePreview();
    const quantity = field(creation, '每组题数'); quantity.id = 'focus-group-size'; quantity.inputMode = 'numeric';
    if (!plan.questions.length) page.append(element('p', model.active(api.get()) ? '当前没有可重新分组的题目，正在复习的分组保持不变。' : '暂无可训练的重点题。'));
    const groupButton = button('分组', () => {
      const size = quantity.value;
      if (!/^\d+$/.test(size) || !Number.isSafeInteger(Number(size)) || Number(size) < 1) throw Error('每组题数必须为正整数。');
      if (model.active(api.get())?.group.subjectKey === subject) throw Error('当前学科有未完成的重点复习，请先继续完成，再重新分组；原进度和历史未修改。');
      const conditions = filters(), selected = model.groupingPlan(api.get(), subject, conditions);
      if (!selected.questions.length) throw Error('暂无符合条件的重点题');
      const expected = { questionIds: selected.questions.map(question => question.id), groupIds: selected.groupIds, filters: conditions };
      const apply = confirmed => { save(state => model.regroup(state, subject, size, expected, confirmed)); open(view); status('分组已保存。'); };
      if (selected.groupIds.length) confirmInline(creation, '按首次保存顺序对本次筛选的有效重点题重新分组？未选中题目及旧分组、正确率、用时和全部历史会保留。', () => apply(true));
      else apply(false);
    });
    groupButton.disabled = !plan.questions.length;
    const allButton = button('全部复习', () => {
      let id;
      save(state => {
        id = model.startAll(state, subject);
        global.PocketReviewAdmission?.markClicked(state, 'focus');
      });
      open({ subject, focusGroup: id });
    });
    const hasGroupedQuestions = model.allQuestions(api.get(), subject).length > 0;
    allButton.disabled = !hasGroupedQuestions;
    if (!hasGroupedQuestions) creation.append(element('p', '暂无已分组的重点题', 'focus-subject-statistics'));
    const actions = element('div', '', 'focus-group-actions'); actions.append(groupButton, allButton);
    creation.append(actions); page.append(creation);
    const running = model.active(api.get());
    const groups = data.groups.filter(group => group.subjectKey === subject && (running?.group.id === group.id ||
      !group.retiredAt && group.members.some(member => isEffective(data, member))));
    page.append(element('h3', '共 ' + groups.length + ' 组'));
    groups.forEach(group => {
      const row = element('div', '', 'focus-group-row');
      const titles = [...new Set(group.members.filter(question => isEffective(data, question)).map(question => model.names(api.get(), question).title))];
      row.append(element('span', titles.join('、')));
      const review = button('复习', () => reviewGroup(group));
      review.disabled = !!running && running.group.id !== group.id; row.append(review); page.append(row);
    });
  }
  function reviewGroup(group) {
    save(state => model.start(state, group.id)); open({ subject: group.subjectKey, focusGroup: group.id });
  }
  function renderGroup(data) {
    const group = model.findGroup(api.get(), view.focusGroup);
    if (!group) throw Error('重点 Group 不存在，历史未删除。');
    const current = model.active(api.get());
    if (current?.group.id === group.id) {
      const { run, index, question, questionRun } = current;
      if (!isEffective(data, question)) {
        save(state => model.transition(state, run.id, 'skipInactive', questionRun, Date.now(), index));
        open(view); return;
      }
      page.append(element('p', `${group.mode === 'all' ? '全部重点题' : '重点 Group ' + group.number} · 第 ${index + 1}/${run.members.length} 题`, 'assignment-title'));
      questionList(page, [question], 'review');
      const record = element('section', '', 'group-key-questions');
      record.append(element('h3', '本组重点题目', 'focus-record-title'));
      const keyStatus = element('p', '', 'field-error'); keyStatus.setAttribute('role', 'status');
      const metrics = element('div', '', 'group-latest-metrics');
      const savedMetrics = run.metricsScope === 'group' || run.groupReviews ? model.metricRecord(api.get()) : { accuracy: '', durationMinutes: '', notes: '' };
      const legacyAllMetrics = group.mode === 'all' && !run.groupReviews;
      const ratio = savedMetrics.accuracy ? savedMetrics.accuracy.split('/').map(Number) : null;
      const values = () => model.metricRecord(api.get());
      const recording = patch => {
        const active = model.active(api.get()), currentRun = active?.run;
        if (!currentRun || active.run.id !== run.id || active.index !== index) throw Error('复习任务已变化，请返回后重试。');
        const previous = currentRun.groupReviews || currentRun.metricsScope === 'group' ? model.metricRecord(api.get()) : savedMetrics;
        save(state => model.transition(state, run.id, 'save', { accuracy: previous.accuracy, durationMinutes: previous.durationMinutes, notes: previous.notes || currentRun.notes, ...patch }, Date.now(), index));
        renderHistory(history, group.id);
      };
      const inputs = global.PocketReviewUI.metrics(metrics, { idPrefix: 'focus-', values: { latestAccuracyRatio: savedMetrics.accuracy,
        latestAccuracyPercent: ratio ? ratio[0] / ratio[1] * 100 : null,
        latestDurationMinutes: savedMetrics.durationMinutes === '' ? null : Number(savedMetrics.durationMinutes) },
        status: keyStatus, save: (field, value, accuracy) => recording(field === 'latestAccuracyPercent' ?
          { accuracy: accuracy || '' } : { durationMinutes: value === null ? '' : String(value) }) });
      if (legacyAllMetrics) {
        Object.values(inputs).forEach(input => { input.disabled = true; });
        keyStatus.textContent = '旧轮仅保存了整轮成绩，无法可靠拆分到各 Group；原成绩保留，本轮继续后可新开一轮分别记录。';
      }
      record.append(metrics, keyStatus); page.append(record);
      const task = element('section', '', 'current-task');
      global.PocketReviewUI.output(task, {
        view: view.outputPage || '',
        onView: name => { view.outputPage = name; global.PocketNavigation.remember(view); },
        outputLinks: () => {
          const sources = element('div'); questionList(sources, [question], 'output'); return sources;
        },
        video: container => {
          container.append(element('h3', '当前任务', 'task-eyebrow'), element('span', 'VIDEO', 'step-badge'),
            element('p', '预习+看视频', 'task-title'), element('p', '1、自己尝试理解和重做讲义内容', 'task-guidance'),
            element('p', '2、有问题的标注问题（不深入）', 'task-guidance'), element('p', '3、开始看本组对应的视频内容', 'task-guidance'));
          questionList(container, [question], 'video');
        },
        complete: () => button('输出达标 → 下一步', () => {
          const finalValues = { accuracy: inputs.latestAccuracyPercent.value, durationMinutes: inputs.latestDurationMinutes.value, notes: values()?.notes || '' };
          save(state => {
            const active = model.active(state);
            if (active?.run.id !== run.id || active.index !== index) throw Error('复习任务已变化。');
            if (active.session.step === 'video') model.transition(state, run.id, 'videoSkip', finalValues, Date.now(), index);
            model.transition(state, run.id, 'finish', finalValues, Date.now(), index);
          });
          open({ subject: group.subjectKey, focusGroup: group.id });
          status(model.active(api.get()) ? '当前题已保存，继续下一题。' : group.mode === 'all' ? '全部重点题复习完成' : '本重点 Group 复习完成');
        }, '')
      });
      page.append(task);
      const removal = element('section', '', 'focus-question-removal');
      const removalRow = element('div', '', 'focus-group-row');
      const selection = element('div');
      removalRow.append(element('span', '本组题目已降为秒杀的简单题，可移除'), button('移除', () => {
        const questions = model.removalQuestions(api.get());
        selection.replaceChildren();
        const checkboxes = questions.map(question => {
          const label = element('label', '', 'focus-removal-choice'), checkbox = element('input');
          checkbox.type = 'checkbox'; checkbox.checked = false;
          const names = model.names(api.get(), question);
          label.append(checkbox, element('span', names.subject + ' · ' + names.title + ' · 第 ' + question.number + ' 题'));
          selection.append(label);
          return { checkbox, id: question.id };
        });
        const confirm = button('确认移出所选题目', () => {
          const selected = checkboxes.filter(item => item.checkbox.checked).map(item => item.id);
          const finalValues = { accuracy: inputs.latestAccuracyPercent.value, durationMinutes: inputs.latestDurationMinutes.value, notes: values()?.notes || '' };
          save(state => model.removeSelected(state, run.id, index, selected, finalValues));
          open({ subject: group.subjectKey, focusGroup: group.id });
          status(model.active(api.get()) ? '所选题目已移出重点训练，当前队列已更新。' : '所选题目已移出，本轮已结束；移出不计作 OUTPUT 达标。');
        });
        confirm.disabled = true;
        checkboxes.forEach(({ checkbox }) => checkbox.addEventListener('change', () => { confirm.disabled = !checkboxes.some(item => item.checkbox.checked); }));
        selection.append(button('取消', () => selection.replaceChildren()), confirm);
        if (!questions.length) selection.append(element('p', '本组暂无有效重点题。'));
      }));
      removal.append(removalRow, selection); page.append(removal);
    } else {
      if (group.runs.some(run => run.completedAt !== null)) page.append(element('h3', group.runs.at(-1)?.outputCompleted ?
        group.mode === 'all' ? '全部重点题复习完成' : '本重点 Group 复习完成' : '本轮已结束（无 OUTPUT 达标，不计今日有效复习）', 'completion-title'));
      questionList(page, group.members, 'group');
      if (!group.retiredAt && group.mode !== 'all') {
        const review = button('复习', () => reviewGroup(group));
        review.disabled = !!current;
        page.append(review);
      }
    }
    const history = element('details'); renderHistory(history, group.id); page.append(history);
  }
  function renderHistory(history, groupId) {
    const group = model.findGroup(api.get(), groupId);
    history.replaceChildren(element('summary', `复习记录：${group.runs.filter(run => run.completedAt !== null).length}次`),
      element('h4', group.mode === 'all' ? '全部复习记录' : '当前 Group 复习记录'));
    if (!group.runs.length) history.append(element('p', '暂无当前 Group 复习记录。'));
    group.runs.forEach(run => appendHistoryRun(history, group, run));
    if (group.mode === 'all') return;

    // Resolve history through immutable question IDs and run member snapshots, never Group numbers or grades.
    const data = model.root(api.get()), memberIds = new Set(group.members.map(member => member.id));
    const overlaps = run => (run.members || []).some(member => memberIds.has(member.id));
    const allRuns = (data.allReviews || []).flatMap(owner => owner.runs
      .filter(run => overlaps(run) && !group.runs.some(record => record.sourceAllRunId === run.id)).map(run => ({ owner, run })));
    const allIds = new Set(allRuns.map(({ run }) => run.id));
    const related = data.groups.filter(owner => owner.id !== group.id).flatMap(owner => owner.runs
      .filter(run => overlaps(run) && !allIds.has(run.sourceAllRunId)).map(run => ({ owner, run }))).concat(allRuns);
    related.sort((a, b) => (b.run.startedAt ?? -1) - (a.run.startedAt ?? -1));
    const previous = element('details');
    previous.append(element('summary', `相关历史复习记录：${related.length}条`),
      element('p', '以下为当前题目参与过的历史训练；整组成绩仅属于当时的 Group，不计入当前 Group 的成绩和复习次数。'));
    if (!related.length) previous.append(element('p', '暂无相关历史复习记录。'));
    related.forEach(({ owner, run }) => {
      const entry = element('details');
      entry.append(element('summary', `${owner.mode === 'all' ? '全部复习' : '原重点 Group ' + owner.number} · ${new Date(run.startedAt).toLocaleString()}`),
        element('p', `原分组建立于：${new Date(owner.createdAt).toLocaleString()}`));
      appendHistoryRun(entry, owner, run, true);
      previous.append(entry);
    });
    history.append(previous);
  }
  function historyMembers(parent, members) {
    // Use stored names even if a source has since been renamed, removed, or become unavailable.
    const materials = new Map();
    (members || []).forEach(member => {
      const label = `${member.subjectName || member.subjectKey || '当时学科未保存'} · ${member.materialTitle || '当时资料名称未保存'}`;
      const key = JSON.stringify([member.materialId, label]);
      if (!materials.has(key)) materials.set(key, { label, numbers: [] });
      materials.get(key).numbers.push(member.number);
    });
    materials.forEach(({ label, numbers }) => parent.append(element('p', `${label} · 第 ${numbers.join('、')} 题`)));
  }
  function appendHistoryRun(history, group, run, related = false) {
    const filled = value => String(value ?? '').trim() || '未填写';
    if (related) {
      history.append(element('p', group.mode === 'all' ? '全部复习记录（整轮历史，非单组训练）' :
        run.sourceAllRunId ? '来自全部复习的 Group 记录（非单组训练）' : '单组重点复习记录'));
      historyMembers(history, run.members);
    } else if (run.sourceAllRunId) history.append(element('p', '来自全部复习的 Group 记录（非单组训练）'));
    history.append(element('p', `${new Date(run.startedAt).toLocaleString()} · ${run.completedAt === null ? '进行中' :
      (run.outputCompleted ? '完成：' : '结束（无 OUTPUT 达标）：') + new Date(run.completedAt).toLocaleString()}${run.groupReviews ? '' : ' · 重点 Group ' + (group.number ?? '来源不可用') + ' · 正确率：' + filled(run.accuracy) + ' · 用时：' + filled(run.durationMinutes) + '分钟'}`), element('p', run.notes));
    for (const review of run.groupReviews || []) {
      const original = model.findGroup(api.get(), review.groupId);
      const started = Number.isFinite(review.startedAt) ? ' · 开始：' + new Date(review.startedAt).toLocaleString() : '';
      const ended = Number.isFinite(review.completedAt) ? ' · ' + (review.outputCompleted ? '完成：' : '结束（无 OUTPUT 达标）：') + new Date(review.completedAt).toLocaleString() : '';
      history.append(element('p', `重点 Group ${original?.number ?? '来源不可用'} · ${review.completedAt === null ? '未完成' : '已结束'} · 正确率：${filled(review.accuracy)} · 用时：${filled(review.durationMinutes)}分钟${started}${ended}`));
      if (related) {
        if (original) history.append(element('p', `原分组建立于：${new Date(original.createdAt).toLocaleString()}`));
        historyMembers(history, review.members);
      }
    }
    (run.questionProgress || []).forEach((record, index) => {
      if (!record.accuracy && String(record.durationMinutes ?? '').trim() === '') return;
      const question = run.members[index];
      if (!question || record.questionId !== question.id) return;
      const names = related ? { subject: question.subjectName || question.subjectKey || '当时学科未保存', title: question.materialTitle || '当时资料名称未保存' } : model.names(api.get(), question);
      history.append(element('p', `旧版逐题记录（非整组成绩） · ${names.subject} · ${names.title} · 第 ${question.number} 题 · 正确率：${record.accuracy || '未填写'} · 用时：${record.durationMinutes || '未填写'}分钟`));
    });
  }
  function collection(parent, materialId, index) {
    const section = element('section', '', 'focus-collection');
    const notice = element('p'); notice.setAttribute('role', 'status');
    const choices = element('div', '', 'focus-number-choices');
    const selectedCount = element('p', '已选择：0道', 'data-management-help'); selectedCount.setAttribute('role', 'status');
    const previous = element('p', '', 'data-management-help focus-collection-history'), list = element('div');
    let origin, numbers = [], selected = new Set(), signature = '';
    const collect = button('加入重点复习系统', () => {
      try {
        if (section.isConnected === false) throw Error('当前页面已变化，请使用当前 Group 的加入按钮。');
        if (!selected.size) throw Error('请先勾选本次需要加入的题目。');
        const submitted = numbers.filter(number => selected.has(number));
        let result;
        save(state => {
          const current = model.source(state, materialId, index);
          if (current.groupKey !== origin.groupKey || JSON.stringify(model.groupNumbers(current.group)) !== signature) throw Error('原 Group 或题号范围已变化，请重新进入后核实。');
          result = model.add(state, materialId, index, submitted.join('、'));
          const recorded = new Set();
          const old = typeof current.group.keyQuestions === 'string' ? current.group.keyQuestions : '';
          for (const line of old.split(/\r?\n/)) { try { model.parse(line).forEach(number => recorded.add(number)); } catch (_) {} }
          const additions = submitted.filter(number => !recorded.has(number));
          if (additions.length) current.group.keyQuestions = [old, `第${additions.join('、')}题`].filter(Boolean).join('\n');
        });
        selected.clear(); refresh(); notice.textContent = `已加入${result.added}道，已有${result.duplicates}道。`;
      } catch (error) { notice.textContent = '未收集：' + error.message; }
    });
    function updateCount() { selectedCount.textContent = `已选择：${selected.size}道`; collect.disabled = selected.size === 0; }
    function refresh() {
      choices.replaceChildren(); list.replaceChildren();
      origin = model.source(api.get(), materialId, index);
      numbers = model.groupNumbers(origin.group); signature = JSON.stringify(numbers);
      const draftKey = JSON.stringify([materialId, origin.groupKey, numbers]);
      if (!collectionDrafts.has(draftKey)) collectionDrafts.set(draftKey, new Set());
      selected = collectionDrafts.get(draftKey);
      const existing = model.root(api.get()).questions.filter(question => question.materialId === materialId && model.locate(api.get(), question)?.group === origin.group);
      numbers.forEach(number => {
        const saved = existing.find(question => question.number === number);
        const label = element('label', '', 'focus-number-choice'), checkbox = element('input'); checkbox.type = 'checkbox';
        checkbox.setAttribute('data-question-number', String(number)); checkbox.setAttribute('aria-label', `第${number}题`);
        if (saved?.status === 'active') selected.delete(number);
        checkbox.checked = selected.has(number); checkbox.disabled = saved?.status === 'active';
        const stateText = saved ? saved.status === 'active' ? ' · 已加入' : ` · ${saved.status === 'mastered' ? '已熟练' : '已移出'}（勾选加入可恢复）` : '';
        label.append(checkbox, element('span', `第${number}题${stateText}`));
        checkbox.addEventListener('change', () => { if (checkbox.disabled) return; if (checkbox.checked) selected.add(number); else selected.delete(number); updateCount(); });
        choices.append(label);
      });
      previous.textContent = typeof origin.group.keyQuestions === 'string' && origin.group.keyQuestions ? '已保存重点题目：' + origin.group.keyQuestions : '';
      existing.filter(question => isEffective(model.root(api.get()), question)).forEach(question => {
        const row = element('div', `第${question.number}题 · ${{ active: '训练中', mastered: '已熟练', removed: '已移出' }[question.status]}`);
        const target = question.status === 'active' ? 'removed' : 'active';
        row.append(button(target === 'active' ? '重新加入' : '移出重点题库', () => confirmInline(row, '确认变更？原记录和当前重点 Group 快照不变。', () => {
          save(state => model.setStatus(state, question.id, target)); refresh(); notice.textContent = '已保存。';
        }))); list.append(row);
      });
      updateCount();
    }
    section.append(choices, selectedCount, previous, collect, notice, list);
    try { refresh(); } catch (error) { choices.replaceChildren(); collect.disabled = true; notice.textContent = error.message; }
    parent.append(section);
  }
  function entry(parent, statisticsParent = parent) {
    const entryButton = button('重点复习系统', () => {
      if (global.PocketReviewAdmission) save(state => global.PocketReviewAdmission.markClicked(state, 'focus'));
      const origin = global.PocketNavigation.pocket();
      const openDetails = Array.from(document.querySelectorAll?.('details[id]') || []).filter(node => node.open).map(node => node.id);
      global.PocketNavigation.remember({ ...origin, scrollY: global.scrollY || 0, openDetails }); open();
    });
    entryButton.id = 'focus-review-home-button';
    entryButton.className = 'secondary' + (global.PocketReviewAdmission?.shouldAnimateFocus(api.get()) ? ' daily-review-attention' : '');
    parent.append(entryButton);
    const statistics = element('p', '', 'today-review-statistics'); statistics.id = 'focus-review-statistics'; statisticsParent.append(statistics);
    refreshStatistics();
  }
  function refreshStatistics() {
    const statistics = document.getElementById('focus-review-statistics');
    if (!statistics || !api) return;
    try {
      const data = model.root(api.get());
      statistics.textContent = `重点题 ${data.questions.filter(question => isEffective(data, question)).length} 道 · 重点 Group ${effectiveGroups(data).length} 组`;
    } catch (error) { statistics.textContent = error.message; }
  }
  global.PocketFocusReviewUI = Object.freeze({ attach: bridge => { api = bridge; }, collection, entry, open });
  global.PocketNavigation.register('focus-review', open);
})(globalThis);
