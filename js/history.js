(function (global) {
  'use strict';
  function completeCurrentMaterial(state) {
    if (!global.PocketScheduler.isMaterialComplete(state)) return false;
    const session = state.currentSession;
    const material = state.materials.find(item => item.id === session.materialId);
    material.status = 'completed';
    if (material.completedAt == null) material.completedAt = Date.now();
    if (material.addedToReviewAt === undefined) material.addedToReviewAt = null;
    material.totalGroups = material.groups.length;
    session.currentStep = 'materialComplete';
    session.schedulerState = { ...session.schedulerState, phase: 'complete' };
    return true;
  }
  // V1 今日新增 means completed materials still pending entry into global review.
  // No second array or UTC calendar filtering is used.
  function getPendingCount(state) {
    return getPendingMaterials(state).length;
  }
  function getPendingMaterials(state) {
    return state.materials.filter(item => item.status === 'completed' && item.addedToReviewAt === null);
  }
  function getReviewMaterials(state) {
    return state.materials.filter(item => item.status === 'completed' && item.addedToReviewAt != null);
  }
  function addPendingToReview(state) {
    const materials = getPendingMaterials(state);
    if (!materials.length) return;
    const timestamp = Date.now();
    materials.forEach(material => { material.addedToReviewAt = timestamp; });
  }
  function needsInitialization(state) {
    return state.materials.some(item => item.status === undefined || item.completedAt === undefined ||
      item.addedToReviewAt === undefined || item.totalGroups === undefined) ||
      !!(global.PocketScheduler.isMaterialComplete(state) && state.currentSession.currentStep !== 'materialComplete');
  }
  function initialize(state) {
    state.materials.forEach(item => {
      if (item.status === undefined) item.status = 'learning';
      if (item.completedAt === undefined) item.completedAt = null;
      if (item.addedToReviewAt === undefined) item.addedToReviewAt = null;
      if (item.totalGroups === undefined) item.totalGroups = item.groups.length;
    });
    completeCurrentMaterial(state);
  }
  global.PocketHistory = Object.freeze({ completeCurrentMaterial, getPendingCount, getPendingMaterials,
    getReviewMaterials, addPendingToReview, needsInitialization, initialize });
})(globalThis);
