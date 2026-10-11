(function (global) {
  'use strict';
  const get = id => global.document?.getElementById(id);
  const input = get('restore-learning-file'), button = get('restore-learning-backup'), status = get('learning-recovery-status');
  if (!input || !button || !status) return;
  let selection = 0;
  button.addEventListener('click', () => { input.value = ''; input.click(); });
  input.addEventListener('change', async () => {
    const file = input.files?.[0]; if (!file) return;
    const token = ++selection; button.disabled = true;
    status.textContent = '正在验证 JSON 并保护当前本机记录…';
    try {
      const prepared = await global.PocketCloudBackup.prepareFileRestore(await file.text());
      if (token !== selection) return;
      if (get('firebase-emergency-export')) get('firebase-emergency-export').disabled = false;
      const report = prepared.report, local = prepared.localReport;
      const scope = report.backupVersion === 1 ? '旧版 JSON 仅替换学习主状态，保留当前泛听、训练输入及页面记录。' : '替换学习主状态、泛听、训练输入及页面记录；包含的空数据键也会清空对应本机记录。';
      const comparison = local.issues?.length ? '本机记录无法解析，原始数据已保留在应急副本中。' : `本机：Material ${local.materials} · Group ${local.groups} · Run ${local.runs}`;
      const preview = `备份时间：${new Date(report.exportedAt).toLocaleString()}\n备份：Material ${report.materials} · Group ${report.groups} · Run ${report.runs}\n${comparison}\n${scope}\n当前本机原始数据已保存并读回应急副本。`;
      status.textContent = preview;
      if (!global.confirm(preview + '\n\n确认选择这份 JSON 进行恢复？')) return;
      if (!global.confirm('再次确认恢复？这会替换上述本机记录。Firebase 数据不会被删除或自动覆盖，自动备份将暂停；已有暂停状态继续保留。')) return;
      status.textContent = '正在恢复并核对原始内容…';
      await global.PocketCloudBackup.restoreFile(prepared);
      status.textContent = 'JSON 恢复完成，原始内容校验通过。自动备份保持暂停。';
      global.location.reload();
    } catch (error) { status.textContent = error.message; }
    finally { button.disabled = false; }
  });
})(globalThis);
