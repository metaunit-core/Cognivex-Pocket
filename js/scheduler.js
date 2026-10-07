(function (global) {
  'use strict';
  function getNextAssignment(state) {
    const session = state.currentSession;
    const material = state.materials.find(item => item.id === session.materialId);
    const schedule = session.schedulerState;
    if (!material || !schedule || schedule.phase === 'complete') return null;
    let next;
    if (schedule.phase === 'new') {
      // Only the first new group may go directly to the second new group.
      next = schedule.newGroupIndex === 0 && material.groups.length > 1
        ? { phase: 'new', newGroupIndex: 1, reviewGroupIndex: 0 }
        : { ...schedule, phase: 'review', reviewGroupIndex: 0 };
    } else if (schedule.reviewGroupIndex < schedule.newGroupIndex) {
      next = { ...schedule, reviewGroupIndex: schedule.reviewGroupIndex + 1 };
    } else if (schedule.newGroupIndex + 1 < material.groups.length) {
      next = { phase: 'new', newGroupIndex: schedule.newGroupIndex + 1, reviewGroupIndex: 0 };
    } else return null;
    return {
      groupIndex: next.phase === 'new' ? next.newGroupIndex : next.reviewGroupIndex,
      mode: next.phase === 'new' ? 'new' : 'review',
      schedulerState: next
    };
  }
  function initializeSession(session) {
    if (!session.schedulerState || !session.schedulerState.phase) {
      session.schedulerState = {
        phase: session.mode === 'review' ? 'review' : 'new',
        newGroupIndex: session.currentGroupIndex,
        reviewGroupIndex: session.mode === 'review' ? session.currentGroupIndex : 0
      };
    }
  }
  function isMaterialComplete(state) {
    const session = state.currentSession;
    const material = session && state.materials.find(item => item.id === session.materialId);
    const schedule = session && session.schedulerState;
    if (!material || !material.groups.length || !schedule ||
        !['groupComplete', 'materialComplete'].includes(session.currentStep)) return false;
    const last = material.groups.length - 1;
    if (!['review', 'complete'].includes(schedule.phase) || schedule.newGroupIndex !== last ||
        schedule.reviewGroupIndex !== last || getNextAssignment(state) !== null) return false;
    return material.groups.every(group => {
      const runs = group.runs || [];
      const finished = run => run && run.videoCompleted && run.outputCompleted && Number.isFinite(run.completedAt);
      return runs.some(run => run.mode === 'new' && finished(run)) &&
        runs[runs.length - 1]?.mode === 'review' && finished(runs[runs.length - 1]);
    });
  }
  global.PocketScheduler = Object.freeze({ getNextAssignment, initializeSession, isMaterialComplete });
})(globalThis);
