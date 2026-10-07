// Run with Node: isolated DOM/storage, no real browser learning data.
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const source = fs.readFileSync(path.join(__dirname, 'executor.test.cjs'), 'utf8');
const checks = `
function mountTraining(target, options = {}) {
  const ui = {};
  const html = fs.readFileSync(path.join(__dirname,'../index.html'),'utf8');
  for (const match of html.matchAll(/id="([^"]+)"/g)) {
    ui[match[1]] = new Element('section');
    ui[match[1]].focus = () => { ui.focused = match[1]; };
  }
  target.document.body = new Element('body');
  const create = target.document.createElement;
  target.document.createElement = tag => {
    const node = create(tag);
    Object.defineProperty(node,'innerHTML',{configurable:true,set(html) {
      for (const match of html.matchAll(/id="([^"]+)"/g)) {
        ui[match[1]] = new Element('section');
        ui[match[1]].focus = () => { ui.focused = match[1]; };
      }
      ui[node.id] = node;
    }});
    return node;
  };
  const originalGet = target.document.getElementById;
  target.document.getElementById = id => ui[id] || originalGet(id);
  target.context.scrollY = 180;
  target.context.scrollTo = (_,y) => { ui.scroll = y; };
  const order = [];
  target.context.navigator = {clipboard:{async writeText(text) {
    if (options.copyFail) throw Error('clipboard denied');
    order.push('copy'); ui.copied = text;
  }}};
  target.context.open = url => {
    order.push('open'); ui.opened = url;
    if (options.openThrow) throw Error('blocked');
    return null; // Popup blocked.
  };
  for (const name of ['training-sop','practice-readiness'])
    vm.runInContext(fs.readFileSync(path.join(__dirname,'../js/'+name+'.js'),'utf8'),target.context);
  return {ui,order};
}
function roundTrip(target) {
  const before = data.get('cognivex-pocket-state');
  const writes = snapshots.length;
  const nodes = target.nodes['learning-content'].children.slice();
  const {ui} = mountTraining(target);
  ui['practice-readiness-button'].fire('click');
  assert.equal(ui['training-overview'].hidden,false);
  ui['training-build'].fire('click'); assert.equal(ui['training-model'].hidden,false);
  ui['training-back'].fire('click');
  ui['training-practice'].fire('click'); assert.equal(ui['practice-check'].hidden,false);
  ui['practice-ready'].fire('click'); assert.equal(ui['practice-ready-result'].hidden,false);
  ui['practice-to-simulation'].fire('click'); assert.equal(ui['training-detection'].hidden,false);
  ui['training-detection-overview'].fire('click');
  ui['practice-back'].fire('click');
  ui['training-practice'].fire('click'); ui['practice-not-ready'].fire('click');
  ui['practice-not-ready-return'].fire('click');
  assert.equal(ui['pocket-main'].hidden,false);
  assert.equal(ui.scroll,180);
  assert.equal(data.get('cognivex-pocket-state'),before);
  assert.equal(snapshots.length,writes);
  assert.deepEqual(target.nodes['learning-content'].children,nodes);
}
data.clear(); app=boot(); app.nodes['start-button'].fire('click');
createMaterial('数学','函数','1-4','2'); roundTrip(app);
click(app,'本组视频看完'); roundTrip(app);
assert.equal(saved().currentSession.currentStep,'output');
finishActiveMaterial(); app.nodes['add-review-button'].fire('click');
app.nodes['start-review-button'].fire('click'); click(app,'开始本轮复习（1条）');
click(app,'本组视频看完'); roundTrip(app);
app=boot(); assert.equal(saved().materialReviewSession.currentStep,'output');
console.log('PASS: all SOP routes preserve full learning/review storage, DOM and scroll; review OUTPUT survives reload.');
(async () => {
  const before=data.get('cognivex-pocket-state');
  const {ui,order}=mountTraining(app);
  ui['practice-readiness-button'].fire('click'); ui['training-build'].fire('click');
  const fields=['status','purpose','parent','child','materials'];
  const values=['现状\\n{目的} <script>','目标 $&','母链','子链','资料'];
  fields.forEach((f,i) => { ui['training-'+f].value=values[i]; ui['training-'+f].fire('input'); });
  ui['training-form'].fire('submit');
  const request=fs.readFileSync('C:/Users/Y/.codex/attachments/c5adc327-f923-488f-b4b4-0c3c17e77870/已粘贴的文本.txt','utf8');
  const template=request.match(/\x60\x60\x60text\\r?\\n(请根据我的「达标—能力链模型」[\\s\\S]*?)\\r?\\n\x60\x60\x60/)[1];
  const labels=['当前状态','目的','母链','子链','已有资料'];
  const expected=template.replace(/\\{(当前状态|目的|母链|子链|已有资料)\\}/g,(_,l)=>values[labels.indexOf(l)]);
  assert.equal(ui['training-prompt-text'].value,expected);
  ui['training-copy-open'].fire('click'); await new Promise(resolve=>setImmediate(resolve));
  assert.deepEqual(order,['copy','open']); assert.equal(ui.copied,expected);
  assert.equal(ui.opened,'https://chatgpt.com/'); assert.ok(ui['training-copy-status'].textContent.includes('已复制'));
  assert.equal(ui['training-chatgpt-link'].hidden,false);
  ui['training-copy-again'].fire('click'); await new Promise(resolve=>setImmediate(resolve));
  assert.deepEqual(order,['copy','open','copy']);
  assert.equal(data.get('cognivex-pocket-state'),before);
  const restored=mountTraining(app,{copyFail:true});
  fields.forEach((f,i)=>assert.equal(restored.ui['training-'+f].value,values[i]));
  restored.ui['training-form'].fire('submit'); restored.ui['training-copy-open'].fire('click');
  await new Promise(resolve=>setImmediate(resolve));
  assert.deepEqual(restored.order,[]); assert.ok(restored.ui['training-copy-status'].textContent.includes('复制失败'));
  data.set('pocket-training-sop-model-v1','invalid');
  const corrupt=mountTraining(app); assert.ok(corrupt.ui['training-save-status'].textContent.includes('无法读取'));
  failSave=true; corrupt.ui['training-status'].fire('input'); failSave=false;
  assert.ok(corrupt.ui['training-save-status'].textContent.includes('保存失败'));
  console.log('PASS: exact full prompt, literal special input, separate persistence/reload, copy-before-open, blocked popup fallback, retry, failed clipboard and unavailable storage.');
})().catch(error=>{console.error(error); process.exitCode=1;});
`;
vm.runInNewContext(source + checks, {require,__dirname,console,URL,setImmediate,process}, {
  filename:path.join(__dirname,'practice-readiness.test.cjs')
});
