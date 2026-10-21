(function (global) {
  'use strict';
  const day = at => global.PocketDailyReverse.day(at);
  function root(state) {
    const value = state.reviewAdmission;
    if (value === undefined) return { version: 1, daily: [], focus: [], lastClicked: null };
    if (!value || value.version !== 1 || !Array.isArray(value.daily) || !Array.isArray(value.focus) ||
        [...value.daily, ...value.focus].some(record => !record || typeof record.day !== 'string' || !Number.isFinite(record.completedAt)) ||
        (value.focusClickedDays !== undefined && (!Array.isArray(value.focusClickedDays) || value.focusClickedDays.some(value => typeof value !== 'string'))) ||
        (value.lastClicked !== null && (!value.lastClicked || !['daily', 'focus'].includes(value.lastClicked.system) || !Number.isFinite(value.lastClicked.at)))) {
      throw Error('今日复习准入记录异常，请先导出 JSON 保留数据并核查。');
    }
    return value;
  }
  function edit(state) {
    const value = JSON.parse(JSON.stringify(root(state))); state.reviewAdmission = value; return value;
  }
  function markClicked(state, system, at = Date.now()) {
    if (!['daily', 'focus'].includes(system)) throw Error('复习系统入口无效。');
    const data = edit(state);
    data.lastClicked = { system, at };
    if (system === 'focus') {
      const days = data.focusClickedDays || [];
      if (!days.includes(day(at))) data.focusClickedDays = [...days, day(at)];
    }
  }
  function shouldAnimateFocus(state, at = Date.now()) {
    return needsReview(state, at);
  }
  function recordDaily(state, at = Date.now()) {
    const round = state.dailyReverseReview?.round;
    if (!global.PocketDailyReverse.complete(round, day(at))) return;
    const data = edit(state);
    if (!data.daily.some(record => record.day === round.day)) data.daily.push({ day: round.day, completedAt: round.completedAt, roundId: round.id });
  }
  function recordFocus(state, groupId, runId, at = Date.now()) {
    const focus = global.PocketFocusReview;
    const data = focus.root(state), group = focus.findGroup(state, groupId), run = group?.runs.find(item => item.id === runId);
    if (run?.progressVersion === 1 && (run.completedCount !== run.members?.length || run.questionIndex !== run.members?.length ||
        run.questionProgress?.length !== run.members?.length || run.questionProgress.some(item => (!item.outputCompleted &&
          !(['removed', 'inactive'].includes(item.resolution) && item.processedAt === item.completedAt)) || !Number.isFinite(item.completedAt)))) return;
    if (!run || !run.outputCompleted || (!run.videoCompleted && !run.videoSkipped) || !Number.isFinite(run.startedAt) ||
        run.completedAt !== at || run.completedAt < run.startedAt || !run.members?.length ||
        !run.members.some(member => (run.progressVersion !== 1 || run.questionProgress.some(record => record.questionId === member.id && record.outputCompleted)) &&
          data.questions.find(question => question.id === member.id)?.status === 'active' && focus.locate(state, member))) return;
    const value = edit(state), today = day(at);
    if (!value.focus.some(record => record.day === today)) value.focus.push({ day: today, completedAt: at, groupId, runId });
  }
  function status(state, at = Date.now()) {
    const data = root(state), today = day(at), daily = global.PocketDailyReverse;
    const legacy = [state.dailyReverseReview?.round, ...(state.dailyReverseReview?.history || [])].find(round => daily.complete(round, today));
    const dailyRecord = data.daily.find(record => record.day === today), focusRecord = data.focus.find(record => record.day === today);
    const dailyAt = dailyRecord?.completedAt ?? legacy?.completedAt ?? null, focusAt = focusRecord?.completedAt ?? null;
    return { day: today, lastClicked: data.lastClicked, dailyCompleted: dailyAt !== null, dailyCompletedAt: dailyAt,
      focusCompleted: focusAt !== null, focusCompletedAt: focusAt, unlocked: dailyAt !== null || focusAt !== null };
  }
  function needsReview(state, at = Date.now()) {
    return global.PocketDailyReverse.needsReview(state, at) && !status(state, at).unlocked;
  }
  const names = { daily: '每日正序复习', focus: '重点复习系统' };
  function lines(state, at = Date.now()) {
    const current = status(state, at), completed = [];
    if (current.dailyCompleted) completed.push(names.daily);
    if (current.focusCompleted) completed.push(names.focus);
    return ['最近点击：' + (names[current.lastClicked?.system] || '暂无记录'),
      '今日完成：' + (completed.join('、') || '未完成'), '今日新增资料：' + (current.unlocked ? '已解锁' : '待复习')];
  }
  global.PocketReviewAdmission = Object.freeze({ root, markClicked, shouldAnimateFocus, recordDaily, recordFocus, status, needsReview, lines });
})(globalThis);
