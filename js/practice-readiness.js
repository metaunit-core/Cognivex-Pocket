(function () {
  'use strict';
  // Temporary presentation only. Never accesses Pocket state, sessions or storage.
  const pocket = document.getElementById('pocket-main');
  const tool = document.getElementById('practice-tool');
  const views = {
    check: [document.getElementById('practice-check'), document.getElementById('practice-check-title')],
    ready: [document.getElementById('practice-ready-result'), document.getElementById('practice-ready-title')],
    notReady: [document.getElementById('practice-not-ready-result'), document.getElementById('practice-not-ready-title')]
  };
  let view = 'pocket';

  function showView(name) {
    view = name;
    pocket.hidden = true;
    tool.hidden = false;
    document.getElementById('training-sop').hidden = true;
    Object.entries(views).forEach(([key, [section]]) => { section.hidden = key !== view; });
    window.scrollTo(0, 0);
    views[name][1].focus({ preventScroll: true });
  }
  document.getElementById('practice-ready').addEventListener('click', () => showView('ready'));
  document.getElementById('practice-not-ready').addEventListener('click', () => showView('notReady'));
  document.getElementById('practice-back').addEventListener('click', () => window.PocketTrainingSOP.show('overview'));
  document.getElementById('practice-to-simulation').addEventListener('click', () => window.PocketTrainingSOP.show('detection'));
  ['practice-ready-return', 'practice-not-ready-return'].forEach(id => {
    document.getElementById(id).addEventListener('click', () => window.PocketTrainingSOP.returnToPocket());
  });
  window.PocketPracticeReadiness = { show: showView };
})();
