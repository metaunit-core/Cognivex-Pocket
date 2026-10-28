(function (global) {
  'use strict';
  const clone = value => JSON.parse(JSON.stringify(value));
  const stamp = material => JSON.stringify(material.groups.map(group => [group.id ?? null, group.start ?? null, group.end ?? null, group.questionRange ?? null, group.questionsInactive === true]));
  let api, page, message, outputView = '', viewKey = '';
  function count(material) {
    if (material.relearningCount === undefined) return 0;
    if (!Number.isSafeInteger(material.relearningCount) || material.relearningCount < 0) throw Error('重学次数格式异常，请先导出 JSON 核查。');
    return material.relearningCount;
  }
  function pending(state) { return !!(state.relearning && state.relearning.completedAt === null && state.relearning.cancelledAt == null); }
  function ordered(state, selected) {
    const ids = new Set(selected);
    if (!ids.size || ids.size !== selected.length || new Set(state.materials.map(m => m.id)).size !== state.materials.length || [...ids].some(id => !state.materials.some(m => m.id === id))) throw Error('请重新选择有效且 ID 唯一的资料。');
    // Formal append order is authoritative: createdAt may be the earlier draft time.
    const order = [...(state.dailyReverseReview?.saveOrder || [])];
    state.materials.forEach(material => { if (!order.includes(material.id)) order.push(material.id); });
    return state.materials.filter(m => ids.has(m.id)).sort((a,b) => order.indexOf(a.id) - order.indexOf(b.id));
  }
  function makeMaterial(source) {
    if (!source.groups.length || !source.groups.some(group => group.questionsInactive !== true)) throw Error('所选资料没有可重学的有效 Group。');
    const ids=source.groups.map(group=>group.id).filter(Boolean);
    if(new Set(ids).size!==ids.length)throw Error('所选资料的 Group ID 重复，未开始重学。');
    const groups = source.groups.map(group => ({
      ...(group.id ? { id:group.id } : {}), start:group.start, end:group.end,
      ...(group.questionRange !== undefined ? {questionRange:group.questionRange} : {}),
      ...(group.questionsInactive === true ? {questionsInactive:true} : {}),
      videoCompleted:false, outputCompleted:false, executionCompleted:false,
      latestAccuracyPercent:null, latestAccuracyRatio:null, latestDurationMinutes:null, runs:[]
    }));
    return {id:source.id,subject:source.subject,title:source.title,questionRange:source.questionRange,groups,
      status:'learning',completedAt:null,addedToReviewAt:null,totalGroups:groups.length};
  }
  function activate(batch, at) {
    const item = batch.queue[batch.index];
    const material = batch.engine.materials.find(m=>m.id===item.materialId);
    item.startedAt = at;
    const first = material.groups.findIndex(group=>group.questionsInactive!==true);
    if (batch.version === 3) {
      batch.engine.currentSession={materialId:material.id,currentStep:'output',mode:'review'};
      batch.engine.activeSessionType='learning';
      global.PocketExecutor.startRun(batch.engine,{groupIndex:first,mode:'review'});
      batch.phase='learning';
      return;
    }
    batch.engine.currentSession={materialId:material.id,currentStep:'output',mode:'new'};
    batch.engine.activeSessionType='learning';
    batch.engine.review.generation=(batch.engine.review.generation||0)+1;
    global.PocketExecutor.startRun(batch.engine,{groupIndex:first,mode:'new',schedulerState:{phase:'new',newGroupIndex:first,reviewGroupIndex:first}});
    batch.phase='learning';
  }
  function start(state, selected, at = Date.now()) {
    if (pending(state)) return false; // Resume the saved batch; never silently replace it.
    const sources = ordered(state, selected);
    sources.forEach(count);
    const id = global.crypto.randomUUID();
    const materials=sources.map(makeMaterial);
    state.relearning = {version:3,id,startedAt:at,completedAt:null,index:0,queue:sources.map(material => ({
      taskId:id+':'+material.id,materialId:material.id,sourceStamp:stamp(material),startedAt:null,learningCompletedAt:null
    })),engine:{version:1,isolatedRelearning:true,relearningScheduleVersion:3,review:{lastReviewedAt:null,policyVersion:2,generation:0,roundHistory:[]},
      dailyReverseReview:{version:1,saveOrder:sources.map(m=>m.id),history:[]},materials,currentSession:null}};
    activate(state.relearning, at);
    return true;
  }
  function current(state) {
    if (!pending(state)) return null;
    const batch = state.relearning;
    if (!batch.engine || !['learning','reverse'].includes(batch.phase)) throw Error('重学断点异常，请先导出 JSON 核查。');
    const reverse=batch.phase==='reverse';
    if(reverse && batch.engine.materialReviewSession?.currentStep==='queueBlocked')throw Error(batch.engine.materialReviewSession.blockedReason || '重学倒序复习断点异常，原进度已保留。');
    const active = global.PocketExecutor.getCurrentGroup(batch.engine,reverse ? 'materialReviewSession' : 'currentSession');
    const item=batch.queue.find(item=>item.materialId===active.session.materialId);
    if (!item || !active.run) throw Error('重学断点异常，请先导出 JSON 核查。');
    const sources = state.materials.filter(m => m.id === item.materialId);
    if (sources.length !== 1) throw Error('重学资料已不存在或 ID 不唯一。');
    if (stamp(sources[0]) !== item.sourceStamp) throw Error('重学资料的分组或有效题号已变化；旧进度仍保留，可结束本次重学后重新选择。');
    return {...active,batch,item,source:sources[0],sessionType:reverse ? 'material-review' : 'learning'};
  }
  function checkpoint(state) {
    const active = current(state);
    if (!active) return null;
    const {batch,item,session,sessionType} = active;
    return {batchId:batch.id,taskId:item.taskId,materialId:item.materialId,currentGroupIndex:session.currentGroupIndex,
      currentRunIndex:session.currentRunIndex,currentStep:session.currentStep,mode:session.mode,sessionType,roundId:session.roundId||null};
  }
  function matches(state, expected) { return JSON.stringify(checkpoint(state)) === JSON.stringify(expected); }
  function transition(state, action, expected, at = Date.now()) {
    if (!pending(state) || !matches(state, expected)) return false;
    const {batch,item,session,sessionType} = current(state), engine=batch.engine;
    global.PocketExecutor.transition(engine, action, {...session,sessionType});
    if (batch.version === 3) {
      if (session.currentStep !== 'groupComplete') return true;
      const {material,run}=global.PocketExecutor.getCurrentGroup(engine);
      if (!run.outputCompleted || (!run.videoCompleted && !run.videoSkipped) || !Number.isFinite(run.completedAt)) throw Error('本组复习尚未真正完成，未推进重学。');
      const following=material.groups.findIndex((group,index)=>index>session.currentGroupIndex && group.questionsInactive!==true);
      if (following>=0) global.PocketExecutor.startRun(engine,{groupIndex:following,mode:'review'});
      else {
        item.learningCompletedAt=at;
        if (batch.index+1<batch.queue.length) {batch.index++;activate(batch,at);}
        else settle(state,at);
      }
      return true;
    }
    if (batch.phase==='learning' && session.currentStep === 'materialComplete') {
      if (!global.PocketScheduler.isMaterialComplete(engine)) throw Error('重学尚未完整完成，未计次。');
      item.learningCompletedAt=at;
      if (batch.version === 2 && batch.index+1<batch.queue.length) {batch.index++;activate(batch,at);return true;}
      if (batch.version === 2 && batch.queue.length === 1) {delete engine.review.requiredAfterLearning;settle(state,at);return true;}
      global.PocketMaterialReview.open(engine);
      if (!engine.materialReviewSession || engine.activeSessionType!=='material-review') throw Error('资料间倒序复习未启动，未解锁下一份。');
      batch.phase='reverse';
    } else if(batch.phase==='reverse') {
      if(session.currentStep==='materialCompletePending')global.PocketMaterialReview.advanceQueue(engine);
      if(session.currentStep==='queueComplete') {
        if(!session.roundRecorded)throw Error('资料间倒序复习尚未真实完成，未计次。');
        global.PocketMaterialReview.returnToLearning(engine);
        if(batch.index+1<batch.queue.length){batch.index++;activate(batch,at);}
        else settle(state,at);
      }
    }
    return true;
  }
  function settle(state, at) {
    const batch=state.relearning,engine=batch.engine;
    if(batch.completedAt!==null)return;
    const rounds=batch.version === 3 ? 0 : batch.version === 2 ? (batch.queue.length > 1 ? 1 : 0) : batch.queue.length;
    if (batch.version === 3 && engine.materials.some(material=>material.groups.filter(group=>group.questionsInactive!==true).some(group=>{
      const run=group.runs[0];
      return group.runs.length!==1 || run.mode!=='review' || !run.outputCompleted || (!run.videoCompleted && !run.videoSkipped) || !Number.isFinite(run.completedAt);
    }))) throw Error('本轮正序重学尚未全部完成，未计次。');
    if(batch.queue.some(item=>item.learningCompletedAt===null) || engine.review.requiredAfterLearning ||
      engine.review.roundHistory.length!==rounds || (rounds > 0 && engine.materialReviewSession?.currentStep!=='queueComplete'))throw Error('本轮学习或倒序复习未全部完成，未计次。');
    for(const item of batch.queue){
      const source=state.materials.find(m=>m.id===item.materialId);
      if(!source || stamp(source)!==item.sourceStamp)throw Error('资料范围已变化，本轮尚未结算。');
      const history=source.relearningHistory ||= [];
      if(!Array.isArray(history))throw Error('重学历史格式异常，未计次。');
      if(!history.some(record=>record.taskId===item.taskId)){
        const value=count(source)+1;if(!Number.isSafeInteger(value))throw Error('重学次数超出有效范围。');
        source.relearningCount=value;
        history.push({taskId:item.taskId,batchId:batch.id,startedAt:item.startedAt,completedAt:at,
          groups:clone(engine.materials.find(m=>m.id===item.materialId).groups)});
      }
    }
    batch.reviewRounds=clone(engine.review.roundHistory);batch.completedAt=at;batch.phase='complete';delete batch.engine;
    global.PocketReviewAdmission.recordRelearning(state,at);
  }
  function metrics(state, expected, field, value, ratio) {
    if (!pending(state) || !matches(state, expected)) throw Error('重学任务已变化，请重新打开当前 Group。');
    const {group,run} = current(state);
    group[field] = value;
    if (field === 'latestAccuracyPercent') { group.latestAccuracyRatio = ratio; run.accuracyRatio = ratio; run.accuracyPercent = value; }
    else run.durationMinutes = value;
  }
  function cancel(state, at = Date.now()) {
    if (!pending(state)) return;
    state.relearning.cancelledAt = at;
    (state.relearningArchives ||= []).push(clone(state.relearning));
  }
  function removeMaterials(state, ids, at = Date.now()) {
    const batch = state.relearning;
    if (!batch || !batch.queue.some(item => ids.has(item.materialId))) return;
    if(pending(state)){
      cancel(state,at);
      batch.cancelReason='本轮选中资料已删除，未完成重学不计次。';
      delete batch.engine;
    }
    batch.queue = batch.queue.filter(item => !ids.has(item.materialId));
    batch.index=Math.min(batch.index,batch.queue.length);
  }
  const el = (tag, text = '', className = '') => { const node = document.createElement(tag); if (text) node.textContent = text; if (className) node.className = className; return node; };
  function button(text, action, className = 'secondary') { const node = el('button',text,className); node.type='button'; node.addEventListener('click',action); return node; }
  function save(change) {
    let persisted=false;
    try { api.save(change); persisted=true; message.textContent=''; render(); return true; }
    catch(error) { message.textContent=(persisted ? '重学已保存，页面更新失败，请刷新：' : '重学保存失败，进度未推进：')+error.message; return false; }
  }
  function links(source, kind) {
    const area = el('section','','video-link-area');
    area.append(el('h4',kind === 'video' ? '视频入口' : '输出资料'));
    (source[kind+'Links'] || []).forEach(link => {
      if (!global.PocketExternalLinks.canNavigate(link.url)) return;
      const anchor = el('a',link.title || (kind === 'video' ? '视频' : '输出'),'video-link-button');
      anchor.href=global.PocketExternalLinks.normalizeUri(link.url);anchor.target='_blank';anchor.rel='noopener noreferrer';area.append(anchor);
    });
    return area;
  }
  function render() {
    const state = api.get();
    page.replaceChildren();
    page.append(button('← 返回',() => global.PocketNavigation.back(),'practice-back'),el('h1','选做重学'));
    message = el('p','','field-error'); message.setAttribute('role','status'); page.append(message);
    if (!pending(state)) {
      page.append(el('h2',state.relearning?.completedAt !== null && state.relearning?.completedAt !== undefined ? '本次重学任务已完成' : '当前没有进行中的重学任务'));
      if (state.relearning?.completedAt != null && global.PocketReviewAdmission.root(state).relearning?.some(record =>
        record.batchId === state.relearning.id && record.day === global.PocketDailyReverse.day(Date.now()))) {
        page.append(el('p','本轮重学已完成，今日新增资料已解锁。'));
      }
      page.append(button('回到主页',() => document.getElementById('pocket-home-button').click()));
      return;
    }
    let active;
    try { active = current(state); }
    catch(error) { message.textContent=error.message; }
    const end = button('结束本次重学（未完成不计次）',() => {
      if (global.confirm('结束本次重学？本轮尚未完成，所有选中资料均不计次；原学习和复习进度不变。')) save(next => cancel(next));
    });
    if (!active) { page.append(end); return; }
    const {batch,session,group,source} = active;
    const expected = checkpoint(state);
    page.append(el('p',`本轮资料 ${batch.index+1}/${batch.queue.length} · ${source.subject} · ${source.title}`,'material-title'),
      el('p',`${batch.phase==='reverse' ? '资料间倒序复习' : session.mode === 'review' ? '组间复习' : '分组学习'}｜第${session.currentGroupIndex+1}/${source.groups.length}组`,'assignment-title'),
      el('p',`题目：${group.questionRange || (group.start === group.end ? group.start : group.start+'-'+group.end)}`,'question-range'));
    const metricArea = el('div');
    global.PocketReviewUI.metrics(metricArea,{values:group,status:message,idPrefix:'relearning-',save:(field,value,ratio)=>{
      api.save(next=>metrics(next,expected,field,value,ratio));
    }});
    page.append(metricArea);
    const task = el('section','','current-task');
    const act = action => save(next => transition(next,action,expected));
    if (session.currentStep === 'groupComplete') {
      task.append(el('h3','本组本轮完成'),button('继续',()=>act('continue'),''));
    } else {
      const key=JSON.stringify(expected);
      if (key !== viewKey) {viewKey=key;outputView='';}
      global.PocketReviewUI.output(task,{view:outputView,onView:name=>{
        outputView=name;global.PocketNavigation.remember({page:'relearning',outputPage:name});
      },video:container=>{
        container.append(el('span','VIDEO','step-badge'));global.PocketReviewUI.videoIntroduction(container);
        container.append(el('p',`只看第${group.questionRange || (group.start===group.end ? group.start : group.start+'-'+group.end)}题对应的课程内容，不要超过当前组范围。`,'task-guidance'));
        global.PocketReviewUI.videoFurtherStages(container);container.append(links(source,'video'));
      },outputLinks:()=>links(source,'output'),complete:()=>button('输出达标 → 下一步',()=>act('outputDone'),'')});
    }
    page.append(task,el('p','重学进度和成绩独立保存，不改变原学习记录。','data-management-help'),end);
    global.PocketNavigation.remember({page:'relearning',outputPage:outputView});
  }
  function open(saved = {}) {
    if (!api) return false;
    if (!page) {page=el('main','','practice-tool');page.id='relearning';document.body.append(page);}
    global.PocketNavigation.hideTools();document.getElementById('pocket-main').hidden=true;page.hidden=false;
    viewKey='';
    try{const savedCheckpoint=checkpoint(api.get());if(savedCheckpoint)viewKey=JSON.stringify(savedCheckpoint);}catch(_){/* Render reports the preserved, blocked checkpoint. */}
    outputView=saved.outputPage || '';
    render();return true;
  }
  global.PocketRelearning = Object.freeze({count,pending,ordered,start,current,checkpoint,transition,metrics,cancel,removeMaterials,open,attach:value=>{api=value;}});
  global.PocketNavigation?.register('relearning',open);
})(globalThis);
