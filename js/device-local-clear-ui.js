(function (global) {
  'use strict';
  const VERSION = 'local-clear-v2';
  const get = id => global.document.getElementById(id);
  const service = global.PocketDeviceLocalData;
  const panel = get('device-local-clear-confirm'), status = get('device-local-clear-status');
  if (!panel || !status) return;
  let prepared = null, stage = 0, busy = false;
  const input = get('device-local-clear-text'), submit = get('device-local-clear-submit');
  const version = get('device-local-clear-version');
  function checkVersion() {
    if (service?.VERSION !== VERSION || get('device-local-clear')?.getAttribute('data-clear-version') !== VERSION) throw Error('清除功能代码版本不一致，未清除数据。请重新加载页面，并确认版本为 ' + VERSION + '；不要清除浏览器网站数据。');
  }
  function showError(error) { status.textContent = error.message; status.scrollIntoView?.({ block: 'center' }); }
  function reset() {
    prepared = null; stage = 0; panel.hidden = true;
    get('device-local-clear-second').hidden = true;
    get('device-local-clear-continue').hidden = false;
    input.value = ''; submit.disabled = true;
  }
  function controls() {
    submit.disabled = busy || stage !== 2 || input.value !== '清除本地数据';
    get('device-local-clear-open').disabled = busy;
    get('device-local-clear-cancel').disabled = busy;
  }
  get('device-local-clear-open').addEventListener('click', () => {
    if (busy) return;
    reset(); status.textContent = '';
    try {
      checkVersion();
      prepared = service.preview(); stage = 1; panel.hidden = false;
      const size = prepared.bytes >= 1024 * 1024 ? (prepared.bytes / 1024 / 1024).toFixed(2) + ' MB' : (prepared.bytes / 1024).toFixed(2) + ' KB';
      get('device-local-clear-preview').textContent = '当前环境：' + prepared.environment + '；当前预计清除的数据量（估算）：' + size + '。';
      get('device-local-clear-backup').textContent = prepared.backupTime ? '最近一次 Firebase 成功备份时间（本机历史记录）：' + new Date(prepared.backupTime).toLocaleString() + '。未联网核验当前云端状态。' : '无法确认云端备份是否成功。请先确认已保存有效备份。';
      get('device-local-clear-title').focus();
    } catch (error) { showError(error); }
  });
  get('device-local-clear-cancel').addEventListener('click', () => { if (!busy) { reset(); status.textContent = '已取消，本地数据未改变。'; get('device-local-clear-open').focus(); } });
  get('device-local-clear-continue').addEventListener('click', () => {
    if (!prepared || busy || stage !== 1) return;
    stage = 2; get('device-local-clear-second').hidden = false;
    get('device-local-clear-continue').hidden = true; input.value = ''; controls(); input.focus();
  });
  input.addEventListener('input', controls);
  submit.addEventListener('click', async () => {
    if (!prepared || busy || stage !== 2 || input.value !== '清除本地数据') return;
    busy = true; controls(); status.textContent = '正在隔离备份任务并清除本设备本地数据…';
    try {
      checkVersion();
      const message = await service.clear(prepared, input.value);
      if (!service.completed()) throw Error('未能核验本设备学习数据已清空，不能确认清除成功。请保留页面并检查错误提示；不要重复恢复云端数据。');
      status.textContent = message;
      global.PocketLocalCapacity?.refresh();
      panel.hidden = true;
      global.location.reload();
    } catch (error) { reset(); showError(error); }
    finally { busy = false; controls(); }
  });
  try {
    checkVersion();
    if (version) version.textContent = '清除功能版本：' + VERSION;
    if (service.completed()) {
      status.textContent = '本设备 Pocket 本地学习数据已清除。自动备份保持暂停，不自动恢复旧数据。可使用原有 JSON 恢复；重新开始云端备份前请先处理并核对旧备份，不能直接覆盖。';
      global.document.addEventListener?.('DOMContentLoaded', () => {
        const settings = global.document.querySelector?.('.settings');
        if (settings) settings.open = true;
        status.scrollIntoView?.({ block: 'center' });
      }, { once: true });
    }
    else if (service.getError()) status.textContent = '清除保护尚未完成：' + service.getError();
  } catch (error) {
    if (version) version.textContent = '清除功能版本未通过校验';
    showError(error);
  }
})(globalThis);
