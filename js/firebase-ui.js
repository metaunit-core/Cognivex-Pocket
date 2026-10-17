import { connectFirebase } from './firebase-adapter.js';
  const pocketLocalStore = globalThis.PocketEnvironment?.storage || globalThis.localStorage;

const get = id => document.getElementById(id);
const status = get('firebase-backup-status');
let service = null, engine = null, connecting = null;
let displayedUid = null;
let newStartReport = null;
function newStartControls(view) {
  get('firebase-new-start-check').disabled = !view.user || activeActions.has(get('firebase-new-start-check')) || activeActions.has(get('firebase-new-start'));
  get('firebase-new-start').disabled = !view.user || !newStartReport || !get('firebase-new-start-rules').checked || activeActions.has(get('firebase-new-start'));
}
let feedbackVerified = false;
const activeActions = new Set();
function localFeedback(message) {
  feedbackVerified = message.startsWith('最新数据已备份');
  get('firebase-local-backup-feedback').textContent = message;
}
function counts(value) { return `Material ${value?.materials || 0} · Group ${value?.groups || 0} · Run ${value?.runs || 0}`; }
function describe(comparison) {
  return `本地：${counts(comparison.local.summary.counts)}\n本地备份时间：${new Date(comparison.local.backup.exportedAt).toLocaleString()}\n` +
    (comparison.cloud ? `云端：${counts(comparison.cloud.summary.counts)}\n云端备份时间：${new Date(comparison.cloud.backup.exportedAt).toLocaleString()}` : '云端：暂无有效备份') +
    `\n内容校验：${comparison.cloud ? comparison.local.hash === comparison.cloud.manifest.dataHash ? '完全一致' : '不同（数量相同也不代表内容一致）' : '云端为空'}\n本地校验值：${comparison.local.hash}` +
    (comparison.cloud ? `\n云端校验值：${comparison.cloud.manifest.dataHash}` : '') +
    '\n内容不同需要确认使用哪一份；原有云端历史会保留。';
}
function render(view) {
  if (newStartReport && newStartReport.uid !== view.user?.uid) newStartReport = null;
  newStartControls(view);
  if (activeActions.has(get('firebase-new-start'))) get('firebase-new-start-status').textContent = view.status === '正在备份' ? '正在上传当前本机数据并读回校验…' : view.status === '正在验证旧写入保护' ? '正在验证服务端拒绝旧设备写入…' : get('firebase-new-start-status').textContent;
  if (feedbackVerified && (!view.latestVerified || view.pending || view.paused || view.status === '失败')) localFeedback('当前记录尚未确认备份成功，请查看最新备份状态。');
  globalThis.PocketBackupSafety?.updateCloud(view);
  if (displayedUid !== (view.user?.uid || null)) {
    displayedUid = view.user?.uid || null;
    get('firebase-history-list').replaceChildren();
  }
  const last = view.lastSuccessAt ? new Date(view.lastSuccessAt).toLocaleString() : '暂无';
  const normal = !view.paused && view.bound && ['备份成功', '待备份', '正在备份'].includes(view.status);
  const backupStatus = normal ? '自动备份已开启' + (view.status === '正在备份' ? '，正在保存最新记录' : view.pending ? '，最新记录等待上传' : '') : view.status;
  status.textContent = `Firebase 账号：${view.user?.email || view.user?.uid || '未登录'}\n自动备份状态：${backupStatus}\n最近成功备份：${last}` +
    (view.reason ? `\n原因：${view.reason}` : '') + (view.controlError ? `\n${view.controlError}` : '');
  status.textContent += `\n本地保存：${view.localStatus}\n云端连接：${view.connected ? '已连接' : view.user ? '尚未连接 / 等待检查' : '未登录'}`;
  get('firebase-retry-area').hidden = !(view.status === '失败' || view.controlError);
  get('firebase-conflict-entry').hidden = !view.paused && !view.localReset && !/冲突|异常|不同|失败/.test(view.status) && !(view.user && !view.bound);
  get('firebase-conflict-entry').textContent = view.waitingCloudDeletion ? '查看重新开始 Firebase 备份' : view.localReset ? '选择重新绑定或恢复云端记录' : '查看异常与冲突';
  if (get('firebase-restore-evidence')) get('firebase-restore-evidence').textContent = view.restoreVerifiedAt ? `最近实际恢复内容校验：${new Date(view.restoreVerifiedAt).toLocaleString()}。这不代表每个历史版本都做过恢复测试。` : '上传及读回校验不等于实际恢复测试；尚无实际恢复校验记录。';
  if (get('local-reset-status')) get('local-reset-status').textContent = view.localReset ? view.status : '';
  globalThis.PocketManualDeletionUI?.setAccount({ user: view.user, resetUid: view.localResetUid });
  if (get('firebase-bind-local-area')) get('firebase-bind-local-area').hidden = view.waitingCloudDeletion || !(view.user && (activeActions.has(get('firebase-bind-local')) || view.paused || /冲突|异常|不同/.test(view.status) || (!view.bound && view.comparison?.cloud)));
  if (get('firebase-enable-area')) get('firebase-enable-area').hidden = view.waitingCloudDeletion || !(view.user && !view.bound && view.comparison && !view.comparison.cloud);
  get('firebase-login-fields').hidden = !!view.user;
  const canEnable = !view.waitingCloudDeletion && !view.bound && view.comparison && !view.comparison.cloud;
  if (get('firebase-enable')) { get('firebase-enable').hidden = !canEnable; get('firebase-enable').disabled = !canEnable; }
  get('firebase-comparison').textContent = view.comparison ? describe(view.comparison).split('\n').filter(line => !line.startsWith('本地校验值：') && !line.startsWith('云端校验值：')).join('\n') : '';
  get('firebase-checksums').textContent = view.comparison ? `本地 SHA-256：${view.comparison.local.hash}\n云端 SHA-256：${view.comparison.cloud?.manifest.dataHash || '暂无'}` : '';
  get('firebase-copy-checksums').disabled = !view.comparison;
  if (get('firebase-bind-local')) get('firebase-bind-local').disabled = view.waitingCloudDeletion || !view.user || activeActions.has(get('firebase-bind-local'));
  get('firebase-bind-cloud').disabled = view.waitingCloudDeletion || !view.comparison?.head;
  for (const id of ['firebase-compare', 'firebase-retry', 'firebase-history', 'firebase-logout']) get(id).disabled = !view.user;
  get('firebase-emergency-export').disabled = !view.emergencyKey;
  for (const button of activeActions) button.disabled = true;
}
async function connect() {
  if (globalThis.PocketEnvironment?.firebaseAllowed !== true) throw Error('测试环境不连接 Firebase；数据仅保存在本机测试存储。');
  if (service) return service;
  if (connecting) return connecting;
  connecting = (async () => {
    service = await connectFirebase();
    engine = globalThis.PocketCloudBackup.createEngine({ adapter: service.adapter, onChange: render });
    service.observe(user => { engine.setUser(user ? { uid: user.uid, email: user.email } : null); });
    window.addEventListener('online', () => { engine.changed(); engine.retry(); });
    window.addEventListener('offline', () => engine.changed());
    window.addEventListener('storage', event => {
      if (event.key === null || globalThis.PocketCloudBackup.DATA_KEYS.includes(event.key)) engine.changed();
      if (event.key === globalThis.PocketCloudBackup.CONTROL) render(engine.view());
    });
    document.addEventListener('visibilitychange', () => { if (!document.hidden) engine.retry(); });
    render(engine.view());
    return service;
  })();
  try { return await connecting; }
  finally { connecting = null; }
}
async function action(button, task) {
  if (activeActions.has(button)) return;
  const localAction = button === get('firebase-bind-local') || button === get('firebase-enable');
  if (localAction && (activeActions.has(get('firebase-bind-local')) || activeActions.has(get('firebase-enable')))) return;
  activeActions.add(button);
  button.disabled = true;
  try { await task(); }
  catch (error) {
    status.textContent += '\n操作失败：' + error.message;
    if (button === get('firebase-bind-local') || button === get('firebase-enable') || button === get('firebase-compare')) localFeedback('操作失败：' + error.message);
  }
  finally { activeActions.delete(button); button.disabled = false; if (engine) renderControls(); }
}
function renderControls() {
  const view = engine.view();
  newStartControls(view);
  if (get('firebase-bind-local')) get('firebase-bind-local').disabled = view.waitingCloudDeletion || !view.user || activeActions.has(get('firebase-bind-local'));
  get('firebase-bind-cloud').disabled = view.waitingCloudDeletion || !view.comparison?.head;
  if (get('firebase-enable')) get('firebase-enable').disabled = view.waitingCloudDeletion || !view.comparison || view.bound || !!view.comparison.cloud;
}
function handle(id, task) { const button = get(id); button?.addEventListener('click', () => action(button, task)); }
get('firebase-new-start-rules').addEventListener('change', () => { if (engine) newStartControls(engine.view()); });
handle('firebase-new-start-check', async () => {
  const info = get('firebase-new-start-status'); newStartReport = null;
  info.textContent = '正在只读检查云端 head、周期及本机数据…';
  try {
    if (!engine) throw Error('Firebase 尚未连接，请稍后重试。');
    newStartReport = await engine.prepareNewBackup();
    info.textContent = `可进入确认流程。本机：${counts(newStartReport.counts)}。${newStartReport.pending ? '将重试同一次初始化，不重复创建周期。' : '将以本机数据开始新周期。'}请先确认规则部署；实际写入前还会验证旧写入保护。`;
  } catch (error) { info.textContent = '无法重新开始：' + error.message; }
});
handle('firebase-new-start', async () => {
  const info = get('firebase-new-start-status');
  if (!newStartReport || !get('firebase-new-start-rules').checked) { info.textContent = '请先检查条件并确认 Pocket protocol 3 Rules 已部署。'; return; }
  if (!window.confirm(`这是重新开始 Firebase 云端备份，不恢复旧云端历史。\n当前本机：${counts(newStartReport.counts)}。\n不修改本机学习数据，残留云端历史保留。是否继续？`) || !window.confirm('再次确认：以当前本机数据作为新的云端起点？将验证旧写入保护、自动创建新周期并上传；保护验证失败会停止。')) { info.textContent = '已取消，未初始化或上传。'; return; }
  info.textContent = '正在验证旧写入保护并初始化…';
  try {
    const view = await engine.startNewBackup(newStartReport, 'RESTART_WITH_VERIFIED_RULES');
    info.textContent = view.latestVerified && !view.pending && !view.paused ? '最新数据已备份，云端读回校验通过。待备份修改：无。' : '首个版本已提交，当前新增修改仍待备份。';
    newStartReport = null;
  } catch (error) { info.textContent = '重新开始失败：' + error.message + ' 本机数据保留；处理原因后重新检查并重试。'; newStartReport = null; }
});
handle('firebase-conflict-entry', async () => {
  get('backup-advanced').open = true;
  if (engine.view().waitingCloudDeletion) { get('learning-backup-files').open = true; get('firebase-new-start-area').open = true; get('firebase-new-start-check').focus(); return; }
  get('firebase-advanced').open = true;
  if (engine.view().localReset) { await engine.compare(); get('firebase-restore').open = true; }
  get('firebase-compare').focus();
});
handle('firebase-copy-checksums', async () => { await navigator.clipboard.writeText(get('firebase-checksums').textContent); get('firebase-copy-status').textContent = '校验值已复制。'; });
handle('firebase-login', async () => {
  const password = get('firebase-password').value;
  get('firebase-password').value = '';
  if (!get('firebase-email').value.trim() || !password) throw Error('请填写邮箱和密码。');
  const api = await connect();
  await api.login(get('firebase-email').value.trim(), password);
});
handle('firebase-forgot', async () => {
  const email = get('firebase-email').value.trim();
  if (!email) throw Error('请先填写邮箱。');
  await (await connect()).forgot(email);
  status.textContent += '\n已提交密码重置请求，请检查邮箱。';
});
handle('firebase-logout', async () => { await service.logout(); });
handle('firebase-readonly-diagnose', async () => {
  const report = get('firebase-readonly-report');
  report.textContent = '正在从 Firebase 服务端读取并校验，仅核查，不上传…';
  try {
    if (!engine) throw Error('Firebase 尚未连接，请稍后重试。');
    const d = await engine.diagnose();
    const time = at => at ? new Date(at).toLocaleString() : '未取得服务端时间';
    report.textContent = `当前 Firebase 项目：${service.target?.projectId || '未取得'}\nFirestore 数据库：${service.target?.databaseId || '未取得'}\n当前用户 UID：${d.uid}\n最新 head 路径：${d.headPath}\n最新快照路径：${d.snapshotPath || '暂无'}\n本机 revision：${d.localRevision ?? '未绑定'}；云端 revision：${d.cloudRevision ?? '暂无'}\n本机 generation：${d.localGeneration || '未绑定'}\n云端 generation：${d.cloudGeneration || '暂无'}\n本机内容 SHA-256：${d.localHash}\n云端内容 SHA-256：${d.cloudHash || '暂无'}\n内容摘要一致：${!d.stable ? '核查期间数据变化，请重试' : d.contentMatches ? '是' : '否或尚未验证'}\n服务端最新快照完整校验：${d.serverVerified ? '通过' : '未通过或暂无备份'}\n云端最近实际提交时间：${time(d.lastCloudCommitAt)}\n本页面会话实际提交并读回：${d.sessionCommit ? `revision ${d.sessionCommit.revision}，${time(d.sessionCommit.committedAt)}` : '未记录（可能只是核对已有备份，或提交发生在刷新之前）'}\n未同步修改：${d.pending === null ? '核查期间变化，尚未确认' : d.pending ? '存在或尚未确认' : '无，本机内容与服务端最新 head 一致'}\n本次核查未执行上传。`;
  } catch (error) { report.textContent = '只读核查失败：' + error.message + '\n未执行上传，不能据此确认最新数据已备份。'; }
});
handle('firebase-retry', async () => { await engine.retry(); });
handle('firebase-compare', async () => {
  localFeedback('正在比较本机与云端数据…');
  await engine.compare();
  localFeedback('比较完成，请查看差异；如需以本机为准，请点击「确认使用本地数据备份」。');
});
async function confirmLocalBackup() {
  get('backup-advanced').open = true;
  get('firebase-advanced').open = true;
  localFeedback('正在比较本机与云端数据…');
  const comparison = await engine.compare();
  if (!comparison) {
    const verified = engine.view();
    if (verified.latestVerified && !verified.pending && !verified.paused) { localFeedback('最新数据已备份，本机与云端内容一致，读回校验通过。'); return; }
    throw Error('未取得有效比较结果，请在「数据比较与异常处理」中重新比较。');
  }
  const issues = globalThis.PocketCloudBackup.losses(comparison.cloud?.summary, comparison.local.summary);
  localFeedback('比较完成，等待确认。请核对本机与云端差异。');
  if (!window.confirm(describe(comparison) + (issues.length ? '\n记录减少：\n' + issues.join('\n') : '') + '\n\n是否选择以当前本机记录为准？下一步还需要再次确认。')) { localFeedback('已取消，未执行上传。'); return; }
  if (!window.confirm('再次确认：将当前本机记录保存为云端新版本，保留云端历史。' + (issues.length ? '\n本机存在记录减少，请先导出 JSON 备份，仅在确认这是主动删除或明确选择的本机版本时继续。' : '') + '\n确认上传？')) { localFeedback('已取消，未执行上传。'); return; }
  localFeedback('正在上传并读回校验…');
  await engine.bindLocal(comparison, issues.length > 0, true);
  const view = engine.view();
  if (view.status === '失败' || view.paused) throw Error(view.reason || view.status);
  localFeedback(view.latestVerified && !view.pending ? '最新数据已备份，云端读回校验通过。' : '当前版本已处理，最新修改仍等待上传或校验，请查看备份状态。');
}
handle('firebase-enable', confirmLocalBackup);
handle('firebase-bind-local', confirmLocalBackup);
async function restore(id) {
  const prepared = await engine.prepareRestore(id);
  const snapshot = prepared.snapshot;
  const originalState = prepared.original[0].content;
  const localCounts = originalState === null ? { materials: 0, groups: 0, runs: 0 } : globalThis.PocketLearningBackup.inspect(originalState);
  if (!window.confirm(`恢复备份：${new Date(snapshot.backup.exportedAt).toLocaleString()}\n备份：${counts(snapshot.summary.counts)}\n本机：${counts(localCounts)}\n` +
    '完整校验已通过，当前本地数据已保存为独立应急副本。确认覆盖这 5 个本地数据键？')) return;
  if (!window.confirm('再次确认恢复？将替换本机资料、分组、训练、复习、泛听、训练输入和页面记录。原有备份暂停状态不会自动解除。')) return;
  await engine.restore(prepared);
  window.location.reload();
}
handle('firebase-bind-cloud', async () => {
  const comparison = engine.view().comparison;
  if (!comparison?.head) throw Error('没有可恢复的云端版本。');
  await restore(comparison.head.snapshotId);
});
handle('firebase-history', async () => {
  const list = await engine.history();
  const area = get('firebase-history-list'); area.replaceChildren();
  const message = document.createElement('p');
  message.textContent = `最近历史版本：${list.length}（最多展示 100 个）`; area.append(message);
  for (const entry of list) {
    const button = document.createElement('button'); button.type = 'button'; button.className = 'secondary';
    button.textContent = `${new Date(entry.exportedAt).toLocaleString()} · ${counts(entry.counts)} · 预览并恢复`;
    button.addEventListener('click', () => action(button, () => restore(entry.id))); area.append(button);
  }
});
handle('firebase-emergency-export', async () => {
  const key = engine.view().emergencyKey;
  if (!key) throw Error('尚无应急副本。');
  const raw = pocketLocalStore.getItem(key); if (raw === null) throw Error('应急副本不存在。');
  const url = URL.createObjectURL(new Blob([raw], { type: 'application/json' }));
  const anchor = document.createElement('a'); anchor.href = url; anchor.download = 'Pocket-emergency-' + key.slice(-36) + '.json';
  document.body.append(anchor); anchor.click(); anchor.remove(); setTimeout(() => URL.revokeObjectURL(url), 60000);
});
globalThis.PocketVerifyManualCloudDeletion = async () => { await connect(); return engine.verifyManualCloudDeletion(); };
globalThis.PocketPrepareRestartAutoBackup = async () => { await connect(); return engine.prepareRestartAutoBackup(); };
if (globalThis.PocketEnvironment?.isTest) {
  status.textContent = '测试环境｜不会上传 Firebase\n不登录、不读取、不恢复正式云端数据。';
  for (const node of document.querySelectorAll('[id^="firebase-"]')) {
    if (node.tagName === 'BUTTON' || node.tagName === 'INPUT') node.disabled = true;
  }
} else connect().catch(error => {
  globalThis.PocketBackupSafety?.updateCloud({ initError: true, status: '失败' });
  status.textContent = 'Firebase 未连接：' + error.message + '\n本地学习不受影响，可稍后点击登录重试。';
});

globalThis.PocketRestartAutoBackup = async report => { await connect(); return engine.restartAutoBackup(report); };

globalThis.PocketClearAndRestart = async text => { await connect(); return engine.clearAndRestart(text); };
globalThis.PocketCancelFreshStart = async () => { await connect(); return engine.cancelFreshStart(); };
