(function (global) {
  'use strict';
  function getCurrentGroup(state, sessionKey = 'currentSession') {
    const session = state[sessionKey];
    const material = session && state.materials.find(item => item.id === session.materialId);
    const group = material && material.groups[session.currentGroupIndex];
    if (!group) throw new Error('找不到当前分组。');
    return { session, material, group, run: group.runs && group.runs[session.currentRunIndex] };
  }
  function startRun(state, assignment, sessionKey = 'currentSession') {
    const session = state[sessionKey];
    session.currentGroupIndex = assignment.groupIndex;
    session.mode = assignment.mode;
    if (assignment.schedulerState) session.schedulerState = assignment.schedulerState;
    const { group } = getCurrentGroup(state, sessionKey);
    group.runs = group.runs || [];
    session.currentRunIndex = group.runs.length;
    group.runs.push({ mode: assignment.mode, videoCompleted: false, outputCompleted: false,
      startedAt: Date.now(), completedAt: null });
    session.currentStep = 'video';
  }
  function selectNextGroup(state) {
    return global.PocketScheduler.getNextAssignment(state);
  }
  function transition(state, action, expected) {
    const sessionType = expected.sessionType || 'learning';
    if ((state.activeSessionType || 'learning') !== sessionType) return;
    const { session, group, run } = getCurrentGroup(state,
      sessionType === 'material-review' ? 'materialReviewSession' : 'currentSession');
    if (session.materialId !== expected.materialId || session.currentGroupIndex !== expected.currentGroupIndex ||
        session.currentStep !== expected.currentStep || session.currentRunIndex !== expected.currentRunIndex ||
        session.mode !== expected.mode || !run) return;
    if (action === 'videoDone' && session.currentStep === 'video') {
      run.videoCompleted = true;
      if (run.mode === 'new') group.videoCompleted = true;
      session.currentStep = 'output';
    } else if (action === 'outputDone' && session.currentStep === 'output' && run.videoCompleted) {
      run.outputCompleted = true;
      run.completedAt = Date.now();
      if (run.mode === 'new') {
        group.outputCompleted = true;
        group.executionCompleted = true;
        if (group.firstLearningCompletedAt == null) group.firstLearningCompletedAt = run.completedAt;
      }
      if (sessionType === 'material-review') global.PocketMaterialReview.finishGroup(state);
      else {
        session.currentStep = 'groupComplete';
        global.PocketHistory.completeCurrentMaterial(state);
      }
    } else if (action === 'continue' && session.currentStep === 'groupComplete' && run.completedAt !== null) {
      const assignment = selectNextGroup(state);
      if (assignment) startRun(state, assignment);
      else {
        global.PocketHistory.completeCurrentMaterial(state);
      }
    }
  }
  function needsInitialization(state) {
    const session = state.currentSession;
    const material = session && state.materials.find(item => item.id === session.materialId);
    return state.materials.some(item => (item.groups || []).some(group => !Array.isArray(group.runs))) ||
      !!(material && material.groups.length && (!session.schedulerState || !session.schedulerState.phase ||
        !material.groups[session.currentGroupIndex].runs?.[session.currentRunIndex]));
  }
  // Upgrade Phase 2/3 data without moving its current group or step.
  function initializeGroups(state) {
    state.materials.forEach(material => {
      (material.groups || []).forEach(group => {
        if (typeof group.videoCompleted !== 'boolean') group.videoCompleted = false;
        if (typeof group.outputCompleted !== 'boolean') group.outputCompleted = false;
        if (typeof group.executionCompleted !== 'boolean') group.executionCompleted = false;
        if (!Array.isArray(group.runs)) {
          group.runs = [];
          if (group.videoCompleted || group.outputCompleted || group.executionCompleted) {
            group.runs.push({ mode: 'new', videoCompleted: group.videoCompleted,
              outputCompleted: group.outputCompleted, startedAt: null,
              completedAt: group.executionCompleted ? Date.now() : null, migrated: true });
          }
        }
      });
    });
    const session = state.currentSession;
    const material = session && state.materials.find(item => item.id === session.materialId);
    if (!material || !material.groups.length) return;
    global.PocketScheduler.initializeSession(session);
    const { group } = getCurrentGroup(state);
    if (!group.runs[session.currentRunIndex]) {
      let index = group.runs.findIndex(run => run.mode === session.mode);
      if (index < 0) {
        index = group.runs.length;
        group.runs.push({ mode: session.mode, videoCompleted: false, outputCompleted: false,
          startedAt: Date.now(), completedAt: null, migrated: true });
      }
      session.currentRunIndex = index;
      const run = group.runs[index];
      if (session.currentStep === 'output' || session.currentStep === 'groupComplete') run.videoCompleted = true;
      if (session.currentStep === 'groupComplete') {
        run.outputCompleted = true;
        if (run.completedAt == null) run.completedAt = Date.now();
      }
    }
    state.materials.forEach(item => item.groups.forEach(group => {
      const first = group.runs.find(run => run.mode === 'new' && run.completedAt !== null);
      if (first && group.firstLearningCompletedAt == null) group.firstLearningCompletedAt = first.completedAt;
    }));
  }
  global.PocketExecutor = Object.freeze({ getCurrentGroup, startRun, selectNextGroup, transition,
    initializeGroups, needsInitialization });
})(globalThis);
