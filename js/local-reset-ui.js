(function (global) {
  'use strict';
  const pocketLocalStore = globalThis.PocketEnvironment?.storage || globalThis.localStorage;
  const KEY = 'pocket-local-reset-v1', get = id => document.getElementById(id);
  const dialog = get('manual-cloud-dialog'), status = get('manual-cloud-status'), reminder = get('manual-cloud-reminder'), button = get('manual-cloud-restart');
  let working = false;
  const marker = () => JSON.parse(pocketLocalStore.getItem(KEY) || 'null');
  const pending = () => marker()?.status === 'complete';
  function refresh() { reminder.hidden = !pending(); button.disabled = working || !pending(); }
  function show() { if (!pending()) return; refresh(); if (!dialog.open) { if (dialog.showModal) dialog.showModal(); else dialog.setAttribute('open', ''); } }
  reminder.addEventListener('click', show);
  get('manual-cloud-console').addEventListener('click', () => {
    const value = marker(); if (value) { try { pocketLocalStore.setItem(KEY, JSON.stringify({ ...value, consoleVisited: true })); } catch (_) {} }
  });
  function assessment(report) {
    get('manual-cloud-assessment').hidden = false;
    get('manual-cloud-index-status').textContent = '云端索引检查：' + (report.indexCheckPassed ? '通过' : '未通过');
    get('manual-cloud-history-status').textContent = '历史数据彻底删除：未验证（历史孤立分片：未完全验证）';
    get('manual-cloud-backup-status').textContent = '自动备份恢复：' + (report.canInitialize || report.automaticBackupSafe ? '等待确认' : '保护未就绪，继续暂停');
    get('manual-cloud-restart-preview').hidden = !report.indexCheckPassed;
    const n = report.localCounts;
    get('manual-cloud-local-preview').textContent = `当前本机学习记录：Material ${n.materials} · Group ${n.groups} · Run ${n.runs}。`;
    get('manual-cloud-check-details').textContent = `当前 UID：${report.uid}\nbackup/head：${report.indexes.head ? '空' : '有记录或未确认'}\nsnapshots：${report.indexes.snapshots ? '空' : '有记录或未确认'}\nuploads：${report.indexes.uploads ? '空' : '有记录或未确认'}\n历史孤立分片：未完全验证。\n${report.protectionReason || ''}`;
  }
  button.addEventListener('click', async () => {
    if (working || !pending()) return;
    working = true; refresh(); status.textContent = '检查云端数据…';
    try {
      if (!global.PocketPrepareRestartAutoBackup) throw Error('Firebase 尚未就绪，请稍后重试。');
      const report = await global.PocketPrepareRestartAutoBackup();
      if (!report) throw Error('未收到有效检查结果。');
      assessment(report);
      if (!report.indexCheckPassed) { status.textContent = '云端仍有记录或检查未完成，请使用现有冲突处理；自动备份保持暂停。'; return; }
      if (!report.canInitialize && !report.automaticBackupSafe) { status.textContent = '请先发布新版 Firestore 规则，再点击恢复。自动备份保持暂停。'; return; }
      const n = report.localCounts;
      if (!global.confirm(`当前本机：Material ${n.materials}、Group ${n.groups}、Run ${n.runs}。\n${n.materials === 0 && n.groups === 0 && n.runs === 0 ? '当前本机为空白学习状态。\n' : ''}请确认已在当前项目发布提供的新版规则。将以当前本机记录恢复自动备份，不覆盖已有云端备份。历史残留分片未完全验证。\n确认恢复？`)) { status.textContent = '已取消，学习数据未改变，自动备份仍暂停。'; return; }
      status.textContent = '正在准备备份保护并恢复…';
      const result = await global.PocketRestartAutoBackup(report);
      status.textContent = result?.empty ? '自动备份已恢复，开始学习后自动上传；未上传空白备份。' : '新备份已校验，自动备份已恢复。';
      get('manual-cloud-backup-status').textContent = status.textContent;
    } catch (error) {
      get('manual-cloud-check-details').textContent = '恢复检查结果：' + error.message;
      status.textContent = /permission|权限/i.test(error.message) ? '规则未发布或权限不足，请先发布新版规则；自动备份保持暂停。' : /离线|Offline|network/i.test(error.message) ? '网络不可用，请联网后重试；自动备份保持暂停。' : error.message + ' 自动备份保持暂停。';
    } finally { working = false; get('manual-cloud-dialog-reason').textContent = status.textContent; refresh(); }
  });
  // Closing, opening Console, returning or refreshing never initialize/resume.
  global.addEventListener('focus', refresh); document.addEventListener('visibilitychange', refresh);
  global.PocketManualDeletionUI = Object.freeze({ show, setAccount: refresh });
  if (pending()) status.textContent = '自动备份已暂停，请点击「恢复 Firebase 自动备份」。';
  show(); refresh();
})(globalThis);
