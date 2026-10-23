(function () {
  'use strict';
  // View-only navigation: no learning storage, executor or scheduler calls.
  const data = window.PocketOutputSOPData;
  let tool, model, hub, list, detail, operational, situations, back, origin, originScroll = 0, modelScroll = 0, listScroll = 0, detailScroll = 0;
  let level = 'list';
  let stageIndex = null, methodIndex = null;
  const entries = {};
  const operationalSessions = {};
  function operationalSession() {
    return operationalSessions[model] ||= window.PocketOutputOperational.createSession();
  }
  function rememberView() {
    // Keep legacy stage offsets (heading + subtitle) independent of the new entry card.
    window.PocketNavigation?.remember({page:'output-sop',model,level,stage:stageIndex,method:methodIndex,scrollY:window.scrollY || 0,
      expanded:Array.from(list.children).filter(node => node.tagName === 'DETAILS').map((node,index) => node.open ? index + 2 : null).filter(index => index !== null)});
  }
  const el = (tag, text, className) => {
    const result = document.createElement(tag);
    if (text) result.textContent = text;
    if (className) result.className = className;
    return result;
  };
  function button(text, action, className = 'practice-secondary') {
    const result = el('button', text, className);
    result.type = 'button'; result.addEventListener('click', action);
    return result;
  }
  function focusTitle(view) {
    const title = view.querySelector('h1');
    title.tabIndex = -1; title.focus({preventScroll:true});
  }
  function notes(container, sections) {
    sections.forEach(note => {
      const section = el('section', '', 'output-note');
      section.append(el('h2', note.title));
      note.items.forEach(item => section.append(el('p', item)));
      container.append(section);
    });
  }
  function renderDetail(stage, method = false) {
    if (method) methodIndex = data.methods.indexOf(stage);
    else { stageIndex = data[model].stages.indexOf(stage); methodIndex = null; }
    detail.replaceChildren();
    detail.append(el('h1', stage.title), el('p', stage.chain, 'practice-intro'), el('p', stage.purpose, 'output-purpose'));
    stage.nodes.forEach((node, index) => {
      const section = el('section', '', 'output-node');
      section.append(el('span', String(index + 1).padStart(2,'0'), 'practice-number'), el('h2', node.name));
      [['最简操作',node.operation],['最核心提问',node.question]].forEach(([label,text]) => {
        const p = el('p'); p.append(el('strong', label + '：'), document.createTextNode(text)); section.append(p);
      });
      detail.append(section);
    });
    notes(detail, stage.notes);
    if (!method && model === 'knowledge' && stage === data.knowledge.stages[1]) {
      data.methods.forEach(item => detail.append(button(item.title + ' →', () => {
        detailScroll = window.scrollY;
        renderDetail(item, true);
      })));
    }
    if (!method && model === 'problems' && stage === data.problems.stages[2]) {
      const section = el('section', '', 'output-note');
      const prompt = el('textarea'); prompt.value = data.aiPrompt; prompt.readOnly = true; prompt.rows = 18;
      prompt.setAttribute('aria-label','完整 AI 固定提问');
      const status = el('p'); status.setAttribute('role','status');
      const copy = button('复制 AI 提问', async () => {
        try { await navigator.clipboard.writeText(data.aiPrompt); status.textContent = '已复制完整 AI 提问。'; }
        catch (_) { prompt.focus(); prompt.select(); status.textContent = '复制失败，已选中完整模板，请手动复制。'; }
      });
      section.append(el('h2','AI 固定提问'), el('p',data.aiPrompt,'output-prompt'),copy,status,prompt);
      detail.append(section);
    }
    level = method ? 'method' : 'detail';
    hub.hidden = true; list.hidden = true; detail.hidden = false;
    back.textContent = method ? '← 返回中标准' : '← 返回阶段列表';
    window.scrollTo(0,0); focusTitle(detail);
    rememberView();
  }
  function returnToList() {
    if (situations) situations.hidden = true;
    if (operational) operational.hidden = true;
    hub.hidden = true; detail.hidden = true; list.hidden = false; level = 'list'; back.textContent = '← 返回' + data[model].title;
    window.scrollTo(0,listScroll);
    list.querySelector('details[open] button')?.focus({preventScroll:true});
    rememberView();
  }
  function returnToModel() {
    if (situations) situations.hidden = true;
    if (operational) operational.hidden = true;
    list.hidden = true; detail.hidden = true; hub.hidden = false;
    level = 'model'; back.textContent = '← 返回 OUTPUT';
    window.scrollTo(0, modelScroll); rememberView();
  }
  function openMethodology() {
    modelScroll = window.scrollY; rememberView();
    returnToList(); window.scrollTo(0,0); focusTitle(list); rememberView();
  }
  function openOperational() {
    modelScroll = window.scrollY;
    rememberView();
    if (!operational) { operational = el('section'); operational.id = 'output-operational-view'; tool.append(operational); }
    if (situations) situations.hidden = true;
    hub.hidden = true; list.hidden = true; detail.hidden = true; operational.hidden = false;
    level = 'operational'; back.textContent = '← 返回' + data[model].title;
    window.PocketOutputOperational.mount(operational, model, { session: operationalSession(), onSituations: openSituations });
    window.scrollTo(0,0); rememberView();
  }
  function openSituations() {
    rememberView();
    if (!situations) { situations = el('section'); situations.id = 'output-situations-view'; tool.append(situations); }
    hub.hidden = true; list.hidden = true; detail.hidden = true;
    if (operational) operational.hidden = true;
    situations.hidden = false;
    level = 'situations'; back.textContent = '← 返回可操作版';
    window.PocketOutputOperational.mount(situations, model, { session: operationalSession(), situations: true });
    window.scrollTo(0,0); rememberView();
  }
  function open(name, entry) {
    model = name; origin = entry; originScroll = window.scrollY; modelScroll = 0; listScroll = 0;
    if (!tool) {
      tool = el('main', '', 'practice-tool output-sop'); tool.id = 'output-sop'; tool.hidden = true;
      back = button('← 返回 OUTPUT', () => {
        if (window.PocketNavigation) {window.PocketNavigation.back();return;}
        if (level === 'method') {
          renderDetail(data.knowledge.stages[1]); window.scrollTo(0,detailScroll);
        } else if (level === 'detail') returnToList();
        else if (level === 'situations') openOperational();
        else if (level === 'list' || level === 'operational') returnToModel();
        else {
          tool.hidden = true; document.getElementById('pocket-main').hidden = false;
          origin.focus({preventScroll:true}); window.scrollTo(0,originScroll);
          window.PocketNavigation?.remember(window.PocketNavigation.pocket());
        }
      }, 'practice-back');
      list = el('section'); list.id = 'output-methodology-view';
      detail = el('section'); hub = el('section'); hub.id = 'output-model-home';
      tool.append(back,list,detail,hub); document.body.append(tool);
    }
    hub.replaceChildren(); hub.append(el('h1',data[name].title),el('p',data[name].subtitle,'practice-intro'));
    const modelTitle = name === 'problems' ? '做题' : '知识点';
    list.replaceChildren(); list.append(el('h1',modelTitle + ' OUTPUT｜方法论版'),el('p',data[name].subtitle,'practice-intro'));
    if (window.PocketOutputOperational) {
      const entry = button('', openOperational, 'output-version-entry output-operational-entry');
      entry.append(el('strong',window.PocketOutputOperationalData[name].title),el('span','从详细引导，到简短提示，再到独立执行'),el('span','→','operational-arrow'));
      hub.append(entry);
    }
    const methodology = button('', openMethodology, 'output-version-entry output-methodology-entry');
    methodology.append(el('strong',modelTitle + ' OUTPUT｜方法论版'),el('span','查看原来的完整' + modelTitle + '训练方法'),el('span','→','operational-arrow'));
    hub.append(methodology);
    data[name].stages.forEach((stage,index) => {
      const card = el('details', '', 'output-stage');
      card.addEventListener('toggle', () => { if (!tool.hidden && !list.hidden) rememberView(); });
      const summary = el('summary');
      summary.append(el('span',String(index + 1).padStart(2,'0'),'practice-number'),el('span',stage.title,'output-stage-title'),el('span',stage.chain,'output-chain'));
      card.append(summary,el('p',stage.chain,'output-purpose'),el('p',stage.purpose,'output-purpose'),button('详细操作 →',() => {
        listScroll = window.scrollY; rememberView(); renderDetail(stage);
      }));
      list.append(card);
    });
    if (name === 'problems') {
      const cycle = el('details','','output-stage'); cycle.append(el('summary','完整训练闭环'));
      cycle.addEventListener('toggle', () => { if (!tool.hidden && !list.hidden) rememberView(); });
      data.cycle.forEach(text => cycle.append(el('p',text,'output-purpose'))); list.append(cycle);
    }
    document.getElementById('pocket-main').hidden = true; tool.hidden = false;
    returnToModel(); focusTitle(hub);
  }
  function createEntries() {
    const container = el('div','','output-entries');
    [['problems','做题','七阶段训练：自探 → 学路 → 内化 → 提炼 → 创题 → 复现 → 验收'],['knowledge','知识点','三个达标层次：独立复述 → 独立生成 → 熟练调用']].forEach(([name,title,description]) => {
      const entry = button('', () => open(name,entry), 'output-entry');
      entries[name] = entry;
      entry.append(el('strong',title),el('span',description)); container.append(entry);
    });
    return container;
  }
  window.PocketOutputSOP = {createEntries};
  window.PocketNavigation?.register('output-sop',saved => {
    if (!entries[saved.model] || !data[saved.model]) return false;
    open(saved.model,entries[saved.model]);
    const cards = Array.from(list.children).filter(node => node.tagName === 'DETAILS');
    (saved.expanded || []).forEach(index => { if (Number.isInteger(index) && cards[index - 2]) cards[index - 2].open = true; });
    if (saved.level === 'detail' && data[model].stages[saved.stage]) renderDetail(data[model].stages[saved.stage]);
    else if (saved.level === 'method' && model === 'knowledge' && data.methods[saved.method]) renderDetail(data.methods[saved.method],true);
    else if (saved.level === 'operational' && window.PocketOutputOperational) openOperational();
    else if (saved.level === 'situations' && window.PocketOutputOperational) openSituations();
    else if (saved.level === 'list') returnToList();
    rememberView();
  });
})();
