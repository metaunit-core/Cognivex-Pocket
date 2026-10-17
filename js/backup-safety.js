(function (global) {
  'use strict';
  const pocketLocalStore = globalThis.PocketEnvironment.requireStorage();
  const META = 'pocket-offline-backup-meta-v1', DAY = 86400000;
  let cloud = null, metadataError = '';
  function metadata() { try { return JSON.parse(pocketLocalStore.getItem(META) || 'null') || {}; } catch (_) { metadataError = '导出时间记录无法读取。'; return {}; } }
  function offlineView(now = Date.now()) {
    const meta = metadata(), at = Number.isFinite(meta.lastExportAt) ? meta.lastExportAt : null;
    const due = at === null || now - at > 7 * DAY;
    return { at, due, remind: due && !(meta.dismissUntil > now), label: at === null ? '尚未导出' : due ? '建议重新导出' : '最近已触发导出',
      help: at === null ? '建议保存一份 JSON 离线备份。' : due ? '已经超过 7 天没有导出 JSON，建议保存一份离线备份。' : `最近导出：${new Date(at).toLocaleString()}；请自行确认文件已保存在安全位置。`, metadataError };
  }
  function cloudView(view = cloud) {
    if (global.PocketEnvironment?.isTest) return { label: '测试环境｜不会连接 Firebase', help: '仅使用独立本机测试存储；不连接、读取或恢复正式 Firebase。' };
    if (!view || view.initError) {
      try {
        const protectedPause = pocketLocalStore.getItem('pocket-local-reset-v1') || pocketLocalStore.getItem('pocket-offline-restore-pause-v1') || JSON.parse(pocketLocalStore.getItem('pocket-cloud-control-v1') || '{}').pause;
        if (protectedPause) return { label: '自动备份已暂停', help: '自动备份暂停状态已保留，请在高级管理中处理。' };
      } catch (_) { return { label: '已暂停', help: '备份保护状态无法读取，请先处理。' }; }
      if (view?.initError) return { label: '备份失败', help: '云端服务未能连接；本机记录仍保留，请在高级管理中查看原因。' };
    }
    if (!view) return { label: '等待备份', help: '正在检查云端连接；本机学习不受影响。' };
    if (view.localReset || view.paused || /暂停|冲突|异常|不同/.test(view.status)) return { label: '已暂停', help: '自动备份已暂停，请先处理云端数据或冲突。' };
    if (!view.user) return { label: '未登录', help: '登录 Firebase 后可配置自动备份。' };
    if (view.pending && (view.online === false || global.navigator?.onLine === false)) return { label: '离线，等待联网', help: '存在未备份修改，联网后会安全重试。' };
    if (view.status === '正在备份') return { label: '正在备份', help: view.pending ? '正在上传和校验；期间新增修改仍会保留为待备份。' : '正在核对最新版本。' };
    if (view.status === '失败' || view.controlError) return { label: '备份失败', help: '最新记录尚未确认备份成功，请在高级管理中重试。' };
    if (view.bound && view.latestVerified === true && !view.pending) return { label: '最新数据已备份', help: '当前本机内容与已读回校验的云端版本一致。' };
    return { label: '等待备份', help: view.bound ? '最新记录等待上传或校验；本机记录仍可使用。' : '需要先比较本机与云端记录并确认绑定。' };
  }
  function render() {
    const get = id => global.document?.getElementById(id);
    const offline = offlineView(), remote = cloudView();
    const local = global.PocketCloudSignal?.localStatus() || '正在检查';
    for (const [id, value] of [['safety-local-state', local === '已保存' ? '已保存' : '保存失败'], ['safety-local-help', local === '已保存' ? '学习修改已自动保存在本机，不依赖网络。' : '本机保存或读取异常，请先保留备份并处理。'], ['safety-cloud-state', remote.label], ['safety-cloud-help', remote.help], ['safety-json-state', offline.label], ['safety-json-help', offline.help + (offline.metadataError ? ' ' + offline.metadataError : '')]]) if (get(id)) get(id).textContent = value;
    if (get('safety-cloud-last-success')) get('safety-cloud-last-success').textContent = '最近成功备份：' + (cloud?.lastSuccessAt ? new Date(cloud.lastSuccessAt).toLocaleString() : '暂无记录');
    if (get('safety-cloud-pending')) get('safety-cloud-pending').textContent = '待备份修改：' + (cloud?.latestVerified === true && !cloud?.pending ? '无' : '存在未备份修改或尚未确认');
    if (get('offline-backup-reminder')) get('offline-backup-reminder').hidden = !offline.remind;
    if (get('offline-backup-reminder-text')) get('offline-backup-reminder-text').textContent = offline.help;
  }
  function exported() {
    try { pocketLocalStore.setItem(META, JSON.stringify({ lastExportAt: Date.now(), dismissUntil: null })); metadataError = ''; }
    catch (_) { metadataError = '无法记录导出时间，请自行确认文件已保存。'; }
    render();
  }
  function dismiss() {
    try { pocketLocalStore.setItem(META, JSON.stringify({ ...metadata(), dismissUntil: Date.now() + DAY })); } catch (_) {}
    render();
    const node = global.document?.getElementById('offline-backup-reminder'); if (node) node.hidden = true;
  }
  global.PocketBackupSafety = Object.freeze({ META, offlineView, cloudView, render, exported, updateCloud(view) { cloud = view; render(); } });
  global.document?.getElementById('offline-backup-dismiss')?.addEventListener('click', dismiss);
  global.document?.getElementById('offline-backup-export')?.addEventListener('click', () => global.document.getElementById('export-learning-backup').click());
  global.PocketCloudSignal?.subscribe(render);
  global.addEventListener?.('storage', render);
  global.addEventListener?.('focus', render);
  render();
})(globalThis);
