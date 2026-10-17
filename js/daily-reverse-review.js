(function (global) {
  'use strict';
  const MESSAGE = '请先完成今日倒序复习，再新增资料。';
  function day(at = Date.now()) {
    const d = new Date(at);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  }
  const learned = state => global.PocketHistory.getReviewMaterials(state);
  function root(state) {
    const value = state.dailyReverseReview;
    if (value === undefined) return { version: 1, saveOrder: [], history: [] };
    if (!value || value.version !== 1 || !Array.isArray(value.saveOrder) || new Set(value.saveOrder).size !== value.saveOrder.length || value.saveOrder.some(id => typeof id !== 'string') || !Array.isArray(value.history)) throw Error('每日倒序复习状态异常，请先导出 JSON 保留数据。');
    return value;
  }
  function validRound(round) {
    return !!round && typeof round.id === 'string' && typeof round.day === 'string' && Array.isArray(round.ids) && round.ids.length > 0 &&
      round.ids.every(id => typeof id === 'string') && new Set(round.ids).size === round.ids.length &&
      Number.isInteger(round.index) && round.index >= 0 && round.index <= round.ids.length && Array.isArray(round.completedIds) &&
      round.completedIds.length === round.index && round.completedIds.every((id, index) => id === round.ids[index]) &&
      Number.isFinite(round.startedAt) && round.startedAt >= 0 && /^\d{4}-\d{2}-\d{2}$/.test(round.day);
  }
  function complete(round, today) {
    return validRound(round) && round.day === today && round.index === round.ids.length && Number.isFinite(round.completedAt) && round.completedAt >= round.startedAt && day(round.completedAt) === today;
  }
  function needsReview(state, at = Date.now()) {
    if (!learned(state).length) return false;
    return !complete(root(state).round, day(at));
  }
  function assertCanCreate(state, at = Date.now()) { if (needsReview(state, at)) throw Error(MESSAGE); }
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
    return all.filter(id => eligible.has(id)).reverse();
  }
  function shouldPrompt(state, at = Date.now()) { return needsReview(state, at) && root(state).promptedDay !== day(at); }
  function markPrompted(state, at = Date.now()) { state.dailyReverseReview = { ...root(state), promptedDay: day(at) }; }
  function start(state, at = Date.now()) {
    const data = root(state), today = day(at);
    if (data.round && !validRound(data.round)) throw Error('每日倒序复习进度异常，未重置；请先导出 JSON 并核查。');
    if (data.round?.day === today) return; // Resume exactly the saved snapshot.
    const ids = orderedIds(state); if (!ids.length) return;
    recordSavedMaterial(state);
    const next = root(state);
    state.dailyReverseReview = { ...next, history: [...next.history, ...(next.round ? [next.round] : [])],
      round: { id: `daily-${today}-${at}`, day: today, ids, index: 0, completedIds: [], startedAt: at, completedAt: null } };
  }
  function current(state, at = Date.now()) {
    const round = root(state).round;
    if (!validRound(round) || round.day !== day(at)) return null;
    return state.materials.find(material => material.id === round.ids[round.index]) || null;
  }
  function finish(state, expected, at = Date.now()) {
    const data = root(state), round = data.round;
    if (!validRound(round) || round.day !== day(at)) throw Error('日期或每日复习进度已变化，请返回已学内容，开始今日复习。');
    if (at < round.startedAt) throw Error('设备时间早于本轮开始时间，请核对日期后重试。');
    if (round.id !== expected.roundId || round.index !== expected.index || round.ids[round.index] !== expected.materialId) return false;
    if (!current(state, at)) throw Error('本轮资料已缺失，未跳过或标记完成，请保留备份并核查。');
    const index = round.index + 1;
    state.dailyReverseReview = { ...data, round: { ...round, index, completedIds: [...round.completedIds, expected.materialId], completedAt: index === round.ids.length ? at : null } };
    return true;
  }
  global.PocketDailyReverse = Object.freeze({ MESSAGE, day, learned, needsReview, assertCanCreate, orderedIds,
    recordSavedMaterial, shouldPrompt, markPrompted, start, current, finish, validRound, complete });
})(globalThis);
