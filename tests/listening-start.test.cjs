// Run: node tests/listening-start.test.cjs
// Fake clocks and isolated storage; never launches a real shortcut.
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const source = fs.readFileSync(path.join(__dirname,'executor.test.cjs'),'utf8');
const checks = `
const LISTEN_KEY = 'pocket-listening-start-v1';
const HOUR = 3600000;
let now = new Date(2026,9,9,10).getTime();
class ClockDate extends Date {
  constructor(...args) { super(...(args.length ? args : [now])); }
  static now() { return now; }
}
const appSource = sources.app; delete sources.app;
sources['listening-start'] = fs.readFileSync(path.join(__dirname,'../js/listening-start.js'),'utf8');
sources.app = appSource;
let ios = false;
boot = eval('(' + boot.toString().replace('context.window = context;', 
  'context.window = context; nodes["start-button"].tag="button"; nodes["listening-start-button"]=new Element("button"); nodes["listening-start-button"].textContent="热身：泛听启动"; nodes["listening-start-area"]=new Element("div"); context.Date = ClockDate; context.navigator = {userAgent:ios ? "iPhone" : "Windows",platform:"",maxTouchPoints:0}; context.intervals = new Map(); context.setInterval = fn => {const id=context.intervals.size+1; context.intervals.set(id,fn); return id;}; context.clearInterval = id => context.intervals.delete(id); context.shortcutCalls=[]; context.location={}; Object.defineProperty(context.location,"href",{set(value){context.shortcutCalls.push(value);}}); context.resumeEvents={}; context.addEventListener=(name,fn)=>context.resumeEvents[name]=fn; document.addEventListener=(name,fn)=>context.resumeEvents[name]=fn;') + ')');
const allNodes = target => Object.values(target.nodes).flatMap(walk);
button = (target,label) => { const node=allNodes(target).find(n=>n.tag==='button'&&n.textContent===label); assert.ok(node,'Missing '+label); return node; };
const allText = target => allNodes(target).map(n=>n.textContent).join(' ');
const gate = () => allNodes(app).find(n=>n.className==='listening-start');
const timerText = () => walk(gate()).find(n=>n.className==='listening-clock').textContent;
const tick = () => [...app.context.intervals.values()].forEach(fn=>fn());
const records = () => JSON.parse(data.get(LISTEN_KEY));
const record = subject => Object.values(records()).find(r=>r.subject===subject);
data.clear(); app=boot(); app.nodes['start-button'].fire('click'); createMaterial('数学','A','1-4','2');
assert.ok(gate()); assert.equal(timerText(),'01:00:00');
assert.equal(app.nodes['start-button'].textContent,'开始学习'); assert.equal(app.nodes['start-button'].hidden,true);
assert.equal(app.context.shortcutCalls.length,0); // Never on load.
const checkpoint = data.get('cognivex-pocket-state');
const link = walk(gate()).find(n=>n['aria-label']==='泛听视频链接（可选）');
link.value='course:optional'; link.fire('input');
assert.equal(data.get('cognivex-pocket-state'),checkpoint);
assert.deepEqual(saved().materials[0].videoLinks,[]);
click(app,'开始泛听 · 60 分钟');
const startRecord=record('数学'); assert.equal(startRecord.startedAt,now); assert.equal(startRecord.endsAt,now+HOUR);
assert.equal(app.context.shortcutCalls.length,0); assert.equal(timerText(),'01:00:00');
now+=10*60000; app=boot(); click(app,'热身：泛听启动'); assert.equal(timerText(),'00:50:00');
assert.equal(record('数学').endsAt,startRecord.endsAt); assert.equal(record('数学').videoUrl,'course:optional');
assert.equal(data.get('cognivex-pocket-state'),checkpoint);
now+=5*60000; tick(); assert.equal(timerText(),'00:45:00');
// iPhone retry calls the URL without changing either timestamp.
ios=true; app=boot(); assert.equal(app.context.shortcutCalls.length,0); click(app,'热身：泛听启动');
click(app,'重新启动苹果提醒'); click(app,'重新启动苹果提醒');
assert.deepEqual(app.context.shortcutCalls,Array(2).fill('shortcuts://run-shortcut?name=Cognivex%20%E6%B3%9B%E5%90%AC'));
assert.equal(record('数学').endsAt,startRecord.endsAt);
now=startRecord.endsAt+2000; app=boot(); click(app,'热身：泛听启动'); assert.equal(timerText(),'00:00:00');
assert.equal(app.nodes['start-button'].hidden,true); assert.equal(app.nodes['start-button'].textContent,'开始学习');
assert.ok(!walk(gate()).some(n=>n.tag==='button'&&n.textContent==='开始学习'));
assert.ok(allText(app).includes('60 分钟已到，请进入正式分组学习。')); assert.equal(record('数学').status,'completed');
assert.equal(data.get('cognivex-pocket-state'),checkpoint);
click(app,'跳过泛听，直接开始学习'); assert.ok(!gate()); assert.equal(saved().currentSession.currentStep,'output');
assert.equal(data.get('cognivex-pocket-state'),checkpoint);
app=boot(); assert.ok(!gate()); assert.ok(!gate());
click(app,'输出'); click(app,'← 返回 OUTPUT'); assert.ok(!gate());
click(app,'输出达标 → 下一步'); click(app,'继续'); assert.ok(!gate());
click(app,'输出达标 → 下一步'); click(app,'继续');
assert.equal(saved().currentSession.mode,'review'); assert.ok(!gate());
now+=24*HOUR; app=boot(); assert.ok(!gate()); // Internal review does not trigger.
finishActiveMaterial(); click(app,'开始下一份资料'); createMaterial('数学','A2','1-2','2');
assert.ok(gate()); click(app,'开始泛听 · 60 分钟');
assert.equal(app.context.shortcutCalls.length,1); // User initiated start on iPhone.
const startedAgain = records()[JSON.stringify([new ClockDate().getFullYear()+'-'+String(new ClockDate().getMonth()+1).padStart(2,'0')+'-'+String(new ClockDate().getDate()).padStart(2,'0'),'数学'])];
now+=HOUR; tick(); click(app,'跳过泛听，直接开始学习'); assert.ok(!gate());
// Global review skips the gate and preserves the current material's checkpoint.
const mainBefore = JSON.stringify(saved().currentSession);
app.nodes['add-review-button'].fire('click'); app.nodes['start-review-button'].fire('click'); click(app,'开始本轮复习（1条）');
assert.ok(!gate()); assert.equal(JSON.stringify(saved().currentSession),mainBefore);
assert.ok(!gate());
click(app,'输出达标 → 下一组'); assert.ok(!gate());
click(app,'输出达标 → 下一组'); click(app,'返回当前学习'); assert.ok(!gate());
// Another subject gets its own gate, even on the same day.
finishActiveMaterial(); click(app,'开始下一份资料'); createMaterial('英语','B','1-2','2');
assert.ok(gate()); click(app,'开始泛听 · 60 分钟');
assert.ok(record('英语')); assert.ok(record('数学'));
const englishEnd=record('英语').endsAt;
now=englishEnd+HOUR; app=boot(); click(app,'热身：泛听启动'); assert.equal(timerText(),'00:00:00'); click(app,'跳过泛听，直接开始学习');
assert.equal(saved().materials[2].subject,'英语'); assert.equal(saved().currentSession.currentStep,'output');
assert.equal(saved().currentSession.currentStep,'output');
// Visibility/focus checks the next local day without changing the checkpoint.
const beforeNextDay=data.get('cognivex-pocket-state'); now+=24*HOUR; app.context.resumeEvents.visibilitychange();
assert.ok(!gate()); assert.equal(data.get('cognivex-pocket-state'),beforeNextDay);
app=boot(); assert.ok(!gate()); assert.equal(saved().currentSession.currentStep,'output');
assert.equal(data.get('cognivex-pocket-state'),beforeNextDay); click(app,'热身：泛听启动');
failSave=true; click(app,'开始泛听 · 60 分钟'); failSave=false;
assert.equal(timerText(),'01:00:00'); assert.ok(allText(app).includes('保存失败'));
// Start across midnight, restore, and count completion toward the new local day.
now=new Date(2026,9,15,23,45).getTime(); app=boot(); click(app,'热身：泛听启动'); click(app,'开始泛听 · 60 分钟');
const midnightEnd=Object.values(records()).find(r=>r.subject==='英语'&&!r.enteredAt&&r.status==='running').endsAt;
now+=30*60000; app=boot(); click(app,'热身：泛听启动'); assert.equal(timerText(),'00:30:00');
now=midnightEnd+1; app=boot(); click(app,'热身：泛听启动'); assert.equal(timerText(),'00:00:00'); click(app,'跳过泛听，直接开始学习');
app=boot(); assert.ok(!gate()); assert.equal(data.get('cognivex-pocket-state'),beforeNextDay);
// Corrupt timer data is never silently overwritten or restarted.
data.set(LISTEN_KEY,'invalid-json'); app=boot(); assert.ok(!gate()); click(app,'热身：泛听启动'); assert.ok(gate());
assert.equal(button(app,'开始泛听 · 60 分钟').disabled,true); assert.equal(data.get(LISTEN_KEY),'invalid-json');
// The manual entry sits before the existing new-material button and needs no Material.
const html=fs.readFileSync(path.join(__dirname,'../index.html'),'utf8');
assert.ok(html.indexOf('id="listening-start-button"') < html.indexOf('id="start-button"'));
data.clear(); ios=false; app=boot(); const emptyCheckpoint=data.get('cognivex-pocket-state');
click(app,'热身：泛听启动'); assert.ok(gate());
const manualSubject=walk(gate()).find(n=>n['aria-label']==='当前学习科目');
manualSubject.value='物理'; manualSubject.fire('change'); click(app,'开始泛听 · 60 分钟');
assert.equal(record('物理').endsAt,now+HOUR); assert.equal(data.get('cognivex-pocket-state'),emptyCheckpoint);
now+=HOUR; app=boot(); assert.ok(!gate());
assert.ok(allText(app).includes('目前没有进行中的学习'));
click(app,'热身：泛听启动'); assert.ok(gate()); assert.equal(timerText(),'00:00:00');
click(app,'跳过泛听，直接开始学习'); assert.ok(!gate());
app.nodes['start-button'].fire('click'); createMaterial('物理','C','1-2','2'); assert.ok(!gate());
assert.equal(saved().currentSession.currentStep,'output');
// Pause freezes remaining time across refresh; resume uses a new fixed deadline.
now+=24*HOUR; app=boot(); click(app,'热身：泛听启动'); const controlCheckpoint=data.get('cognivex-pocket-state');
click(app,'开始泛听 · 60 分钟'); now+=10*60000; tick();
failSave=true; click(app,'暂停'); failSave=false;
assert.equal(Object.values(records()).find(r=>r.subject==='物理'&&!r.enteredAt).status,'running');
click(app,'暂停'); assert.equal(timerText(),'00:50:00');
now+=2*HOUR; app=boot(); click(app,'热身：泛听启动'); assert.equal(timerText(),'00:50:00');
assert.equal(app.nodes['start-button'].hidden,true);
app.nodes['start-button'].fire('click'); assert.ok(gate());
click(app,'继续');
const resumed=Object.values(records()).find(r=>r.subject==='物理'&&!r.enteredAt);
assert.equal(resumed.endsAt,now+50*60000); assert.equal(resumed.status,'running');
now+=5*60000; tick(); assert.equal(timerText(),'00:45:00');
failSave=true; click(app,'复位'); failSave=false; assert.equal(timerText(),'00:45:00');
click(app,'复位'); assert.equal(timerText(),'01:00:00'); assert.equal(app.nodes['start-button'].hidden,true);
assert.equal(button(app,'开始泛听 · 60 分钟').hidden,false);
assert.equal(data.get('cognivex-pocket-state'),controlCheckpoint);
app=boot(); click(app,'热身：泛听启动'); assert.equal(timerText(),'01:00:00');
// Skip works before start, while running and while paused, with no learning writes.
for(const phase of ['ready','running','paused']) {
  if(phase!=='ready') { now+=24*HOUR; app=boot(); click(app,'热身：泛听启动'); click(app,'开始泛听 · 60 分钟'); }
  if(phase==='paused') click(app,'暂停');
  const beforeSkip=data.get('cognivex-pocket-state');
  click(app,'跳过泛听，直接开始学习'); assert.ok(!gate());
  assert.equal(data.get('cognivex-pocket-state'),beforeSkip);
  app=boot(); assert.ok(!gate()); assert.equal(saved().currentSession.currentStep,'output');
}
// Skipping before a subject exists goes to setup and applies only to the next subject.
data.clear(); app=boot(); click(app,'热身：泛听启动'); click(app,'跳过泛听，直接开始学习');
assert.equal(saved().currentSession.currentStep,'basic');
assert.equal(app.nodes['listening-start-button'].hidden,true);
app=boot(); assert.equal(app.nodes['listening-start-button'].hidden,true);
createMaterial('化学','Skip setup','1-2','2');
assert.ok(!gate()); finishActiveMaterial(); click(app,'开始下一份资料'); createMaterial('生物','Other subject','1-2','2');
assert.ok(gate());
console.log('PASS: pause/resume persistence and deadlines, reset/reload, failed-save preservation, skips from all timer states without learning writes, and subject-specific skip before setup.');
console.log('PASS: independent local-day/subject gates, 60-minute timestamps, desktop/iOS trigger and retry, refresh/background/late reopen, original checkpoint isolation, same-day suppression, internal/global review skips, next-day resume, cross-midnight completion, failed save and corrupt-record protection.');
`;
vm.runInNewContext(source + checks,{require,__dirname,console,URL},{filename:__filename});
