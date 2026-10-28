(function (global) {
  'use strict';
  function groups(state) {
    const items = [];
    const saved = state.dailyReverseReview?.saveOrder;
    const order = Array.isArray(saved) ? [...saved] : [];
    state.materials.forEach(m => { if (!order.includes(m.id)) order.push(m.id); });
    global.PocketHistory.getReviewMaterials(state).forEach((material,materialOrder) => {
      (material.groups || []).forEach((group,groupIndex) => {
        if (group.questionsInactive === true) return;
        if (group.appended === true && !Number.isFinite(group.addedToReviewAt)) return;
        items.push({materialId:material.id,groupId:group.id,
        groupIndex,addedToReviewAt:Number.isFinite(group.addedToReviewAt) ? group.addedToReviewAt :
          Number.isFinite(material.addedToReviewAt) ? material.addedToReviewAt : 0,materialOrder});
      });
    });
    return items.sort((a,b) => order.indexOf(b.materialId)-order.indexOf(a.materialId) || a.addedToReviewAt-b.addedToReviewAt || a.groupIndex-b.groupIndex);
  }
  const keyOf = item => JSON.stringify([item.materialId,item.groupId]);
  function localDay(at) {
    const date = new Date(at);
    return `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')}`;
  }
  function originalLearningDay(material) {
    const completedAt = material.completedAt;
    if (!Number.isFinite(completedAt) || completedAt < 0) return null;
    // Recorded only at the original scheduler's actual first completion. Quick
    // input never sets this field. Keep the effective local study day on reload.
    if (typeof material.originalLearningDay==='string' && /^\d{4}-\d{2}-\d{2}$/.test(material.originalLearningDay)) return material.originalLearningDay;
    // Quick input also has completedAt, but has no original new/internal-review
    // runs at that time. Later review or appended Groups cannot establish it.
    const original = material.groups.filter(group => group.appended !== true && group.questionsInactive !== true);
    const finished = run => run && run.migrated !== true && (run.videoCompleted || run.videoSkipped) &&
      run.outputCompleted === true && Number.isFinite(run.completedAt) && run.completedAt >= 0 && run.completedAt <= completedAt;
    const genuine=original.length > 0 && original.every(group =>
      group.runs?.some(run => run.mode === 'new' && finished(run)) &&
      group.runs?.some(run => run.mode === 'review' && finished(run)));
    return genuine ? localDay(completedAt) : null;
  }
  function groupsOnDay(state,day) {
    const ids = new Set(global.PocketHistory.getReviewMaterials(state).filter(material => originalLearningDay(material)===day).map(material => material.id));
    return groups(state).filter(item => ids.has(item.materialId));
  }
  function todayGroups(state) {return groupsOnDay(state,global.PocketDailyReverse?.day() ?? localDay(Date.now()));}
  function requiredReview(state) {
    const required=state.review.requiredAfterLearning;
    if(required && state.materials.some(material=>material.id===required.materialId))return required;
    // Read-only compatibility for a first completion saved before the explicit
    // obligation existed. A completed internal schedule alone is not B.
    const checkpoint=state.currentSession;
    const material=checkpoint?.currentStep==='materialComplete' && state.materials.find(material=>material.id===checkpoint.materialId);
    if(!material || material.hasAppendedGroups===true)return null;
    const day=originalLearningDay(material);if(!day)return null;
    const keys=groups(state).filter(item=>item.materialId===material.id).map(keyOf);
    const covered=[state.review.unlock,...(state.review.roundHistory||[]).slice(-1)].some(record=>{
      if(!record || !Number.isFinite(record.completedAt) || record.completedAt<material.completedAt)return false;
      try {const reviewed=JSON.parse(record.collectionKey);return Array.isArray(reviewed) && keys.length>0 && keys.every(key=>reviewed.includes(key));}
      catch(_){return false;}
    });
    return covered ? null : {materialId:material.id,day};
  }
  function reviewGroups(state) {
    // Only the isolated optional-relearning engine supplies this flag. Its
    // materials contain the selected batch; keep that scope across midnight.
    if (state.isolatedRelearning === true) return groups(state);
    const required=requiredReview(state);
    return required ? groupsOnDay(state,required.day) : todayGroups(state);
  }
  const collectionKey = state => JSON.stringify(reviewGroups(state).map(keyOf).sort());
  function requireAfterLearning(state,material) {
    if(state.currentSession?.materialId!==material.id || !global.PocketScheduler.isMaterialComplete(state))throw Error('原资料学习尚未真正完成，不能进入资料间复习。');
    const day=global.PocketDailyReverse?.day(material.completedAt) ?? localDay(material.completedAt);
    material.originalLearningDay=day;
    state.review.requiredAfterLearning={materialId:material.id,day};
  }
  function canCreate(state) {
    try { if (global.PocketReviewAdmission?.needsReview(state) ?? global.PocketDailyReverse?.needsReview(state)) return false; } catch (_) { return false; }
    if (state.materialReviewSession?.currentStep==='queueBlocked') return false;
    if (requiredReview(state)) return false;
    const items = reviewGroups(state);
    // Keep an old in-progress queue resumable when midnight empties today's
    // collection. Otherwise retain the original grant/voluntary-round rules.
    if (!items.length) return !state.materialReviewSession || state.materialReviewSession.currentStep==='queueComplete';
    const grant = state.review.unlock;
    return !!(grant && grant.usedAt == null && grant.generation === (state.review.generation || 0) && grant.collectionKey === collectionKey(state));
  }
  function createMaterial(state,material) {
    global.PocketDailyReverse?.assertCanCreate(state);
    if (state.currentSession?.materialId !== material.id || state.currentSession.currentStep !== 'grouping') throw Error('缺少有效的新资料设置断点。');
    const grandfathered = state.review.grandfatheredDraftId === material.id;
    if (!grandfathered && !canCreate(state)) throw Error('请先完成已学内容的资料间倒序复习，再新增资料。');
    if (state.materials.some(item => item.id === material.id)) throw Error('资料已创建，不能重复创建。');
    state.materials.push(material);
    global.PocketDailyReverse?.recordSavedMaterial(state);
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
    if (!session.queue?.length || session.queue.some(item=>{
      const found=resolve(state,item),run=found?.group.runs?.[item.runIndex];
      return item.status!=='completed' || !Number.isFinite(item.completedAt) || !run?.outputCompleted ||
        (!run.videoCompleted && !run.videoSkipped) || run.mode!=='material-review' || run.reviewRoundId!==session.roundId ||
        run.startedAt!==item.startedAt || run.completedAt!==item.completedAt || run.completedAt<run.startedAt;
    })) return;
    const completedAt=Math.max(...session.queue.map(item => item.completedAt || 0));
    session.completedAt=completedAt;session.roundRecorded=true;
    state.review.lastReviewedAt=completedAt;
    state.review.roundHistory=state.review.roundHistory || [];
    state.review.roundHistory.push({id:session.roundId,startedAt:session.startedAt,completedAt,
      collectionKey:session.collectionKey,generation:session.generation,groupCount:session.queue.length});
    if (session.collectionKey === collectionKey(state) && session.generation === (state.review.generation || 0)) {
      state.review.unlock={roundId:session.roundId,collectionKey:session.collectionKey,generation:session.generation,completedAt,usedAt:null};
      const required=requiredReview(state);
      if(required && session.queue.some(item=>item.materialId===required.materialId)) delete state.review.requiredAfterLearning;
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
    const queue=reviewGroups(state).map(item => ({...item,status:'pending',runIndex:null,completedAt:null}));
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
      else {
        finishRound(state,session);
        if(session.roundRecorded)session.currentStep='queueComplete';
        else {session.currentStep='queueBlocked';session.blockedReason='本轮存在尚未真实完成或不匹配的 Group 记录，未解锁下一份资料。';}
      }
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
    let roundTotal=reviewGroups(state).length;
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
    const available=session && session.currentStep!=='queueComplete' ? (session.queue?.length ?? roundTotal) : roundTotal;
    return {total,done,available,pending:session?.queueVersion===2 && Array.isArray(session.queue) && snapshotCurrent ? Math.max(0,session.queue.length-done) : Math.max(0,roundTotal-done)};
  }
  // Explicit material deletion trims the frozen queue without reordering surviving work.
  function removeMaterials(state, ids) {
    if(ids.has(state.review.requiredAfterLearning?.materialId))delete state.review.requiredAfterLearning;
    const session = state.materialReviewSession;
    if (!session || !session.materialIds?.some(id => ids.has(id))) return;
    if (session.queueVersion !== 2 || !Array.isArray(session.queue)) {
      throw Error('旧版倒序复习队列无法安全分离，请先完成当前倒序复习后再删除资料。');
    }
    const active = session.queue[session.currentQueueIndex];
    session.queue = session.queue.filter(item => !ids.has(item.materialId));
    session.materialIds = session.materialIds.filter(id => !ids.has(id));
    session.completedMaterials = session.completedMaterials.filter(item => !ids.has(item.materialId));
    session.completedGroupCount = session.queue.filter(item => item.status === 'completed').length;
    if (typeof session.collectionKey === 'string') {
      const keys = JSON.parse(session.collectionKey);
      session.collectionKey = JSON.stringify(keys.filter(key => !ids.has(JSON.parse(key)[0])));
    }
    if (!session.queue.length || !session.queue.some(item => item.status !== 'completed')) {
      state.review.archivedSessions ||= [];
      state.review.archivedSessions.push({ ...session, archivedAt: Date.now(), reason: '指定资料已删除，剩余队列已结束' });
      state.materialReviewSession = null;
      if (state.activeSessionType === 'material-review') state.activeSessionType = 'learning';
      return;
    }
    session.currentQueueIndex = session.queue.indexOf(active);
    if (session.currentQueueIndex < 0) {
      session.currentQueueIndex = session.queue.findIndex(item => item.status !== 'completed');
      activate(state);
    } else {
      session.currentMaterialIndex = session.materialIds.indexOf(session.materialId);
    }
  }
  function removeEmptyGroups(state, materialId, at) {
    const session = state.materialReviewSession;
    if (!session || session.currentStep === 'queueComplete' || !session.materialIds?.includes(materialId)) return;
    if (session.queueVersion !== 2) {
      if(state.materials.find(material=>material.id===materialId)?.groups.some(group=>group.questionsInactive===true))throw Error('旧版倒序任务无法安全调整空 Group，请先完成该复习再移除题目。');
      return;
    }
    const keep = item => item.status === 'completed' || resolve(state,item)?.group.questionsInactive !== true;
    if (session.queue.every(keep)) return;
    (state.review.questionRemovalHistory ||= []).push({at, session:JSON.parse(JSON.stringify(session))});
    const current = session.queue[session.currentQueueIndex];
    session.queue = session.queue.filter(keep);
    session.materialIds = [...new Set(session.queue.map(item=>item.materialId))];
    session.collectionKey = JSON.stringify(session.queue.filter(item=>resolve(state,item)?.group.questionsInactive!==true).map(keyOf).sort());
    session.completedGroupCount = session.queue.filter(item=>item.status==='completed').length;
    if (!session.queue.length) {
      (state.review.archivedSessions ||= []).push({...session,cancelledAt:at});
      state.materialReviewSession=null; if(state.activeSessionType==='material-review')state.activeSessionType='learning'; return;
    }
    session.currentQueueIndex=session.queue.indexOf(current);
    if(session.currentQueueIndex<0) {
      session.currentQueueIndex=session.queue.findIndex(item=>item.status!=='completed');
      if(session.currentQueueIndex<0) {session.currentQueueIndex=session.queue.length-1;session.currentStep='queueComplete';finishRound(state,session);}
      else activate(state);
    }
  }
  global.PocketMaterialReview = Object.freeze({ open, start, finishGroup, advanceQueue,
    needsInitialization, initialize, returnToLearning, groups,todayGroups,collectionKey,canCreate,createMaterial,rebuild,counts,removeMaterials,removeEmptyGroups,requireAfterLearning });
})(globalThis);
