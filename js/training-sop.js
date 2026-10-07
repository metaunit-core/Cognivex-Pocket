(function () {
  'use strict';
  // SOP navigation restores the DOM; breakthrough explicitly starts a new material.
  const get = id => document.getElementById(id);
  const pocket = get('pocket-main');
  const practice = get('practice-tool');
  const entry = get('practice-readiness-button');
  const tool = document.createElement('main');
  tool.id = 'training-sop'; tool.className = 'practice-tool'; tool.hidden = true;
  document.body.append(tool);
  const key = 'pocket-training-sop-model-v1';
  const fields = ['status', 'purpose', 'parent', 'child', 'materials'];
  const labels = ['当前状态', '目的', '母链', '子链', '已有资料'];
  const template = "请根据我的「达标—能力链模型」为当前学习目的构建训练模型。\r\n\r\n【我的输入】\r\n\r\n① 当前状态：\r\n{当前状态}\r\n\r\n② 目的：\r\n{目的}\r\n\r\n③ 母链：\r\n{母链}\r\n\r\n④ 子链：\r\n{子链}\r\n\r\n⑤ 已有资料：\r\n{已有资料}\r\n\r\n\r\n【请严格按照以下逻辑分析】\r\n\r\n一、达标准\r\n\r\n进入一个学习目标以后，先说明：\r\n① 当前状态\r\n② 目的\r\n③ 已有资料\r\n\r\n然后确定：最终达标标准是什么？\r\n\r\n核心问题：\r\n如果我真的练成了，我应该能够独立做到什么？\r\n\r\n例如：\r\n知识点 → 脱离资料能熟练默写、口语化讲明白。\r\n题目 → 能在合理时间内独立、稳定、正确完成。\r\n\r\n\r\n二、能力链\r\n\r\n确定达标标准以后，再问：\r\n\r\n我要达到这个标准，\r\n背后需要哪些能力连续工作？\r\n\r\n母链：\r\n根据学习一个陌生学科时，\r\n从该学科对应的所有课程内容中，\r\n提纯出一条学科能力链。\r\n\r\n子链：\r\n针对该学科中具体的一门课程，\r\n提纯出当前课程能力链，\r\n并允许根据真实训练动态自适应修改。\r\n\r\n能力 A → 能力 B → 能力 C → …… → 最终表现\r\n\r\n每个能力节点说明：\r\n\r\n① 它解决现实中的什么问题？\r\n② 它锻炼什么核心能力？\r\n③ 它弱的时候，我实际会出现什么表现？\r\n\r\n\r\n三、最小补强操作\r\n\r\n结合：\r\n\r\n当前状态 + 已有资料 + 实际训练方式\r\n\r\n确定某个节点弱时：\r\n\r\n最小增加什么训练动作，\r\n就能直接训练这个能力？\r\n\r\n执行：\r\n\r\n找到断点\r\n→ 最小干预\r\n→ 马上重新输出验证。\r\n\r\n\r\n【最终输出格式】\r\n\r\n1. 当前目的\r\n2. 最终达标标准\r\n3. 母能力链\r\n4. 当前子能力链\r\n\r\n5. 各节点：\r\n- 解决什么现实问题\r\n- 锻炼什么能力\r\n- 弱时有什么表现\r\n- 利用现有资料的最小补强操作\r\n\r\n6. 当前最值得优先关注的能力节点\r\n\r\n7. 实际训练时如何使用这套模型\r\n\r\n\r\n要求：\r\n\r\n- 模型必须服务于实际学习\r\n- 不要为了理论完整增加不必要节点\r\n- 能力链允许以后根据真实训练动态修改\r\n- 输出尽量口语化、清晰、可直接执行";
  let scroll = 0, generated = '', view = 'overview';
  tool.innerHTML = `
    <button id="training-back" class="practice-back" type="button">← 返回 Pocket</button>
    <section id="training-overview" aria-labelledby="training-overview-title">
      <h1 id="training-overview-title" tabindex="-1">学习训练总纲</h1>
      <section class="practice-condition"><span class="practice-number">01</span><h2>构建学科能力链模型</h2><p>给后续刷题和检测建立能力锚点</p><button id="training-build" type="button">开始构建 →</button></section>
      <section class="practice-condition"><span class="practice-number">02</span><h2>大量刷题</h2><p>简单 / 边界 / 难题分组训练</p><button id="training-practice" type="button">进入大量刷题 →</button></section>
      <section class="practice-condition"><span class="practice-number">03</span><h2>模拟检测</h2><p>全真检测 → 找断点 → 专题突破</p><button id="training-simulation" type="button">查看检测 SOP →</button></section>
    </section>
    <section id="training-model" aria-labelledby="training-model-title" hidden>
      <span class="practice-number">01</span><h1 id="training-model-title" tabindex="-1">构建学科能力链模型</h1>
      <p class="practice-intro">讲义吃透后，为后续大量刷题和检测建立能力锚点。</p>
      <form id="training-form">${fields.map((field,i) => `<label for="training-${field}">${labels[i]}</label><textarea id="training-${field}" rows="4"></textarea>`).join('')}
        <p id="training-save-status" role="status" class="practice-intro"></p><button type="submit">生成能力链模型 →</button>
      </form>
    </section>
    <section id="training-prompt" aria-labelledby="training-prompt-title" hidden>
      <h1 id="training-prompt-title" tabindex="-1">能力链 Prompt 已生成</h1>
      <p class="practice-intro">进入 ChatGPT 后，自己点击输入框，粘贴后发送。</p>
      <button id="training-copy-open" type="button">复制并打开 ChatGPT</button>
      <button id="training-copy" class="practice-secondary" type="button">复制提示词</button>
      <p id="training-copy-status" role="status" class="practice-intro"></p>
      <a id="training-chatgpt-link" href="https://chatgpt.com/" target="_blank" rel="noopener noreferrer" hidden>打开 ChatGPT ↗</a>
      <button id="training-copy-again" class="practice-secondary" type="button">再次复制</button>
      <button id="training-edit" class="practice-back" type="button">返回修改</button>
      <details class="training-preview"><summary>查看完整提示词 / 手动复制</summary><textarea id="training-prompt-text" rows="14" readonly aria-label="完整能力链提示词"></textarea></details>
    </section>
    <section id="training-detection" aria-labelledby="training-detection-title" hidden>
      <span class="practice-number">03</span><h1 id="training-detection-title" tabindex="-1">模拟检测</h1><p class="practice-intro">目标：检验能力能不能真正转化成考试得分。</p>
      <section class="practice-condition"><span class="practice-number">01</span><h2>全真限时模拟</h2><p>按高考规定时间和真实答题环境，独立完成第一次见到的试卷。</p></section>
      <section class="practice-condition"><span class="practice-number">02</span><h2>考场思维复盘</h2><p>写小作文，还原：<br>当时怎么想？<br>哪里卡住？<br>为什么换路？<br>为什么没有换路？</p></section>
      <section class="practice-condition"><span class="practice-number">03</span><h2>能力链找断点</h2><p>把题目 + 作答 + 思维复盘交给 AI，对照「达标—能力链模型」，寻找最先出现的能力断点。</p><p class="practice-definition">必要时继续校准能力链模型，确定最小补强操作。</p></section>
      <section class="practice-condition"><span class="practice-number">04</span><h2>专题突破</h2><p>根据暴露出的断点，返回分组阶段，进行针对性训练。</p><p class="practice-definition">重点使用对应能力断点的最小补强操作。补强后重新进入模拟检测。</p></section>
      <section class="training-goal"><h2>最终看 3 件事</h2><p>01 · 会做的题<br>能不能又快又准？</p><p>02 · 第一次见到的题<br>能不能在高考规定时间和环境下稳定拿分？</p><p>03 · 达标—能力链模型<br>能不能越来越准确地定位断点，并指导下一步训练？</p></section>
      <p class="training-cycle">检测<br>↓<br>找断点<br>↓<br>专题突破<br>↓<br>再检测</p><button id="training-breakthrough" type="button">返回分组阶段 → 专题突破</button><button id="training-detection-overview" class="practice-back" type="button">← 返回学习训练总纲</button>
    </section>`;
  function show(name) {
    view = name; pocket.hidden = true; practice.hidden = true; tool.hidden = false;
    ['overview','model','prompt','detection'].forEach(v => { get('training-'+v).hidden = v !== name; });
    get('training-back').textContent = name === 'overview' ? '← 返回 Pocket' : '← 总纲';
    window.scrollTo(0,0); get('training-'+name+'-title').focus({preventScroll:true});
  }
  function returnToPocket() {
    tool.hidden = true; practice.hidden = true; pocket.hidden = false;
    entry.focus({preventScroll:true}); window.scrollTo(0,scroll);
  }
  const values = () => Object.fromEntries(fields.map(f => [f,get('training-'+f).value]));
  function save() {
    try { localStorage.setItem(key,JSON.stringify(values())); get('training-save-status').textContent = '已保存到本机'; }
    catch (_) { get('training-save-status').textContent = '本机保存失败；当前输入仍保留，请在离开或刷新前复制备份。'; }
  }
  try {
    const draft = JSON.parse(localStorage.getItem(key) || '{}');
    fields.forEach(f => { if (draft && typeof draft[f] === 'string') get('training-'+f).value = draft[f]; });
  } catch (_) { get('training-save-status').textContent = '无法读取本机草稿，请自行填写。'; }
  fields.forEach(f => get('training-'+f).addEventListener('input',save));
  entry.addEventListener('click',() => { scroll = window.scrollY; show('overview'); });
  get('training-back').addEventListener('click',() => view === 'overview' ? returnToPocket() : show('overview'));
  get('training-build').addEventListener('click',() => show('model'));
  get('training-practice').addEventListener('click',() => window.PocketPracticeReadiness.show('check'));
  get('training-simulation').addEventListener('click',() => show('detection'));
  get('training-breakthrough').addEventListener('click',() => {
    if (!window.PocketLearning.startNewMaterial()) return;
    returnToPocket();
    get('subject').focus({preventScroll:true});
    window.scrollTo(0,0);
  });
  get('training-detection-overview').addEventListener('click',() => show('overview'));
  get('training-edit').addEventListener('click',() => show('model'));
  get('training-form').addEventListener('submit',event => {
    event.preventDefault(); save(); const draft = values();
    // Replace once: placeholder-like user input remains literal text.
    generated = template.replace(/\{(当前状态|目的|母链|子链|已有资料)\}/g,(_,label) => draft[fields[labels.indexOf(label)]]);
    get('training-prompt-text').value = generated; get('training-copy-status').textContent = '';
    get('training-chatgpt-link').hidden = true; show('prompt');
  });
  async function copy(open) {
    const buttons = ['training-copy-open','training-copy','training-copy-again'].map(get);
    buttons.forEach(b => { b.disabled = true; });
    try {
      await navigator.clipboard.writeText(generated);
      get('training-copy-status').textContent = '已复制。请打开 ChatGPT，粘贴后发送。';
      get('training-chatgpt-link').hidden = false;
      if (open) { try { const tab = window.open('https://chatgpt.com/','_blank'); if (tab) tab.opener = null; } catch (_) {} }
    } catch (_) { get('training-copy-status').textContent = '复制失败。请重试，或展开完整提示词后手动复制。'; }
    finally { buttons.forEach(b => { b.disabled = false; }); }
  }
  get('training-copy-open').addEventListener('click',() => copy(true));
  get('training-copy').addEventListener('click',() => copy(false));
  get('training-copy-again').addEventListener('click',() => copy(false));
  window.PocketTrainingSOP = {show,returnToPocket};
})();
