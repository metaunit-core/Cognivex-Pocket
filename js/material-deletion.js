(function (global) {
  'use strict';
  function remove(state, selected, at = Date.now()) {
    const ids = new Set(selected);
    if (!ids.size) throw Error('请先选择资料。');
    if (new Set(state.materials.map(m => m.id)).size !== state.materials.length ||
        [...ids].some(id => typeof id !== 'string' || !state.materials.some(m => m.id === id))) {
      throw Error('资料列表已变化或 ID 不唯一，请重新打开资料列表后选择。');
    }
    const daily = state.dailyReverseReview;
    if (daily?.round && !global.PocketDailyReverse.validRound(daily.round)) throw Error('每日复习断点异常，未删除资料，请先导出 JSON 核查。');
    const previousCollection = global.PocketMaterialReview.collectionKey(state);
    state.materials = state.materials.filter(m => !ids.has(m.id));
    if (ids.has(state.currentSession?.materialId)) state.currentSession = null;
    if (ids.has(state.review.grandfatheredDraftId)) delete state.review.grandfatheredDraftId;
    if (Array.isArray(state.reviewSelectionIds)) state.reviewSelectionIds = state.reviewSelectionIds.filter(id => !ids.has(id));
    global.PocketMaterialReview.removeMaterials(state, ids);
    if (state.review.unlock) {
      if (state.review.unlock.collectionKey === previousCollection) state.review.unlock.collectionKey = global.PocketMaterialReview.collectionKey(state);
      else delete state.review.unlock; // An already-stale grant must not become valid through deletion.
    }
    if (daily) {
      daily.saveOrder = daily.saveOrder.filter(id => !ids.has(id));
      const round = daily.round;
      if (round?.ids.some(id => ids.has(id))) {
        const oldIds = [...round.ids];
        round.ids = round.ids.filter(id => !ids.has(id));
        round.completedIds = round.completedIds.filter(id => !ids.has(id));
        round.index = round.completedIds.length;
        if (round.tasks) {
          round.taskStartIndex = oldIds.slice(0, round.taskStartIndex).filter(id => !ids.has(id)).length;
          round.tasks = round.tasks.filter(item => !ids.has(item.materialId));
          round.taskIndex = round.tasks.filter(item => item.status === 'completed').length;
          const next = round.tasks[round.taskIndex];
          if (next && next.run.startedAt === null) next.run.startedAt = at;
        }
        if (!round.ids.length || round.tasks?.length === 0) {
          daily.history.push({ ...round, cancelledAt: at, reason: '指定资料已删除，当前队列为空' });
          delete daily.round;
        } else {
          if (round.index === round.ids.length && round.completedAt === null) {
            round.completedAt = Math.max(...(round.tasks || []).map(t => t.run.completedAt || 0));
            // Legacy rounds lack per-Group completion times; never invent one.
            if (!round.completedAt) { daily.history.push({ ...round, cancelledAt: at }); delete daily.round; }
          }
          if (daily.round && !global.PocketDailyReverse.validRound(round)) throw Error('无法安全保留每日复习进度，未删除资料。');
        }
      }
    }
    const focus = state.focusReview;
    if (focus) {
      global.PocketFocusReview.root(state);
      focus.questions = focus.questions.filter(q => !ids.has(q.materialId));
      for (const ref of focus.subjectRefs || []) ref.materialIds = ref.materialIds.filter(id => !ids.has(id));
      // Member snapshots and shared grades remain history. Existing inactive-question handling advances only invalid work.
      const originalSession = focus.session;
      const sessions = [originalSession, ...(focus.pausedSessions || [])].filter(Boolean);
      let resumedActive = null;
      state.focusReview.session = null; state.focusReview.pausedSessions = [];
      for (let i = 0; i < sessions.length; i++) {
        state.focusReview.session = sessions[i];
        let current = global.PocketFocusReview.active(state);
        while (current && ids.has(current.question.materialId)) {
          global.PocketFocusReview.transition(state, current.run.id, 'skipInactive', {}, at, current.index);
          current = global.PocketFocusReview.active(state);
        }
        const resumed = state.focusReview.session;
        state.focusReview.session = null;
        if (resumed) {
          if (sessions[i] === originalSession) resumedActive = resumed;
          else state.focusReview.pausedSessions.push(resumed);
        }
      }
      state.focusReview.session = resumedActive;
    }
    return ids.size;
  }
  global.PocketMaterialDeletion = Object.freeze({ remove });
})(globalThis);
