(function(global) {
  'use strict';
  let api, page, generation=0;
  const clone=value=>JSON.parse(JSON.stringify(value));
  function range(numbers) {
    const parts=[];
    for(let i=0;i<numbers.length;) {
      const start=numbers[i++];let end=start;
      while(i<numbers.length && numbers[i]===end+1)end=numbers[i++];
      parts.push(start===end ? String(start) : `${start}-${end}`);
    }
    return parts.join(', ');
  }
  function entries(material) {
    const ids=material.groups.map(group=>group.id).filter(Boolean);
    if(new Set(ids).size!==ids.length)throw Error('原 Group ID 重复，无法安全移除。');
    return material.groups.flatMap((group,index)=>{
      const groupKey=group.id ? 'id:'+group.id : 'legacy:'+JSON.stringify([index,group.start??null,group.end??null]);
      return global.PocketFocusReview.groupNumbers(group).map(number=>({key:JSON.stringify([groupKey,number]),groupKey,groupIndex:index,number}));
    });
  }
  function repairDaily(state, material, at) {
    const daily=state.dailyReverseReview, round=daily?.round;
    if(!round || Number.isFinite(round.completedAt) || !round.ids.includes(material.id))return;
    if(!global.PocketDailyReverse.validRound(round) || !round.tasks)throw Error('当前旧版或异常正序复习无法安全调整，请先完成该复习再移除题目。');
    (daily.questionRemovalHistory ||= []).push({at,round:clone(round)});
    round.tasks=round.tasks.filter(task=>{
      if(task.materialId!==material.id || task.status==='completed')return true;
      const group=task.groupId.startsWith('id:') ? material.groups.find(group=>'id:'+group.id===task.groupId) : material.groups[task.groupIndex];
      if(!group)throw Error('正序复习分组已缺失，未移除题目。');
      if(group.questionsInactive===true)return false;
      task.questionRange=group.questionRange;return true;
    });
    const prefix=round.ids.slice(0,round.taskStartIndex), planned=[...new Set(round.tasks.map(task=>task.materialId))];
    if(!round.tasks.length)throw Error('移除后正序队列将失效，未移除题目。');
    round.ids=[...prefix,...planned];
    round.completedIds=[...prefix,...planned.filter(id=>round.tasks.filter(task=>task.materialId===id).every(task=>task.status==='completed'))];
    round.index=round.completedIds.length;
    round.taskIndex=round.tasks.filter(task=>task.status==='completed').length;
    const current=round.tasks[round.taskIndex];
    if(current && current.run.startedAt===null)current.run.startedAt=at;
    if(!current)round.completedAt=Math.max(...round.tasks.map(task=>task.run.completedAt||0));
    if(!global.PocketDailyReverse.validRound(round))throw Error('无法安全保留正序进度，未移除题目。');
    if(!current)global.PocketReviewAdmission?.recordDaily(state,at);
  }
  function repairLearning(state, material, at) {
    const session=state.currentSession;
    if(session?.materialId!==material.id || ['materialComplete','complete','basic','grouping'].includes(session.currentStep) || material.groups[session.currentGroupIndex]?.questionsInactive!==true)return;
    (material.questionRemovalSessions ||= []).push({at,session:clone(session)});
    const activeIndices=material.groups.map((group,index)=>group.questionsInactive===true ? -1 : index).filter(index=>index>=0);
    const finished=group=>group.runs?.some(run=>run.mode==='new' && run.outputCompleted && Number.isFinite(run.completedAt)) &&
      group.runs.at(-1)?.mode==='review' && group.runs.at(-1).outputCompleted && Number.isFinite(group.runs.at(-1).completedAt);
    if(activeIndices.every(index=>finished(material.groups[index]))) {
      const index=activeIndices.at(-1), group=material.groups[index];
      Object.assign(session,{currentGroupIndex:index,currentRunIndex:group.runs.length-1,currentStep:'groupComplete',mode:'review',schedulerState:{phase:'review',newGroupIndex:index,reviewGroupIndex:index}});
      if(!global.PocketHistory.completeCurrentMaterial(state))throw Error('当前学习断点无法安全调整，未移除题目。');
      return;
    }
    const assignment=global.PocketScheduler.getNextAssignment(state);
    if(assignment)global.PocketExecutor.startRun(state,assignment);
    else {
      const index=material.groups.map((group,index)=>group.questionsInactive===true ? -1 : index).filter(index=>index>=0).pop();
      const group=material.groups[index], last=group.runs?.[group.runs.length-1];
      if(last?.mode==='review' && last.outputCompleted && Number.isFinite(last.completedAt)) {
        Object.assign(session,{currentGroupIndex:index,currentRunIndex:group.runs.length-1,currentStep:'groupComplete',mode:'review',schedulerState:{phase:'review',newGroupIndex:index,reviewGroupIndex:index}});
        if(!global.PocketHistory.completeCurrentMaterial(state))throw Error('当前学习断点无法安全调整，未移除题目。');
      } else global.PocketExecutor.startRun(state,{groupIndex:index,mode:'review',schedulerState:{phase:'review',newGroupIndex:index,reviewGroupIndex:index}});
    }
  }
  function repairFocus(state,at) {
    const focus=state.focusReview, model=global.PocketFocusReview;
    if(!focus)return;
    const original=focus.session, sessions=[original,...(focus.pausedSessions||[])].filter(Boolean), paused=[];
    let activeSession=null;
    for(const session of sessions) {
      state.focusReview.session=session;
      let active=model.active(state);
      while(active && !model.locate(state,active.question)) {
        model.transition(state,active.run.id,'skipInactive',{},at,active.index);
        active=model.active(state);
      }
      if(state.focusReview.session) {
        if(session===original)activeSession=state.focusReview.session;
        else paused.push(state.focusReview.session);
      }
    }
    state.focusReview.session=activeSession;state.focusReview.pausedSessions=paused;
  }
  function remove(state, materialId, selected, at=Date.now()) {
    if(!Number.isFinite(at) || at<0)throw Error('设备时间无效，未移除题目。');
    const matches=state.materials.filter(material=>material.id===materialId);
    if(matches.length!==1)throw Error('资料不存在或稳定 ID 重复，请重新选择。');
    const material=matches[0], all=entries(material), keys=new Set(selected);
    if(!keys.size || keys.size!==selected.length || [...keys].some(key=>!all.some(entry=>entry.key===key)))throw Error('勾选题目已变化或无效，请重新选择。');
    if(keys.size===all.length)throw Error('不能移除整份资料的全部题目；如需删除整份资料，请使用「查看资料」选择性删除功能。');
    const previousCollection=global.PocketMaterialReview.collectionKey(state);
    const changed=new Set(all.filter(entry=>keys.has(entry.key)).map(entry=>entry.groupIndex));
    for(const index of changed) {
      const group=material.groups[index], old=all.filter(entry=>entry.groupIndex===index), numbers=old.filter(entry=>!keys.has(entry.key)).map(entry=>entry.number);
      const oldRange=range(old.map(entry=>entry.number));
      (group.questionRemovalHistory ||= []).push({at,range:oldRange,removedNumbers:old.filter(entry=>keys.has(entry.key)).map(entry=>entry.number),
        materialId:material.id,groupKey:old[0].groupKey,subjectName:material.subject,materialTitle:material.title,
        accuracyRatio:group.latestAccuracyRatio??null,accuracyPercent:group.latestAccuracyPercent??null,durationMinutes:group.latestDurationMinutes??null});
      group.latestAccuracyQuestionRange ??= oldRange;group.latestDurationQuestionRange ??= oldRange;
      // Keep the numeric original bounds and identities for historical/legacy references.
      // questionRange is the authoritative current membership, including an explicit empty range.
      group.questionRange=range(numbers);group.questionsInactive=numbers.length===0;
    }
    material.questionRange=range([...new Set(entries(material).map(entry=>entry.number))]);
    global.PocketMaterialReview.removeEmptyGroups(state,material.id,at);
    if(state.review.unlock?.collectionKey===previousCollection)state.review.unlock.collectionKey=global.PocketMaterialReview.collectionKey(state);
    repairDaily(state,material,at);repairLearning(state,material,at);repairFocus(state,at);
    return keys.size;
  }
  const node=(tag,text='',className='')=>{const item=global.document.createElement(tag);item.textContent=text;if(className)item.className=className;return item;};
  function open() {
    if(!api)return false;
    const current=++generation;
    if(!page){page=node('main','','practice-tool');page.id='learning-question-removal';global.document.body.append(page);}
    global.PocketNavigation.hideTools();global.document.getElementById('pocket-main').hidden=true;
    page.hidden=false;page.replaceChildren();global.PocketNavigation.remember({page:'learning-question-removal'});
    const back=node('button','← 返回','practice-back');back.type='button';back.addEventListener('click',()=>{generation++;global.PocketNavigation.back();});
    page.append(back,node('h1','已熟练，可移除'));
    const label=node('label','选择学习资料'), select=node('select');select.id='learning-removal-material';label.setAttribute('for',select.id);
    const placeholder=node('option','请选择学习资料');placeholder.value='';select.append(placeholder);select.value='';
    const state=api.get(), order=[...(state.dailyReverseReview?.saveOrder||[])];
    state.materials.forEach(material=>{if(!order.includes(material.id))order.push(material.id);});
    state.materials.slice().sort((a,b)=>order.indexOf(a.id)-order.indexOf(b.id)).forEach(material=>{
      const option=node('option',`${material.subject} · ${material.title}`);option.value=material.id;select.append(option);
    });
    const choices=node('div','','focus-number-choices');choices.id='learning-removal-choices';
    const status=node('p');status.id='learning-removal-status';status.setAttribute('role','status');
    const removeButton=node('button','移除选中题目（0）');removeButton.type='button';removeButton.disabled=true;
    const confirm=node('section','','focus-confirm');confirm.id='learning-removal-confirm';confirm.hidden=true;
    const picked=new Set();let busy=false, confirmation=0;
    const refreshCount=()=>{removeButton.textContent=`移除选中题目（${picked.size}）`;removeButton.disabled=busy||!picked.size;};
    function renderChoices() {
      picked.clear();choices.replaceChildren();confirm.hidden=true;confirmation++;refreshCount();
      const material=api.get().materials.find(material=>material.id===select.value);
      if(!material)return;
      try {
        const all=entries(material), counts=new Map();all.forEach(entry=>counts.set(entry.number,(counts.get(entry.number)||0)+1));
        all.forEach(entry=>{
          const choice=node('label','','focus-number-choice'), input=node('input');input.type='checkbox';input.setAttribute('data-question-key',entry.key);input.setAttribute('data-question-number',String(entry.number));input.setAttribute('data-group-index',String(entry.groupIndex));
          input.addEventListener('change',()=>{if(input.checked)picked.add(entry.key);else picked.delete(entry.key);confirm.hidden=true;confirmation++;refreshCount();});
          choice.append(input,node('span',`第${entry.number}题${counts.get(entry.number)>1 ? `（原第${entry.groupIndex+1}组）` : ''}`));choices.append(choice);
        });
      }catch(error){status.textContent=error.message;}
    }
    select.addEventListener('change',()=>{status.textContent='';renderChoices();});
    removeButton.addEventListener('click',()=>{
      if(busy||!picked.size)return;
      const material=api.get().materials.find(material=>material.id===select.value);if(!material)return;
      const selected=[...picked], token=++confirmation, materialId=material.id;
      const numbers=entries(material).filter(entry=>picked.has(entry.key)).map(entry=>`第${entry.number}题（第${entry.groupIndex+1}组）`);
      confirm.replaceChildren(node('p','确定将以下题目从当前学习资料中移除吗？'),node('p',`${material.subject} · ${material.title}`),node('p',numbers.join('、')));
      const cancel=node('button','取消','secondary'), yes=node('button','确认移除');cancel.type=yes.type='button';yes.id='confirm-remove-learning-questions';
      cancel.addEventListener('click',()=>{confirm.hidden=true;confirmation++;});
      yes.addEventListener('click',()=>{
        if(busy||confirm.hidden||token!==confirmation||current!==generation||page.hidden)return;
        busy=true;yes.disabled=true;removeButton.disabled=true;
        try {
          api.save(next=>remove(next,materialId,selected));
          confirm.hidden=true;confirmation++;renderChoices();
          status.textContent=`已移除 ${selected.length} 道题目。`;
          global.PocketNavigation.remember({page:'learning-question-removal'});
        }catch(error){status.textContent='移除失败：'+error.message;}
        finally{busy=false;yes.disabled=false;refreshCount();}
      });
      confirm.append(cancel,yes);confirm.hidden=false;
    });
    page.append(label,select,choices,removeButton,confirm,status);return true;
  }
  global.PocketLearningQuestionRemoval=Object.freeze({entries,remove,open,attach:bridge=>{api=bridge;}});
  global.PocketNavigation?.register('learning-question-removal',open);
  global.document?.getElementById('learning-question-removal-entry')?.addEventListener('click',open);
})(globalThis);
