(function () {
  'use strict';
  const storage = window.PocketStorage;
  const daily = window.PocketDailyReverse;
  const calculateGroups = window.PocketGrouping.calculateGroups;
  const executor = window.PocketExecutor;
  const normalizeExternalUri = window.PocketExternalLinks.normalizeUri;
  let state = storage.loadState();
  let dailyView = window.PocketNavigation?.read().page === 'daily-review';
  const titleNodes = new Map();
  let renameNumber = 0;
  let learnedContentFold = null;
  // OUTPUT choices are transient display state, never a learning checkpoint.
  let outputViewKey = '', outputView = '';
  let dailyOutputRestore = '';
  // An unfinished basic-info draft is not a formal learning checkpoint.
  let homeView = window.PocketNavigation?.read().page === 'home' || window.PocketNavigation?.read().underlying?.page === 'home';
  let listeningBeforeNewMaterial = false;
  let draftPage = null;
  let sourceContext = null;
  let learnedView = window.PocketNavigation?.read().page === 'learned-content';
  let newMaterialLocked = window.PocketNavigation?.read().page === 'new-material-locked';
  let newMaterialForm = null; // Display-only draft; never replaces an active learning session.
  const message = document.getElementById('message');
  const content = document.getElementById('learning-content');
  const startButton = document.getElementById('start-button');
  const listeningButton = document.getElementById('listening-start-button');
  const listeningArea = document.getElementById('listening-start-area') || content;
  let listeningEnter = null;
  const listeningControls = {button:startButton, setEnter: action => { listeningEnter = action; }};
  function continueAfterListening() {
    sourceContext = null;
    homeView = false;
    listeningBeforeNewMaterial = false;
    if (!getActiveSession()) beginMaterial();
    else render();
  }
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
      if (redraw === true) {dailyView=false;homeView = false;sourceContext = null;learnedView=false;newMaterialLocked=false;}
      if (redraw === 'global') renderGlobalReview();
      else if (redraw) render();
      return true;
    } catch (error) {
      if (error.message === daily?.MESSAGE) { guideDaily(error.message); return false; }
      if (error.message === '请先完成已学内容的资料间倒序复习，再新增资料。') {
        newMaterialLocked=true;learnedView=false;homeView=false;render();return false;
      }
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

  function editMaterialDraft(session, change, redraw = true) {
    if (session !== newMaterialForm) return commit(change, redraw);
    change({ currentSession: session });
    if (redraw) render();
    return true;
  }
  function creationBlock(target = state) {
    const active = target.currentSession;
    if (active?.materialId && !['materialComplete', 'complete'].includes(active.currentStep)) return '已有未完成的学习进度，请先继续原任务；可以先填写资料，但暂不能创建。';
    if (!window.PocketMaterialReview.canCreate(target)) return '请先完成已学内容的资料间倒序复习，再新增资料。';
    return '';
  }
  function renderBasic(session) {
    heading.textContent = '新资料';
    const back = element('button', '← 返回', 'practice-back new-material-back');
    back.type = 'button';
    back.addEventListener('click', () => {
      if (window.PocketNavigation) window.PocketNavigation.back();
      else showHome();
      window.scrollTo?.(0,0);
    });
    content.append(back);
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
      return editMaterialDraft(session, next => {
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
      draftPage = null;
      editMaterialDraft(session, next => {
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

  function renderMaterialLink(material, expected, kind) {
    const name = kind === 'video' ? '视频' : '输出';
    const property = `${kind}Links`;
    const links = material[property];
    const area = element('section', '', 'video-link-area');
    const editor = element('div');
    function changeLinks(change) {
      try {
        if (expected.sessionType === 'daily-reverse') {
          const round = state.dailyReverseReview?.round;
          if (!dailyView || round?.id !== expected.roundId || round?.index !== expected.index || round?.taskIndex !== expected.taskIndex || daily.current(state)?.id !== material.id) return;
          state = storage.updateState(state, next => {
            if (daily.current(next)?.id !== material.id || next.dailyReverseReview.round.taskIndex !== expected.taskIndex) throw Error('每日复习资料已变化，请刷新后重试。');
            change(next.materials.find(item => item.id === material.id)[property]);
          });
          showMessage(''); render(); return;
        }
        const key = expected.sessionType === 'material-review' ? 'materialReviewSession' : 'currentSession';
        const { session, material: currentMaterial } = executor.getCurrentGroup(state, key);
        if ((state.activeSessionType || 'learning') !== expected.sessionType || currentMaterial !== material ||
            session.materialId !== expected.materialId || session.currentGroupIndex !== expected.currentGroupIndex ||
            session.currentRunIndex !== expected.currentRunIndex || session.mode !== expected.mode ||
            session.currentStep !== expected.currentStep) return;
        // Independent storage write: never advance a learning or review queue.
        state = storage.updateState(state, next => {
          const target = executor.getCurrentGroup(next, key).material;
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
        editMaterialDraft(session, next => {
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
      if (!session.draft.subject.trim() || !session.draft.title.trim()) {
        showMessage('请先填写学科和资料名称。');
        return;
      }
      if (session === newMaterialForm) {
        if (daily?.needsReview(state)) { guideDaily(daily.MESSAGE); return; }
        const reason = creationBlock();
        if (reason) { showMessage(reason); return; }
      }
      listeningBeforeNewMaterial = true;
      const saved = commit(next => {
        if (session === newMaterialForm) {
          daily?.assertCanCreate(next);
          const reason = creationBlock(next);
          if (reason) throw Error(reason);
          const timestamp = Date.now();
          let id = `material-${timestamp}`, suffix = 0;
          while (next.materials.some(item => item.id === id) || next.currentSession?.materialId === id) id = `material-${timestamp}-${++suffix}`;
          next.currentSession = { ...JSON.parse(JSON.stringify(session)), materialId: id, createdAt: timestamp };
          next.activeSessionType = 'learning';
        }
        const current = next.currentSession;
        const material = {
          id: current.materialId,
          subject: current.draft.subject,
          title: current.draft.title,
          questionRange: range.value.trim(),
          groupSize: Number(size.value),
          status: 'learning', completedAt: null, addedToReviewAt: null,
          totalGroups: result.groups.length,
          videoLinks: [], outputLinks: [], externalLinksVersion: 1,
          groups: result.groups.map(group => ({
            ...group, videoCompleted: false, outputCompleted: false, executionCompleted: false, runs: []
          })),
          createdAt: current.createdAt
        };
        window.PocketMaterialReview.createMaterial(next,material);
        current.title = material.title;
        current.currentGroupIndex = 0;
        current.mode = 'new';
        executor.startRun(next, { groupIndex: 0, mode: 'new',
          schedulerState: { phase: 'new', newGroupIndex: 0, reviewGroupIndex: 0 } });
        delete current.draft;
      });
      if (saved && session === newMaterialForm) newMaterialForm = null;
    });
    updatePreview(false);
    content.append(form);
  }

  function renderExecutor(session, material, dailyTask = null) {
    const isMaterialReview = session.sessionType === 'material-review';
    const isDailyReview = !!dailyTask;
    heading.textContent = isDailyReview ? '每日正序复习' : isMaterialReview ? '整条资料复习' : '当前学习区';
    if (isMaterialReview && session.currentStep === 'queueBlocked') {
      content.append(element('p',session.blockedReason || '复习队列记录已缺失，原历史已保留。'));
      const rebuild=element('button','重新建立完整复习轮次');rebuild.type='button';
      rebuild.addEventListener('click',()=>commit(next=>window.PocketMaterialReview.rebuild(next)));content.append(rebuild);
      return;
    }
    if (isMaterialReview && session.currentStep === 'materialCompletePending') {
      content.append(element('p', '本组复习已保存，正在准备下一步。'));
      const retry = element('button', '重试保存');
      retry.type = 'button';
      retry.addEventListener('click', () => commit(() => {}));
      content.append(retry);
      return;
    }
    if (isMaterialReview && session.currentStep === 'queueComplete') {
      content.append(element('h3', '✓ 本轮复习全部完成', 'completion-title'),
        element('p',session.queueVersion===2 ? `已复习：${session.completedGroupCount}组` : `已复习：${session.materialIds.length}条资料`, 'completion-note'));
      const finished = element('ul', '', 'group-list');
      session.materialIds.forEach(id => {
        const item = state.materials.find(entry => entry.id === id);
        finished.append(item ? trackName(element('li'), item, m => `✓ ${m.subject} · ${m.title}`) : element('li', '原资料已缺失，复习历史已保留'));
      });
      const reviewed = element('details', '', 'completed-review-materials');
      const summary = element('summary');
      summary.append(element('span', '查看已复习资料'), element('span', `${session.materialIds.length}份`, 'completed-review-count'));
      reviewed.append(summary, finished);
      content.append(reviewed);
      const button = element('button', '返回当前学习');
      button.type = 'button';
      button.addEventListener('click', () => {
        const current = state.materialReviewSession;
        if (state.activeSessionType === 'material-review' && current &&
            current.materialId === session.materialId && current.currentRunIndex === session.currentRunIndex &&
            current.currentStep === 'queueComplete') commit(next => window.PocketMaterialReview.returnToLearning(next));
      });
      content.append(button);
      const add=element('button','新增资料 →');add.type='button';add.addEventListener('click',beginMaterial);content.append(add);
      return;
    }
    if (session.currentStep === 'materialComplete') {
      content.append(element('h3', '✓ 当前资料完成', 'completion-title'),
        element('p', material.subject, 'subject-label'), trackName(element('p', '', 'material-title'), material, m => m.title),
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
    const run = dailyTask ? dailyTask.item.run : group.runs && group.runs[session.currentRunIndex];
    if (!run) {
      content.append(element('p', '当前执行记录未保存，请刷新重试。'));
      return;
    }
    [['学科', material.subject], ['资料', material.title],
      ['当前', `${isDailyReview ? '每日正序复习' : isMaterialReview ? '整条资料复习' : session.mode === 'review' ? '复习' : '新学'}｜第${number}/${material.groups.length}组`],
      ['题目', rangeText(group)]].forEach(([label, value]) => {
      const classes = { '学科': 'subject-label', '资料': 'material-title', '当前': 'assignment-title', '题目': 'question-range' };
      const valueNode = element('dd', value, classes[label]);
      if (label === '资料') trackName(valueNode, material, m => m.title);
      details.append(element('dt', label, 'visually-hidden'), valueNode);
    });
    content.append(details);
    if (isMaterialReview && session.queueVersion===2) content.append(element('p',`本轮第 ${session.currentQueueIndex+1}/${session.queue.length} 组 · 已完成 ${session.completedGroupCount} 组`));
    const keyQuestions = element('details', '', 'group-key-questions');
    keyQuestions.id = 'group-key-questions-panel';
    const keyInput = element('textarea');
    keyInput.id = 'group-key-questions';
    keyInput.rows = 3;
    keyInput.value = typeof group.keyQuestions === 'string' ? group.keyQuestions : '';
    keyInput.placeholder = '例如：第 3、7、12 题';
    keyInput.setAttribute('aria-label', '本组重点题目');
    const keyStatus = element('p', '', 'field-error');
    keyStatus.setAttribute('role', 'status');
    const groupIndex = session.currentGroupIndex;
    keyInput.addEventListener('input', () => {
      // Only the shared Material/Group field changes; sessions and runs stay intact.
      try {
        const target = state.materials.find(item => item.id === material.id)?.groups[groupIndex];
        if (!target) return;
        state = storage.updateState(state, next => {
          next.materials.find(item => item.id === material.id).groups[groupIndex].keyQuestions = keyInput.value;
        });
        keyStatus.textContent = '';
      } catch (_) {
        keyStatus.textContent = '保存失败，当前输入仍保留，请重试输入。';
      }
    });
    const metrics = element('div', '', 'group-latest-metrics');
    for (const [field, id, label, maximum] of [
      ['latestAccuracyPercent', 'group-latest-accuracy', '本组题目最新正确率（答对题数/总题数）', 100],
      ['latestDurationMinutes', 'group-latest-duration', '本组题目最新用时（分钟）', null]
    ]) {
      const wrapper = element('div');
      const caption = element('label', label);
      caption.setAttribute('for', id);
      const ratioField = field === 'latestAccuracyPercent';
      const input = element('input'); input.id = id; input.type = ratioField ? 'text' : 'number';
      input.min = '0'; input.step = 'any'; input.inputMode = 'decimal';
      if (maximum !== null) input.max = String(maximum);
      if (ratioField) { input.inputMode = 'text'; input.placeholder = '例如：8/10'; }
      input.value = ratioField ? group.latestAccuracyRatio || '' : group[field] == null ? '' : String(group[field]);
      const display = ratioField ? element('p', '', 'data-management-help') : null;
      const showPercent = (value, ratio) => { if (display) display.textContent = value == null ? '未填写' : Number(value.toFixed(2)) + '%' + (ratio ? '（' + ratio + '）' : '（旧记录）'); };
      if (ratioField) showPercent(typeof group[field] === 'number' ? group[field] : null, group.latestAccuracyRatio);
      input.addEventListener('input', () => {
        const raw = input.value.trim();
        const match = ratioField && raw !== '' ? /^(\d+)\s*\/\s*(\d+)$/.exec(raw) : null;
        const numerator = match ? Number(match[1]) : NaN, denominator = match ? Number(match[2]) : NaN;
        const ratio = match ? match[1] + '/' + match[2] : null;
        const value = raw === '' ? null : ratioField ? numerator / denominator * 100 : Number(raw);
        if ((ratioField && raw !== '' && (!match || !Number.isSafeInteger(numerator) || !Number.isSafeInteger(denominator) || denominator <= 0 || numerator > denominator)) || input.validity?.badInput || (value !== null && (!Number.isFinite(value) || value < 0 || (maximum !== null && value > maximum)))) {
          keyStatus.textContent = ratioField ? '请填写答对题数/总题数，如 8/10；总题数须大于 0，答对题数不能超过总题数。' : '用时请填写非负数，或留空。';
          return;
        }
        try {
          state = storage.updateState(state, next => {
            const target = next.materials.find(item => item.id === material.id)?.groups[groupIndex];
            if (!target) throw Error('找不到当前分组。');
            target[field] = value;
            if (ratioField) target.latestAccuracyRatio = ratio;
          });
          keyStatus.textContent = '';
          if (ratioField) showPercent(value, ratio);
        } catch (_) { keyStatus.textContent = '保存失败，当前输入仍保留，请重试输入。'; }
      });
      wrapper.append(caption, input); if (display) wrapper.append(display); metrics.append(wrapper);
    }
    keyQuestions.append(element('summary', '本组重点题目'), metrics, keyInput, keyStatus);
    content.append(keyQuestions);
    const progress = element('progress', '', 'group-progress');
    progress.max = material.groups.length;
    progress.value = number;
    progress.setAttribute('aria-label', `当前组位置：第${number}组，共${material.groups.length}组`);
    content.append(progress);
    const task = element('section', '', 'current-task');
    // 捕获渲染时的断点，所有事件只通过保存后的 state 推进页面。
    const expected = {
      ...(dailyTask ? { roundId: dailyTask.round.id, index: dailyTask.round.index, taskIndex: dailyTask.round.taskIndex } : {}),
      materialId: session.materialId,
      currentGroupIndex: session.currentGroupIndex,
      currentStep: session.currentStep,
      currentRunIndex: session.currentRunIndex,
      mode: session.mode,
      sessionType: isDailyReview ? 'daily-reverse' : isMaterialReview ? 'material-review' : 'learning'
    };
    function actionButton(text, action) {
      const button = element('button', text);
      button.type = 'button';
      button.disabled = !!sourceContext;
      button.addEventListener('click', () => {
        if (isDailyReview) {
          if (saveDaily(next => daily.transition(next, action, expected))) afterDailyStep();
        } else commit(next => executor.transition(next, action, expected));
      });
      return button;
    }
    function renderVideoContents(container) {
      container.append(element('h3', '当前任务', 'task-eyebrow'), element('span', 'VIDEO', 'step-badge'),
        element('p', '预习+看视频', 'task-title'),
        element('p', '1、自己尝试理解和重做讲义内容', 'task-guidance'),
        element('p', '2、有问题的标注问题（不深入）', 'task-guidance'),
        element('p', '3、开始看本组对应的视频内容', 'task-guidance'),
        element('p', `只看第${rangeText(group)}题对应的课程内容，不要超过当前组范围。`, 'task-guidance'),
        renderMaterialLink(material, expected, 'video'));
    }
    if (session.currentStep === 'output') {
      const viewKey = JSON.stringify(expected);
      if (outputViewKey !== viewKey) { outputViewKey = viewKey; outputView = isDailyReview ? dailyOutputRestore : ''; dailyOutputRestore = ''; }
      task.append(element('h3', '当前任务', 'task-eyebrow'), element('span', 'OUTPUT', 'step-badge'));
      const choices = element('div', '', 'output-entries');
      const video = element('section');
      const questions = element('section');
      questions.append(
        element('p', '请选择本次输出内容', 'task-title'),
        element('p', '根据自己当前的水平，在输出模型中选择一个合适阶段的操作执行，达到输出目标。', 'task-guidance'),
        window.PocketOutputSOP.createEntries(),
        renderMaterialLink(material, expected, 'output'));
      const back = element('button', '← 返回 OUTPUT', 'practice-back');
      back.type = 'button';
      function showOutputView(name) {
        outputView = name;
        if (name === 'video' && !video.children.length) renderVideoContents(video);
        choices.hidden = !!name;
        video.hidden = name !== 'video';
        questions.hidden = name !== 'questions';
        back.hidden = !name;
        window.PocketNavigation?.remember({page:isDailyReview ? 'daily-review' : 'learning',outputPage:name,sourceContext});
      }
      [['视频', 'video'], ['输出', 'questions']].forEach(([label, name]) => {
        const entry = element('button', label, 'output-entry');
        entry.type = 'button';
        entry.addEventListener('click', () => showOutputView(name));
        choices.append(entry);
      });
      back.addEventListener('click', () => showOutputView(''));
      showOutputView(outputView);
      task.append(choices, back, video, questions,
        actionButton('输出达标 → 下一步', 'outputDone'));
    } else if (session.currentStep === 'groupComplete') {
      task.append(element('h3', `第${number}组本轮完成`, 'completion-title'), element('p', `题目 ${rangeText(group)}`, 'completion-note'),
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
    const reviewed = history.getReviewMaterials(state);
    const counts=window.PocketMaterialReview.counts(state);
    document.getElementById('pending-count').textContent = '已学 Group：'+counts.total+'组';
    document.getElementById('review-count').textContent = '已学资料：'+reviewed.length+'条';
    const done=document.getElementById('review-completed-count');
    const pending=document.getElementById('review-pending-group-count');
    if(done)done.textContent='本轮已复习：'+counts.done+'组';
    if(pending)pending.textContent='本轮待复习：'+counts.pending+'组';
    const reviewButton=document.getElementById('start-review-button');
    reviewButton.disabled=counts.total===0;
    setMaterialReviewButtonLabel(reviewButton);
    const list = document.getElementById('review-materials');
    list.replaceChildren();
    function appendMaterials(title, materials, emptyText) {
      const section = element('details', '', 'learned-content-fold');
      section.append(element('summary', title));
      if (!materials.length) section.append(element('p', emptyText));
      else {
        const items = element('ul');
        materials.forEach(material => {
          const item = element('li'); appendMaterialName(item, material); items.append(item);
        });
        section.append(items);
      }
      list.append(section);
      return section;
    }
    learnedContentFold = appendMaterials('已学内容', reviewed, '暂无已加入复习的资料');
    appendDailyReviewButton(list, 'daily-reverse-review-entry');
    const timestamp = state.review.lastReviewedAt;
    const time = document.getElementById('review-time');
    time.textContent = timestamp === null ? '暂无记录' : new Intl.DateTimeFormat('zh-CN', {
      year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false
    }).format(new Date(timestamp));
    if (timestamp !== null) time.dateTime = new Date(timestamp).toISOString();
    else time.removeAttribute('datetime');
  }

  function setMaterialReviewButtonLabel(button) {
    if (state.materialReviewSession && state.materialReviewSession.currentStep !== 'queueComplete') {
      button.textContent = '继续复习';
    } else {
      button.replaceChildren('开始资料间', element('span', '倒序复习', 'material-review-label'));
    }
  }

  function renderLearnedContent() {
    heading.textContent='已学内容区';
    const counts=window.PocketMaterialReview.counts(state);
    content.append(element('p','已学资料：'+window.PocketHistory.getReviewMaterials(state).length+'条'),
      element('p','已学 Group：'+counts.total+'组'),element('p','本轮已复习：'+counts.done+'组'));
    const pendingFold = element('details', '', 'learned-content-fold');
    pendingFold.append(element('summary','本轮待复习：'+counts.pending+'组'));
    const list = element('ul', '', 'learned-materials');
    const savedOrder = [...(state.dailyReverseReview?.saveOrder || [])];
    state.materials.forEach(material => { if (!savedOrder.includes(material.id)) savedOrder.push(material.id); });
    window.PocketHistory.getReviewMaterials(state)
      .sort((a, b) => savedOrder.indexOf(b.id) - savedOrder.indexOf(a.id))
      .forEach(material => { const item = element('li'); appendMaterialName(item, material); list.append(item); });
    pendingFold.append(list);
    content.append(pendingFold);
    appendDailyReviewButton(content, 'daily-reverse-review-button');
    const start=element('button');
    setMaterialReviewButtonLabel(start);
    start.type='button';start.disabled=!counts.total;
    start.addEventListener('click',()=>commit(next=>window.PocketMaterialReview.open(next)));content.append(start);
    {
      const add=element('button','新增资料 →');add.type='button';add.addEventListener('click',beginMaterial);content.append(add);
    }
  }

  function refreshDailyReviewButton(button) {
    const needed = daily.needsReview(state), hasMaterials = daily.learned(state).length > 0;
    button.textContent = needed && state.dailyReverseReview?.round?.day === daily.day() ? '继续每日正序复习' : !needed && hasMaterials ? '今日正序复习已完成' : '每日正序复习';
    button.disabled = !hasMaterials || !needed;
    button.className = 'secondary' + (daily.shouldAnimate(state) ? ' daily-review-attention' : '');
  }
  function refreshDailyReviewAttention() {
    if (!daily || document.hidden) return;
    for (const id of ['daily-reverse-review-entry', 'daily-reverse-review-button']) {
      const button = document.getElementById(id);
      if (button) { try { refreshDailyReviewButton(button); } catch (_) { button.className = 'secondary'; } }
    }
  }
  function appendDailyReviewButton(container, id) {
    if (!daily) return;
    const button = element('button', '每日正序复习', 'secondary'); button.id = id; button.type = 'button';
    try { refreshDailyReviewButton(button); }
    catch (error) { button.disabled = true; container.append(element('p', error.message)); }
    button.addEventListener('click', () => {
      if (!saveDaily(next => daily.markClicked(next))) return;
      refreshDailyReviewAttention();
      if (saveDaily(next => daily.start(next))) { dailyView = true; learnedView = false; homeView = false; sourceContext = null; render(); }
    });
    container.append(button, element('p', '今日开始学习新增资料时，先复习完所有已学内容。', 'data-management-help'));
  }
  function trackName(node, material, format, property = 'textContent') {
    const update = current => { if (property === 'aria-label') node.setAttribute(property, format(current)); else node[property] = format(current); };
    update(material);
    if (!titleNodes.has(material.id)) titleNodes.set(material.id, new Set());
    titleNodes.get(material.id).add(update);
    return node;
  }
  function appendMaterialName(container, material) {
    const label = trackName(element('span'), material, m => `${m.subject} · ${m.title}`);
    const edit = element('button', '修改名称', 'video-link-edit'); edit.type = 'button';
    trackName(edit, material, m => `修改「${m.title}」名称`, 'aria-label');
    const editor = element('div');
    edit.addEventListener('click', () => {
      edit.hidden = true; editor.replaceChildren();
      const form = element('form');
      const current = state.materials.find(item => item.id === material.id);
      const input = field(form, 'rename-title-' + (++renameNumber), '资料名称', current?.title, '请输入资料名称');
      const error = element('p', '', 'field-error'); error.setAttribute('role', 'alert');
      const save = element('button', '保存', 'secondary'); save.type = 'submit';
      const cancel = element('button', '取消', 'video-link-edit'); cancel.type = 'button';
      const close = () => { editor.replaceChildren(); edit.hidden = false; edit.focus?.({ preventScroll: true }); };
      cancel.addEventListener('click', close);
      form.addEventListener('submit', event => {
        event.preventDefault(); const y = window.scrollY;
        try {
          state = storage.renameMaterial(state, material.id, input.value);
          const renamed = state.materials.find(item => item.id === material.id);
          for (const update of titleNodes.get(material.id) || []) update(renamed);
          close(); if (Number.isFinite(y)) window.scrollTo?.(0, y);
          showMessage('名称已保存。');
        } catch (failure) { error.textContent = failure.message; }
      });
      form.append(error, save, cancel); editor.append(form); input.focus?.({ preventScroll: true });
    });
    container.append(label, edit, editor);
  }

  function guideDaily(message) {
    dailyView = false; showLearnedContent(); showMessage(message);
    const details = document.getElementById('learned-material-details'); if (details) details.open = true;
    if (learnedContentFold) learnedContentFold.open = true;
    const button = document.getElementById('daily-reverse-review-entry') || document.getElementById('daily-reverse-review-button');
    button?.scrollIntoView?.({ block: 'center' }); button?.focus?.({ preventScroll: true });
  }
  function saveDaily(change) {
    try {
      state = storage.updateState(state, next => { if (change(next) === false) throw Error('本份资料已处理，请查看当前复习进度。'); });
      showMessage(''); return true;
    } catch (error) { showMessage(error.message); return false; }
  }
  function renderDailyReview() {
    heading.textContent = '每日正序复习'; startButton.hidden = true; if (listeningButton) listeningButton.hidden = true;
    const exit = element('button', '返回已学内容', 'secondary'); exit.type = 'button'; exit.addEventListener('click', showLearnedContent); content.append(exit);
    const round = state.dailyReverseReview?.round;
    if (!round || !daily.validRound(round) || round.day !== daily.day()) { content.append(element('p', '日期或复习进度已变化，请返回已学内容，主动开始今日复习。')); return; }
    if (daily.complete(round, daily.day())) { content.append(element('p', '今日正序复习已完成。原有复习状态保持独立。')); return; }
    if (round.order !== 'oldest-first') content.append(element('p', '本轮沿用已保存的复习顺序；下一轮按最早保存到最新保存执行。', 'data-management-help'));
    const material = daily.current(state);
    if (!material) { content.append(element('p', '本轮资料缺失或进度异常，未自动跳过，请先保留 JSON 并核查。')); return; }
    content.append(element('p', `${round.index + 1} / ${round.ids.length}`, 'assignment-title'), trackName(element('h3', '', 'material-title'), material, m => `${m.subject} · ${m.title}`));
    let active;
    try { active = daily.task(state); } catch (error) { content.append(element('p', error.message)); return; }
    if (!active) { content.append(element('p', '请返回已学内容，点击继续每日复习以建立独立分组任务。')); return; }
    renderExecutor({ sessionType: 'daily-reverse', materialId: material.id, currentGroupIndex: active.groupIndex,
      currentRunIndex: round.taskIndex, currentStep: 'output', mode: 'daily-reverse' }, material, active);
  }
  function afterDailyStep() {
      if (!daily.complete(state.dailyReverseReview?.round, daily.day())) { render(); return; }
      try {
        render(); // Completion is already durable; keep its page if navigation fails.
        dailyView = false;
        window.PocketLearning.startNewMaterial(); // Preserve both existing creation gates.
      } catch (error) {
        dailyView = true;
        showMessage('今日正序复习已完成并保存，无法打开新增资料页面：' + error.message);
      }
  }

  function render() {
    window.PocketListeningStart?.clear();
    listeningEnter = null;
    startButton.textContent = '正式开始学习新资料';
    content.hidden = false;
    if (listeningArea !== content) listeningArea.replaceChildren();
    if (listeningButton) listeningButton.hidden = !homeView && !!getActiveSession();
    titleNodes.clear(); renderGlobalReview();
    content.replaceChildren();
    if (dailyView && daily) {
      const round = state.dailyReverseReview?.round;
      window.PocketNavigation?.setContext({ type: 'daily-reverse', roundId: round?.id, index: round?.index });
      renderDailyReview(); window.PocketNavigation?.remember({ page: 'daily-review', outputPage: outputView }); return;
    }
    const active = state.activeSessionType === 'material-review' ? state.materialReviewSession : state.currentSession;
    window.PocketNavigation?.setContext({type:state.activeSessionType || 'learning',
      materialId:active?.materialId || null,step:active?.currentStep || null,
      group:active?.currentGroupIndex ?? null,run:active?.currentRunIndex ?? null});
    if (newMaterialLocked) {
      startButton.hidden=true;if(listeningButton)listeningButton.hidden=true;
      newMaterialForm ||= { mode: 'new', currentStep: 'basic', currentGroupIndex: 0,
        draft: { subject: '', title: '', questionRange: '', groupSize: '', groups: [] } };
      const reason = creationBlock();
      if (reason) content.append(element('p', reason));
      const busy=getActiveSession() && !['materialComplete','complete'].includes(getActiveSession().currentStep);
      const back=element('button',busy ? '继续上次学习' : '返回已学内容区 →');back.type='button';
      back.addEventListener('click',()=>{if(busy){newMaterialLocked=false;homeView=false;render();}else showLearnedContent();});content.append(back);
      if (newMaterialForm.currentStep === 'grouping') renderGrouping(newMaterialForm);
      else renderBasic(newMaterialForm);
      window.PocketNavigation?.remember({page:'new-material-locked'});return;
    }
    if (learnedView) {
      startButton.hidden=true;if(listeningButton)listeningButton.hidden=true;renderLearnedContent();
      window.PocketNavigation?.remember({page:'learned-content'});return;
    }
    if (homeView) {
      heading.textContent = '当前学习区';
      const unfinishedMain=getActiveSession() && !['materialComplete','complete'].includes(getActiveSession().currentStep);
      const unfinishedReview=state.activeSessionType==='material-review' && state.materialReviewSession?.currentStep!=='queueComplete';
      const hasProgress = !!unfinishedMain || (unfinishedReview && !window.PocketMaterialReview.canCreate(state));
      content.append(element('p',hasProgress ? '上次学习进度已保存，可继续学习。' : '目前没有进行中的学习'));
      startButton.hidden = false;
      if (hasProgress) startButton.textContent = '继续上次学习';
      window.PocketNavigation?.remember({page:'home'});
      return;
    }
    const pendingSubject = state.materials.find(item => item.id === active?.materialId)?.subject;
    const openingListening = listeningBeforeNewMaterial && !sourceContext && state.activeSessionType !== 'material-review' &&
      active?.mode !== 'review' && active?.currentStep === 'output' && window.PocketListeningStart?.needsGate(pendingSubject);
    if (!openingListening) window.PocketNavigation?.remember({page:'learning',outputPage:outputView,draftPage,sourceContext});
    if (sourceContext) {
      if (sourceContext.type === 'review-selection' || sourceContext.type === 'learned-content') {
        learnedView=true;renderLearnedContent();startButton.hidden=true;if(listeningButton)listeningButton.hidden=true;return;
      }
      const material = state.materials.find(item => item.id === sourceContext.materialId);
      if (material && ['basic','grouping'].includes(sourceContext.step)) {
        heading.textContent = sourceContext.step === 'basic' ? '新资料' : '分组设置';
        const form = element('form');
        const fields = sourceContext.step === 'basic' ?
          [['subject','学科',material.subject],['title','资料名称',material.title]] :
          [['question-range','题号范围',material.questionRange],['group-size','每组题数',String(material.groupSize)]];
        fields.forEach(([name,label,value]) => {const input=field(form,name,label,value,'');input.readOnly=true;if(name==='title')trackName(input,material,m=>m.title,'value');});
        form.addEventListener('submit',event => event.preventDefault());
        content.append(form);
        const resume = element('button','继续当前学习');resume.type='button';
        resume.addEventListener('click',() => {sourceContext=null;homeView=false;render();});content.append(resume);
        startButton.hidden=true;if(listeningButton)listeningButton.hidden=true;
        return;
      }
      const group = material?.groups[sourceContext.group];
      const run = group?.runs[sourceContext.run];
      if (material && run && ['output','groupComplete'].includes(sourceContext.step)) {
        startButton.hidden=true;if(listeningButton)listeningButton.hidden=true;
        renderExecutor({...active,materialId:material.id,currentGroupIndex:sourceContext.group,currentRunIndex:sourceContext.run,
          currentStep:sourceContext.step,mode:run.mode,sessionType:sourceContext.type},material);
        const inputs = content.querySelectorAll?.('input, textarea, form button') || [];
        inputs.forEach(node => {node.disabled=true;});
        return;
      }
      sourceContext=null;
    }
    if (state.activeSessionType === 'review-selection' || state.activeSessionType === 'learned-content') {
      if (listeningButton) listeningButton.hidden=true;startButton.hidden=true;renderLearnedContent();return;
    }
    if (state.activeSessionType === 'material-review') {
      if (listeningButton) listeningButton.hidden = true;
      startButton.hidden = true;
      const session = state.materialReviewSession;
      const material = session && state.materials.find(item => item.id === session.materialId);
      if (session && (material || session.currentStep==='queueBlocked' || session.currentStep==='queueComplete')) renderExecutor(session, material);
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
    if (material && material.groups && material.groups.length) {
      if (listeningBeforeNewMaterial && session.mode !== 'review' && ['video', 'output'].includes(session.currentStep) &&
          window.PocketListeningStart?.showIfNeeded(listeningArea, material.subject, continueAfterListening, false, listeningControls)) {
        if (listeningButton) listeningButton.hidden = true;
        heading.textContent = '泛听启动';
        return;
      }
      renderExecutor(session, material);
    }
    else if (session.currentStep === 'grouping') {
      if (listeningButton) listeningButton.hidden = true;
      if (draftPage === 'basic') renderBasic(session);
      else renderGrouping(session);
    }
    else {
      if (listeningButton) listeningButton.hidden = true;
      renderBasic(session);
    }
  }

  document.getElementById('reset-data-button')?.addEventListener('click', async () => {
    const button = document.getElementById('reset-data-button');
    const status = document.getElementById('local-reset-status');
    try {
      const deletion = window.PocketDataDeletion;
      if (!deletion) throw Error('本机清空保护尚未就绪，请刷新后重试。');
      const preview = deletion.preview(), count = preview.counts;
      const text = `将清空当前设备的学习记录：\nMaterial：${count.materials}\nGroup：${count.groups}\nRun：${count.runs}\n\nFirebase 最新备份、历史版本和账号不会删除；其他设备及导出的 JSON 文件不受影响。清空后自动云端备份暂停。\n\n请输入 CLEAR：`;
      if (window.prompt(text) !== 'CLEAR') return;
      if (!window.confirm('再次确认：清空本机学习数据？\nFirebase 云端备份保留，自动备份将暂停。')) return;
      button.disabled = true;
      if (status) status.textContent = '正在暂停自动备份并清空本机记录，请稍候…';
      const message = await deletion.clearLocal(preview.raw);
      if (status) status.textContent = message;
      window.location.reload();
    } catch (error) {
      if (status) status.textContent = error.message;
      showMessage(error.message);
    } finally { button.disabled = false; }
  });
  document.getElementById('start-review-button').addEventListener('click',()=>commit(next=>window.PocketMaterialReview.open(next)));
  function beginMaterial() {
    try { if (daily?.needsReview(state)) { guideDaily(daily.MESSAGE); return false; } }
    catch (error) { showMessage(error.message); return false; }
    const active = getActiveSession();
    if (state.activeSessionType !== 'material-review' && active?.draft && ['basic', 'grouping'].includes(active.currentStep)) {
      dailyView=false;newMaterialLocked=false;learnedView=false;homeView=false;sourceContext=null;
      window.PocketNavigation?.hideTools();render();return true;
    }
    const busy=getActiveSession() && !['materialComplete','complete'].includes(getActiveSession().currentStep);
    if (busy || !window.PocketMaterialReview.canCreate(state)) {
      dailyView=false;newMaterialLocked=true;learnedView=false;homeView=false;sourceContext=null;
      window.PocketNavigation?.hideTools();render();return true;
    }
    sourceContext = null;
    homeView = false;
    listeningBeforeNewMaterial = false;
    draftPage = null;
    return commit(next => {
      daily?.assertCanCreate(next);
      if (!window.PocketMaterialReview.canCreate(next)) throw Error('请先完成已学内容的资料间倒序复习，再新增资料。');
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
    if (listeningEnter) { listeningEnter(); return; }
    const unfinishedMain=getActiveSession() && !['materialComplete','complete'].includes(getActiveSession().currentStep);
    const unfinishedReview=state.activeSessionType==='material-review' && state.materialReviewSession?.currentStep!=='queueComplete';
    if (homeView && (unfinishedMain || (unfinishedReview && !window.PocketMaterialReview.canCreate(state)))) {
      homeView = false;
      render();
      return;
    }
    if (unfinishedMain) return;
    beginMaterial();
  });
  function showHome() {
    dailyView = false;
    newMaterialLocked=false;learnedView=false;
    sourceContext = null;
    homeView = true;
    listeningBeforeNewMaterial = false;
    window.PocketNavigation?.hideTools();
    render();
  }
  function showListening(savedView) {
    dailyView = false;
    const session = getActiveSession();
    const material = state.materials.find(item => item.id === session?.materialId);
    const subject = savedView?.subject ?? material?.subject ?? session?.draft?.subject ?? '';
    window.PocketListeningStart?.clear();
    listeningArea.replaceChildren();
    if (window.PocketListeningStart?.showIfNeeded(listeningArea, subject, continueAfterListening, true, listeningControls, savedView?.localDate)) {
      content.hidden = true;
      listeningButton.hidden = true;
    }
  }
  listeningButton?.addEventListener('click', () => showListening());
  window.PocketLearning = Object.freeze({ startNewMaterial: beginMaterial, showHome, resume: () => {dailyView=false;learnedView=false;newMaterialLocked=false;homeView=false;render();} });
  window.PocketNavigation?.register('home',showHome);
  window.PocketNavigation?.register('learning',view => {
    dailyView = false;
    homeView=false;
    learnedView=false;newMaterialLocked=false;
    sourceContext = view.sourceContext || null;
    draftPage = view.draftPage === 'basic' ? 'basic' : null;
    if (['video','questions',''].includes(view.outputPage)) {
      const session = state.activeSessionType === 'material-review' ? state.materialReviewSession : state.currentSession;
      if (session?.currentStep === 'output') {
        outputView = view.outputPage;
        outputViewKey = JSON.stringify({materialId:session.materialId,currentGroupIndex:session.currentGroupIndex,
          currentStep:session.currentStep,currentRunIndex:session.currentRunIndex,mode:session.mode,
          sessionType:state.activeSessionType === 'material-review' ? 'material-review' : 'learning'});
      }
    }
    render();
  });
  window.PocketNavigation?.register('listening',showListening);
  function showLearnedContent() {
    dailyView = false;
    learnedView=true;newMaterialLocked=false;homeView=false;sourceContext=null;
    window.PocketNavigation?.hideTools();render();
  }
  window.PocketNavigation?.register('learned-content',showLearnedContent);
  window.PocketNavigation?.register('daily-review', view => { dailyView = true; homeView = false; learnedView = false; outputViewKey = ''; dailyOutputRestore = view.outputPage || ''; render(); });
  window.PocketNavigation?.register('new-material-locked',()=>{dailyView=false;newMaterialLocked=true;learnedView=false;homeView=false;render();});
  // Recheck the local learning day when returning to the app; never advance a session.
  function resumeListening() {
    if (!listeningBeforeNewMaterial) return;
    const session = getActiveSession();
    if ((state.activeSessionType || 'learning') !== 'learning' || session?.mode === 'review' ||
        !['video', 'output'].includes(session?.currentStep)) return;
    const material = state.materials.find(item => item.id === session.materialId);
    if (material && window.PocketListeningStart?.needsGate(material.subject)) render();
  }
  document.addEventListener?.('visibilitychange', () => { if (!document.hidden) resumeListening(); });
  window.addEventListener?.('pageshow', resumeListening);
  window.addEventListener?.('focus', resumeListening);

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
  if (executor.needsVideoUpgrade(state) && !commit(next => executor.upgradeVideoSteps(next), false)) {
    showMessage('原 VIDEO 断点转换保存失败，原进度仍保留，请刷新重试。');
    return;
  }
  // Recover a close or failed save between completion and the next-material snapshot.
  if (state.materialReviewSession?.currentStep === 'materialCompletePending' &&
      !commit(next => window.PocketMaterialReview.advanceQueue(next), false)) return;
  render();
  showMessage(storage.getNotice());
  window.addEventListener?.('pocket-local-test-cleared', () => {
    window.PocketLocalTestTools.assertAllowed();
    window.PocketListeningStart?.clear();
    window.PocketNavigation.resetLocalTest();
    state = storage.loadState();
    newMaterialForm = null; draftPage = null; dailyView = false; dailyOutputRestore = '';
    outputViewKey = ''; outputView = ''; listeningBeforeNewMaterial = false;
    showHome(); showMessage(''); window.scrollTo?.(0, 0);
  });
  // Daily review gates creation only; page restore/focus must preserve the current task.
  window.addEventListener?.('focus', refreshDailyReviewAttention);
  window.addEventListener?.('pageshow', refreshDailyReviewAttention);
  document.addEventListener?.('visibilitychange', refreshDailyReviewAttention);
  window.addEventListener?.('pocket-daily-test-date-change', () => {
    if (dailyView || learnedView || newMaterialLocked) render();
    else renderGlobalReview();
  });
})();
