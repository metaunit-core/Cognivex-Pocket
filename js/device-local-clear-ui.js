(function (global) {
  'use strict';
  const VERSION = 'local-clear-v3';
  const COMPATIBILITY = 'clear-click-r1';
  function trace(code) { try { global.PocketClearDiagnostics?.record(code); } catch (_) {} }
  trace('ui-loaded');
  const get = id => global.document.getElementById(id);
  const service = global.PocketDeviceLocalData;
  const panel = get('device-local-clear-confirm'), status = get('device-local-clear-status');
  if (!panel || !status) return;
  let prepared = null, stage = 0, busy = false, previousOverflow = null;
  const input = get('device-local-clear-text'), submit = get('device-local-clear-submit');
  const version = get('device-local-clear-version');
  const compatibility = get('device-local-clear-compatibility');
  if (compatibility) compatibility.textContent = '确认界面修订：' + COMPATIBILITY;
  try {
    global.PocketClearDiagnostics?.attach(() => ({ revision: COMPATIBILITY, stage, busy, prepared: !!prepared,
      matches: input.value === '清除本地数据' }));
  } catch (_) {}
  function checkVersion() {
    if (service?.VERSION !== VERSION || get('device-local-clear')?.getAttribute('data-clear-version') !== VERSION) throw Error('清除功能代码版本不一致，未清除数据。请重新加载页面，并确认版本为 ' + VERSION + '；不要清除浏览器网站数据。');
  }
  const progress = get('device-local-clear-progress');
  function notify(message) {
    status.textContent = message;
    if (progress) progress.textContent = message;
  }
  function reveal(node) {
    try { node.scrollIntoView?.({ block: 'center' }); }
    catch (error) {
      try { global.PocketClearDiagnostics?.error(error, 'scroll'); } catch (_) {}
      try { node.scrollIntoView?.(true); } catch (_) {}
    }
  }
  function focus(node) {
    try { node.focus(); }
    catch (error) { try { global.PocketClearDiagnostics?.error(error, 'focus'); } catch (_) {} }
  }
  function closePanel() {
    panel.hidden = true;
    trace('panel-closed');
    if (previousOverflow !== null && global.document.body?.style) global.document.body.style.overflow = previousOverflow;
    previousOverflow = null;
  }
  function showPanel() {
    if (global.document.body && panel.parentElement !== global.document.body) global.document.body.append?.(panel);
    panel.hidden = false; panel.scrollTop = 0;
    trace('panel-opened');
    if (previousOverflow === null && global.document.body?.style) {
      previousOverflow = global.document.body.style.overflow;
      global.document.body.style.overflow = 'hidden';
    }
  }
  function showError(error, keepOpen = false) {
    try { global.PocketClearDiagnostics?.error(error); } catch (_) {}
    if (!keepOpen) closePanel();
    notify(error?.message || String(error));
    reveal(status);
  }
  function reset() {
    prepared = null; stage = 0; closePanel();
    get('device-local-clear-second').hidden = true;
    get('device-local-clear-continue').hidden = false;
    input.value = ''; submit.disabled = true;
  }
  function controls() {
    submit.disabled = busy || stage !== 2 || input.value !== '清除本地数据';
    get('device-local-clear-open').disabled = busy;
    get('device-local-clear-cancel').disabled = busy;
  }
  function activate(button, action) {
    const run = () => {
      if (button.disabled) return;
      try { return Promise.resolve(action()).catch(showError); }
      catch (error) { showError(error); }
    };
    button.addEventListener('click', () => {
      try { global.PocketClearDiagnostics?.handled(button.id); } catch (_) {}
      return run();
    });
    try { global.PocketClearDiagnostics?.bound(button.id); } catch (_) {}
  }
  activate(get('device-local-clear-open'), () => {
    trace('open-click');
    if (busy) { notify('正在处理已确认的清除操作，请等待结果。'); return; }
    if (prepared && stage > 0 && !panel.hidden) { trace('already-open'); return; }
    try {
      reset(); notify('正在打开清除确认界面…');
      checkVersion();
      trace('version-ok');
      trace('preview-start');
      prepared = service.preview(); stage = 1;
      trace('preview-ready');
      const size = prepared.bytes >= 1024 * 1024 ? (prepared.bytes / 1024 / 1024).toFixed(2) + ' MB' : (prepared.bytes / 1024).toFixed(2) + ' KB';
      get('device-local-clear-preview').textContent = '当前环境：' + prepared.environment + '；当前预计清除的数据量（估算）：' + size + '。';
      get('device-local-clear-backup').textContent = prepared.backupTime ? '最近一次 Firebase 成功备份时间（本机历史记录）：' + new Date(prepared.backupTime).toLocaleString() + '。未联网核验当前云端状态。' : '无法确认云端备份是否成功。请先确认已保存有效备份。';
      notify('请核对清除范围；尚未删除任何数据。');
      showPanel(); focus(get('device-local-clear-title'));
    } catch (error) { showError(error); }
  });
  activate(get('device-local-clear-cancel'), () => { if (!busy) { const untouched = !!prepared; trace('cancel'); reset(); if (untouched) notify('已取消，本地数据未改变。'); focus(get('device-local-clear-open')); reveal(status); } });
  activate(get('device-local-clear-continue'), () => {
    if (!prepared || busy || stage !== 1) return;
    stage = 2; get('device-local-clear-second').hidden = false;
    trace('second-confirm');
    get('device-local-clear-continue').hidden = true; input.value = ''; controls();
    notify('请手动输入「清除本地数据」后再确认；尚未删除任何数据。'); focus(input); reveal(input);
  });
  input.addEventListener('input', controls);
  input.addEventListener('change', controls);
  input.addEventListener('compositionend', controls);
  activate(submit, async () => {
    if (!prepared || busy || panel.hidden || stage !== 2 || input.value !== '清除本地数据') return;
    try {
      busy = true; controls(); notify('正在隔离备份任务并清除本设备本地数据…');
      checkVersion();
      trace('clear-start');
      const message = await service.clear(prepared, input.value);
      trace('clear-return');
      if (!service.completed()) throw Error('未能核验本设备学习数据已清空，不能确认清除成功。请保留页面并检查错误提示；不要重复恢复云端数据。');
      notify(message);
      trace('clear-verified');
      global.PocketLocalCapacity?.refresh();
      closePanel();
      trace('reload-request');
      global.location.reload();
    } catch (error) { prepared = null; stage = 0; input.value = ''; showError(error, true); }
    finally { busy = false; controls(); }
  });
  try {
    checkVersion();
    if (version) version.textContent = '清除功能版本：' + VERSION;
    if (service.completed()) {
      notify('本设备 Pocket 本地学习数据已清除。自动备份保持暂停，不自动恢复旧数据。可使用原有 JSON 恢复；重新开始云端备份前请先处理并核对旧备份，不能直接覆盖。');
      global.document.addEventListener?.('DOMContentLoaded', () => {
        const settings = global.document.querySelector?.('.settings');
        if (settings) settings.open = true;
        reveal(status);
      }, { once: true });
    }
    else if (service.getError()) notify('清除保护尚未完成：' + service.getError());
  } catch (error) {
    if (version) version.textContent = '清除功能版本未通过校验';
    showError(error);
  }
})(globalThis);
