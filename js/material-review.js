(function (global) {
  'use strict';
  function groups(state) {
    const items = [];
    global.PocketHistory.getReviewMaterials(state).forEach((material,materialOrder) => {
      (material.groups || []).forEach((group,groupIndex) => items.push({materialId:material.id,groupId:group.id,
        groupIndex,addedToReviewAt:Number.isFinite(group.addedToReviewAt) ? group.addedToReviewAt :
          Number.isFinite(material.addedToReviewAt) ? material.addedToReviewAt : 0,materialOrder}));
    });
    return items.sort((a,b) => a.addedToReviewAt-b.addedToReviewAt || a.materialOrder-b.materialOrder || a.groupIndex-b.groupIndex);
  }
  const keyOf = item => JSON.stringify([item.materialId,item.groupId]);
  const collectionKey = state => JSON.stringify(groups(state).map(keyOf).sort());
  function canCreate(state) {
    if (state.materialReviewSession?.currentStep==='queueBlocked') return false;
    const items = groups(state);
    if (!items.length) return true;
    const grant = state.review.unlock;
    return !!(grant && grant.usedAt == null && grant.generation === (state.review.generation || 0) && grant.collectionKey === collectionKey(state));
  }
  function createMaterial(state,material) {
    if (state.currentSession?.materialId !== material.id || state.currentSession.currentStep !== 'grouping') throw Error('缺少有效的新资料设置断点。');
    const grandfathered = state.review.grandfatheredDraftId === material.id;
    if (!grandfathered && !canCreate(state)) throw Error('请先完成已学内容复习，再新增资料。');
    if (state.materials.some(item => item.id === material.id)) throw Error('资料已创建，不能重复创建。');
    state.materials.push(material);
    if (state.review.unlock && state.review.unlock.usedAt == null) state.review.unlock.usedAt = Date.now();
    state.review.generation = (state.review.generation || 0) + 1;
    delete state.review.grandfatheredDraftId;
  }
  function resolve(state,item) {
    const material = state.materials.find(entry => entry.id === item.materialId);
    if (!material || !Array.isArray(material.groups)) return null;
    const matches = material.groups.map((group,index) => ({group,index})).filter(entry => entry.group.id === item.groupId);
    return matches.length === 1 ? {material,...matches[0]} : null;
  }
  function activate(state) {
    const session = state.materialReviewSession;
    const item = session.queue?.[session.currentQueueIndex];
    const found = item && resolve(state,item);
    if (!found) {session.currentStep='queueBlocked';session.blockedReason='本轮资料或分组已缺失，复习解锁尚未完成。';return;}
    session.materialId=item.materialId;session.currentGroupIndex=found.index;
    session.currentMaterialIndex=session.materialIds.indexOf(item.materialId);
    if (item.runIndex == null) {
      global.PocketExecutor.startRun(state,{groupIndex:found.index,mode:'material-review'},'materialReviewSession');
      item.runIndex=session.currentRunIndex;
      item.startedAt=found.group.runs[item.runIndex].startedAt;
      found.group.runs[item.runIndex].reviewRoundId=session.roundId;
    } else {
      const run=found.group.runs?.[item.runIndex];
      if (!run || run.mode !== 'material-review' || run.reviewRoundId!==session.roundId || run.startedAt!==item.startedAt) {session.currentStep='queueBlocked';session.blockedReason='本组执行记录已缺失，原队列已保留。';return;}
      session.currentRunIndex=item.runIndex;session.currentStep='output';
    }
    delete session.blockedReason;
  }
  function finishRound(state,session) {
    if (session.roundRecorded) return;
    const completedAt=Math.max(...session.queue.map(item => item.completedAt || 0));
    session.completedAt=completedAt;session.roundRecorded=true;
    state.review.lastReviewedAt=completedAt;
    state.review.roundHistory=state.review.roundHistory || [];
    state.review.roundHistory.push({id:session.roundId,startedAt:session.startedAt,completedAt,
      collectionKey:session.collectionKey,generation:session.generation,groupCount:session.queue.length});
    if (session.collectionKey === collectionKey(state) && session.generation === (state.review.generation || 0)) {
      state.review.unlock={roundId:session.roundId,collectionKey:session.collectionKey,generation:session.generation,completedAt,usedAt:null};
    }
  }
  function open(state) {
    const materials = global.PocketHistory.getReviewMaterials(state);
    if (!materials.length) return;
    if (state.materialReviewSession && state.materialReviewSession.currentStep !== 'queueComplete') {
      state.activeSessionType = 'material-review';
    } else start(state);
  }
  function start(state) {
    if (state.materialReviewSession && state.materialReviewSession.currentStep !== 'queueComplete') {
      state.activeSessionType='material-review';return;
    }
    const queue=groups(state).map(item => ({...item,status:'pending',runIndex:null,completedAt:null}));
    if (!queue.length) return;
    if (state.materialReviewSession) {
      state.review.archivedSessions=state.review.archivedSessions || [];
      state.review.archivedSessions.push(state.materialReviewSession);
    }
    state.review.nextRoundNumber=(state.review.nextRoundNumber || 0)+1;
    state.materialReviewSession = {
      queueVersion:2,roundId:`group-review-${state.review.nextRoundNumber}`,queue,currentQueueIndex:0,
      completedGroupCount:0,collectionKey:collectionKey(state),generation:state.review.generation || 0,
      materialIds:[...new Set(queue.map(item=>item.materialId))],currentMaterialIndex:0,completedMaterials:[],materialId:queue[0].materialId,
      sessionType: 'material-review', mode: 'material-review', currentGroupIndex: 0,
      currentStep: 'output', startedAt: Date.now(), materialStartedAt: Date.now(), completedAt: null
    };
    state.activeSessionType = 'material-review';
    activate(state);
    delete state.reviewSelectionIds;
  }
  function finishGroup(state) {
    const { session, material, run } = global.PocketExecutor.getCurrentGroup(state, 'materialReviewSession');
    if (!run.outputCompleted || run.completedAt === null) return;
    if (session.queueVersion === 2) {
      if (!Array.isArray(session.queue) || !Number.isInteger(session.currentQueueIndex)) return;
      const item=session.queue[session.currentQueueIndex];
      if (!item || item.status === 'completed' || item.runIndex !== session.currentRunIndex || item.groupId !== material.groups[session.currentGroupIndex].id) return;
      item.status='completed';item.completedAt=run.completedAt;
      session.completedGroupCount=session.queue.filter(entry=>entry.status==='completed').length;
      if (!session.completedMaterials.some(entry=>entry.materialId===material.id) &&
          session.queue.filter(entry=>entry.materialId===material.id).every(entry=>entry.status==='completed')) {
        const startedAt=Math.min(...session.queue.filter(entry=>entry.materialId===material.id).map(entry=>entry.startedAt));
        material.lastMaterialReviewedAt=run.completedAt;
        material.materialReviewHistory=material.materialReviewHistory || [];
        material.materialReviewHistory.push({roundId:session.roundId,startedAt,completedAt:run.completedAt});
        session.completedMaterials.push({materialId:material.id,completedAt:run.completedAt});
      }
      session.currentStep='materialCompletePending';
      return;
    }
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
      if (session.currentMaterialIndex === session.materialIds.length - 1) {
        state.review.lastReviewedAt = timestamp;
      }
      // Persist completion first. The UI coordinator advances only AFTER this snapshot is saved.
      session.currentStep = 'materialCompletePending';
    }
  }
  function advanceQueue(state) {
    const session = state.materialReviewSession;
    if (!session || session.currentStep !== 'materialCompletePending') return;
    if (session.queueVersion === 2) {
      if (session.queue[session.currentQueueIndex]?.status !== 'completed') return;
      if (session.currentQueueIndex+1 < session.queue.length) {session.currentQueueIndex+=1;activate(state);}
      else {session.currentStep='queueComplete';finishRound(state,session);}
      return;
    }
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
    return state.review.policyVersion !== 2 || state.activeSessionType === 'review-selection' ||
      !!(state.materialReviewSession && !Array.isArray(state.materialReviewSession.materialIds)) || needsRepair(state);
  }
  function needsRepair(state) {
    const session=state.materialReviewSession;
    if (!session || session.currentStep === 'queueComplete' || session.currentStep === 'queueBlocked') return false;
    if (session.queueVersion === 2) {
      if (!Array.isArray(session.queue) || !Number.isInteger(session.currentQueueIndex)) return true;
      const item=session.queue?.[session.currentQueueIndex],found=item&&resolve(state,item);
      const run=found?.group.runs?.[item?.runIndex];
      return !found || session.materialId !== item.materialId || session.currentGroupIndex !== found.index ||
        (item.runIndex != null && (session.currentRunIndex !== item.runIndex || !run || run.reviewRoundId!==session.roundId || run.startedAt!==item.startedAt));
    }
    const material=state.materials.find(item=>item.id===session.materialId);
    return !material?.groups?.[session.currentGroupIndex]?.runs?.[session.currentRunIndex];
  }
  function initialize(state) {
    if (state.review.policyVersion !== 2) {
      state.review.policyVersion=2;state.review.generation=state.review.generation || 0;
      if (state.currentSession?.draft) state.review.grandfatheredDraftId=state.currentSession.materialId;
    }
    if (state.activeSessionType === 'review-selection') state.activeSessionType='learned-content';
    const session = state.materialReviewSession;
    if (!session) return;
    if (session.queueVersion === 2) {
      if (needsRepair(state)) {
        if (session.currentStep === 'materialCompletePending') {session.currentStep='queueBlocked';session.blockedReason='已完成组的资料或记录已缺失，原队列已保留。';}
        else activate(state);
      }
      return;
    }
    if (needsRepair(state)) {session.currentStep='queueBlocked';session.blockedReason='旧复习队列的资料或分组已缺失，原队列已保留。';return;}
    if (Array.isArray(session.materialIds)) return;
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
    if (state.materialReviewSession && state.materialReviewSession.queueVersion !== 2) {
      state.review.archivedSessions=state.review.archivedSessions || [];
      state.review.archivedSessions.push(state.materialReviewSession);state.materialReviewSession=null;
    }
    delete state.reviewSelectionIds;
    if (state.currentSession && state.currentSession.currentStep === 'materialComplete') state.currentSession = null;
  }
  function rebuild(state) {
    if (state.materialReviewSession?.currentStep !== 'queueBlocked') return;
    state.review.archivedSessions=state.review.archivedSessions || [];
    state.review.archivedSessions.push({...state.materialReviewSession,archivedAt:Date.now()});
    state.materialReviewSession=null;start(state);
    if (!state.materialReviewSession) state.activeSessionType='learning';
  }
  function counts(state) {
    const session=state.materialReviewSession;
    const total=groups(state).length;
    let done=session?.queueVersion===2 && Number.isInteger(session.completedGroupCount) ? session.completedGroupCount : 0;
    let roundTotal=total;
    if (session?.queueVersion===2 && session.currentStep==='queueComplete' && session.collectionKey!==collectionKey(state)) done=0;
    if (session && session.queueVersion!==2 && Array.isArray(session.materialIds)) {
      roundTotal=0;
      session.materialIds.forEach(id => {
        const size=state.materials.find(material=>material.id===id)?.groups?.length || 0;roundTotal+=size;
        if (session.completedMaterials?.some(item=>item.materialId===id)) done+=size;
        else if (session.materialId===id) done+=Math.min(size,session.currentGroupIndex || 0);
      });
    }
    const snapshotCurrent=session?.collectionKey===collectionKey(state) || session?.currentStep!=='queueComplete';
    return {total,done,pending:session?.queueVersion===2 && Array.isArray(session.queue) && snapshotCurrent ? Math.max(0,session.queue.length-done) : Math.max(0,roundTotal-done)};
  }
  global.PocketMaterialReview = Object.freeze({ open, start, finishGroup, advanceQueue,
    needsInitialization, initialize, returnToLearning, groups,collectionKey,canCreate,createMaterial,rebuild,counts });
})(globalThis);
