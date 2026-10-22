(function (global) {
  'use strict';

  function calculateGroups(range, size) {
    const match = /^\s*(\d+)\s*-\s*(\d+)\s*$/.exec(range);
    if (!match) return { groups: [], error: '请输入题号范围，例如 1-30。' };
    const start = Number(match[1]);
    const end = Number(match[2]);
    const count = Number(size);
    if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start > end) {
      return { groups: [], error: '起始题号必须小于或等于结束题号。' };
    }
    if (!/^\s*\d+\s*$/.test(String(size)) || !Number.isSafeInteger(count) || count <= 0) {
      return { groups: [], error: '每组题数必须为大于 0 的整数。' };
    }
    const groups = [];
    let current = start;
    while (current <= end) {
      const groupEnd = current + Math.min(count - 1, end - current);
      groups.push({ start: current, end: groupEnd });
      if (groupEnd === end) break;
      current = groupEnd + 1;
    }
    return { groups, error: '' };
  }

  function intervalsOf(range) {
    const parts = String(range).split(/[,，]/).map(value => value.trim());
    if (!parts.length || parts.some(value => !value)) throw Error('请输入新增题号，例如 16-20, 23, 25-30。');
    return parts.map(value => {
      const match = /^(\d+)\s*(?:-\s*(\d+))?$/.exec(value);
      if (!match) throw Error('新增题号格式不正确，例如 16-20, 23, 25-30。');
      const start = Number(match[1]), end = Number(match[2] || match[1]);
      if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start < 0 || start > end) throw Error('新增题号范围不正确。');
      return { start, end };
    });
  }
  function previewAppend(material, range, size) {
    const intervals = intervalsOf(range);
    const old = (material.groups || []).flatMap(group => typeof group.questionRange === 'string' ? intervalsOf(group.questionRange) : [group]);
    const overlap = (a, b) => a.start <= b.end && b.start <= a.end;
    intervals.forEach((interval, index) => {
      if (old.some(group => overlap(interval, group))) throw Error('新增题号与原有分组重复，请检查题号。');
      if (intervals.slice(0, index).some(previous => overlap(interval, previous))) throw Error('新增题号内部存在重复，请检查题号。');
    });
    const count = Number(size);
    if (!/^\s*\d+\s*$/.test(String(size)) || !Number.isSafeInteger(count) || count <= 0) throw Error('每组题数必须为大于 0 的整数。');
    if (intervals.reduce((total, interval) => total + Math.ceil((interval.end - interval.start + 1) / count), 0) > 10000) throw Error('一次追加分组过多，请分批追加。');
    return intervals.flatMap(interval => calculateGroups(`${interval.start}-${interval.end}`, size).groups);
  }
  function assertAppendAvailable(state, id) {
    const material = state.materials.find(item => item.id === id);
    if (!material || material.status !== 'completed' || !material.groups.length) throw Error('请先完成这份资料当前的学习任务，再追加分组。');
    if (state.currentSession && !['materialComplete', 'complete'].includes(state.currentSession.currentStep)) throw Error('请先完成当前学习任务，再追加分组，原学习断点已保留。');
    if (state.materialReviewSession && state.materialReviewSession.currentStep !== 'queueComplete') throw Error('请先完成当前资料间倒序复习，再追加分组，原复习队列已保留。');
    const daily = global.PocketDailyReverse, round = state.dailyReverseReview?.round;
    if (round && daily && round.day === daily.day() && !daily.complete(round, daily.day())) throw Error('请先完成当前每日正序复习，再追加分组，原复习进度已保留。');
    return material;
  }
  function previewCompleted(range, size) {
    const count = Number(size);
    if (!/^\s*\d+\s*$/.test(String(size)) || !Number.isSafeInteger(count) || count <= 0) throw Error('每组题数必须为大于 0 的整数。');
    // Reuse the existing discontinuous-range parser, validation and order without changing append/new-learning grouping.
    const numbers = previewAppend({ groups: [] }, range, 1).map(group => group.start);
    const groups = [];
    for (let offset = 0; offset < numbers.length; offset += count) {
      const members = numbers.slice(offset, offset + count), parts = [];
      for (let index = 0; index < members.length;) {
        const start = members[index]; let end = start; index++;
        while (index < members.length && members[index] === end + 1) end = members[index++];
        parts.push(start === end ? String(start) : `${start}-${end}`);
      }
      const group = { start: Math.min(...members), end: Math.max(...members) };
      if (parts.length > 1) group.questionRange = parts.join(', ');
      groups.push(group);
    }
    return groups;
  }
  function appendToMaterial(state, id, range, size) {
    const material = assertAppendAvailable(state, id);
    const additions = previewAppend(material, range, size), first = material.groups.length;
    const ids = new Set(state.materials.flatMap(item => item.groups.map(group => group.id)));
    const groups = additions.map(group => {
      let id;
      do { id = global.crypto.randomUUID(); } while (ids.has(id));
      ids.add(id);
      return { ...group, id, appended: true, addedToReviewAt: null, videoCompleted: false,
        outputCompleted: false, executionCompleted: false, runs: [] };
    });
    // updateState applies this to a clone and persists the complete result atomically.
    material.groups.push(...groups);
    material.questionRange = [material.questionRange, String(range).trim()].filter(Boolean).join(', ');
    material.totalGroups = material.groups.length;
    material.hasAppendedGroups = true;
    material.status = 'learning';
    if (state.currentSession) {
      state.completedLearningSessions = state.completedLearningSessions || [];
      state.completedLearningSessions.push(state.currentSession);
    }
    state.currentSession = { materialId: id, title: material.title, createdAt: Date.now(), currentStep: 'output', mode: 'new' };
    state.activeSessionType = 'learning';
    state.review.generation = (state.review.generation || 0) + 1;
    global.PocketExecutor.startRun(state, { groupIndex: first, mode: 'new',
      schedulerState: { phase: 'new', newGroupIndex: first, reviewGroupIndex: 0 } });
  }
  global.PocketGrouping = Object.freeze({ calculateGroups, previewAppend, previewCompleted, assertAppendAvailable, appendToMaterial });
})(globalThis);
