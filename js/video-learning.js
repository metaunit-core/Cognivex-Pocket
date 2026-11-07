(function (global) {
  'use strict';
  const modes=Object.freeze({continuous:'连续看课',question:'逐题突破'});
  const routes=Object.freeze({
    continuous:Object.freeze(['连续观看完整视频。','快速标记重点、截图、录音。','关视频主动回忆。','独立重做或复现。','对标补漏。']),
    question:Object.freeze(['独立尝试当前题目。','标注自己的问题。','只看当前题对应的视频讲解。','关视频独立重做。','分析卡点，必要时提问 AI。','未掌握则继续对标与重做。','独立做对后进入下一题。'])
  });
  const guideSteps=Object.freeze({
    continuous:Object.freeze([
      {title:'连续观看完整视频',text:'连续观看完整视频，尽量做到不暂停太长时间'},
      {title:'标注重点、截图、录音',text:'在百度网盘标记功能快速标记、截图+录音收获或问题到onenote。'},
      {title:'回忆',text:'看完一个完整视频后，自己尝试主动回忆，想不出没关系，有这个动作就行'},
      {title:'独立重做',text:'看完并且回忆完一个完整视频，开始尝试一口气完整从第一道题开始做到最后一道题'},
      {title:'卡住的题目进入逐题突破',text:'做到哪道题有问题，做不了了，就进入到逐题突破的第一步攻克这道题'}
    ])
  });
  const guideStepCounts=Object.freeze({continuous:guideSteps.continuous.length,question:7});
  function validateGuidance(value) {
    if(value===undefined)return;
    if(!value || !Object.keys(modes).every(mode=>Number.isInteger(value[mode]) && value[mode]>=0 && value[mode]<guideStepCounts[mode]) || !Number.isSafeInteger(value.currentQuestion) || value.currentQuestion<1)throw Error('视频操作指导进度异常，原数据已保留。');
  }
  function records(state) {
    if(state.videoLearning===undefined)return [];
    const data=state.videoLearning;
    if(!data || data.version!==1 || !Array.isArray(data.records))throw Error('视频学习数据格式异常，原数据已保留。');
    validateGuidance(data.guidance);
    const ids=new Set();
    data.records.forEach(record=>{
      if(!record || typeof record.id!=='string' || !record.id || ids.has(record.id) || typeof record.title!=='string' || !record.title.trim() || typeof record.subject!=='string' || !Object.hasOwn(modes,record.mode) || !['learning','pending-grouping'].includes(record.status) || !Number.isSafeInteger(record.currentQuestion) || record.currentQuestion<1 || !record.modePositions || !Object.keys(routes).every(mode=>Number.isInteger(record.modePositions[mode]) && record.modePositions[mode]>=0 && record.modePositions[mode]<routes[mode].length) || !Array.isArray(record.links) || record.links.some(link=>!link || typeof link.url!=='string' || !link.url || typeof link.title!=='string') || ![record.createdAt,record.updatedAt].every(value=>Number.isFinite(value)&&value>=0) || !(record.completedAt===null || Number.isFinite(record.completedAt)&&record.completedAt>=0) || (record.status==='pending-grouping')!==(record.completedAt!==null))throw Error('视频学习记录格式异常，原数据已保留。');
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
    if(!Object.hasOwn(modes,input.mode))throw Error('请选择有效的学习模式。');
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
      if(!Object.hasOwn(modes,value))throw Error('请选择有效的学习模式。');
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
    return {...(state.videoLearning?.guidance || {continuous:0,question:0,currentQuestion:1})};
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
    state.videoLearning ||= {version:1,records:[]};
    state.videoLearning.guidance=current;
  }
  global.PocketVideoLearning=Object.freeze({modes,routes,records,find,create,update,groupingHandoff,guideSteps,progress,saveProgress});
})(globalThis);
