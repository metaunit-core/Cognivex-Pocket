(function (global) {
  'use strict';
  let page;
  const sections = [
    ['① 电脑｜开发环境', ['电脑用于开发、修改、调试和测试 Cognivex Pocket 新代码。', '电脑 localhost 测试环境与正式学习环境隔离。', '电脑测试数据不上传 Firebase，不作为正式学习数据积累。', '注意：环境隔离依据是网站运行环境，而不是单纯依据设备类型。电脑打开正式 GitHub Pages 网站仍属于正式环境。']],
    ['② iPad｜正式学习环境', ['iPad 是实际学习和积累学习数据的主要设备。', '使用自由笔记、百度网盘、B站等工具做题、阅读资料和观看课程。', '使用 Pocket 查看任务、完成分组、记录学习进度及执行复习。', '正式学习数据保存在当前浏览器本地，并通过现有 Firebase 自动备份机制尝试备份。', 'Firebase 自动备份不等于多设备实时同步。']],
    ['③ 手机｜ChatGPT 辅助理解', ['手机主要用于查看 Pocket 提供的复盘指令，并向 ChatGPT 提问。', '与 ChatGPT 反复对话，弄懂知识、解题思路、错误原因及关键转折。', 'ChatGPT 负责辅助理解，不代替独立思考。']],
    ['④ 自由笔记｜独立输出', ['向 ChatGPT 提问弄懂后，放下手机。', '回到 iPad 的自由笔记，在不看 ChatGPT 提示和聊天记录的情况下，独立写出自己的理解、关键思路和简单心得。', '如果写不出来，就重新定位没有弄懂的地方，补强后再次独立输出。', '不要直接复制、粘贴 ChatGPT 聊天记录作为自己的学习笔记。']]
  ];
  const highlighted = new Set([sections[2][1][0], sections[3][1][0], sections[3][1][1], sections[3][1][3]]);
  function element(tag, text) {
    const node = global.document.createElement(tag);
    node.textContent = text;
    return node;
  }
  function open() {
    if (!page) {
      page = element('main', ''); page.id = 'device-principles'; page.className = 'practice-tool';
      const back = element('button', '← 返回'); back.type = 'button'; back.className = 'practice-back';
      back.addEventListener('click', () => global.PocketNavigation.back());
      const title = element('h1', '设备分工与学习原则'); title.tabIndex = -1;
      page.append(back, title);
      sections.forEach(([heading, paragraphs]) => {
        const section = element('section', ''); section.className = 'practice-condition'; section.append(element('h2', heading));
        paragraphs.forEach(text => {
          const paragraph = element('p', text);
          if (highlighted.has(text)) {
            paragraph.className = 'device-principles-highlight';
            paragraph.textContent = ''; paragraph.append(element('strong', text));
          }
          section.append(paragraph);
        });
        page.append(section);
      });
      const flow = element('section', '');
      const sequence = element('p', ''); sequence.append(element('strong', 'Pocket 查看任务 → iPad 独立做题 → 手机 ChatGPT 提问弄懂 → 放下手机 → 自由笔记独立输出 → Pocket 记录与复习 → 下一组'));
      const principle = element('p', '核心原则：'); principle.append(element('strong', 'AI 帮我弄懂，我自己脱离提示独立复现。'));
      flow.append(sequence, principle); page.append(flow); global.document.body.append(page);
    }
    global.PocketNavigation.hideTools();
    global.document.getElementById('pocket-main').hidden = true; page.hidden = false;
    global.PocketNavigation.remember({ page: 'device-principles' });
    global.scrollTo?.(0, 0); page.querySelector('h1').focus({ preventScroll: true });
  }
  global.document.getElementById('device-principles-entry')?.addEventListener('click', () => {
    global.PocketNavigation.remember({ ...global.PocketNavigation.pocket(), scrollY: global.scrollY || 0 });
    open();
  });
  global.PocketNavigation.register('device-principles', open);
})(globalThis);
