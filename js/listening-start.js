(function () {
  'use strict';
  const KEY = 'pocket-listening-start-v1';
  const DURATION = 60 * 60 * 1000;
  const SHORTCUT = 'shortcuts://run-shortcut?name=Cognivex%20%E6%B3%9B%E5%90%AC';
  let timer;
  const localDate = () => {
    const date = new Date();
    return `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')}`;
  };
  const id = (subject, date = localDate()) => JSON.stringify([date, subject]);
  const isIOS = () => /iPad|iPhone|iPod/.test(navigator.userAgent || '') ||
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  function read() {
    const raw = localStorage.getItem(KEY);
    if (raw === null) return {};
    const records = JSON.parse(raw);
    if (!records || typeof records !== 'object' || Array.isArray(records)) throw Error('Invalid listening data');
    return records;
  }
  function valid(record) {
    return record && typeof record.subject === 'string' && typeof record.localDate === 'string' &&
      ['ready','running','paused','completed'].includes(record.status) &&
      (record.status === 'ready' || (Number.isFinite(record.startedAt) && Number.isFinite(record.endsAt) &&
        record.endsAt >= record.startedAt && (record.status !== 'paused' ||
          (Number.isFinite(record.remainingMs) && record.remainingMs > 0 && record.remainingMs <= DURATION))));
  }
  function current(records, subject) {
    // Finish a pending timer across midnight before requiring any new start.
    const pending = Object.values(records).find(record => valid(record) && (!subject || record.subject === subject) &&
      record.status !== 'ready' && !record.enteredAt);
    const unknownSkip = records[id('')];
    const record = pending || records[id(subject)] || (subject && unknownSkip?.skipped &&
      unknownSkip.subject === '' && unknownSkip.enteredAt ? {...unknownSkip,subject} : null);
    if (record && !valid(record)) throw Error('Invalid listening record');
    return record || {subject, localDate:localDate(), status:'ready', videoUrl:''};
  }
  function save(record, aliasSubject) {
    const records = read();
    records[id(record.subject, record.localDate)] = record;
    if (aliasSubject === '') records[id('',record.localDate)] = record;
    localStorage.setItem(KEY, JSON.stringify(records));
  }
  function needsGate(subject) {
    try { return !current(read(), (subject || '').trim()).enteredAt; }
    catch (_) { return true; }
  }
  function hasPending() {
    try { return Object.values(read()).some(record => valid(record) && record.status !== 'ready' && !record.enteredAt); }
    catch (_) { return false; }
  }
  function clear() { if (timer !== undefined) { clearInterval(timer); timer = undefined; } }
  const el = (tag, text, className) => {
    const node = document.createElement(tag);
    if (text) node.textContent = text;
    if (className) node.className = className;
    return node;
  };
  function showIfNeeded(container, materialSubject, onEnter, reopen = false, controls, restoreDate) {
    const initialSubject = (materialSubject || '').trim();
    let record;
    let loadFailed = false;
    try {
      const records = read();
      record = restoreDate && records[id(initialSubject,restoreDate)] || current(records, initialSubject);
      if (!valid(record)) throw Error('Invalid listening record');
      // A skip before material setup applies to the next chosen subject only.
      if (initialSubject && record.skipped && record.enteredAt && !records[id(initialSubject)] &&
          records[id('')]?.subject === '') {
        records[id(initialSubject)] = record; delete records[id('')];
        localStorage.setItem(KEY,JSON.stringify(records));
      }
    }
    catch (_) { loadFailed = true; record = {subject:initialSubject,localDate:localDate(),status:'ready',videoUrl:''}; }
    if (record.enteredAt && !reopen) return false;
    clear();
    const page = el('section', '', 'listening-start');
    const title = el('h3', '泛听启动');
    const subjectLabel = el('p', record.subject || '请选择当前学习科目', 'listening-subject');
    const subject = el('input'); subject.value = record.subject; subject.setAttribute('aria-label','当前学习科目');
    subject.hidden = !!initialSubject;
    const instruction = el('p', '任选当前科目一个视频，泛听 60 分钟');
    const video = el('input'); video.type = 'text'; video.inputMode = 'url'; video.value = record.videoUrl || '';
    video.setAttribute('aria-label','泛听视频链接（可选）'); video.placeholder = '视频链接（可选）';
    const openVideo = el('a', '打开泛听视频 ↗', 'video-link-button'); openVideo.target = '_blank'; openVideo.rel = 'noopener noreferrer';
    const clock = el('p', '01:00:00', 'listening-clock'); clock.setAttribute('role','timer');
    const message = el('p', '', 'listening-message'); message.setAttribute('role','status');
    const error = el('p', loadFailed ? '无法读取泛听记录，请检查本机存储后重新打开。原记录未覆盖。' : '', 'field-error'); error.setAttribute('role','alert');
    const start = el('button', '开始泛听 · 60 分钟'); start.type = 'button'; start.disabled = loadFailed;
    const retry = el('button', '重新启动苹果提醒', 'practice-secondary'); retry.type = 'button';
    const pause = el('button', '暂停', 'practice-secondary'); pause.type = 'button';
    const reset = el('button', '复位', 'practice-secondary'); reset.type = 'button';
    const skip = el('button', '跳过泛听，直接开始学习', 'practice-secondary'); skip.type = 'button';
    const enter = controls?.button || el('button', '进入分组学习 →'); enter.type = 'button';
    if (controls) enter.textContent = '开始学习';
    const appleNote = el('p', '将尝试打开「Cognivex 泛听」快捷指令，请在 iPhone 上确认运行。Pocket 无法确认苹果计时器是否启动。暂停、复位和跳过仅作用于 Pocket，苹果计时器需在系统中自行操作。', 'listening-message');
    function updateVideo() {
      const url = video.value.trim();
      openVideo.hidden = !url || !window.PocketExternalLinks.canNavigate(url);
      if (!openVideo.hidden) openVideo.href = url;
      else openVideo.removeAttribute('href');
    }
    updateVideo();
    function persist(next) {
      try { save(next,initialSubject); record = next; error.textContent = ''; rememberView(); return true; }
      catch (_) { error.textContent = '泛听状态保存失败，请检查本机存储后重试。'; return false; }
    }
    function rememberView() {
      window.PocketNavigation?.remember({page:'listening',subject:record.subject,localDate:record.localDate});
    }
    function apple() {
      if (!isIOS()) return;
      message.textContent = '已尝试打开苹果快捷指令，请在系统中确认；Pocket 倒计时继续独立运行。';
      try { window.location.href = SHORTCUT; }
      catch (_) { message.textContent = '未能打开快捷指令，可点击「重新启动苹果提醒」重试。'; }
    }
    function tick() {
      const running = record.status !== 'ready';
      const remaining = record.status === 'paused' ? record.remainingMs : running ? Math.max(0,record.endsAt - Date.now()) : DURATION;
      const seconds = Math.ceil(remaining / 1000);
      clock.textContent = [Math.floor(seconds/3600),Math.floor(seconds/60)%60,seconds%60].map(n=>String(n).padStart(2,'0')).join(':');
      const done = running && remaining === 0;
      if (done && record.status !== 'completed') persist({...record,status:'completed'});
      title.textContent = done ? '泛听结束' : '泛听启动';
      if (done) message.textContent = record.skipped ? '' : '60 分钟已到，请进入正式分组学习。';
      else if (record.status === 'paused') message.textContent = '已暂停，点击「继续」恢复倒计时。';
      start.hidden = running; enter.hidden = true; retry.hidden = !running || !isIOS();
      pause.hidden = !running || done; pause.textContent = record.status === 'paused' ? '继续' : '暂停';
      reset.hidden = !running; reset.disabled = loadFailed;
      appleNote.hidden = !isIOS(); subject.disabled = !!initialSubject;
    }
    video.addEventListener('input', () => {
      updateVideo();
      if (!loadFailed) {
        try {
          // Another tab may already have started this subject; preserve its deadline.
          const latest = current(read(),record.subject);
          persist({...latest,videoUrl:video.value}); tick();
        } catch (_) { error.textContent = '无法读取泛听记录，视频链接未保存。'; }
      }
    });
    subject.addEventListener('change', () => {
      if (initialSubject) return;
      try {
        record = current(read(),subject.value.trim()); subjectLabel.textContent = record.subject;
        rememberView();
        video.value = record.videoUrl || ''; updateVideo(); tick();
      } catch (_) { loadFailed = true; start.disabled = true; error.textContent = '无法读取该科目的泛听记录。'; }
    });
    start.addEventListener('click', () => {
      if (loadFailed || record.status !== 'ready') return;
      const chosen = initialSubject || subject.value.trim();
      if (!chosen) { error.textContent = '请先填写当前学习科目。'; return; }
      try {
        const saved = current(read(),chosen);
        if (saved.status !== 'ready') { record = saved; tick(); return; }
      } catch (_) { error.textContent = '无法读取泛听记录，未启动计时。'; return; }
      const startedAt = Date.now();
      if (!persist({subject:chosen,localDate:localDate(),startedAt,endsAt:startedAt+DURATION,status:'running',videoUrl:video.value})) return;
      subjectLabel.textContent = chosen; tick(); apple();
    });
    retry.addEventListener('click', () => { if (record.status !== 'ready') apple(); });
    pause.addEventListener('click', () => {
      if (loadFailed) return;
      try { record = current(read(),record.subject); }
      catch (_) { error.textContent = '无法读取泛听记录，未更改计时。'; return; }
      if (record.status === 'paused') {
        const next = {...record,status:'running',endsAt:Date.now()+record.remainingMs};
        delete next.remainingMs;
        if (persist(next)) { message.textContent = '已继续倒计时。'; tick(); }
      } else if (record.status === 'running') {
        const remainingMs = Math.max(0,record.endsAt-Date.now());
        if (!remainingMs) { tick(); return; }
        if (persist({...record,status:'paused',remainingMs})) tick();
      }
    });
    reset.addEventListener('click', () => {
      if (loadFailed || record.status === 'ready') return;
      try {
        const records = read();
        const next = {subject:record.subject,localDate:localDate(),status:'ready',videoUrl:video.value};
        // Clear aliases of this timer together, including a timer spanning midnight.
        Object.keys(records).forEach(key => {
          const item = records[key];
          if (item && item.subject === record.subject && item.localDate === record.localDate &&
              item.startedAt === record.startedAt) records[key] = {...next,localDate:item.localDate};
        });
        records[id(next.subject)] = next;
        if (!initialSubject) records[id('')] = next;
        localStorage.setItem(KEY,JSON.stringify(records)); record = next; error.textContent = '';
        rememberView();
        message.textContent = '已复位为 60 分钟，请点击开始泛听。'; tick();
      } catch (_) { error.textContent = '复位保存失败，原计时状态保持不变，请重试。'; }
    });
    const enterLearning = (skipListening = false) => {
      if (!skipListening && (record.status === 'ready' || record.status === 'paused' || Date.now() < record.endsAt)) return;
      const enteredAt = Date.now();
      try {
        const records = read();
        const completed = skipListening ? {...record,status:'completed',skipped:true,enteredAt,
          startedAt:record.startedAt ?? enteredAt,endsAt:enteredAt} : {...record,status:'completed',enteredAt};
        delete completed.remainingMs;
        Object.keys(records).forEach(key => {
          const item = records[key];
          if (item && item.subject === record.subject && item.localDate === record.localDate &&
              item.startedAt === record.startedAt) records[key] = completed;
        });
        records[id(record.subject,record.localDate)] = completed;
        // A timer spanning midnight also satisfies the day formal study starts.
        records[id(record.subject)] = {...completed,localDate:localDate()};
        if (!initialSubject) records[id('')] = {...completed,localDate:localDate()};
        localStorage.setItem(KEY,JSON.stringify(records)); record = completed; error.textContent = '';
      } catch (_) { error.textContent = '泛听完成状态保存失败，请重试进入分组学习。'; return; }
      clear(); onEnter();
    };
    skip.addEventListener('click', () => enterLearning(true));
    if (controls) controls.setEnter(() => enterLearning());
    else enter.addEventListener('click', () => enterLearning());
    page.append(title,subjectLabel,subject,instruction,video,openVideo,clock,message,error,start,pause,reset,retry,appleNote,skip);
    if (!controls) page.append(enter);
    container.append(page); tick(); timer = setInterval(tick,1000);
    rememberView();
    return true;
  }
  window.PocketListeningStart = Object.freeze({showIfNeeded,needsGate,hasPending,clear});
})();
