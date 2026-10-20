(function (global) {
  'use strict';
  const IDS = ['device-local-clear-open', 'device-local-clear-cancel', 'device-local-clear-continue', 'device-local-clear-submit'];
  const LABELS = { 'ui-loaded': '确认界面脚本已执行', 'open-click': '清除按钮处理函数已执行', 'already-open': '确认层已打开，忽略重复打开',
    'version-ok': '版本校验通过', 'preview-start': '开始读取清除范围', 'preview-ready': '清除范围读取完成',
    'panel-opened': '已请求显示确认层', 'panel-closed': '确认层已关闭', 'cancel': '用户取消，未执行清除',
    'second-confirm': '进入第二次确认', 'clear-start': '已调用现有清除服务，等待结果', 'clear-return': '清除服务返回',
    'clear-verified': '清空结果核验通过', 'reload-request': '请求重新加载页面' };
  const get = id => global.document?.getElementById(id);
  const events = [], bindings = new Set(), captured = new Map(), handled = new Map();
  let readState = null, base = '', visible = false;
  const safe = action => (...args) => { try { return action(...args); } catch (_) { return undefined; } };
  function render() {
    const live = get('device-clear-diagnostic-live');
    if (live && events.length) live.textContent = '诊断进度：' + events[events.length - 1];
    if (!visible) return;
    for (const suffix of ['', '-in-panel']) {
      const output = get('device-clear-diagnostic-output' + suffix);
      if (output) output.value = base + '\n\n最近执行记录（仅本页内存，刷新后清空）：\n' + events.join('\n');
    }
  }
  function append(text) {
    events.push(new Date().toLocaleTimeString() + ' ' + text);
    if (events.length > 60) events.shift();
    render();
  }
  function record(code) { if (Object.hasOwn(LABELS, code)) append(LABELS[code]); }
  function error(error, phase = 'handler') {
    const names = ['Error', 'TypeError', 'SyntaxError', 'ReferenceError', 'SecurityError', 'QuotaExceededError', 'NotAllowedError'];
    const name = names.includes(error?.name) ? error.name : '未知类型';
    const source = ['handler', 'focus', 'scroll', 'window', 'promise'].includes(phase) ? phase : 'handler';
    const message = typeof error?.message === 'string' ? error.message : '';
    let category = '未分类';
    for (const [fragment, label] of [['安全隔离', '安全锁不可用'], ['版本不一致', '版本混用'],
      ['记录已变化', '学习数据变化'], ['未完成的备份', '备份任务未结束'], ['读取', '本地读取异常']]) {
      if (message.includes(fragment)) { category = label; break; }
    }
    const codes = {
      LOCK_BUSY: ['锁冲突', '浏览器未授予独占锁；可能存在后台保留文档或其他同源页面持锁'],
      LOCK_FAILURE: ['锁异常', '安全锁申请、等待或释放未完成'],
      LOCK_TIMEOUT: ['锁等待超时', '浏览器未在等待期限内完成会话锁申请或释放'],
      LOCAL_WRITES_PAUSED: ['本页保存已暂停', '清除操作正在安全释放或重新取得本页会话锁'],
      PAGE_SUSPENDED: ['页面生命周期', '页面已离开或正在重新取得会话锁']
    };
    const code = Object.hasOwn(codes, error?.pocketClearCode || '') ? error.pocketClearCode :
      (['SecurityError', 'QuotaExceededError'].includes(name) ? 'STORAGE_FAILURE' : category === '版本混用' ? 'VERSION_MISMATCH' : 'UNKNOWN');
    const stages = ['session-enter', 'session-release', 'exclusive-acquire', 'clear-work', 'lifecycle'];
    const stage = stages.includes(error?.pocketClearStage) ? error.pocketClearStage : source;
    const detail = codes[code] || [code === 'STORAGE_FAILURE' ? '存储异常' : category, '未确认具体原因；未记录原始消息或堆栈'];
    append('异常：' + name + '；代码=' + code + '；阶段=' + stage + '；分类=' + detail[0] + '；原因=' + detail[1]);
  }
  function describe(node) {
    if (!node) return '不存在';
    const style = global.getComputedStyle?.(node), rect = node.getBoundingClientRect?.();
    const result = ['存在', 'hidden=' + !!node.hidden, 'disabled=' + !!node.disabled];
    if (style) result.push('display=' + style.display, 'visibility=' + style.visibility, 'opacity=' + style.opacity,
      'position=' + style.position, 'z-index=' + style.zIndex, 'pointer-events=' + style.pointerEvents);
    if (rect) {
      result.push('宽×高=' + Math.round(rect.width) + '×' + Math.round(rect.height));
      const x = rect.left + rect.width / 2, y = rect.top + Math.min(rect.height / 2, 32);
      if (rect.width <= 0 || rect.height <= 0) result.push('无可见区域');
      else if (x < 0 || y < 0 || x >= global.innerWidth || y >= global.innerHeight) result.push('检测点在视口外');
      else if (global.document.elementFromPoint) {
        const hit = global.document.elementFromPoint(x, y);
        result.push(hit && (hit === node || node.contains?.(hit)) ? '检测点未被遮挡' : '检测点被其他元素覆盖（不记录元素内容）');
      }
    }
    return result.join('；');
  }
  function inspect() {
    const panel = get('device-local-clear-confirm');
    const lines = ['确认界面只读诊断 · clear-click-r1', '检测时间：' + new Date().toLocaleString(),
      '不读取学习内容或存储键，不调用清除或 Firebase，不上传日志。',
      '只检查当前界面；不模拟点击、不主动打开确认层。',
      '清除按钮：' + describe(get(IDS[0])), '确认层：' + describe(panel),
      '确认层父容器：' + (panel?.parentElement === global.document.body ? 'body' : '其他或未挂载'),
      '确认层实际显示需在正常点击后检查；hidden=true 本身不代表故障。'];
    for (const id of IDS) lines.push(id + '：click监听登记=' + bindings.has(id) + '；捕获click=' + (captured.get(id + ':click') || 0) +
      '；捕获touchend=' + (captured.get(id + ':touchend') || 0) + '；click处理=' + (handled.get(id) || 0));
    try {
      const lock = global.PocketDataDeletion?.lockState?.();
      if (lock) lines.push('清除锁修订：' + (lock.revision === 'clear-lock-r2' ? 'clear-lock-r2' : 'clear-lock-r1') + '；阶段=' +
        (['idle', 'session-enter', 'session-release', 'exclusive-acquire', 'clear-work'].includes(lock.phase) ? lock.phase : '未知') +
        '；当前页共享锁=' + !!lock.held + '；当前页独占锁=' + !!lock.exclusiveHeld +
        '；页面离开=' + !!lock.suspended + '；恢复中=' + !!lock.resuming + '；清除中=' + !!lock.clearing + '；锁转换中=' + !!lock.sessionTransition);
      if (lock?.acquisition) {
        const attempt = lock.acquisition;
        const count = value => Number.isInteger(value) && value >= 0 ? value : '未知';
        lines.push('独占申请时快照（不同于失败恢复后的当前状态）：共享锁=' + !!attempt.sharedHeld +
          '；独占锁=' + !!attempt.exclusiveHeld + '；申请次数=' + count(attempt.attempts) +
          '；首次失败后同名持锁数=' + count(attempt.holders) + '；等待数=' + count(attempt.waiters) +
          '。不记录窗口标识；当前页共享锁=true 可能是失败恢复后重新取得。');
      }
      const state = readState?.();
      lines.push(state ? '界面修订=' + (state.revision === 'clear-click-r1' ? state.revision : '其他') + '；阶段=' +
        ([0, 1, 2].includes(state.stage) ? state.stage : '异常') + '；busy=' + !!state.busy + '；预览就绪=' + !!state.prepared +
        '；确认文字匹配=' + !!state.matches : 'UI 未注册诊断状态，可能未加载当前修订或初始化中断。');
    } catch (_) { lines.push('读取 UI 状态发生异常。'); }
    lines.push('捕获事件不等于处理函数执行；无捕获事件时需结合遮挡、disabled 和实机触摸情况判断。');
    base = lines.join('\n'); visible = true;
    for (const suffix of ['', '-in-panel']) { const report = get('device-clear-diagnostic-report' + suffix); if (report) report.hidden = false; }
    render(); return base;
  }
  global.PocketClearDiagnostics = Object.freeze({ record: safe(record), error: safe(error), inspect: safe(inspect),
    attach: safe(getter => { readState = getter; }), bound: safe(id => { if (IDS.includes(id)) bindings.add(id); }),
    handled: safe(id => { if (IDS.includes(id)) { handled.set(id, (handled.get(id) || 0) + 1); append('click处理已到达 [' + id + ']'); } }) });
  for (const type of ['click', 'touchend']) global.document?.addEventListener(type, safe(event => {
    let node = event.target;
    while (node && !IDS.includes(node.id)) node = node.parentElement;
    if (!node) return;
    const key = node.id + ':' + type; captured.set(key, (captured.get(key) || 0) + 1);
    append('捕获 ' + type + ' [' + node.id + ']；defaultPrevented=' + !!event.defaultPrevented);
  }), { capture: true, passive: true });
  const relevant = value => typeof value === 'string' && /device-local-clear-ui\.js|device-clear-diagnostics\.js/.test(value);
  global.addEventListener?.('error', safe(event => { if (relevant(event.filename) || relevant(event.target?.src)) error(event.error, 'window'); }), true);
  global.addEventListener?.('unhandledrejection', safe(event => { if (relevant(event.reason?.stack)) error(event.reason, 'promise'); }));
  for (const suffix of ['', '-in-panel']) {
    get('device-clear-diagnostic-run' + suffix)?.addEventListener('click', safe(inspect));
    get('device-clear-diagnostic-copy' + suffix)?.addEventListener('click', async () => {
      const output = get('device-clear-diagnostic-output' + suffix), status = get('device-clear-diagnostic-copy-status' + suffix);
      try { await global.navigator.clipboard.writeText(output.value); if (status) status.textContent = '诊断结果已复制。'; }
      catch (_) {
        try { output.focus(); output.select(); output.setSelectionRange?.(0, output.value.length); } catch (_) {}
        if (status) status.textContent = '未能自动复制，请长按诊断文本全选复制。';
      }
    });
  }
})(globalThis);
