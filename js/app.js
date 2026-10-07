(function () {
  'use strict';
  const storage = window.PocketStorage;
  const calculateGroups = window.PocketGrouping.calculateGroups;
  const executor = window.PocketExecutor;
  const normalizeExternalUri = window.PocketExternalLinks.normalizeUri;
  let state = storage.loadState();
  const message = document.getElementById('message');
  const content = document.getElementById('learning-content');
  const startButton = document.getElementById('start-button');
  const heading = document.getElementById('learning-heading');

  function showMessage(text) {
    message.textContent = text;
    message.hidden = !text;
  }

  function commit(change, redraw = true) {
    try {
      state = storage.updateState(state, change);
      // Separate write: completed material history must already be durable before advancing.
      if (state.materialReviewSession?.currentStep === 'materialCompletePending') {
        state = storage.updateState(state, next => window.PocketMaterialReview.advanceQueue(next));
        redraw = true;
      }
      showMessage('');
      if (redraw === 'global') renderGlobalReview();
      else if (redraw) render();
      return true;
    } catch (error) {
      if (state.materialReviewSession?.currentStep === 'materialCompletePending') {
        render();
        showMessage('本条资料复习历史已保存，队列切换保存失败。请重试保存或刷新页面。');
      } else showMessage('保存失败，操作未完成。请检查浏览器存储设置后重试。');
      return false;
    }
  }

  function getActiveSession() {
    const session = state.currentSession;
    return session && session.materialId && session.currentStep !== 'complete' ? session : null;
  }

  function element(tag, text, className) {
    const node = document.createElement(tag);
    if (text) node.textContent = text;
    if (className) node.className = className;
    return node;
  }

  function field(form, name, label, value, placeholder, numeric = false) {
    const input = element('input');
    input.id = name;
    input.name = name;
    input.value = value || '';
    input.placeholder = placeholder;
    if (numeric) input.inputMode = 'numeric';
    const caption = element('label', label);
    caption.htmlFor = name;
    form.append(caption, input);
    return input;
  }

  function renderBasic(session) {
    heading.textContent = '新资料';
    content.append(element('p', '吃透一个老师的思维刷讲义→大量分组刷题', 'new-material-guidance'));
    const draft = session.draft;
    const form = element('form');
    form.noValidate = true;
    const subject = field(form, 'subject', '学科', draft.subject, '例如：数学');
    const title = field(form, 'title', '资料名称', draft.title, '例如：函数第一课时');
    const error = element('p', '', 'field-error');
    error.setAttribute('role', 'alert');
    const button = element('button', '下一步：分组设置');
    button.type = 'submit';
    form.append(error, button);
    function saveDraft() {
      return commit(next => {
        next.currentSession.draft.subject = subject.value;
        next.currentSession.draft.title = title.value;
      }, false);
    }
    subject.addEventListener('input', saveDraft);
    title.addEventListener('input', saveDraft);
    form.addEventListener('submit', event => {
      event.preventDefault();
      if (!subject.value.trim() || !title.value.trim()) {
        error.textContent = '请填写学科和资料名称。';
        return;
      }
      commit(next => {
        next.currentSession.draft.subject = subject.value.trim();
        next.currentSession.draft.title = title.value.trim();
        next.currentSession.currentStep = 'grouping';
      });
    });
    content.append(form);
  }

  function rangeText(group) {
    return group.start === group.end ? String(group.start) : `${group.start}-${group.end}`;
  }

  function renderGroupLink(group, expected, kind) {
    const name = kind === 'video' ? '视频' : '输出';
    const property = `${kind}Links`;
    const links = window.PocketExternalLinks.getGroupLinks(group, kind);
    const area = element('section', '', 'video-link-area');
    const editor = element('div');
    function changeLinks(change) {
      try {
        const key = expected.sessionType === 'material-review' ? 'materialReviewSession' : 'currentSession';
        const { session, group: currentGroup } = executor.getCurrentGroup(state, key);
        if ((state.activeSessionType || 'learning') !== expected.sessionType || currentGroup !== group ||
            session.materialId !== expected.materialId || session.currentGroupIndex !== expected.currentGroupIndex ||
            session.currentRunIndex !== expected.currentRunIndex || session.mode !== expected.mode ||
            session.currentStep !== expected.currentStep) return;
        // Independent storage write: never advance a learning or review queue.
        state = storage.updateState(state, next => {
          const target = executor.getCurrentGroup(next, key).group;
          target[property] = window.PocketExternalLinks.getGroupLinks(target, kind).map(link => ({ ...link }));
          change(target[property]);
        });
        showMessage('');
        render();
      } catch (error) {
        showMessage('保存失败，操作未完成。请检查浏览器存储设置后重试。');
      }
    }
    function renderEditor(existing) {
      editor.replaceChildren();
      const form = element('form');
      form.noValidate = true;
      const title = field(form, `group-${kind}-title`, '名称', existing?.title,
        kind === 'video' ? '例如：老师A｜本组课程' : '例如：自由笔记｜本组输出');
      const input = field(form, `group-${kind}-url`, '链接', existing?.url, '粘贴从 App 导出的链接');
      input.type = 'text';
      input.inputMode = 'url';
      input.autocapitalize = 'none';
      input.spellcheck = false;
      const error = element('p', '', 'field-error');
      error.setAttribute('role', 'alert');
      const save = element('button', '保存', 'secondary');
      save.type = 'submit';
      const cancel = element('button', '取消', 'video-link-edit');
      cancel.type = 'button';
      cancel.addEventListener('click', () => editor.replaceChildren());
      form.append(error, save, cancel);
      form.addEventListener('submit', event => {
        event.preventDefault();
        const url = normalizeExternalUri(input.value);
        const label = title.value.trim();
        if (!label || !url) { error.textContent = '请填写名称和链接。'; return; }
        if (!window.PocketExternalLinks.canNavigate(url)) {
          error.textContent = '不能使用 javascript:、data: 或 vbscript: 等可执行代码协议。';
          return;
        }
        changeLinks(items => {
          if (existing) {
            const index = items.findIndex(link => link.id === existing.id);
            if (index !== -1) items[index] = { ...items[index], title: label, url };
          } else {
            let id;
            do { id = `link-${Date.now()}-${Math.random().toString(36).slice(2)}`; }
            while (items.some(link => link.id === id));
            items.push({ id, title: label, url });
          }
        });
      });
      editor.append(form);
      title.focus?.();
    }
    area.append(element('h4', `${name}入口`));
    const list = element('ul', '', 'group-link-list');
    links.forEach(entry => {
      const row = element('li', '', 'group-link-row');
      const url = normalizeExternalUri(entry.url);
      const label = entry.title || `本组${name}`;
      if (window.PocketExternalLinks.canNavigate(url)) {
        const link = element('a', label, 'video-link-button');
        link.href = url;
        link.target = '_blank';
        link.rel = 'noopener noreferrer';
        row.append(link);
      } else row.append(element('span', label, 'group-link-unavailable'));
      const actions = element('div', '', 'group-link-actions');
      const edit = element('button', '修改', 'video-link-edit');
      edit.type = 'button';
      edit.setAttribute('aria-label', `修改${label}`);
      edit.addEventListener('click', () => renderEditor(entry));
      const remove = element('button', '删除', 'video-link-edit');
      remove.type = 'button';
      remove.setAttribute('aria-label', `删除${label}`);
      remove.addEventListener('click', () => {
        if (!window.confirm(`确定删除「${label}」入口吗？`)) return;
        changeLinks(items => {
          const index = items.findIndex(link => link.id === entry.id);
          if (index !== -1) items.splice(index, 1);
        });
      });
      actions.append(edit, remove);
      row.append(actions);
      list.append(row);
    });
    const add = element('button', '＋ 新增链接', 'video-link-edit group-link-add');
    add.type = 'button';
    add.addEventListener('click', () => renderEditor());
    area.append(list, add, editor);
    return area;
  }
  function renderGrouping(session) {
    heading.textContent = '分组设置';
    content.append(element('p', '根据当前资料的题目难度和自己的能力，确定当前讲义每组处理多少道题。'));
    const draft = session.draft;
    content.append(element('p', `${draft.subject} · ${draft.title}`));
    const form = element('form');
    form.noValidate = true;
    const range = field(form, 'question-range', '题号范围', draft.questionRange, '例如：1-30');
    const size = field(form, 'group-size', '每组题数', draft.groupSize, '例如：5', true);
    const error = element('p', '', 'field-error');
    error.setAttribute('role', 'alert');
    const preview = element('div');
    preview.setAttribute('aria-live', 'polite');
    const button = element('button', '确认分组，开始学习');
    button.type = 'submit';
    form.append(error, preview, button);

    function updatePreview(save) {
      const result = calculateGroups(range.value, size.value);
      preview.replaceChildren();
      error.textContent = range.value || size.value ? result.error : '';
      button.disabled = !!result.error;
      if (!result.error) {
        preview.append(element('p', `共 ${result.groups.length} 组`));
        const list = element('ul', '', 'group-list');
        result.groups.forEach((group, index) => list.append(element('li', `第${index + 1}组：${rangeText(group)}`)));
        preview.append(list);
      }
      if (save) {
        commit(next => {
          const nextDraft = next.currentSession.draft;
          nextDraft.questionRange = range.value;
          nextDraft.groupSize = size.value;
          nextDraft.groups = result.groups;
        }, false);
      }
      return result;
    }
    range.addEventListener('input', () => updatePreview(true));
    size.addEventListener('input', () => updatePreview(true));
    form.addEventListener('submit', event => {
      event.preventDefault();
      const result = updatePreview(false);
      if (result.error) return;
      if (!state.currentSession.draft.subject.trim() || !state.currentSession.draft.title.trim()) {
        showMessage('请先填写学科和资料名称。');
        return;
      }
      commit(next => {
        const current = next.currentSession;
        const material = {
          id: current.materialId,
          subject: current.draft.subject,
          title: current.draft.title,
          questionRange: range.value.trim(),
          groupSize: Number(size.value),
          status: 'learning', completedAt: null, addedToReviewAt: null,
          totalGroups: result.groups.length,
          groups: result.groups.map(group => ({
            ...group, videoCompleted: false, outputCompleted: false, executionCompleted: false, runs: []
          })),
          createdAt: current.createdAt
        };
        next.materials.push(material);
        current.title = material.title;
        current.currentGroupIndex = 0;
        current.mode = 'new';
        executor.startRun(next, { groupIndex: 0, mode: 'new',
          schedulerState: { phase: 'new', newGroupIndex: 0, reviewGroupIndex: 0 } });
        delete current.draft;
      });
    });
    updatePreview(false);
    content.append(form);
  }

  function renderExecutor(session, material) {
    const isMaterialReview = session.sessionType === 'material-review';
    heading.textContent = isMaterialReview ? '整条资料复习' : '当前学习区';
    if (isMaterialReview && session.currentStep === 'materialCompletePending') {
      content.append(element('p', '本条资料复习历史已保存，正在准备下一步。'));
      const retry = element('button', '重试保存');
      retry.type = 'button';
      retry.addEventListener('click', () => commit(() => {}));
      content.append(retry);
      return;
    }
    if (isMaterialReview && session.currentStep === 'queueComplete') {
      content.append(element('h3', '✓ 本轮复习全部完成', 'completion-title'),
        element('p', `已复习：${session.materialIds.length}条资料`, 'completion-note'));
      const finished = element('ul', '', 'group-list');
      session.materialIds.forEach(id => {
        const item = state.materials.find(entry => entry.id === id);
        finished.append(element('li', `✓ ${item.subject} · ${item.title}`));
      });
      content.append(finished);
      const button = element('button', '返回当前学习');
      button.type = 'button';
      button.addEventListener('click', () => {
        const current = state.materialReviewSession;
        if (state.activeSessionType === 'material-review' && current &&
            current.materialId === session.materialId && current.currentRunIndex === session.currentRunIndex &&
            current.currentStep === 'queueComplete') commit(next => window.PocketMaterialReview.returnToLearning(next));
      });
      content.append(button);
      return;
    }
    if (session.currentStep === 'materialComplete') {
      content.append(element('h3', '✓ 当前资料完成', 'completion-title'),
        element('p', material.subject, 'subject-label'), element('p', material.title, 'material-title'),
        element('p', `题目：${material.questionRange}`, 'completion-note'), element('p', `共${material.groups.length}组`, 'completion-note'),
        element('p', '所有分组学习已完成', 'completion-note'), element('p', '已自动保存为学习历史', 'completion-note'));
      const button = element('button', '开始下一份资料');
      button.type = 'button';
      button.addEventListener('click', () => {
        const current = getActiveSession();
        if (current && current.materialId === session.materialId && current.currentStep === 'materialComplete' &&
            material.status === 'completed') beginMaterial();
      });
      content.append(button);
      return;
    }
    const details = element('dl', '', 'material-context');
    const group = material.groups[session.currentGroupIndex];
    if (!group) {
      content.append(element('p', '找不到当前分组，请检查本机学习数据。'));
      return;
    }
    const number = session.currentGroupIndex + 1;
    const run = group.runs && group.runs[session.currentRunIndex];
    if (!run) {
      content.append(element('p', '当前执行记录未保存，请刷新重试。'));
      return;
    }
    [['学科', material.subject], ['资料', material.title],
      ['当前', `${isMaterialReview ? '整条资料复习' : session.mode === 'review' ? '复习' : '新学'}｜第${number}/${material.groups.length}组`],
      ['题目', rangeText(group)]].forEach(([label, value]) => {
      const classes = { '学科': 'subject-label', '资料': 'material-title', '当前': 'assignment-title', '题目': 'question-range' };
      details.append(element('dt', label, 'visually-hidden'), element('dd', value, classes[label]));
    });
    content.append(details);
    const progress = element('progress', '', 'group-progress');
    progress.max = material.groups.length;
    progress.value = number;
    progress.setAttribute('aria-label', `当前组位置：第${number}组，共${material.groups.length}组`);
    content.append(progress);
    const task = element('section', '', 'current-task');
    // 捕获渲染时的断点，所有事件只通过保存后的 state 推进页面。
    const expected = {
      materialId: session.materialId,
      currentGroupIndex: session.currentGroupIndex,
      currentStep: session.currentStep,
      currentRunIndex: session.currentRunIndex,
      mode: session.mode,
      sessionType: isMaterialReview ? 'material-review' : 'learning'
    };
    function actionButton(text, action) {
      const button = element('button', text);
      button.type = 'button';
      button.addEventListener('click', () => {
        commit(next => executor.transition(next, action, expected));
      });
      return button;
    }
    if (session.currentStep === 'video') {
      task.append(element('h3', '当前任务', 'task-eyebrow'), element('span', 'VIDEO', 'step-badge'),
        element('p', '看本组对应课程视频', 'task-title'),
        element('p', `只看第${rangeText(group)}题对应的课程内容，不要超过当前组范围。`, 'task-guidance'),
        renderGroupLink(group, expected, 'video'),
        actionButton('本组视频看完', 'videoDone'));
    } else if (session.currentStep === 'output') {
      task.append(element('h3', '当前任务', 'task-eyebrow'), element('span', 'OUTPUT', 'step-badge'),
        element('p', '完成本组输出', 'task-title'),
        element('p', '根据自己当前的水平，在输出模型中选择一个合适阶段的操作执行，达到输出目标。', 'task-guidance'),
        renderGroupLink(group, expected, 'output'),
        actionButton(isMaterialReview ? '输出达标 → 下一组' : '输出达标 → 下一步', 'outputDone'));
    } else if (session.currentStep === 'groupComplete') {
      task.append(element('h3', `第${number}组本轮完成`, 'completion-title'), element('p', `题目 ${rangeText(group)}`, 'completion-note'),
        element('p', `视频 ${run.videoCompleted ? '✓' : '未完成'}`, 'completion-check'),
        element('p', `输出 ${run.outputCompleted ? '✓' : '未完成'}`, 'completion-check'));
      const button = actionButton('继续', 'continue');
      task.append(button);
    } else {
      task.append(element('p', '当前学习阶段无法识别，请检查本机学习数据。'));
    }
    content.append(task);
  }

  function renderGlobalReview() {
    const history = window.PocketHistory;
    const pending = history.getPendingMaterials(state);
    const reviewed = history.getReviewMaterials(state);
    document.getElementById('pending-count').textContent = `今日新增：${pending.length}条`;
    document.getElementById('review-count').textContent = `已进入复习：${reviewed.length}条`;
    const addButton = document.getElementById('add-review-button');
    const reviewButton = document.getElementById('start-review-button');
    reviewButton.disabled = reviewed.length === 0 || state.activeSessionType === 'material-review';
    reviewButton.textContent = !reviewed.length ? '暂无已学资料需要复习' :
      state.activeSessionType === 'material-review' ? '正在复习旧内容' :
        state.materialReviewSession && state.materialReviewSession.currentStep !== 'queueComplete' ? '继续复习旧内容' : '开始复习旧内容';
    addButton.disabled = pending.length === 0;
    addButton.textContent = pending.length ? `将今日新增 ${pending.length} 条加入复习` : '今日暂无新增资料';
    const list = document.getElementById('review-materials');
    list.replaceChildren();
    function appendMaterials(title, materials, emptyText) {
      list.append(element('h3', title));
      if (!materials.length) list.append(element('p', emptyText));
      else {
        const items = element('ul');
        materials.forEach(material => items.append(element('li', `${material.subject} · ${material.title}`)));
        list.append(items);
      }
    }
    appendMaterials('已学内容', reviewed, '暂无已加入复习的资料');
    appendMaterials('今日新学', pending, '暂无等待加入复习的资料');
    const timestamp = state.review.lastReviewedAt;
    const time = document.getElementById('review-time');
    time.textContent = timestamp === null ? '暂无记录' : new Intl.DateTimeFormat('zh-CN', {
      year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false
    }).format(new Date(timestamp));
    if (timestamp !== null) time.dateTime = new Date(timestamp).toISOString();
    else time.removeAttribute('datetime');
  }

  function renderReviewSelection() {
    heading.textContent = '选择要复习的资料';
    const eligible = window.PocketHistory.getReviewMaterials(state);
    const selected = state.reviewSelectionIds || eligible.map(item => item.id);
    content.append(element('p', '勾选本轮资料，开始后按列表顺序连续复习。'));
    const list = element('ul', '', 'material-selection');
    eligible.forEach(material => {
      const item = element('li');
      const label = element('label', '', 'queue-choice');
      const checkbox = element('input');
      checkbox.type = 'checkbox';
      checkbox.checked = selected.includes(material.id);
      checkbox.setAttribute('aria-label', `选择 ${material.subject} · ${material.title}`);
      checkbox.addEventListener('change', () => commit(next => {
        if (next.activeSessionType !== 'review-selection') return;
        const ids = new Set(next.reviewSelectionIds || eligible.map(entry => entry.id));
        if (checkbox.checked) ids.add(material.id);
        else ids.delete(material.id);
        next.reviewSelectionIds = eligible.filter(entry => ids.has(entry.id)).map(entry => entry.id);
      }));
      label.append(checkbox, element('span', `${material.subject} · ${material.title}（${material.groups.length}组）`));
      item.append(label);
      list.append(item);
    });
    const start = element('button', `开始本轮复习（${selected.length}条）`);
    start.type = 'button';
    start.disabled = selected.length === 0;
    start.addEventListener('click', () => commit(next => window.PocketMaterialReview.start(next,
      next.reviewSelectionIds || eligible.map(item => item.id))));
    const back = element('button', '返回当前学习', 'secondary');
    back.type = 'button';
    back.addEventListener('click', () => commit(next => window.PocketMaterialReview.returnToLearning(next)));
    content.append(list, start, back);
  }

  function render() {
    renderGlobalReview();
    content.replaceChildren();
    if (state.activeSessionType === 'review-selection') {
      startButton.hidden = true;
      renderReviewSelection();
      return;
    }
    if (state.activeSessionType === 'material-review') {
      startButton.hidden = true;
      const session = state.materialReviewSession;
      const material = session && state.materials.find(item => item.id === session.materialId);
      if (material) renderExecutor(session, material);
      return;
    }
    const session = getActiveSession();
    startButton.hidden = !!session;
    heading.textContent = '当前学习区';
    if (!session) {
      content.append(element('p', '目前没有进行中的学习'));
      return;
    }
    const material = state.materials.find(item => item.id === session.materialId);
    if (material && material.groups && material.groups.length) renderExecutor(session, material);
    else if (session.currentStep === 'grouping') renderGrouping(session);
    else renderBasic(session);
  }

  document.getElementById('review-button').addEventListener('click', () => {
    commit(next => { next.review.lastReviewedAt = Date.now(); }, 'global');
  });
  document.getElementById('reset-data-button').addEventListener('click', () => {
    const confirmed = window.confirm(
      '确定清空当前设备的 Pocket 本机数据？\n\n' +
      '将删除：\n' +
      '• 当前学习断点\n' +
      '• 全部资料 materials、分组 groups 和执行历史 runs\n' +
      '• 复习状态和复习队列 reviewSession\n' +
      '• VIDEO / OUTPUT 保存的所有外部入口\n\n' +
      '数据无法恢复。\n' +
      '不会删除 Pocket App、PWA 安装或 GitHub 上的代码。'
    );
    if (!confirmed) return;
    try {
      state = storage.resetState();
      render();
      showMessage('本机学习数据已清空。');
    } catch (error) {
      showMessage('清空失败，当前学习数据未删除。请检查浏览器存储设置后重试。');
    }
  });
  document.getElementById('add-review-button').addEventListener('click', () => {
    if (!window.PocketHistory.getPendingCount(state)) return;
    commit(next => window.PocketHistory.addPendingToReview(next), 'global');
  });
  document.getElementById('start-review-button').addEventListener('click', () => {
    if (state.activeSessionType === 'material-review') return;
    commit(next => window.PocketMaterialReview.open(next));
  });
  function beginMaterial() {
    return commit(next => {
      const timestamp = Date.now();
      let id = `material-${timestamp}`;
      let suffix = 0;
      while (next.materials.some(item => item.id === id) || next.currentSession?.materialId === id) {
        id = `material-${timestamp}-${++suffix}`;
      }
      next.currentSession = {
        materialId: id,
        mode: 'new', currentGroupIndex: 0, currentStep: 'basic', createdAt: timestamp,
        draft: { subject: '', title: '', questionRange: '', groupSize: '', groups: [] }
      };
      next.activeSessionType = 'learning';
    });
  }
  startButton.addEventListener('click', () => {
    if (getActiveSession()) return;
    beginMaterial();
  });
  window.PocketLearning = Object.freeze({ startNewMaterial: beginMaterial });

  // 第一阶段测试 session 没有正式资料，保留其 ID，转成可恢复的新资料草稿。
  const legacy = getActiveSession();
  if (legacy && !legacy.draft && !state.materials.some(item => item.id === legacy.materialId)) {
    commit(next => {
      next.currentSession.currentStep = 'basic';
      next.currentSession.draft = { subject: '', title: '', questionRange: '', groupSize: '', groups: [] };
    }, false);
    // 保存失败时保留原数据，并等待刷新重试，避免渲染不存在的草稿。
    if (!state.currentSession.draft) return;
  }
  const needsGroupState = executor.needsInitialization(state);
  if (needsGroupState && !commit(next => executor.initializeGroups(next), false)) {
    render();
    return;
  }
  if (window.PocketHistory.needsInitialization(state) && !commit(next => window.PocketHistory.initialize(next), false)) {
    showMessage('保存失败，资料完成状态尚未保存。请刷新后重试。');
    return;
  }
  if (window.PocketMaterialReview.needsInitialization(state) &&
      !commit(next => window.PocketMaterialReview.initialize(next), false)) return;
  // Recover a close or failed save between completion and the next-material snapshot.
  if (state.materialReviewSession?.currentStep === 'materialCompletePending' &&
      !commit(next => window.PocketMaterialReview.advanceQueue(next), false)) return;
  render();
  showMessage(storage.getNotice());
})();
