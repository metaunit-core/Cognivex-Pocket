(function (global) {
  'use strict';
  const pocketLocalStore = globalThis.PocketEnvironment?.storage || globalThis.localStorage;
  const missing = '未记录';
  const present = value => value !== undefined && value !== null && value !== '';
  // Escape user content as text, never as executable HTML, links or Markdown layout.
  function text(value) {
    if (!present(value)) return missing;
    return String(value).replace(/\r\n?|\u2028|\u2029/g, '\n')
      .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, '')
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/([\\`*_{}\[\]()#!|~])/g, '\\$1').replace(/\n/g, '<br>');
  }
  function timestamp(value) {
    if (!present(value) || (typeof value !== 'number' && typeof value !== 'string')) return missing;
    if (typeof value === 'string' && !/^\d{4}-\d{2}-\d{2}T/.test(value)) return missing;
    const date = new Date(value);
    return Number.isFinite(date.getTime()) ? date.toISOString().replace('T', ' ').replace('Z', ' UTC') : missing;
  }
  const states = { learning: '学习中', completed: '已完成', paused: '已暂停', running: '进行中', ready: '待开始' };
  function render(raw, exportedAt = new Date().toISOString()) {
    const report = raw === null ? { materials: 0, groups: 0, runs: 0, issues: [] } : global.PocketLearningBackup.inspect(raw);
    if (report.issues.length) throw Error('学习记录无法完整读取，请先导出 JSON 保留原始数据。' + report.issues.join('；'));
    const materials = raw === null ? [] : JSON.parse(raw).materials;
    const lines = ['# 学习数据备份预览', '', `备份时间：${timestamp(exportedAt)}`, '',
      '> 这份 Markdown 仅供阅读，不可用于恢复。JSON 是唯一完整备份文件，保留原始字段、版本及 SHA-256 校验。', '',
      '## 学习数据统计', '', `- Material：${report.materials}`, `- Group：${report.groups}`, `- Run：${report.runs}`, '', '## 资料目录', ''];
    const subjects = new Map();
    for (const material of materials) {
      const subject = present(material.subject) ? String(material.subject) : missing;
      if (!subjects.has(subject)) subjects.set(subject, []);
      subjects.get(subject).push(material);
    }
    for (const [subject, items] of subjects) {
      lines.push(`### 学科：${text(subject)}`, '');
      for (const material of items) {
        const groups = material.groups;
        const totalRuns = groups.reduce((sum, group) => sum + (group.runs || []).length, 0);
        lines.push(`#### ${text(subject)} · ${text(material.title)}`, '', `- 分组数量：${groups.length}`,
          `- 训练记录：${totalRuns}`, `- 学习状态：${text(states[material.status] || material.status)}`, '', '##### 分组记录', '');
        groups.forEach((group, index) => {
          const range = present(group.start) && present(group.end) ? group.start === group.end ? String(group.start) : `${group.start}-${group.end}` : missing;
          const notes = typeof group.keyQuestions === 'string' && group.keyQuestions !== '' ? text(group.keyQuestions) : '未填写';
          const accuracy = present(group.latestAccuracyPercent) ? text(Number(Number(group.latestAccuracyPercent).toFixed(2))) + '%' + (group.latestAccuracyRatio ? '（' + text(group.latestAccuracyRatio) + '）' : '') : '未填写';
          const duration = present(group.latestDurationMinutes) ? text(group.latestDurationMinutes) + ' 分钟' : '未填写';
          lines.push(`**第 ${index + 1} 组**`, '', `- 题号范围：${text(range)}`, `- 最新正确率：${accuracy}`, `- 最新用时：${duration}`, `- 本组重点题目：${notes}`, '');
        });
      }
    }
    return lines.join('\n');
  }
  global.PocketLearningArchive = Object.freeze({ render });
  const button = global.document?.getElementById('export-learning-archive');
  const status = global.document?.getElementById('learning-backup-status');
  if (!button || !status) return;
  button.addEventListener('click', () => {
    button.disabled = true;
    try {
      const exportedAt = new Date().toISOString();
      const raw = pocketLocalStore.getItem('cognivex-pocket-state');
      const markdown = render(raw, exportedAt);
      const url = URL.createObjectURL(new Blob([markdown], { type: 'text/markdown;charset=utf-8' }));
      const anchor = global.document.createElement('a');
      anchor.href = url; anchor.download = `Pocket-learning-archive-${exportedAt.replace(/[:.]/g, '-')}.md`;
      global.document.body.appendChild(anchor); anchor.click(); anchor.remove();
      global.setTimeout(() => URL.revokeObjectURL(url), 60000);
      status.textContent = '已发起学习档案下载，请确认 .md 文件已保存。在 VS Code 打开后，按 Ctrl+Shift+V 预览。档案仅供阅读，请另行导出 JSON 完整备份。';
    } catch (error) { status.textContent = '学习档案导出失败：' + error.message; }
    finally { button.disabled = false; }
  });
})(globalThis);
