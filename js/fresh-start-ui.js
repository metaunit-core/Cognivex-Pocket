(function (global) {
  'use strict';
  const pocketLocalStore = globalThis.PocketEnvironment.requireStorage();
  const get=id=>document.getElementById(id),button=get('fresh-start-submit'),input=get('fresh-start-confirmation'),status=get('fresh-start-status'),cancel=get('fresh-start-cancel');
  if(!button||!input||!status||!cancel)return;
  const unavailable = get('fresh-start-area').dataset?.unavailable === 'true';
  let working=false;
  const pending=()=>!!global.PocketCloudBackup?.freshStartMarker();
  function refresh(){button.disabled=unavailable||working||input.value!=='CLEAR';input.disabled=unavailable||working;cancel.hidden=!pending();cancel.disabled=working;button.textContent=unavailable?'清空功能暂时不可用':pending()?'重试清空并同步 Firebase':'确认清空并同步 Firebase';}
  input.addEventListener('input',refresh);
  for(const [id,target] of [['fresh-start-export-json','export-learning-backup'],['fresh-start-export-markdown','export-learning-archive']])get(id).addEventListener('click',()=>{if(!working&&!get(target).disabled){get('learning-backup-files').open=true;get(target).click();}});
  button.addEventListener('click',async()=>{
    if(unavailable){status.textContent='此删除功能暂时不可用，本机学习数据未改变。';return;}
    if(working||input.value!=='CLEAR')return;
    working=true;refresh();status.textContent='正在隔离旧任务并同步清空版本，请稍候…';
    try{
      if(!global.PocketClearAndRestart)throw Error('Firebase 尚未就绪，请稍后重试。');
      const result=await global.PocketClearAndRestart(input.value);
      status.textContent=result.message;
      if(result.reload)global.location.reload();
    }catch(error){status.textContent='清空未完成：'+error.message+(pending()?' 请保持原数据，输入 CLEAR 后重试；不需要重新配置 Firebase。':'');}
    finally{working=false;refresh();}
  });
  cancel.addEventListener('click',async()=>{
    if(working)return;working=true;refresh();
    try{await global.PocketCancelFreshStart();status.textContent='已取消，本机学习记录保留。云端如有变化请使用现有冲突处理。';}
    catch(error){status.textContent=error.message;}
    finally{working=false;refresh();}
  });
  if(pending()){get('fresh-start-area').open=true;status.textContent=unavailable?'上次清空流程尚未完成，保护日志保留；请先导出 JSON 并核查，勿手动移除暂停标记。':'上次清空同步未完成，旧数据上传已隔离。请登录原账号，输入 CLEAR 后重试。';}
  else{try{if(JSON.parse(pocketLocalStore.getItem('pocket-cloud-control-v1')||'null')?.freshStartCompletedAt)status.textContent='学习数据已清空，可以重新开始学习';}catch(_){} }
  refresh();
})(globalThis);
