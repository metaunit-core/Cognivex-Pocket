(function (global) {
  'use strict';
  const KEY = 'cognivex-pocket-state';
  const FORMAT = 'pocket-learning-backup';

  // Explicit allowlist: never enumerate unrelated or authentication storage.
  const KEYS = Object.freeze([
    { key: KEY, label: '学习主状态' },
    { key: 'pocket-listening-start-v1', label: '泛听计时与科目日期状态' },
    { key: 'pocket-training-sop-model-v1', label: '训练模型输入' },
    { key: 'pocket-last-view-v1', label: '上次页面与显示设置' },
    { key: 'pocket-view-history-v1', label: '返回页面历史' }
  ]);
  async function hash(value) {
    if (!global.crypto?.subtle) throw new Error('当前浏览器无法计算校验值，请通过 HTTPS 打开 Pocket。');
    const bytes = new TextEncoder().encode(value);
    const result = await global.crypto.subtle.digest('SHA-256', bytes);
    return Array.from(new Uint8Array(result), byte => byte.toString(16).padStart(2, '0')).join('');
  }
  const entryDigest = entry => hash(JSON.stringify([entry.key, entry.content]));
  async function digest(backup) {
    if (!global.crypto?.subtle) throw new Error('当前浏览器无法计算校验值，请通过 HTTPS 打开 Pocket。');
    const bytes = new TextEncoder().encode(JSON.stringify([
      backup.format, backup.backupVersion, backup.exportedAt, backup.stateVersion, backup.rawState,
      ...(backup.backupVersion === 2 ? [backup.entries] : [])
    ]));
    const hash = await global.crypto.subtle.digest('SHA-256', bytes);
    return Array.from(new Uint8Array(hash), byte => byte.toString(16).padStart(2, '0')).join('');
  }

  function inspect(raw) {
    const result = { materials: 0, groups: 0, runs: 0, issues: [] };
    let state;
    try { state = JSON.parse(raw); } catch (_) {
      result.issues.push('原始学习状态不是有效 JSON。'); return result;
    }
    if (!state || state.version !== 1 || !Array.isArray(state.materials)) {
      result.issues.push('学习数据结构不兼容，不能确认完整性。'); return result;
    }
    if (!state.review || typeof state.review !== 'object' || Array.isArray(state.review) ||
        !(state.review.lastReviewedAt === null || (Number.isFinite(state.review.lastReviewedAt) &&
          state.review.lastReviewedAt >= 0 && state.review.lastReviewedAt <= 8640000000000000))) {
      result.issues.push('复习状态格式异常。');
    }
    if (!(state.currentSession === null || (state.currentSession && typeof state.currentSession === 'object' &&
        !Array.isArray(state.currentSession) && typeof state.currentSession.currentStep === 'string'))) {
      result.issues.push('学习断点格式异常。');
    }
    const ids = new Set();
    result.materials = state.materials.length;
    state.materials.forEach((material, index) => {
      if (!material || typeof material.id !== 'string' || !material.id || !Array.isArray(material.groups)) {
        result.issues.push(`第 ${index + 1} 份资料格式异常。`); return;
      }
      if (ids.has(material.id)) result.issues.push('资料 ID 重复。');
      ids.add(material.id);
      const groupIds = new Set();
      result.groups += material.groups.length;
      material.groups.forEach(group => {
        if (!group || typeof group !== 'object' || Array.isArray(group) ||
            (group.runs !== undefined && !Array.isArray(group.runs))) {
          result.issues.push('Group 或 Run 格式异常。'); return;
        }
        // Older Groups may not have IDs or runs. Do not migrate them during inspection.
        if (group.id !== undefined) {
          if (typeof group.id !== 'string' || !group.id || groupIds.has(group.id)) result.issues.push('Group ID 异常或重复。');
          groupIds.add(group.id);
        }
        result.runs += group.runs?.length || 0;
        if (group.runs?.some(run => !run || typeof run !== 'object' || Array.isArray(run))) result.issues.push('Run 记录格式异常。');
      });
    });
    return result;
  }

  async function create() {
    // Read the stored bytes directly: never reconstruct from the in-memory state.
    const entries = KEYS.map(({ key }) => ({ key, content: global.localStorage.getItem(key) }));
    return createFromEntries(entries);
  }
  async function createFromEntries(values) {
    if (!Array.isArray(values) || values.length !== KEYS.length || values.some((entry, i) => entry.key !== KEYS[i].key || !(entry.content === null || typeof entry.content === 'string'))) throw Error('备份数据键清单无效。');
    const entries = values.map(entry => ({ key: entry.key, content: entry.content }));
    const rawState = entries[0].content;
    if (entries.every(entry => entry.content === null)) throw new Error('本机尚无用户数据可导出。');
    // Capture all raw strings synchronously before hashing; no migration or write.
    for (const entry of entries) entry.checksum = { algorithm: 'SHA-256', value: await entryDigest(entry) };
    let stateVersion = null;
    try { stateVersion = JSON.parse(rawState)?.version ?? null; } catch (_) { /* Still export damaged originals for rescue. */ }
    const backup = { format: FORMAT, backupVersion: 2, exportedAt: new Date().toISOString(), stateVersion, rawState, entries };
    backup.checksum = { algorithm: 'SHA-256', value: await digest(backup) };
    return backup;
  }

  async function verify(text) {
    let backup;
    try { backup = JSON.parse(text); } catch (_) { throw new Error('备份文件不是有效 JSON。'); }
    if (!backup || backup.format !== FORMAT || ![1, 2].includes(backup.backupVersion) ||
        !(typeof backup.rawState === 'string' || (backup.backupVersion === 2 && backup.rawState === null)) || typeof backup.exportedAt !== 'string' ||
        !Number.isFinite(Date.parse(backup.exportedAt)) || backup.checksum?.algorithm !== 'SHA-256' ||
        !/^[a-f0-9]{64}$/.test(backup.checksum?.value || '')) throw new Error('备份文件结构不正确或版本不支持。');
    const result = backup.rawState === null ? { materials: 0, groups: 0, runs: 0, issues: [] } : inspect(backup.rawState);
    let scope;
    if (backup.backupVersion === 2) {
      if (!Array.isArray(backup.entries) || backup.entries.length !== KEYS.length ||
          KEYS.some(({ key }, index) => backup.entries[index]?.key !== key) ||
          backup.entries.some(entry => !(entry.content === null || typeof entry.content === 'string') ||
            entry.checksum?.algorithm !== 'SHA-256' || !/^[a-f0-9]{64}$/.test(entry.checksum?.value || ''))) {
        throw new Error('数据键清单不完整、含未知键或单键校验格式异常。');
      }
      if (backup.entries[0].content !== backup.rawState) result.issues.push('学习主状态与键内容不一致。');
      scope = [];
      for (const [index, entry] of backup.entries.entries()) {
        const checksumValid = await entryDigest(entry) === entry.checksum.value;
        if (!checksumValid) result.issues.push(entry.key + ' 校验值不匹配。');
        if (entry.content !== null && entry.key !== KEY) {
          try {
            const value = JSON.parse(entry.content);
            if (entry.key === 'pocket-view-history-v1' ? !Array.isArray(value) :
                !value || typeof value !== 'object' || Array.isArray(value)) throw Error('结构异常');
          } catch (_) { result.issues.push(entry.key + ' 内容不是预期的 JSON 结构。'); }
        }
        scope.push({ key: entry.key, label: KEYS[index].label, present: entry.content !== null, checksumValid });
      }
    } else {
      scope = KEYS.map(({ key, label }) => ({ key, label, present: key === KEY, checksumValid: null }));
    }
    const checksumValid = await digest(backup) === backup.checksum.value;
    if (!checksumValid) result.issues.push('校验值不匹配，文件可能已被修改或损坏。');
    try {
      if ((JSON.parse(backup.rawState)?.version ?? null) !== backup.stateVersion) result.issues.push('数据版本与备份描述不一致。');
    } catch (_) { /* inspect reports invalid JSON. */ }
    return { ...result, scope, backupVersion: backup.backupVersion, checksumValid, valid: result.issues.length === 0, exportedAt: backup.exportedAt, stateVersion: backup.stateVersion };
  }

  global.PocketLearningBackup = Object.freeze({ create, createFromEntries, verify, inspect, KEYS });

  const exportButton = global.document?.getElementById('export-learning-backup');
  const verifyButton = global.document?.getElementById('verify-learning-backup');
  const input = global.document?.getElementById('learning-backup-file');
  const status = global.document?.getElementById('learning-backup-status');
  const verificationStatus = global.document?.getElementById('learning-backup-verify-status') || status;
  if (!exportButton || !verifyButton || !input || !status) return;

  exportButton.addEventListener('click', async () => {
    exportButton.disabled = true;
    try {
      const backup = await create();
      const report = await verify(JSON.stringify(backup));
      const blob = new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const anchor = global.document.createElement('a');
      anchor.href = url;
      anchor.download = `Pocket-backup-${backup.exportedAt.replace(/[:.]/g, '-')}.json`;
      global.document.body.appendChild(anchor);
      anchor.click(); anchor.remove();
      global.setTimeout(() => URL.revokeObjectURL(url), 60000);
      status.textContent = '已发起备份下载，请确认文件已保存。备份覆盖学习主状态、泛听、训练输入、上次页面及返回历史；未保存的键标记为空，不包含认证信息。';
      if (report.valid) global.PocketBackupSafety?.exported();
      else status.textContent = '已导出原始数据应急副本，但完整性检查未通过：' + report.issues.join('；') + '。请勿将其视为可恢复的有效备份。';
    } catch (error) { status.textContent = `导出失败：${error.message}`; }
    finally { exportButton.disabled = false; }
  });
  verifyButton.addEventListener('click', () => { input.value = ''; input.click(); });
  let selection = 0;
  input.addEventListener('change', async () => {
    const file = input.files?.[0];
    if (!file) return;
    const current = ++selection;
    verificationStatus.textContent = '正在只读检查备份…';
    try {
      const report = await verify(await file.text());
      if (current !== selection) return;
      verificationStatus.textContent = `备份时间：${new Date(report.exportedAt).toLocaleString()}\n数据版本：${report.stateVersion}\n资料：${report.materials} · Group：${report.groups} · Run：${report.runs}\n` +
        `备份格式：v${report.backupVersion}\n包含范围：\n${report.scope.map(item => item.label + '（' + item.key + '）：' + (item.present ? '已包含' : report.backupVersion === 1 ? '旧版未覆盖' : '本机未保存')).join('\n')}\n` +
        (report.valid ? '校验值及已知结构检查通过。' : `检查未通过：${report.issues.join('；')}`) +
        '\n仅验证文件内部完整性，不能判断是否缺少导出前的记录。未写入或恢复任何学习数据。';
    } catch (error) { if (current === selection) verificationStatus.textContent = `验证失败：${error.message} 未写入学习数据。`; }
  });
})(globalThis);
