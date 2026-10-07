(function (global) {
  'use strict';
  function open(state) {
    const materials = global.PocketHistory.getReviewMaterials(state);
    if (!materials.length) return;
    if (state.materialReviewSession && state.materialReviewSession.currentStep !== 'queueComplete') {
      state.activeSessionType = 'material-review';
    } else {
      state.activeSessionType = 'review-selection';
      state.reviewSelectionIds = materials.map(item => item.id);
    }
  }
  function start(state, materialIds) {
    if (state.activeSessionType !== 'review-selection') return;
    const eligible = global.PocketHistory.getReviewMaterials(state);
    const requested = Array.isArray(materialIds) ? materialIds : [materialIds];
    const ids = [...new Set(requested)].filter(id => eligible.some(item => item.id === id && item.groups.length));
    if (!ids.length) return;
    state.materialReviewSession = {
      materialIds: ids, currentMaterialIndex: 0, completedMaterials: [], materialId: ids[0],
      sessionType: 'material-review', mode: 'material-review', currentGroupIndex: 0,
      currentStep: 'video', startedAt: Date.now(), materialStartedAt: Date.now(), completedAt: null
    };
    state.activeSessionType = 'material-review';
    global.PocketExecutor.startRun(state, { groupIndex: 0, mode: 'material-review' }, 'materialReviewSession');
    delete state.reviewSelectionIds;
  }
  function finishGroup(state) {
    const { session, material, run } = global.PocketExecutor.getCurrentGroup(state, 'materialReviewSession');
    if (!run.videoCompleted || !run.outputCompleted || run.completedAt === null) return;
    if (session.currentGroupIndex + 1 < material.groups.length) {
      global.PocketExecutor.startRun(state, {
        groupIndex: session.currentGroupIndex + 1, mode: 'material-review'
      }, 'materialReviewSession');
    } else {
      const timestamp = Date.now();
      material.lastMaterialReviewedAt = timestamp;
      material.materialReviewHistory = material.materialReviewHistory || [];
      material.materialReviewHistory.push({ startedAt: session.materialStartedAt, completedAt: timestamp });
      session.completedMaterials.push({ materialId: material.id, completedAt: timestamp });
      // Persist completion first. The UI coordinator advances only AFTER this snapshot is saved.
      session.currentStep = 'materialCompletePending';
    }
  }
  function advanceQueue(state) {
    const session = state.materialReviewSession;
    if (!session || session.currentStep !== 'materialCompletePending') return;
    if (session.currentMaterialIndex + 1 < session.materialIds.length) {
      session.currentMaterialIndex += 1;
      session.materialId = session.materialIds[session.currentMaterialIndex];
      session.materialStartedAt = Date.now();
      global.PocketExecutor.startRun(state, { groupIndex: 0, mode: 'material-review' }, 'materialReviewSession');
    } else {
      session.currentStep = 'queueComplete';
      session.completedAt = Date.now();
    }
  }
  function needsInitialization(state) {
    return !!(state.materialReviewSession && !Array.isArray(state.materialReviewSession.materialIds));
  }
  function initialize(state) {
    const session = state.materialReviewSession;
    if (!session || Array.isArray(session.materialIds)) return;
    session.materialIds = [session.materialId];
    session.currentMaterialIndex = 0;
    session.materialStartedAt = session.startedAt;
    session.completedMaterials = [];
    if (session.currentStep === 'reviewComplete') {
      session.currentStep = 'queueComplete';
      session.completedMaterials.push({ materialId: session.materialId, completedAt: session.completedAt });
    }
  }
  function returnToLearning(state) {
    if (state.activeSessionType === 'material-review' && state.materialReviewSession?.currentStep !== 'queueComplete') return;
    state.activeSessionType = 'learning';
    state.materialReviewSession = null;
    delete state.reviewSelectionIds;
    if (state.currentSession && state.currentSession.currentStep === 'materialComplete') state.currentSession = null;
  }
  global.PocketMaterialReview = Object.freeze({ open, start, finishGroup, advanceQueue,
    needsInitialization, initialize, returnToLearning });
})(globalThis);
