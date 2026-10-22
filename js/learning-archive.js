(function (global) {
  'use strict';
  const pocketLocalStore = globalThis.PocketEnvironment.requireStorage();
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
  function number(value, maximum = Infinity) {
    if (!['string', 'number'].includes(typeof value) || String(value).trim() === '') return null;
    const result = Number(value);
    return Number.isFinite(result) && result >= 0 && result <= maximum ? result : null;
  }
  function accuracy(value, percent) {
    const match = typeof value === 'string' && /^(\d+)\s*\/\s*(\d+)$/.exec(value.trim());
    if (match && Number.isSafeInteger(Number(match[1])) && Number.isSafeInteger(Number(match[2])) &&
        Number(match[2]) > 0 && Number(match[1]) <= Number(match[2])) return `${match[1]}/${match[2]}`;
    const parsed = number(percent, 100);
    return parsed === null ? null : Number(parsed.toFixed(2)) + '%';
  }
  const completed = run => run && run.outputCompleted === true && Number.isFinite(run.startedAt) &&
    run.startedAt >= 0 && Number.isFinite(run.completedAt) && run.completedAt >= run.startedAt && run.completedAt <= 8640000000000000;
  function recordedGrades(runs, focus = false) {
    const seen = new Set();
    const records = runs.map((run, index) => ({ run, index })).filter(({ run }) => {
      if (!completed(run)) return false;
      if (focus && (run.metricsScope === 'all-groups' || run.mode === 'all' || run.groupReviews)) return false;
      if (focus && run.progressVersion !== undefined && (run.progressVersion !== 1 || !run.members?.length ||
          run.completedCount !== run.members.length || run.questionIndex !== run.members.length ||
          run.questionProgress?.length !== run.members.length || run.questionProgress.some((item, index) =>
            !item || item.questionId !== run.members[index].id || !Number.isFinite(item.startedAt) || !Number.isFinite(item.completedAt) ||
            item.completedAt < item.startedAt || (!item.outputCompleted && !(['removed', 'inactive'].includes(item.resolution) && item.processedAt === item.completedAt))))) return false;
      if (run.id) { if (seen.has(run.id)) return false; seen.add(run.id); }
      return true;
    }).sort((a, b) => a.run.completedAt - b.run.completedAt || a.index - b.index);
    records.forEach((record, index) => { record.ordinal = index + 1; });
    const savedAt = run => Number.isFinite(run.metricsSavedAt) && run.metricsSavedAt >= run.startedAt ? run.metricsSavedAt : run.completedAt;
    records.sort((a, b) => savedAt(b.run) - savedAt(a.run) || b.ordinal - a.ordinal);
    const result = { accuracy: null, duration: null };
    for (const { run, ordinal } of records) {
      if (focus && !(run.metricsScope === 'group' || run.progressVersion === undefined && !run.questionProgress)) continue;
      const ratio = accuracy(run.accuracy, focus ? undefined : run.accuracyPercent);
      const duration = number(run.durationMinutes);
      if (!result.accuracy && ratio !== null) result.accuracy = { value: ratio, ordinal };
      if (!result.duration && duration !== null) result.duration = { value: duration, ordinal };
    }
    return result;
  }
  function materialGrades(state, material, group, index) {
    const runs = [...(group.runs || [])];
    const daily = state.dailyReverseReview;
    for (const round of [...(daily?.history || []), ...(daily?.round ? [daily.round] : [])]) {
      for (const task of round.tasks || []) {
        if (task.materialId !== material.id || task.status !== 'completed') continue;
        const matches = group.id ? task.groupId === 'id:' + group.id : task.groupId === '@' + index && task.start === group.start && task.end === group.end;
        if (matches) runs.push({ ...task.run, id: 'daily:' + JSON.stringify([round.id, task.materialId, task.groupId]) });
      }
    }
    const grades = recordedGrades(runs);
    const latestAccuracy = accuracy(group.latestAccuracyRatio, group.latestAccuracyPercent);
    const latestDuration = number(group.latestDurationMinutes);
    // These saved Group fields have no Run identity/timestamp. Never guess an ordinal from a matching value.
    if (latestAccuracy !== null) grades.accuracy = { value: latestAccuracy, ordinal: null };
    if (latestDuration !== null) grades.duration = { value: latestDuration, ordinal: null };
    return grades;
  }
  function focusSource(state, question) {
    const matches = state.materials.filter(material => material.id === question.materialId);
    const material = matches.length === 1 ? matches[0] : null;
    let index = -1;
    if (material && typeof question.groupKey === 'string') {
      if (question.groupKey.startsWith('id:')) {
        const groups = material.groups.map((group, position) => ({ group, position })).filter(item => 'id:' + item.group.id === question.groupKey);
        if (groups.length === 1) index = groups[0].position;
      } else if (question.groupKey.startsWith('legacy:')) {
        const position = question.groupIndex, group = material.groups[position];
        if (group && question.groupKey === 'legacy:' + JSON.stringify([position, group.start ?? null, group.end ?? null])) index = position;
      }
    }
    return { subject: material?.subject || question.subjectName || '来源不可用', title: material?.title || question.materialTitle || '来源不可用', index };
  }
  function focusArchive(lines, state) {
    lines.push('', '## 二、重点复习系统学习数据', '');
    const focus = state.focusReview;
    const questions = focus?.questions || [];
    const effective = member => {
      const current = questions.find(question => question.id === member.id);
      return current?.status === 'active' && focusSource(state, current).index >= 0 && focusSource(state, member).index >= 0;
    };
    const groups = (focus?.groups || []).filter(group => !group.retiredAt && group.members.some(effective));
    if (!groups.length) lines.push('暂无重点复习数据');
    for (const group of groups) {
      const members = group.members.filter(effective);
      const sources = members.map(question => focusSource(state, question));
      const subjects = [...new Set(sources.map(source => source.subject))];
      const materials = new Map();
      members.forEach((question, index) => {
        if (!materials.has(question.materialId)) materials.set(question.materialId, { title: sources[index].title, numbers: new Set() });
        materials.get(question.materialId).numbers.add(question.number);
      });
      const grades = recordedGrades(group.runs || [], true);
      lines.push('', `### 重点 Group ${text(group.number)}`, '', `> **学科：${subjects.map(text).join('、')}**`, '',
        '| 资料名称 | 对应题号 | 最新正确率 | 最新用时 |', '| --- | --- | --- | --- |');
      let first = true;
      for (const material of materials.values()) {
        const accuracy = first ? grades.accuracy ? text(grades.accuracy.value) : '未填写' : '—';
        const duration = first ? grades.duration ? text(grades.duration.value) + '分钟' : '未填写' : '—';
        lines.push(`| ${text(material.title)} | 第${[...material.numbers].map(text).join('、')}题 | ${accuracy} | ${duration} |`);
        first = false;
      }
    }
    const hidden = questions.filter(question => question.status !== 'active' || focusSource(state, question).index < 0);
    if (hidden.length) lines.push('', '### 已熟练、已移出及来源不可用的重点题', '',
      '| 学科 | 资料名称 | 题号 | 状态 |', '| --- | --- | --- | --- |');
    const seen = new Set();
    for (const question of hidden) {
      if (seen.has(question.id)) continue;
      seen.add(question.id);
      const source = focusSource(state, question);
      const status = source.index < 0 ? '来源不可用' : question.status === 'mastered' ? '已熟练' : '已移出';
      lines.push(`| ${text(source.subject)} | ${text(source.title)} | 第${text(question.number)}题 | ${status} |`);
    }
  }
  function render(raw, exportedAt = new Date().toISOString()) {
    const report = raw === null ? { materials: 0, groups: 0, runs: 0, issues: [] } : global.PocketLearningBackup.inspect(raw);
    if (report.issues.length) throw Error('学习记录无法完整读取，请先导出 JSON 保留原始数据。' + report.issues.join('；'));
    const state = raw === null ? { materials: [] } : JSON.parse(raw), materials = state.materials;
    const lines = ['# Cognivex Pocket 学习档案', '', `备份时间：${timestamp(exportedAt)}`, '',
      '> 这份 Markdown 仅供阅读，不可用于恢复。JSON 是唯一完整备份文件，保留原始字段、版本及 SHA-256 校验。', '',
      '## 一、已学习全部资料的学习数据', '', '## 学习数据统计', '', `- Material：${report.materials}`, `- Group：${report.groups}`, `- Run：${report.runs}`, '', '## 资料目录', ''];
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
        lines.push(`#### ${text(subject)} · ${text(material.title)}`, '', '> **资料概况**', '>', `> 分组数量：${groups.length}\\`,
          `> 训练记录：${totalRuns}\\`, `> 学习状态：${text(states[material.status] || material.status)}`, '', '**分组记录**', '');
        lines.push('| 组别 | 题号范围 | 最新正确率 | 最新用时 | 本组重点题目 |',
          '| --- | --- | --- | --- | --- |');
        groups.forEach((group, index) => {
          const range = present(group.start) && present(group.end) ? group.start === group.end ? String(group.start) : `${group.start}-${group.end}` : '未填写';
          const notes = typeof group.keyQuestions === 'string' && group.keyQuestions !== '' ? text(group.keyQuestions) : '未填写';
          const grades = materialGrades(state, material, group, index);
          lines.push(`| 第${index + 1}组 | ${text(range)} | ${grades.accuracy ? text(grades.accuracy.value) : '未填写'} | ${grades.duration ? text(grades.duration.value) + '分钟' : '未填写'} | ${notes} |`);
        });
        lines.push('');
      }
    }
    focusArchive(lines, state);
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
