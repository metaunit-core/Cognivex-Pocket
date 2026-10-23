(function (global) {
  'use strict';
  const MESSAGE = '请先完成今日正序复习，再新增资料。';
  function day(at = Date.now()) {
    const simulated = global.PocketDailyTestDate?.dayOverride();
    if (simulated) return simulated;
    const d = new Date(at);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  }
  const learned = state => global.PocketHistory.getReviewMaterials(state);
  function root(state) {
    const value = state.dailyReverseReview;
    if (value === undefined) return { version: 1, saveOrder: [], history: [] };
    if (!value || value.version !== 1 || !Array.isArray(value.saveOrder) || new Set(value.saveOrder).size !== value.saveOrder.length || value.saveOrder.some(id => typeof id !== 'string') || !Array.isArray(value.history)) throw Error('每日正序复习状态异常，请先导出 JSON 保留数据。');
    return value;
  }
  function validTasks(round) {
    if (round.tasks === undefined) return true; // Preserve older saved rounds; never reset their progress.
    const tasks = round.tasks;
    return round.taskVersion === 1 && Array.isArray(tasks) && tasks.length > 0 && tasks.every(t => t && typeof t === 'object') &&
      Number.isInteger(round.taskStartIndex) && round.taskStartIndex >= 0 && round.taskStartIndex <= round.index &&
      JSON.stringify(tasks.filter((t, i) => !i || t.materialId !== tasks[i - 1].materialId).map(t => t.materialId)) === JSON.stringify(round.ids.slice(round.taskStartIndex)) && Number.isInteger(round.taskIndex) &&
      round.taskIndex >= 0 && round.taskIndex <= tasks.length && new Set(tasks.map(t => JSON.stringify([t.materialId, t.groupId]))).size === tasks.length &&
      tasks.every((t, i) => t && round.ids.includes(t.materialId) && Number.isInteger(t.groupIndex) && t.groupIndex >= 0 &&
        typeof t.groupId === 'string' && t.run && (i < round.taskIndex ? t.status === 'completed' && t.run.outputCompleted === true &&
          Number.isFinite(t.run.startedAt) && Number.isFinite(t.run.completedAt) && t.run.completedAt >= t.run.startedAt : t.status === 'pending' && t.run.completedAt === null)) &&
      tasks.every((t, i) => !i || round.ids.indexOf(t.materialId) >= round.ids.indexOf(tasks[i - 1].materialId)) &&
      (round.taskIndex === tasks.length ? round.index === round.ids.length : tasks[round.taskIndex].materialId === round.ids[round.index]) &&
      tasks.every(t => round.ids.indexOf(t.materialId) >= round.index || t.status === 'completed');
  }
  function validRound(round) {
    return !!round && typeof round.id === 'string' && typeof round.day === 'string' && Array.isArray(round.ids) && round.ids.length > 0 &&
      round.ids.every(id => typeof id === 'string') && new Set(round.ids).size === round.ids.length &&
      Number.isInteger(round.index) && round.index >= 0 && round.index <= round.ids.length && Array.isArray(round.completedIds) &&
      round.completedIds.length === round.index && round.completedIds.every((id, index) => id === round.ids[index]) &&
      Number.isFinite(round.startedAt) && round.startedAt >= 0 && /^\d{4}-\d{2}-\d{2}$/.test(round.day) && validTasks(round);
  }
  function complete(round, today) {
    return validRound(round) && round.day === today && round.index === round.ids.length && Number.isFinite(round.completedAt) && round.completedAt >= round.startedAt && day(round.completedAt) === today;
  }
  function needsReview(state, at = Date.now()) {
    if (!learned(state).length) return false;
    return !complete(root(state).round, day(at));
  }
  function assertCanCreate(state, at = Date.now()) { if (global.PocketReviewAdmission?.needsReview(state, at) ?? needsReview(state, at)) throw Error(MESSAGE); }
  function clickedDays(state) {
    const days = root(state).clickedDays;
    if (days === undefined) return [];
    if (!Array.isArray(days) || days.some(value => typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value))) throw Error('每日复习点击记录异常，请先保留备份并核查。');
    return days;
  }
  function shouldAnimate(state, at = Date.now()) {
    const needed = global.PocketReviewAdmission?.needsReview(state, at) ?? needsReview(state, at);
    return needed;
  }
  function markClicked(state, at = Date.now()) {
    const days = clickedDays(state), today = day(at);
    if (!days.includes(today)) state.dailyReverseReview = { ...root(state), clickedDays: [...days, today] };
  }
  // The application formally saves materials by appending them. createdAt is
  // draft time, so it must not replace that order. Freeze legacy append order
  // once, then register later saves by ID; names/display sorting are irrelevant.
  function recordSavedMaterial(state) {
    const data = root(state), order = [...data.saveOrder], known = new Set(order);
    state.materials.forEach(material => { if (!known.has(material.id)) { order.push(material.id); known.add(material.id); } });
    state.dailyReverseReview = { ...data, saveOrder: order };
  }
  function orderedIds(state) {
    const data = root(state), all = [...data.saveOrder], known = new Set(all);
    state.materials.forEach(material => { if (!known.has(material.id)) { all.push(material.id); known.add(material.id); } });
    const eligible = new Set(learned(state).map(material => material.id));
    return all.filter(id => eligible.has(id));
  }
  function shouldPrompt(state, at = Date.now()) { return needsReview(state, at) && root(state).promptedDay !== day(at); }
  function markPrompted(state, at = Date.now()) { state.dailyReverseReview = { ...root(state), promptedDay: day(at) }; }
  function prepareTasks(state, round, at) {
    const tasks = [];
    round.ids.slice(round.index).forEach(id => {
      const material = state.materials.find(m => m.id === id);
      if (!material?.groups?.length) throw Error('每日复习资料或分组已缺失，未跳过任务。');
      const groupOrder = global.PocketMaterialReview?.groups(state).filter(item => item.materialId === id).map(item => item.groupIndex) || material.groups.map((group, i) => group.questionsInactive===true ? -1 : i).filter(i=>i>=0);
      groupOrder.forEach(groupIndex => { const group = material.groups[groupIndex]; tasks.push({ materialId: id, groupIndex,
        groupId: group.id ? 'id:' + group.id : '@' + groupIndex, start: group.start, end: group.end, status: 'pending',
        run: { mode: 'daily-reverse', videoCompleted: false, videoSkipped: true, outputCompleted: false, startedAt: null, completedAt: null,
          ...(group.questionRemovalHistory?.length ? {questionRangeSnapshot:group.questionRange} : {}) } }); });
    });
    if (!tasks.length) throw Error('没有可执行的每日分组任务。');
    if (new Set(tasks.map(t => JSON.stringify([t.materialId, t.groupId]))).size !== tasks.length) throw Error('每日复习分组标识重复，未开始或跳过任务。');
    tasks[0].run.startedAt = at;
    return { ...round, taskVersion: 1, taskStartIndex: round.index, tasks, taskIndex: 0 };
  }
  function start(state, at = Date.now()) {
    const data = root(state), today = day(at);
    if (data.round && !validRound(data.round)) throw Error('每日正序复习进度异常，未重置；请先导出 JSON 并核查。');
    if (data.round?.day === today) {
      if (!complete(data.round, today) && data.round.tasks === undefined) state.dailyReverseReview = { ...data, round: prepareTasks(state, data.round, at) };
      return; // Resume exactly the saved snapshot, including group progress.
    }
    const ids = orderedIds(state); if (!ids.length) return;
    recordSavedMaterial(state);
    const next = root(state);
    state.dailyReverseReview = { ...next, history: [...next.history, ...(next.round ? [next.round] : [])],
      round: prepareTasks(state, { id: `daily-${today}-${at}`, day: today, order: 'oldest-first', ids, index: 0, completedIds: [], startedAt: at, completedAt: null }, at) };
  }
  function current(state, at = Date.now()) {
    const round = root(state).round;
    if (!validRound(round) || round.day !== day(at)) return null;
    return state.materials.find(material => material.id === round.ids[round.index]) || null;
  }
  function task(state, at = Date.now()) {
    const round = root(state).round;
    if (!validRound(round) || round.day !== day(at) || !round.tasks || round.taskIndex === round.tasks.length) return null;
    const item = round.tasks[round.taskIndex], material = current(state, at);
    const planned = round.tasks.filter(t => t.materialId === item.materialId);
    // Confirmed additions join the next snapshot; a running round retains its exact task list.
    const eligibleCount = material?.groups.filter((group,index) =>
      (group.questionsInactive !== true || planned.some(task => task.status === 'completed' && task.groupId === (group.id ? 'id:'+group.id : '@'+index))) &&
      (group.appended !== true || planned.some(task => task.groupId === 'id:' + group.id))).length;
    if (eligibleCount !== planned.length) throw Error('每日复习分组数量已变化，未跳过任务。');
    const indexes = material?.groups.map((g, i) => item.groupId.startsWith('id:') ? g.id === item.groupId.slice(3) ? i : -1 : i === item.groupIndex ? i : -1).filter(i => i >= 0) || [];
    if (indexes.length !== 1) throw Error('每日复习分组已缺失或重复，未跳过任务。');
    const group = material.groups[indexes[0]];
    if (group.start !== item.start || group.end !== item.end) throw Error('每日复习题目范围已变化，请先核查，未跳过任务。');
    return { item, groupIndex: indexes[0], material, round };
  }
  function transition(state, action, expected, at = Date.now()) {
    const data = root(state), round = data.round;
    if (!validRound(round) || round.day !== day(at)) throw Error('日期或每日复习进度已变化，请返回已学内容，开始今日复习。');
    if (at < round.startedAt) throw Error('设备时间早于本轮开始时间，请核对日期后重试。');
    if (round.id !== expected.roundId || round.index !== expected.index || round.ids[round.index] !== expected.materialId) return false;
    const active = task(state, at);
    if (!active) throw Error('请从已学内容主动继续每日复习，建立分组任务。');
    if (expected.taskIndex !== round.taskIndex || expected.currentGroupIndex !== active.groupIndex || action !== 'outputDone') return false;
    const next = JSON.parse(JSON.stringify(round)), item = next.tasks[next.taskIndex];
    if (at < item.run.startedAt) throw Error('设备时间早于本组开始时间，请核对日期。');
    item.status = 'completed'; item.run.outputCompleted = true; item.run.completedAt = at;
    next.taskIndex++;
    if (next.taskIndex === next.tasks.length || next.tasks[next.taskIndex].materialId !== item.materialId) {
      next.completedIds.push(item.materialId); next.index++;
    }
    if (next.taskIndex === next.tasks.length) next.completedAt = at;
    else next.tasks[next.taskIndex].run.startedAt = at;
    state.dailyReverseReview = { ...data, round: next };
    global.PocketReviewAdmission?.recordDaily(state, at);
    return true;
  }
  function finish(state, expected, at = Date.now()) { return transition(state, 'outputDone', expected, at); }
  global.PocketDailyReverse = Object.freeze({ MESSAGE, day, learned, needsReview, assertCanCreate, orderedIds,
    recordSavedMaterial, shouldPrompt, markPrompted, shouldAnimate, markClicked, start, current, finish, task, transition, validRound, complete });
})(globalThis);
