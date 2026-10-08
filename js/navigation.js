(function () {
  'use strict';
  const KEY = 'pocket-last-view-v1';
  const HISTORY_KEY = 'pocket-view-history-v1';
  const pages = new Set(['home','learning','listening','output-sop','training','practice']);
  let initial = {page:'learning'}, context = null, pocket = {page:'learning'};
  try {
    const saved = JSON.parse(localStorage.getItem(KEY) || 'null');
    if (saved && pages.has(saved.page)) initial = saved;
  } catch (_) {}
  const handlers = {};
  let last = initial, restoring = false, booting = true, goingBack = false, history = [];
  try {
    const saved = JSON.parse(localStorage.getItem(HISTORY_KEY) || '[]');
    if (Array.isArray(saved)) history = saved.filter(view => view && pages.has(view.page)).slice(-40);
  } catch (_) {}
  const signature = view => JSON.stringify([view.page,view.view,view.model,view.level,view.stage,view.method,
    view.outputPage || '',view.draftPage || '',view.subject,view.localDate,view.context,view.sourceContext]);
  function saveHistory() {
    try {localStorage.setItem(HISTORY_KEY,JSON.stringify(history));} catch (_) {}
    const back = document.getElementById('pocket-back-button'); if (back) back.disabled = !history.length;
  }
  function remember(view) {
    const base = ['home','learning','listening'].includes(view.page);
    const next = {...view,context,...(!base ? {underlying:pocket} : {})};
    if (!booting && !restoring && !goingBack && signature(last) !== signature(next)) {
      history.push(last); history = history.slice(-40); saveHistory();
    }
    last = next;
    if (['home','learning','listening'].includes(next.page)) pocket = next;
    if (!restoring && !booting) {
      try { localStorage.setItem(KEY,JSON.stringify(next)); } catch (_) {}
    }
  }
  function hideTools() {
    ['practice-tool','training-sop','output-sop'].forEach(id => {
      const node = document.getElementById(id); if (node) node.hidden = true;
    });
    const main = document.getElementById('pocket-main'); if (main) main.hidden = false;
  }
  function restore() {
    const sameContext = !initial.context || JSON.stringify(initial.context) === JSON.stringify(context);
    restoring = true;
    try {
      const handler = handlers[initial.page];
      if (handler && (initial.page === 'home' || sameContext)) {
        if (initial.underlying && ['home','learning','listening'].includes(initial.underlying.page)) {
          handlers[initial.underlying.page]?.(initial.underlying);
        }
        if (handler(initial) === false) handlers.learning?.({page:'learning'});
      } else handlers.learning?.({page:'learning'});
    } finally {
      restoring = false; booting = false; remember(last); saveHistory();
      if (sameContext && Number.isFinite(initial.scrollY)) window.scrollTo?.(0,Math.max(0,initial.scrollY));
      (sameContext ? initial.openDetails || [] : []).forEach(id => {
        const node = document.getElementById(id); if (node && node.tagName === 'DETAILS') node.open = true;
      });
    }
  }
  window.PocketNavigation = {
    remember, restore, hideTools, back: goBack,
    read: () => initial,
    pocket: () => pocket,
    setContext: value => {context=value;},
    register: (page,handler) => {handlers[page]=handler;}
  };
  const home = document.getElementById('pocket-home-button');
  home?.addEventListener('click', () => { hideTools(); handlers.home?.({page:'home'}); window.scrollTo?.(0,0); });
  const back = document.getElementById('pocket-back-button');
  back?.addEventListener('click',goBack);
  function goBack() {
    let previous = history.pop();
    if (previous?.page === 'learning' && previous.context && JSON.stringify(previous.context) !== JSON.stringify(context)) {
      if (previous.context.step === 'basic' && context?.step === 'grouping' && previous.context.materialId === context.materialId) {
        previous = {...previous,draftPage:'basic'};
      } else previous = {...previous,sourceContext:previous.sourceContext || previous.context};
    }
    if (!previous) {saveHistory();return;}
    goingBack = true;
    try {
      hideTools();
      if (previous.underlying && ['home','learning','listening'].includes(previous.underlying.page)) handlers[previous.underlying.page]?.(previous.underlying);
      handlers[previous.page]?.(previous);
      window.scrollTo?.(0,previous.scrollY || 0);
    } finally {goingBack = false;saveHistory();}
  }
  document.addEventListener?.('DOMContentLoaded',restore,{once:true});
  function checkpoint() {
    const openDetails = Array.from(document.querySelectorAll?.('details[id]') || []).filter(node => node.open).map(node => node.id);
    remember({...last,scrollY:window.scrollY || 0,openDetails});
  }
  window.addEventListener?.('pagehide',checkpoint);
  document.addEventListener?.('toggle',checkpoint,true);
  document.addEventListener?.('visibilitychange', () => {if (document.hidden) checkpoint();});
})();
