(function (global) {
  'use strict';
  const hasTime = value => Number.isFinite(value) && value >= 0;
  function admit(material) {
    if (material.status !== 'completed') return;
    if (!hasTime(material.addedToReviewAt)) material.addedToReviewAt = hasTime(material.completedAt) ? material.completedAt : 0;
    const ids = new Set((material.groups || []).map(group => group.id).filter(Boolean));
    (material.groups || []).forEach((group,index) => {
      if (!group.id) {
        let id = `${material.id}:group:${index}`, suffix = 0;
        while (ids.has(id)) id = `${material.id}:group:${index}:${++suffix}`;
        group.id = id; ids.add(id);
      }
      if (!hasTime(group.addedToReviewAt)) group.addedToReviewAt = material.addedToReviewAt;
    });
  }
  function markCompleted(material, at = Date.now()) {
    material.status = 'completed';
    if (material.completedAt == null) material.completedAt = at;
    admit(material);
    material.totalGroups = material.groups.length;
  }
  function completeCurrentMaterial(state) {
    if (!global.PocketScheduler.isMaterialComplete(state)) return false;
    const session = state.currentSession;
    const material = state.materials.find(item => item.id === session.materialId);
    markCompleted(material);
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
    return state.materials.filter(item => item.status === 'completed' ||
      (item.hasAppendedGroups === true && hasTime(item.completedAt)));
  }
  function addPendingToReview(state) {
    const materials = getPendingMaterials(state);
    if (!materials.length) return;
    materials.forEach(admit);
  }
  function needsInitialization(state) {
    return state.materials.some(item => item.status === undefined || item.completedAt === undefined ||
      item.addedToReviewAt === undefined || item.totalGroups === undefined ||
      (item.status === 'completed' && (!hasTime(item.addedToReviewAt) || (item.groups || []).some(group => !group.id || !hasTime(group.addedToReviewAt))))) ||
      !!(global.PocketScheduler.isMaterialComplete(state) && state.currentSession.currentStep !== 'materialComplete');
  }
  function initialize(state) {
    state.materials.forEach(item => {
      if (item.status === undefined) item.status = 'learning';
      if (item.completedAt === undefined) item.completedAt = null;
      if (item.addedToReviewAt === undefined) item.addedToReviewAt = null;
      if (item.totalGroups === undefined) item.totalGroups = item.groups.length;
      admit(item);
    });
    completeCurrentMaterial(state);
  }
  global.PocketHistory = Object.freeze({ completeCurrentMaterial, getPendingCount, getPendingMaterials,
    getReviewMaterials, addPendingToReview, needsInitialization, initialize, admit, markCompleted });
})(globalThis);
