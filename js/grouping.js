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
    const old = (material.groups || []).filter(group => group.questionsInactive !== true).flatMap(group => typeof group.questionRange === 'string' ? intervalsOf(group.questionRange) : [group]);
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
  function questionNumbers(group) {
    if (group.questionsInactive === true) return [];
    const ranges = typeof group.questionRange === 'string' ? intervalsOf(group.questionRange.replace(/、/g, ',')) : intervalsOf(`${group.start}-${group.end}`);
    if (ranges.reduce((total, item) => total + item.end - item.start + 1, 0) > 10000) throw Error('题目数量过多，无法安全预览。');
    return ranges.flatMap(item => Array.from({length:item.end-item.start+1}, (_, index) => item.start+index));
  }
  function materialNumbers(material) {
    const ids = material.groups.map(group => group.id).filter(Boolean);
    if (new Set(ids).size !== ids.length) throw Error('原 Group ID 重复，请先核查，未修改数据。');
    const numbers = material.groups.flatMap(questionNumbers);
    if (!numbers.length || numbers.length > 10000 || new Set(numbers).size !== numbers.length) throw Error('有效题号为空、重复或数量过多，请先核查原分组；未修改数据。');
    return numbers;
  }
  function reviewLayouts(material) {
    const data = material?.reviewGrouping;
    if (data === undefined) return [];
    if (!data || data.version !== 1 || !Array.isArray(data.layouts) || !data.layouts.length ||
        data.layouts.filter(layout => layout?.id === data.activeId).length !== 1) throw Error('复习分组版本格式异常，未修改原数据。');
    const ids = new Set(), allGroupIds = new Set((material.groups || []).map(group => group.id).filter(Boolean));
    for (const layout of data.layouts) {
      if (!layout || typeof layout.id !== 'string' || !layout.id || ids.has(layout.id) || !Number.isFinite(layout.createdAt) ||
          !Number.isSafeInteger(layout.groupSize) || layout.groupSize <= 0 || !Array.isArray(layout.groups) || !layout.groups.length) throw Error('复习分组版本不完整，请先核查备份。');
      ids.add(layout.id);
      const groupIds = new Set();
      const numbers = layout.groups.flatMap(group => {
        if (!group || typeof group.id !== 'string' || !group.id || groupIds.has(group.id) || allGroupIds.has(group.id) || !Array.isArray(group.runs)) throw Error('复习 Group 标识或执行记录异常。');
        groupIds.add(group.id); allGroupIds.add(group.id); return questionNumbers(group);
      });
      if (new Set(numbers).size !== numbers.length) throw Error('复习分组存在重复题号，未修改数据。');
    }
    return data.layouts;
  }
  function reviewId(material) { reviewLayouts(material); return material?.reviewGrouping?.activeId || null; }
  function reviewMaterial(material, layoutId = null) {
    if (!material || !layoutId) return material;
    const layout = reviewLayouts(material).find(item => item.id === layoutId);
    if (!layout) throw Error('复习分组版本缺失，原任务已保留。');
    const effective = new Set(materialNumbers(material)), covered = new Set();
    const groups = layout.groups.map(group => {
      const original = questionNumbers(group), numbers = original.filter(number => effective.has(number));
      numbers.forEach(number => covered.add(number));
      const range = numbers.join(', ');
      return new Proxy(group, {get(target, key) {
        if (key === 'questionRange') return range;
        if (key === 'questionsInactive') return numbers.length === 0;
        if (key === 'questionRemovalHistory' && numbers.length !== original.length) return [...(target.questionRemovalHistory || []),{range:original.join(', ')}];
        if (key === 'latestAccuracyQuestionRange') return target.latestAccuracyQuestionRange || original.join(', ');
        if (key === 'latestDurationQuestionRange') return target.latestDurationQuestionRange || original.join(', ');
        return Reflect.get(target, key);
      }});
    });
    material.groups.forEach(group => {
      const numbers = questionNumbers(group).filter(number => !covered.has(number));
      if (!numbers.length) return;
      numbers.forEach(number => covered.add(number));
      groups.push(new Proxy(group, {get(target, key) {
        if (key === 'questionRange') return numbers.join(', ');
        return Reflect.get(target, key);
      }}));
    });
    return new Proxy(material, {get(target, key) {
      if (key === 'groups') return groups;
      if (key === 'totalGroups') return groups.length;
      return Reflect.get(target, key);
    }});
  }
  function previewRegroup(material, size) {
    return previewCompleted(materialNumbers(material).join(', '), size);
  }
  function assertRegroupAvailable(state, id) {
    const material = state.materials.find(item => item.id === id);
    if (!material || state.materials.filter(item => item.id === id).length !== 1 || material.status !== 'completed') throw Error('请先完成这份资料的学习，再修改今后的复习分组。');
    const session = state.currentSession;
    if (session && !['materialComplete','complete'].includes(session.currentStep)) throw Error('当前主学习任务尚未完成，原学习断点已保留。');
    if (session?.materialId === id && !global.PocketScheduler.isMaterialComplete(state)) throw Error('当前资料尚无完整学习完成证据，未修改分组。');
    if (state.materialReviewSession && state.materialReviewSession.currentStep !== 'queueComplete') throw Error('请先完成当前资料间复习，原复习队列已保留。');
    if (state.review.requiredAfterLearning) throw Error('请先完成新学资料要求的资料间复习，原任务已保留。');
    const round = state.dailyReverseReview?.round;
    if (round && !Number.isFinite(round.completedAt)) throw Error('请先完成当前每日正序复习，原进度已保留。');
    const batch = state.relearning;
    if (batch && batch.completedAt === null && batch.cancelledAt == null && batch.queue?.some(item => item.materialId === id)) throw Error('这份资料正在重学，请先完成或结束本轮重学；原重学进度已保留。');
    materialNumbers(material);
    reviewLayouts(material);
    return material;
  }
  function regroup(state, id, size, expected, at = Date.now()) {
    const material = assertRegroupAvailable(state, id);
    if (expected !== JSON.stringify(material)) throw Error('资料已变化，请重新打开分组预览，未修改数据。');
    const previousKey = global.PocketMaterialReview.collectionKey(state);
    const groups = previewRegroup(material, size).map(group => ({...group,id:global.crypto.randomUUID(),
      videoCompleted:false,outputCompleted:false,executionCompleted:false,runs:[]}));
    const layout = {id:global.crypto.randomUUID(),createdAt:at,groupSize:Number(size),groups};
    material.reviewGrouping = {version:1,activeId:layout.id,layouts:[...(material.reviewGrouping?.layouts || []),layout]};
    if (state.review.unlock?.collectionKey === previousKey) state.review.unlock.collectionKey = global.PocketMaterialReview.collectionKey(state);
  }
  global.PocketGrouping = Object.freeze({ calculateGroups, previewAppend, previewCompleted, assertAppendAvailable, appendToMaterial,
    questionNumbers, materialNumbers, reviewLayouts, reviewId, reviewMaterial, previewRegroup, assertRegroupAvailable, regroup });
})(globalThis);
