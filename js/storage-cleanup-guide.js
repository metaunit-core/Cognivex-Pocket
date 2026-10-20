(function (global) {
  'use strict';
  let page;
  const steps = [
    ['① 导出学习档案备份', '新增学习数据过多、需要清理空间时，先导出学习档案备份。'],
    ['② 清空本设备本地数据', '点击页面最下面的「清除本设备本地数据」按钮，清空当前设备的 Pocket 本地数据。'],
    ['③ 删除 Firebase 所有内容', '返回 Firebase，删除 Pocket 对应的所有云端备份内容。'],
    ['④ 查看删除功能指导', '返回 Pocket →「② 备份与导出」→「删除功能指导」，按照现有指导完成相关操作。'],
    ['⑤ 重新开始 Firebase 备份', '点击「② 备份与导出」中的「重新开始 Firebase 备份」，重新启用备份。']
  ];
  function element(tag, text) {
    const node = global.document.createElement(tag); node.textContent = text; return node;
  }
  function open() {
    if (!page) {
      page = element('main', ''); page.id = 'storage-cleanup-guide'; page.className = 'practice-tool';
      const back = element('button', '← 返回'); back.type = 'button'; back.className = 'practice-back';
      back.addEventListener('click', () => global.PocketNavigation.back());
      const title = element('h1', '本地数据空间清理流程'); title.tabIndex = -1;
      page.append(back, title, element('h2', '空间清理指引'));
      steps.forEach(([heading, text]) => {
        const section = element('section', ''); section.className = 'practice-condition';
        section.append(element('h2', heading), element('p', text)); page.append(section);
      });
      global.document.body.append(page);
    }
    global.PocketNavigation.hideTools();
    global.document.getElementById('pocket-main').hidden = true; page.hidden = false;
    global.PocketNavigation.remember({ page: 'storage-cleanup-guide' });
    global.scrollTo?.(0, 0); page.querySelector('h1').focus({ preventScroll: true });
  }
  global.document.getElementById('storage-cleanup-guide-entry')?.addEventListener('click', () => {
    global.PocketNavigation.remember({ ...global.PocketNavigation.pocket(), scrollY: global.scrollY || 0 });
    open();
  });
  global.PocketNavigation.register('storage-cleanup-guide', open);
})(globalThis);
