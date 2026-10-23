(function () {
  'use strict';
  const data = window.PocketOutputOperationalData;
  const modes = [['detailed', '详细引导'], ['brief', '简短提示'], ['independent', '独立执行']];
  const full = [['什么时候做？', 'trigger'], ['脑子里问什么？', 'question'], ['手上做什么？', 'action'], ['怎样算过关？', 'standard']];
  const brief = [['问', 'shortQuestion'], ['做', 'shortAction'], ['过关', 'shortStandard']];
  const states = [['idle', '○ 未开始'], ['doing', '◉ 进行中'], ['done', '✓ 已完成'], ['stuck', '! 卡住了']];
  let menuListeners;
  function el(tag, text, className) {
    const node = document.createElement(tag);
    if (text) node.textContent = text;
    if (className) node.className = className;
    return node;
  }
  function createSession() { return { mode: 'detailed', steps: new Map() }; }
  function mount(container, model, options = {}) {
    const session = options.session || createSession();
    const situations = options.situations === true;
    let mode = session.mode;
    const contents = [];
    const tracked = [];
    let openedMenu = null;
    menuListeners?.abort();
    menuListeners = new AbortController();
    function closeMenu() {
      if (!openedMenu) return;
      openedMenu.menu.hidden = true;
      openedMenu.statusButton.setAttribute('aria-expanded', 'false');
      openedMenu = null;
    }
    document.addEventListener('click', event => {
      if (openedMenu && !openedMenu.control.contains(event.target)) closeMenu();
    }, { signal: menuListeners.signal });
    document.addEventListener('keydown', event => {
      if (event.key === 'Escape' && openedMenu) {
        const button = openedMenu.statusButton;
        closeMenu(); button.focus();
      }
    }, { signal: menuListeners.signal });
    function setState(item, next) {
      if (next === 'doing' && item.state !== 'doing') {
        tracked.filter(other => other !== item && other.state === 'doing').forEach(other => {
          other.state = other.resting; other.update();
        });
        item.resting = item.state;
      }
      item.state = next;
      item.update();
    }
    container.replaceChildren();
    const title = el('h1', situations ? '当前情况导航' : data[model].title);
    title.tabIndex = -1;
    const controls = el('div', '', 'operational-modes');
    controls.setAttribute('role', 'group');
    controls.setAttribute('aria-label', '提示模式');
    const buttons = modes.map(([key, label]) => {
      const button = el('button', label, 'secondary');
      button.type = 'button';
      button.setAttribute('aria-pressed', String(key === mode));
      button.addEventListener('click', () => {
        if (key === mode) return;
        const top = button.getBoundingClientRect().top;
        mode = key;
        session.mode = mode;
        closeMenu();
        buttons.forEach((item, index) => item.setAttribute('aria-pressed', String(modes[index][0] === mode)));
        contents.forEach(item => item.render());
        // Reuse existing details nodes: mode changes retain open stages and current step.
        window.scrollBy?.(0, button.getBoundingClientRect().top - top);
      });
      controls.append(button);
      return button;
    });
    container.append(title);
    if (situations) container.append(el('p', '选择你现在遇到的情况，查看对应的训练操作。', 'practice-intro'));
    else if (options.onSituations) {
      const entry = el('button', '', 'output-situations-entry');
      entry.type = 'button';
      const icon = (compass) => {
        const ns = 'http://www.w3.org/2000/svg';
        const svg = document.createElementNS(ns, 'svg');
        svg.setAttribute('viewBox', '0 0 24 24');
        svg.setAttribute('fill', 'none'); svg.setAttribute('stroke', 'currentColor');
        svg.setAttribute('stroke-width', '1.8'); svg.setAttribute('stroke-linecap', 'round'); svg.setAttribute('stroke-linejoin', 'round');
        svg.setAttribute('aria-hidden', 'true'); svg.setAttribute('focusable', 'false');
        if (compass) {
          const circle = document.createElementNS(ns, 'circle');
          circle.setAttribute('cx', '12'); circle.setAttribute('cy', '12'); circle.setAttribute('r', '10');
          const needle = document.createElementNS(ns, 'path');
          needle.setAttribute('d', 'm16.2 7.8-2.4 6-6 2.4 2.4-6 6-2.4Z');
          svg.append(circle, needle);
        } else {
          const path = document.createElementNS(ns, 'path'); path.setAttribute('d', 'm9 6 6 6-6 6'); svg.append(path);
        }
        return svg;
      };
      const compass = el('span', '', 'situations-entry-compass'); compass.setAttribute('aria-hidden', 'true'); compass.append(icon(true));
      const text = el('span', '', 'situations-entry-text');
      text.append(el('strong', '当前情况导航 →'), el('span', '按遇到的情况，快速找到对应操作'));
      const arrow = el('span', '', 'situations-entry-arrow'); arrow.setAttribute('aria-hidden', 'true'); arrow.append(icon(false));
      entry.append(compass, text, arrow);
      entry.addEventListener('click', options.onSituations);
      container.append(entry);
    }
    container.append(controls, el('p', '步骤状态仅为本次练习的手动标记，不代表系统已验证掌握，也不计入训练记录。', 'data-management-help'));
    const situationSiblings = [];
    function steps(parent, nodes, siblings, stageItems, context) {
      nodes.forEach(step => {
        const card = el('details', '', 'operational-step');
        const prefix = situations ? 'situation-' : 'operational-';
        card.id = prefix + step.id;
        const summary = el('summary', situations ? '' : step.name);
        if (situations) {
          summary.append(el('span', step.trigger, 'situation-trigger'), el('small', context + ' · ' + step.name, 'situation-context'));
        }
        const body = el('div', '', 'operational-guidance');
        const shell = el('div', '', 'operational-step-shell');
        const control = el('div', '', 'operational-status-control');
        const statusButton = el('button', '', 'operational-status-button');
        statusButton.type = 'button';
        statusButton.setAttribute('aria-expanded', 'false');
        const menu = el('div', '', 'operational-status-menu');
        menu.id = prefix + 'status-' + step.id;
        menu.hidden = true;
        menu.setAttribute('role', 'group');
        menu.setAttribute('aria-label', step.name + '步骤状态');
        statusButton.setAttribute('aria-controls', menu.id);
        if (!session.steps.has(step.id)) session.steps.set(step.id, { state:'idle', resting:'idle' });
        const record = session.steps.get(step.id);
        const item = { get state() { return record.state; }, set state(value) { record.state = value; },
          get resting() { return record.resting; }, set resting(value) { record.resting = value; }, control, menu, statusButton, update() {
          const label = states.find(([key]) => key === item.state)[1];
          statusButton.textContent = label;
          statusButton.dataset.state = item.state;
          statusButton.setAttribute('aria-label', step.name + '：' + label + '，选择步骤状态');
          Array.from(menu.children).forEach((button, index) => button.setAttribute('aria-pressed', String(states[index][0] === item.state)));
          item.render();
        }, render(showFull = false) {
          body.replaceChildren();
          if (situations) {
            const inline = el('div', '', 'operational-modes situation-modes');
            inline.setAttribute('role', 'group'); inline.setAttribute('aria-label', step.name + '提示模式');
            modes.forEach(([key, label], index) => {
              const button = el('button', label, 'secondary'); button.type = 'button';
              button.setAttribute('aria-pressed', String(mode === key));
              button.addEventListener('click', () => {
                buttons[index].click();
                body.querySelectorAll('.situation-modes > button')[index]?.focus({ preventScroll: true });
              });
              inline.append(button);
            });
            body.append(inline);
          }
          function guidance(fields) {
            fields.forEach(([label, key]) => {
              const section = el('section');
              section.append(el('h3', label), el('p', step[key]));
              body.append(section);
            });
          }
          if (showFull) guidance(full);
          else if (mode === 'independent') {
            const reveal = el('button', '查看检查标准', 'secondary');
            reveal.type = 'button';
            reveal.setAttribute('aria-expanded', 'false');
            const check = el('div');
            check.hidden = true;
            check.id = prefix + 'check-' + step.id;
            reveal.setAttribute('aria-controls', check.id);
            full.forEach(([label, key]) => {
              const section = el('section');
              section.append(el('h3', label), el('p', step[key]));
              check.append(section);
            });
            reveal.addEventListener('click', () => {
              check.hidden = !check.hidden;
              reveal.textContent = check.hidden ? '查看检查标准' : '隐藏检查标准';
              reveal.setAttribute('aria-expanded', String(!check.hidden));
            });
            body.append(reveal, check);
          } else guidance(mode === 'brief' ? brief : full);
          if (item.state === 'stuck') {
            const help = el('aside', '', 'operational-stuck-help');
            help.append(el('p', '先明确卡在哪一步，再按本环节指导定点补强；必要时返回学路或知识点训练。'));
            const view = el('button', showFull ? '收起本环节详细指导' : '查看本环节详细指导', 'secondary');
            view.type = 'button';
            view.setAttribute('aria-expanded', String(showFull));
            view.addEventListener('click', () => item.render(!showFull));
            const retry = el('button', '重新尝试', 'secondary');
            retry.type = 'button';
            retry.addEventListener('click', () => setState(item, 'doing'));
            help.append(view, retry); body.append(help);
          }
        } };
        states.forEach(([key, label]) => {
          const choice = el('button', label);
          choice.type = 'button';
          choice.addEventListener('click', () => { closeMenu(); setState(item, key); statusButton.focus({ preventScroll: true }); });
          menu.append(choice);
        });
        statusButton.addEventListener('click', () => {
          if (openedMenu === item) { closeMenu(); return; }
          closeMenu(); menu.hidden = false; openedMenu = item;
          statusButton.setAttribute('aria-expanded', 'true');
          menu.classList.remove('operational-menu-above');
          if (menu.getBoundingClientRect().bottom > window.innerHeight && statusButton.getBoundingClientRect().top > menu.offsetHeight) menu.classList.add('operational-menu-above');
        });
        control.append(statusButton, menu);
        item.update(); contents.push(item); tracked.push(item); stageItems.push(item);
        // Close siblings synchronously on user expansion, avoiding delayed toggle races.
        summary.addEventListener('click', () => {
          if (!card.open) siblings.forEach(other => { if (other !== card) other.open = false; });
        });
        card.append(summary, body); siblings.push(card); shell.append(card, control); parent.append(shell);
      });
    }
    const situationStages = [];
    function situationGroup(title, className, siblings) {
      const group = el('details', '', className);
      const summary = el('summary', title);
      summary.addEventListener('click', () => {
        if (!group.open) siblings.forEach(other => { if (other !== group) other.open = false; });
      });
      group.append(summary); siblings.push(group);
      return group;
    }
    data[model].stages.forEach((stage, index) => {
      if (situations) {
        const section = situationGroup('①②③④⑤⑥⑦'[index] + ' ' + stage.title, 'situation-stage', situationStages);
        section.open = index === 0;
        const body = el('div', '', 'situation-stage-body');
        if (stage.methods.length) body.append(el('p', stage.note, 'data-management-help'));
        steps(body, stage.nodes, situationSiblings, [], stage.title.split('｜')[0]);
        const branches = [];
        stage.methods.forEach(method => {
          const branch = situationGroup('方式 ' + method.title + '（可选路线）', 'situation-branch', branches);
          steps(branch, method.nodes, situationSiblings, [], stage.title.split('｜')[0] + ' · ' + method.title);
          body.append(branch);
        });
        section.append(body);
        container.append(section);
        return;
      }
      const card = el('details', '', 'output-stage operational-stage');
      const summary = el('summary', `${String(index + 1).padStart(2, '0')} ${stage.title}`);
      const body = el('div', '', 'operational-stage-body');
      const memory = el('p', stage.memory, 'operational-memory');
      // Independent mode displays names only until an individual check is requested.
      const note = el('p', stage.note || '', 'output-purpose');
      const contextual = { render() { memory.hidden = mode === 'independent'; note.hidden = mode === 'independent' || !stage.note; } };
      contextual.render(); contents.push(contextual);
      body.append(memory, note);
      const siblings = [];
      const stageItems = [];
      const reset = el('button', '重置本阶段状态', 'secondary operational-reset');
      reset.type = 'button';
      reset.addEventListener('click', () => {
        closeMenu(); stageItems.forEach(item => { item.state = 'idle'; item.resting = 'idle'; item.update(); });
      });
      body.append(reset);
      steps(body, stage.nodes, siblings, stageItems);
      stage.methods.forEach(method => {
        const group = el('details', '', 'operational-method');
        group.append(el('summary', method.title));
        steps(group, method.nodes, siblings, stageItems);
        body.append(group);
      });
      card.append(summary, body); container.append(card);
    });
    title.focus({ preventScroll: true });
  }
  window.PocketOutputOperational = Object.freeze({ mount, createSession });
})();
