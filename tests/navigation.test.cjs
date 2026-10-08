// Run: node tests/navigation.test.cjs. All clocks, DOM and storage are isolated.
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const source = fs.readFileSync(path.join(__dirname,'executor.test.cjs'),'utf8');
const checks = `
const NAV_KEY='pocket-last-view-v1';
let navNow=new Date(2026,9,9,10).getTime();
class NavDate extends Date {constructor(...args){super(...(args.length?args:[navNow]));} static now(){return navNow;}}
const moduleNames=['storage','grouping','scheduler','history','executor','material-review','external-links','output-sop-data','navigation','output-sop','listening-start','app','training-sop','practice-readiness'];
const moduleSources=Object.fromEntries(moduleNames.map(name=>[name,fs.readFileSync(path.join(__dirname,'../js/'+name+'.js'),'utf8')]));
function navBoot() {
  const nodes={};
  class Node extends Element {
    constructor(tag){super(tag);this.tagName=tag.toUpperCase();this.hidden=false;}
    focus(){} select(){} getAttribute(name){return this[name]??null;}
    querySelector(selector){
      if(selector==='h1')return walk(this).find(n=>n.tag==='h1');
      if(selector==='details[open] button')return walk(this).find(n=>n.tag==='details'&&n.open)?.children.find(n=>n.tag==='button');
    }
    set innerHTML(html){for(const match of html.matchAll(/<([a-z0-9]+)[^>]*\\bid="([^"]+)"[^>]*>/g)){const node=new Node(match[1]);node.id=match[2];node.hidden=/\\bhidden\\b/.test(match[0]);nodes[node.id]=node;}}
  }
  const html=fs.readFileSync(path.join(__dirname,'../index.html'),'utf8');
  const body=new Node('body'); body.innerHTML=html;
  nodes['pocket-main'].append(nodes['learning-content'],nodes['listening-start-area'],nodes['listening-start-button'],nodes['start-button']);
  body.append(nodes['pocket-main'],nodes['practice-tool'],nodes['pocket-home-button']);
  const listeners={}; const all=()=>[...new Set([...Object.values(nodes),...walk(body)])];
  const document={body,hidden:false,createElement:tag=>new Node(tag),createTextNode:text=>{const n=new Node('#text');n.textContent=text;return n;},
    getElementById:id=>nodes[id]||all().find(n=>n.id===id),querySelectorAll:()=>all().filter(n=>n.tag==='details'&&n.id),
    addEventListener:(name,fn)=>{(listeners[name]||=[]).push(fn);}};
  const context=vm.createContext({document,Intl,Date:NavDate,URL,localStorage:{getItem:key=>data.get(key)??null,
    setItem:(key,value)=>data.set(key,value),removeItem:key=>data.delete(key)},navigator:{userAgent:'Windows'},
    setInterval:()=>1,clearInterval:()=>{},scrollY:0,scrollTo:(_,y)=>{context.scrollY=y;},
    addEventListener:(name,fn)=>{(listeners[name]||=[]).push(fn);},confirm:()=>false});
  context.window=context;
  for(const name of moduleNames)vm.runInContext(moduleSources[name],context);
  (listeners.DOMContentLoaded||[]).forEach(fn=>fn());
  return{nodes,document,context,all,listeners};
}
const navClick=label=>{const node=app.all().find(n=>n.tag==='button'&&n.textContent===label);assert.ok(node,'Missing '+label);node.fire('click');};
const nav=()=>JSON.parse(data.get(NAV_KEY));
const unchanged=before=>assert.equal(data.get('cognivex-pocket-state'),before);
data.clear(); app=navBoot(); assert.ok(text(app).includes('目前没有进行中的学习'));
app.nodes['start-button'].fire('click'); fill(app,'subject','数学'); fill(app,'title','页面恢复');
const draftSnapshot=data.get('cognivex-pocket-state');
navNow+=3*86400000; app=navBoot(); assert.equal(app.document.getElementById('title').value,'页面恢复'); unchanged(draftSnapshot);
assert.equal(app.nodes['listening-start-button'].hidden,true);
app.nodes['pocket-home-button'].fire('click'); assert.equal(nav().page,'home'); unchanged(draftSnapshot);
assert.equal(app.nodes['listening-start-button'].hidden,false);
app=navBoot(); assert.equal(nav().page,'home'); assert.equal(app.document.getElementById('title'),undefined); unchanged(draftSnapshot);
app.nodes['start-button'].fire('click'); assert.equal(app.document.getElementById('title').value,'页面恢复');
submit(app); assert.equal(saved().currentSession.currentStep,'grouping');
assert.equal(app.nodes['listening-start-button'].hidden,true);
app=navBoot(); assert.equal(saved().currentSession.currentStep,'grouping'); assert.equal(app.nodes['listening-start-button'].hidden,true);
const groupingSnapshot=data.get('cognivex-pocket-state');
app.nodes['pocket-back-button'].fire('click');assert.equal(app.document.getElementById('title').value,'页面恢复');unchanged(groupingSnapshot);
assert.equal(saved().currentSession.currentStep,'grouping');app=navBoot();assert.equal(app.document.getElementById('title').value,'页面恢复');
submit(app);assert.ok(app.document.getElementById('question-range'));unchanged(groupingSnapshot);
fill(app,'question-range','1-4'); fill(app,'group-size','2'); submit(app);
assert.equal(nav().page,'listening');
const setupOriginSnapshot=data.get('cognivex-pocket-state');
app.nodes['pocket-back-button'].fire('click');
assert.equal(app.nodes['learning-heading'].textContent,'分组设置');
assert.equal(app.document.getElementById('question-range').value,'1-4');
assert.equal(app.document.getElementById('question-range').readOnly,true);
unchanged(setupOriginSnapshot);assert.equal(saved().currentSession.currentStep,'output');
navClick('继续当前学习');assert.equal(nav().page,'listening');
navClick('跳过泛听，直接开始学习');
const videoSnapshot=data.get('cognivex-pocket-state'); navNow+=7*86400000; app=navBoot();
assert.equal(saved().currentSession.currentStep,'output'); assert.ok(text(app).includes('OUTPUT')); unchanged(videoSnapshot);
assert.equal(app.nodes['listening-start-button'].hidden,true);
click(app,'输出');
const outputSnapshot=data.get('cognivex-pocket-state'); navNow+=86400000; app=navBoot();
assert.equal(nav().outputPage,'questions'); assert.equal(saved().currentSession.currentStep,'output'); unchanged(outputSnapshot);
app.nodes['pocket-back-button'].fire('click');assert.equal(nav().outputPage,'');unchanged(outputSnapshot);click(app,'输出');
app.document.getElementById('group-key-questions-panel').open=true;app.context.scrollY=220;
(app.listeners.pagehide||[]).forEach(fn=>fn());app=navBoot();
assert.equal(app.context.scrollY,220);assert.equal(app.document.getElementById('group-key-questions-panel').open,true);unchanged(outputSnapshot);
const entries=app.all().filter(n=>n.className==='output-entry'&&n.children.some(c=>c.textContent==='做题'));
assert.equal(entries.length,1); entries[0].fire('click');
let tool=app.document.getElementById('output-sop');let list=tool.children[1];
let card=list.children.filter(n=>n.tag==='details')[2];card.open=true;card.fire('toggle');card.children.find(n=>n.tag==='button').fire('click');
assert.equal(nav().page,'output-sop');assert.equal(nav().stage,2);
app=navBoot();tool=app.document.getElementById('output-sop');assert.equal(tool.hidden,false);
assert.ok(walk(tool.children[2]).some(n=>n.textContent==='内化｜把高手的路变成自己的路'));unchanged(outputSnapshot);
app.nodes['pocket-back-button'].fire('click');assert.ok(tool.children[1].children.filter(n=>n.tag==='details')[2].open);
app.nodes['pocket-home-button'].fire('click'); assert.equal(tool.hidden,true); unchanged(outputSnapshot);
app.nodes['start-button'].fire('click');assert.equal(nav().outputPage,'questions');unchanged(outputSnapshot);
// Optional method B is restored together with its expanded parent stage.
const knowledge=app.all().find(n=>n.className==='output-entry'&&n.children.some(c=>c.textContent==='知识点'));knowledge.fire('click');
tool=app.document.getElementById('output-sop');card=tool.children[1].children.filter(n=>n.tag==='details')[1];card.open=true;
card.children.find(n=>n.tag==='button').fire('click');navClick('方式 B｜知识拆成问题 →');
app=navBoot();tool=app.document.getElementById('output-sop');assert.ok(walk(tool.children[2]).some(n=>n.textContent==='方式 B｜知识拆成问题'));unchanged(outputSnapshot);
// All training pages and practice results restore without touching learning state.
app.nodes['pocket-home-button'].fire('click');app.nodes['practice-readiness-button'].fire('click');
app.nodes['training-build'].fire('click');app.nodes['training-status'].value='保留输入';app.nodes['training-status'].fire('input');
app=navBoot();assert.equal(app.nodes['training-model'].hidden,false);assert.equal(app.nodes['training-status'].value,'保留输入');
app.nodes['training-form'].fire('submit');app=navBoot();assert.equal(app.nodes['training-prompt'].hidden,false);assert.ok(app.nodes['training-prompt-text'].value.includes('保留输入'));
app.context.PocketPracticeReadiness.show('ready');app=navBoot();assert.equal(app.nodes['practice-ready-result'].hidden,false);unchanged(outputSnapshot);
app.nodes['pocket-back-button'].fire('click');assert.equal(app.nodes['training-prompt'].hidden,false);unchanged(outputSnapshot);
app.context.PocketTrainingSOP.show('detection');app=navBoot();assert.equal(app.nodes['training-detection'].hidden,false);unchanged(outputSnapshot);
// Home is explicit, and the last listening page resumes even across a new day.
app.nodes['pocket-home-button'].fire('click');assert.equal(app.nodes['listening-start-button'].hidden,false);
app.nodes['listening-start-button'].fire('click');navClick('复位');navClick('开始泛听 · 60 分钟');navNow+=600000;navClick('暂停');
navNow+=2*86400000;app=navBoot();assert.equal(nav().page,'listening');assert.ok(app.all().some(n=>n.className==='listening-clock'&&n.textContent==='00:50:00'));unchanged(outputSnapshot);
navClick('继续');navNow+=3600000;app=navBoot();
assert.ok(app.all().some(n=>n.className==='listening-clock'&&n.textContent==='00:00:00'));unchanged(outputSnapshot);
app.nodes['pocket-home-button'].fire('click');app=navBoot();assert.equal(nav().page,'home');unchanged(outputSnapshot);
app.nodes['pocket-back-button'].fire('click');assert.equal(nav().page,'listening');unchanged(outputSnapshot);
app.nodes['pocket-home-button'].fire('click');
app.nodes['start-button'].fire('click');assert.equal(saved().currentSession.currentStep,'output');unchanged(outputSnapshot);
// Review queues are resumed on the exact same material/group/step across dates.
while(saved().currentSession.currentStep!=='materialComplete') {
  const step=saved().currentSession.currentStep;
  navClick(step==='video'?'本组视频看完':step==='output'?'输出达标 → 下一步':'继续');
}
app.nodes['add-review-button'].fire('click');app.nodes['start-review-button'].fire('click');navClick('开始本轮复习（1条）');
const queueOrigin=data.get('cognivex-pocket-state');app.nodes['pocket-back-button'].fire('click');
assert.equal(app.nodes['learning-heading'].textContent,'选择要复习的资料');unchanged(queueOrigin);
navClick('继续当前学习');unchanged(queueOrigin);
const reviewSnapshot=data.get('cognivex-pocket-state');navNow+=30*86400000;app=navBoot();
assert.equal(saved().materialReviewSession.currentStep,'output');assert.equal(saved().materialReviewSession.currentGroupIndex,0);unchanged(reviewSnapshot);
assert.equal(app.nodes['listening-start-button'].hidden,true);
app.nodes['pocket-home-button'].fire('click');app=navBoot();assert.equal(nav().page,'home');unchanged(reviewSnapshot);
app.nodes['start-button'].fire('click');assert.equal(saved().activeSessionType,'material-review');unchanged(reviewSnapshot);
console.log('PASS: cross-day basic/grouping/OUTPUT, output subviews and SOP detail/method expansion, training forms/prompts/practice/detection, paused timer recovery, explicit home from every view and learning-state isolation; warm-up entry appears only on home.');
`;
vm.runInNewContext(source+checks,{require,__dirname,console,URL},{filename:__filename});
