(function (global) {
  'use strict';
  let api, page, generation = 0;
  let draft = { subject: '', title: '', questionRange: '', groupSize: '' };
  function create(state, values, at = Date.now()) {
    const subject = String(values.subject ?? '').trim(), title = String(values.title ?? '').trim();
    if (!subject || !title) throw Error('请填写学科和资料名称。');
    if (!Number.isFinite(at) || at < 0 || at > 8640000000000000) throw Error('保存时间无效。');
    const groups = global.PocketGrouping.previewCompleted(values.questionRange, values.groupSize);
    let id;
    do { id = 'material-' + global.crypto.randomUUID(); } while (state.materials.some(m => m.id === id) || state.currentSession?.materialId === id);
    const material = { id, subject, title, questionRange: String(values.questionRange).trim(), groupSize: Number(values.groupSize),
      createdAt: at, completedAt: null, addedToReviewAt: null, totalGroups: groups.length,
      videoLinks: [], outputLinks: [], externalLinksVersion: 1,
      groups: groups.map(group => ({ ...group, videoCompleted: false, outputCompleted: false, executionCompleted: true,
        firstLearningCompletedAt: null, latestAccuracyRatio: null, latestAccuracyPercent: null, latestDurationMinutes: null, keyQuestions: '', runs: [] })) };
    // Same final completion/admission fields as ordinary materials; no session, execution or completion log is fabricated.
    global.PocketHistory.markCompleted(material, at);
    state.materials.push(material);
    global.PocketDailyReverse.recordSavedMaterial(state);
    state.review.generation = (state.review.generation || 0) + 1;
    return id;
  }
  const element = (tag, text, className) => {
    const node = global.document.createElement(tag); if (text) node.textContent = text; if (className) node.className = className; return node;
  };
  function open() {
    if (!api) return false;
    if (!page) { page = element('main', '', 'practice-tool'); page.id = 'quick-material'; global.document.body.append(page); }
    const current = ++generation;
    global.PocketNavigation.hideTools(); global.document.getElementById('pocket-main').hidden = true;
    page.hidden = false; page.replaceChildren(); global.PocketNavigation.remember({ page: 'quick-material' });
    const back = element('button', '← 返回', 'practice-back'); back.type = 'button'; back.addEventListener('click', () => { generation++; global.PocketNavigation.back(); });
    page.append(back, element('h1', '一键输入学习资料'));
    const form = element('form'); form.noValidate = true;
    const inputs = {};
    for (const [key, label, placeholder] of [['subject', '学科', '例如：数学'], ['title', '资料名称', '请输入资料名称'],
      ['questionRange', '题号范围', '例如：1-10, 13, 15-18'], ['groupSize', '每组题数', '例如：5']]) {
      const input = element('input'); input.id = 'quick-material-' + key; input.value = draft[key]; input.placeholder = placeholder;
      if (key === 'groupSize') input.inputMode = 'numeric';
      const caption = element('label', label); caption.setAttribute('for', input.id); form.append(caption, input); inputs[key] = input;
    }
    const preview = element('div'); preview.id = 'quick-material-preview'; preview.setAttribute('aria-live', 'polite');
    const error = element('p', '', 'field-error'); error.setAttribute('role', 'alert');
    const status = element('p'); status.id = 'quick-material-status'; status.setAttribute('role', 'status');
    const save = element('button', '保存学习资料'); save.type = 'submit';
    let busy = false;
    const values = () => Object.fromEntries(Object.entries(inputs).map(([key, input]) => [key, input.value]));
    function update() {
      draft = values(); preview.replaceChildren();
      try {
        const groups = global.PocketGrouping.previewCompleted(draft.questionRange, draft.groupSize);
        preview.append(element('p', `分组预览：共${groups.length}组`));
        const list = element('ul', '', 'group-list');
        groups.forEach((group, index) => list.append(element('li', `第${index + 1}组：${group.questionRange || (group.start === group.end ? group.start : group.start + '-' + group.end)}`)));
        preview.append(list); error.textContent = ''; save.disabled = busy || !draft.subject.trim() || !draft.title.trim();
        return true;
      } catch (failure) { error.textContent = draft.questionRange || draft.groupSize ? failure.message : ''; save.disabled = true; return false; }
    }
    Object.values(inputs).forEach(input => input.addEventListener('input', update));
    form.addEventListener('submit', event => {
      event.preventDefault();
      if (busy || page.hidden || generation !== current || form.isConnected === false || !update()) return;
      busy = true; save.disabled = true; status.textContent = '';
      try {
        api.save(state => { create(state, values()); });
        draft = { subject: inputs.subject.value, title: '', questionRange: '', groupSize: '' };
        Object.entries(inputs).forEach(([key, input]) => { input.value = draft[key]; });
        update();
        status.textContent = '学习资料保存成功，可继续新增下一份。';
        inputs.title.focus();
      } catch (failure) { error.textContent = '保存失败：' + failure.message; }
      finally { busy = false; save.disabled = !inputs.subject.value.trim() || !inputs.title.value.trim(); }
    });
    form.append(preview, error, status, save); page.append(form); update(); return true;
  }
  global.PocketQuickMaterial = Object.freeze({ create, open, attach: bridge => { api = bridge; } });
  global.PocketNavigation?.register('quick-material', open);
  global.document?.getElementById('quick-material-entry')?.addEventListener('click', open);
})(globalThis);
