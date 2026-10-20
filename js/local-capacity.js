(function (global) {
  'use strict';
  const REFERENCE = 5 * 1024 * 1024;
  function refresh() {
    const result = global.document.getElementById('local-capacity-result');
    const time = global.document.getElementById('local-capacity-time');
    const detail = global.document.getElementById('local-capacity-detail');
    const warning = global.document.getElementById('local-capacity-warning');
    const guide = global.document.getElementById('storage-cleanup-guide-entry');
    if (!result || !time) return;
    try {
      const bytes = global.PocketDeviceLocalData.usage(), percent = bytes / REFERENCE * 100;
      const size = bytes >= 1024 * 1024 ? (bytes / 1024 / 1024).toFixed(2) + ' MB' : (bytes / 1024).toFixed(2) + ' KB';
      const status = percent >= 90 ? '接近参考上限' : percent >= 70 ? '注意容量' : '正常';
      result.textContent = size + ' / 5 MiB（参考）　' + status;
      if (detail) detail.textContent = '已使用 ' + percent.toFixed(2) + '% · 当前浏览器本地数据（估算）';
      if (warning) warning.hidden = percent < 70;
      if (guide) guide.className = percent >= 70 ? 'secondary local-capacity-guide-warning' : 'secondary';
    } catch (_) {
      result.textContent = '检测失败';
      if (detail) detail.textContent = '无法读取当前浏览器本地数据，请刷新检测。';
      if (warning) warning.hidden = true;
      if (guide) guide.className = 'secondary';
    }
    time.textContent = '最近检测时间：' + new Date().toLocaleString();
  }
  global.PocketLocalCapacity = Object.freeze({ refresh });
  global.document.getElementById('local-capacity-refresh')?.addEventListener('click', refresh);
  global.document.querySelector?.('.settings')?.addEventListener('toggle', event => { if (event.target.open) refresh(); });
  global.PocketCloudSignal?.subscribe(refresh);
  global.addEventListener?.('storage', refresh);
  refresh();
})(globalThis);
