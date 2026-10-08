(function () {
  'use strict';
  const KEY = 'pocket-last-view-v1';
  const pages = new Set(['home','learning','listening','output-sop','training','practice']);
  let initial = {page:'learning'}, context = null, pocket = {page:'learning'};
  try {
    const saved = JSON.parse(localStorage.getItem(KEY) || 'null');
    if (saved && pages.has(saved.page)) initial = saved;
  } catch (_) {}
  const handlers = {};
  let last = initial, restoring = false;
  function remember(view) {
    const base = ['home','learning','listening'].includes(view.page);
    const next = {...view,context,...(!base ? {underlying:pocket} : {})};
    last = next;
    if (['home','learning','listening'].includes(next.page)) pocket = next;
    if (!restoring) {
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
      restoring = false; remember(last);
      if (sameContext && Number.isFinite(initial.scrollY)) window.scrollTo?.(0,Math.max(0,initial.scrollY));
      (sameContext ? initial.openDetails || [] : []).forEach(id => {
        const node = document.getElementById(id); if (node && node.tagName === 'DETAILS') node.open = true;
      });
    }
  }
  window.PocketNavigation = {
    remember, restore, hideTools,
    read: () => initial,
    pocket: () => pocket,
    setContext: value => {context=value;},
    register: (page,handler) => {handlers[page]=handler;}
  };
  const home = document.getElementById('pocket-home-button');
  home?.addEventListener('click', () => { hideTools(); handlers.home?.({page:'home'}); window.scrollTo?.(0,0); });
  document.addEventListener?.('DOMContentLoaded',restore,{once:true});
  function checkpoint() {
    const openDetails = Array.from(document.querySelectorAll?.('details[id]') || []).filter(node => node.open).map(node => node.id);
    remember({...last,scrollY:window.scrollY || 0,openDetails});
  }
  window.addEventListener?.('pagehide',checkpoint);
  document.addEventListener?.('toggle',checkpoint,true);
  document.addEventListener?.('visibilitychange', () => {if (document.hidden) checkpoint();});
})();
