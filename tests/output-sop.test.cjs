// Isolated DOM/storage acceptance tests; never touches real browser data.
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const source = fs.readFileSync(path.join(__dirname,'executor.test.cjs'),'utf8');
const checks = `
Element.prototype.focus = function() { this.focused = true; };
Element.prototype.select = function() { this.selected = true; };
Element.prototype.querySelector = function(selector) {
  if (selector === 'h1') return walk(this).find(n => n.tag === 'h1');
  if (selector === 'details[open] button') return walk(this).find(n => n.tag === 'details' && n.open)?.children.find(n => n.tag === 'button');
};
function mountOutput(target) {
  target.document.body = new Element('body');
  target.nodes['pocket-main'] = new Element('main');
  target.document.createTextNode = value => { const node = new Element('#text'); node.textContent = value; return node; };
  target.context.scrollY = 180;
  target.context.scrollTo = (_,y) => { target.scroll = y; };
  const find = target.document.getElementById;
  target.document.getElementById = id => find(id) || walk(target.document.body).find(n => n.id === id);
  target.context.navigator = {clipboard:{async writeText(value) { target.copied = value; }}};
}
async function roundTripOutput(target) {
  mountOutput(target);
  const before = data.get('cognivex-pocket-state');
  const writes = snapshots.length;
  click(target,'题目');
  const entries = walk(target.nodes['learning-content']).filter(n => n.className === 'output-entry' && n.children.some(c => c.tag === 'strong'));
  assert.equal(entries.length,2);
  const originalNodes = target.nodes['learning-content'].children.slice();
  for (let modelIndex = 0; modelIndex < 2; modelIndex++) {
    entries[modelIndex].fire('click');
    const tool = target.document.getElementById('output-sop');
    const back = tool.children[0]; const list = tool.children[1]; const detail = tool.children[2];
    const cards = list.children.filter(n => n.tag === 'details');
    const count = modelIndex === 0 ? 7 : 3;
    const nodeCounts = modelIndex === 0 ? [8,5,8,4,5,7,3] : [6,0,6];
    assert.equal(cards.length,modelIndex === 0 ? 8 : 3);
    for (let index = 0; index < count; index++) {
      const card = cards[index]; card.open = true;
      target.context.scrollY = 260 + index;
      card.children.find(n => n.tag === 'button').fire('click');
      assert.equal(list.hidden,true); assert.equal(detail.hidden,false);
      const nodes = detail.children.filter(n => n.className === 'output-node');
      assert.equal(nodes.length,nodeCounts[index]);
      nodes.forEach(n => { const content = walk(n).map(n => n.textContent).join(' '); assert.ok(content.includes('最简操作')); assert.ok(content.includes('最核心提问')); });
      if (modelIndex === 0 && index === 2) {
        walk(detail).find(n => n.textContent === '复制 AI 提问').fire('click');
        await new Promise(resolve => setImmediate(resolve));
        const template = target.context.PocketOutputSOPData.aiPrompt;
        assert.equal(target.copied,template);
        assert.ok(template.includes('遇到什么障碍 → 为什么想到下一步 → 如何突破。'));
        target.context.navigator.clipboard.writeText = async () => { throw Error('denied'); };
        walk(detail).find(n => n.textContent === '复制 AI 提问').fire('click');
        await new Promise(resolve => setImmediate(resolve));
        assert.ok(walk(detail).find(n => n.tag === 'textarea').selected);
        assert.ok(walk(detail).some(n => n.textContent.includes('复制失败')));
      }
      if (modelIndex === 1 && index === 1) {
        for (const [methodIndex, method] of target.context.PocketOutputSOPData.methods.entries()) {
          walk(detail).find(n => n.tag === 'button' && n.textContent === method.title + ' →').fire('click');
          assert.equal(detail.children.filter(n => n.className === 'output-node').length,methodIndex === 0 ? 5 : 7);
          back.fire('click');
          assert.ok(walk(detail).some(n => n.textContent === '中标准｜独立生成'));
        }
        assert.ok(walk(detail).some(n => n.textContent === '不要求用户每次必须完成两种方式。'));
      }
      back.fire('click');
      assert.equal(card.open,true); assert.equal(list.hidden,false); assert.equal(detail.hidden,true);
      assert.equal(target.scroll,260 + index);
      assert.equal(data.get('cognivex-pocket-state'),before);
    }
    back.fire('click'); assert.equal(target.nodes['pocket-main'].hidden,false);
  }
  assert.equal(data.get('cognivex-pocket-state'),before);
  assert.equal(snapshots.length,writes);
  assert.deepEqual(target.nodes['learning-content'].children,originalNodes);
}
(async () => {
  data.clear(); app = boot(); app.nodes['start-button'].fire('click');
  createMaterial('数学','函数','1-4','2'); click(app,'本组视频看完');
  await roundTripOutput(app);
  app = boot(); assert.equal(saved().currentSession.currentStep,'output');
  assert.ok(text(app).includes('请选择本次输出内容'));
  click(app,'输出达标 → 下一步'); assert.notEqual(saved().currentSession.currentStep,'output');
  finishActiveMaterial(); app.nodes['add-review-button'].fire('click'); app.nodes['start-review-button'].fire('click');
  click(app,'开始本轮复习（1条）'); click(app,'本组视频看完');
  await roundTripOutput(app);
  app = boot(); assert.equal(saved().materialReviewSession.currentStep,'output');
  click(app,'输出达标 → 下一组');
  assert.equal(saved().materialReviewSession.currentGroupIndex,1);
  assert.equal(saved().materialReviewSession.currentStep,'video');
  console.log('PASS: 10 stages and both optional methods, complete node counts, full clipboard and failure fallback, expanded-state/scroll return, zero writes across all guides in new/review, reload checkpoints and explicit output progression.');
})().catch(error => {console.error(error); process.exitCode = 1;});
`;
vm.runInNewContext(source + checks,{require,__dirname,console,URL,setImmediate,process},{filename:__filename});
