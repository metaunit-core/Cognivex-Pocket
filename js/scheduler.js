(function (global) {
  'use strict';
  function getNextAssignment(state) {
    const session = state.currentSession;
    const material = state.materials.find(item => item.id === session.materialId);
    const schedule = session.schedulerState;
    if (!material || !schedule || schedule.phase === 'complete') return null;
    const indices=material.groups.map((group,index)=>group.questionsInactive===true ? -1 : index).filter(index=>index>=0);
    if(!indices.length)return null;
    const anchor=indices.filter(index=>index<=schedule.newGroupIndex).pop();
    if(anchor===undefined)return {groupIndex:indices[0],mode:'new',schedulerState:{phase:'new',newGroupIndex:indices[0],reviewGroupIndex:indices[0]}};
    const position=indices.indexOf(anchor), following=indices[position+1];
    let next;
    if (schedule.phase === 'new') {
      // Only the first new group may go directly to the second new group.
      next = position === 0 && following !== undefined
        ? { phase: 'new', newGroupIndex: following, reviewGroupIndex: indices[0] }
        : { phase:'review',newGroupIndex:anchor,reviewGroupIndex:indices[0] };
    } else if (indices.some(index=>index>schedule.reviewGroupIndex && index<=anchor)) {
      next = { ...schedule,newGroupIndex:anchor,reviewGroupIndex:indices.find(index=>index>schedule.reviewGroupIndex && index<=anchor) };
    } else if (following !== undefined) {
      next = { phase: 'new', newGroupIndex: following, reviewGroupIndex: indices[0] };
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
    const last = material.groups.map((group,index)=>group.questionsInactive===true ? -1 : index).filter(index=>index>=0).pop();
    if (last === undefined) return false;
    if (!['review', 'complete'].includes(schedule.phase) || schedule.newGroupIndex !== last ||
        schedule.reviewGroupIndex !== last || getNextAssignment(state) !== null) return false;
    return material.groups.filter(group=>group.questionsInactive!==true).every(group => {
      const runs = group.runs || [];
      const finished = run => run && (run.videoCompleted || run.videoSkipped) && run.outputCompleted && Number.isFinite(run.completedAt);
      return runs.some(run => run.mode === 'new' && finished(run)) &&
        runs[runs.length - 1]?.mode === 'review' && finished(runs[runs.length - 1]);
    });
  }
  global.PocketScheduler = Object.freeze({ getNextAssignment, initializeSession, isMaterialComplete });
})(globalThis);
