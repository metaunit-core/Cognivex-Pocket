(function (global) {
  'use strict';
  const modes=Object.freeze({intro:'整章速通',continuous:'分段看＋独立重做',question:'逐题突破'});
  const routes=Object.freeze({
    continuous:Object.freeze(['连续观看完整视频。','快速标记重点、截图、录音。','关视频主动回忆。','独立重做或复现。','对标补漏。']),
    question:Object.freeze(['独立尝试当前题目。','标注自己的问题。','只看当前题对应的视频讲解。','关视频独立重做。','分析卡点，必要时提问 AI。','未掌握则继续对标与重做。','独立做对后进入下一题。'])
  });
  const guideSteps=Object.freeze({
    intro:Object.freeze([
      {title:'第一步：完整观看视频',text:'连续看完当前章节的视频，尽量不暂停、不重做，先了解本章节的知识和题型。\n\n视频过多时\n\n当前章节视频过多可分一批看完几个视频后进入阶段2/3，又回到阶段一解决当前章节的下一批视频。'},
      {title:'收获速记与问题筛选',text:'阶段一｜收获速记与问题筛选\n\n① 有收获 → 判断是否值得记录\n\n- 值得记录 → 截图＋OneNote 简短录音，继续看课。\n- 不需要记录 → 直接跳过，继续看课。\n\n② 有问题 → 判断是否影响继续听课\n\n问自己：不解决这个问题，会不会影响我听懂老师后面的讲解？\n\n- 会影响，而且重要 → 截图问 AI → AI 出题 → 口述回答并解释理由 → AI 判断 → 标记「阶段2重新检测」→ 继续看课。\n- 不影响，或只是小疑问 → 简单标记，阶段二再处理 → 继续看课。\n\n阶段一原则：不保存 AI 检测题，不深入研究，尽量保持连续看课。\n\n一句话心得：有收获就判断值不值得记，有问题就判断影不影响继续听课；该记就记，该问才问，其余快速通过。'},
      {title:'完成 0 基础学习',text:'当前章节的所有视频（多的分批）已经速通完成，马上进入阶段2分段看＋重做本章节的第一个视频。'}
    ]),
    continuous:Object.freeze([
      {title:'视频分段看',text:'把当前章节内的第一个视频的内容，进度条分成几部分，点击下一步操作看＋重做。'},
      {title:'出题检测与解决标记',text:'① 找到标记\n\n重点查看阶段一标记了「阶段2重新检测」的讲义笔记，以及尚未解决的疑问。\n\n② 重新出题\n\n再次复制对应笔记给 AI，让 AI 直接出题。\n\n自己先口述回答、解释理由，再让 AI 判断是否真正理解。\n\n③ 深入理解\n\n向 AI 提问：\n\n「根据笔记内容，出几道关键的题目让我可以透彻理解笔记的。」\n\n自己尝试回答，遇到不理解的地方，继续向 AI 提问，直到能够独立解释。\n\n④ 保存题目\n\n将值得保留的 AI 检测题目与答案解析复制到对应讲义笔记旁边。\n\n重点提示：\n\n- 题目集中放在上方。\n- 参考答案与解析集中放在最下方。\n- 方便以后遮住答案，独立检测和复习重做。\n\n完成标准：\n\n阶段一标记的问题已经重新检测；重要疑问能够独立解释；值得复习的关键问题已保存。\n\n补充说明：\n\n如果当前分段没有需要重新检测的标记，也没有值得深入理解的关键笔记，可以直接跳过本步骤，进入独立重做。'},
      {title:'独立重做',text:'看完并且回忆当前分段视频内容，开始尝试一口气完整从第一道题开始做到分段看的最后一道题。\n没有问题的题目，拉倍速或者拉进度条看视频，有问题的进入逐题突破'},
      {title:'卡住的题目进入逐题突破',text:'做到哪道题有问题，做不了了，就进入到逐题突破的第一步攻克这道题'}
    ])
  });
  const guideStepCounts=Object.freeze({intro:guideSteps.intro.length,continuous:guideSteps.continuous.length,question:7});
  function validateGuidance(value) {
    if(value===undefined)return;
    if(!value || (value.intro!==undefined && (!Number.isInteger(value.intro) || value.intro<0 || value.intro>=guideStepCounts.intro)) || (value.questionStepVersion!==undefined && ![2,3].includes(value.questionStepVersion)) || !Object.keys(routes).every(mode=>Number.isInteger(value[mode]) && value[mode]>=0 && value[mode]<(mode==='continuous'?routes.continuous.length:mode==='question' && value.questionStepVersion===2?8:guideStepCounts[mode])) || !Number.isSafeInteger(value.currentQuestion) || value.currentQuestion<1)throw Error('视频操作指导进度异常，原数据已保留。');
  }
  function records(state) {
    if(state.videoLearning===undefined)return [];
    const data=state.videoLearning;
    if(!data || data.version!==1 || !Array.isArray(data.records))throw Error('视频学习数据格式异常，原数据已保留。');
    validateGuidance(data.guidance);
    const ids=new Set();
    data.records.forEach(record=>{
      if(!record || typeof record.id!=='string' || !record.id || ids.has(record.id) || typeof record.title!=='string' || !record.title.trim() || typeof record.subject!=='string' || !Object.hasOwn(routes,record.mode) || !['learning','pending-grouping'].includes(record.status) || !Number.isSafeInteger(record.currentQuestion) || record.currentQuestion<1 || !record.modePositions || !Object.keys(routes).every(mode=>Number.isInteger(record.modePositions[mode]) && record.modePositions[mode]>=0 && record.modePositions[mode]<routes[mode].length) || !Array.isArray(record.links) || record.links.some(link=>!link || typeof link.url!=='string' || !link.url || typeof link.title!=='string') || ![record.createdAt,record.updatedAt].every(value=>Number.isFinite(value)&&value>=0) || !(record.completedAt===null || Number.isFinite(record.completedAt)&&record.completedAt>=0) || (record.status==='pending-grouping')!==(record.completedAt!==null))throw Error('视频学习记录格式异常，原数据已保留。');
      ids.add(record.id);
    });
    return data.records;
  }
  function find(state,id) {
    const record=records(state).find(item=>item.id===id);
    if(!record)throw Error('视频记录不存在，请返回列表核实。');
    return record;
  }
  function metadata(input) {
    if(typeof input.title!=='string' || !input.title.trim())throw Error('请填写视频名称。');
    const url=global.PocketExternalLinks.normalizeUri(input.url);
    if(url && !global.PocketExternalLinks.canNavigate(url))throw Error('视频链接不安全，未保存。');
    return {title:input.title.trim(),subject:typeof input.subject==='string'?input.subject.trim():'',links:url?[{title:'打开视频链接',url}]:[]};
  }
  function create(state,input) {
    const existing=records(state),data=metadata(input);
    if(!Object.hasOwn(routes,input.mode))throw Error('请选择有效的学习模式。');
    let id;
    do{id='video-'+global.crypto.randomUUID();}while(existing.some(record=>record.id===id));
    const now=Date.now();
    state.videoLearning ||= {version:1,records:[]};
    state.videoLearning.records.push({id,...data,mode:input.mode,status:'learning',currentQuestion:1,modePositions:{continuous:0,question:0},createdAt:now,updatedAt:now,completedAt:null});
    return id;
  }
  function update(state,id,action,value) {
    const record=find(state,id);
    if(action==='metadata')Object.assign(record,metadata(value));
    else if(action==='mode'){
      if(!Object.hasOwn(routes,value))throw Error('请选择有效的学习模式。');
      record.mode=value;
    }else if(action==='position'){
      if(!Number.isInteger(value) || value<0 || value>=routes[record.mode].length)throw Error('操作位置无效。');
      record.modePositions[record.mode]=value;
    }else if(action==='question'){
      if(!Number.isSafeInteger(value) || value<1)throw Error('题号必须为不小于 1 的整数。');
      record.currentQuestion=value;
    }else if(action==='complete'){
      if(record.status==='pending-grouping')return;
      record.status='pending-grouping';record.completedAt=Date.now();
    }else throw Error('不支持的视频学习操作。');
    record.updatedAt=Date.now();
  }
  function groupingHandoff(state,id) {
    const record=find(state,id);
    if(record.status!=='pending-grouping')throw Error('请先手动标记视频学习已完成。');
    return {status:'not-connected',videoId:record.id,title:record.title,subject:record.subject,links:JSON.parse(JSON.stringify(record.links))};
  }
  function progress(state) {
    records(state);
    const saved=state.videoLearning?.guidance;
    let question=saved?.question ?? 0;
    if(saved && saved.questionStepVersion!==3){
      if(saved.questionStepVersion===undefined && question>=4)question++;
      if(question>=3)question--;
    }
    return {intro:saved?.intro ?? 0,continuous:[0,1,1,2,3][saved?.continuous ?? 0],question,currentQuestion:saved?.currentQuestion ?? 1};
  }
  function saveProgress(state,mode,action,value) {
    const current=progress(state);
    if(!Object.hasOwn(modes,mode))throw Error('请选择有效的学习模式。');
    if(action==='step'){
      if(!Number.isInteger(value) || value<0 || value>=guideStepCounts[mode])throw Error('步骤位置无效。');
      current[mode]=value;
    }else if(action==='question' && mode==='question'){
      if(!Number.isSafeInteger(value) || value<1)throw Error('题号必须为不小于 1 的整数。');
      current.currentQuestion=value;
    }else throw Error('不支持的操作指导更新。');
    if(mode!=='intro' && state.videoLearning?.guidance?.intro===undefined)delete current.intro;
    state.videoLearning ||= {version:1,records:[]};
    state.videoLearning.guidance={...current,continuous:[0,1,3,4][current.continuous],questionStepVersion:3};
  }
  global.PocketVideoLearning=Object.freeze({modes,routes,records,find,create,update,groupingHandoff,guideSteps,progress,saveProgress});
})(globalThis);
