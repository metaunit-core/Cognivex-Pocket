'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const source = fs.readFileSync(path.join(__dirname, '../js/device-clear-diagnostics.js'), 'utf8');
const uiSource = fs.readFileSync(path.join(__dirname, '../js/device-local-clear-ui.js'), 'utf8');
const html = fs.readFileSync(path.join(__dirname, '../index.html'), 'utf8');
const version = html.match(/data-clear-version="([^"]+)"/)[1];
function boot(width, height) {
  const nodes = {}, listeners = {}, windowListeners = {}, calls = { storage: 0, clear: 0, firebase: 0, previews: 0 };
  for (const id of [...html.matchAll(/\bid="([^"]+)"/g)].map(match => match[1])) nodes[id] = {
    id, hidden: id === 'device-local-clear-confirm' || id.startsWith('device-clear-diagnostic-report'), disabled: id === 'device-local-clear-submit',
    value: '', textContent: '', events: {}, style: {},
    getAttribute: () => version, addEventListener(name, fn) { this.events[name] = fn; }, async fire(name, event = {}) { return this.events[name]?.(event); },
    focus() {}, scrollIntoView() {}, select() { this.selected = true; }, getBoundingClientRect() { return { left: 20, top: 20, width: Math.min(580, width - 40), height: 200 }; },
    contains(node) { return node === this; }
  };
  const body = { style: { overflow: '' }, children: [], append(node) { node.parentElement = this; this.children.push(node); } };
  const document = { body, getElementById: id => nodes[id], elementFromPoint: () => nodes['device-local-clear-confirm'],
    addEventListener(type, fn) { (listeners[type] ||= []).push(fn); } };
  let copied = '', denied = false;
  const context = vm.createContext({ Date, document, innerWidth: width, innerHeight: height,
    getComputedStyle: node => ({ position: node.id === 'device-local-clear-confirm' ? 'fixed' : 'static',
      display: node.hidden ? 'none' : 'block', opacity: '1', visibility: 'visible', pointerEvents: 'auto', zIndex: '100' }),
    addEventListener(type, fn) { windowListeners[type] = fn; },
    navigator: { clipboard: { async writeText(value) { if (denied) throw Error('Denied'); copied = value; } } },
    PocketDeviceLocalData: { VERSION: version, preview() { calls.previews++; return { bytes: 10, environment: '开发测试版' }; },
      completed: () => false, getError: () => '', clear() { calls.clear++; throw Error('Must not clear in interface test'); } },
    PocketClearAndRestart() { calls.firebase++; throw Error('Must not call Firebase'); },
    location: { reload() { throw Error('Must not reload'); } } });
  Object.defineProperty(context, 'localStorage', { get() { calls.storage++; throw Error('No storage access permitted'); } });
  vm.runInContext(source, context); vm.runInContext(uiSource, context);
  return { nodes, context, listeners, windowListeners, calls, body, copied: () => copied, deny: () => { denied = true; } };
}
module.exports = (async () => {
  for (const [width, height] of [[390, 844], [820, 1180], [1180, 820]]) {
    const app = boot(width, height), nodes = app.nodes;
    await nodes['device-clear-diagnostic-run'].fire('click');
    assert.equal(app.calls.previews, 0); assert.equal(app.calls.clear, 0);
    assert.equal(nodes['device-local-clear-confirm'].hidden, true);
    let report = nodes['device-clear-diagnostic-output'].value;
    assert.match(report, /click监听登记=true/);
    assert.match(report, /阶段=0/);
    const open = nodes['device-local-clear-open'];
    for (const fn of app.listeners.click) fn({ type: 'click', target: open, defaultPrevented: false });
    await open.fire('click');
    assert.equal(nodes['device-local-clear-confirm'].hidden, false);
    assert.equal(nodes['device-local-clear-confirm'].parentElement, app.body);
    await open.fire('click'); assert.equal(app.body.children.length, 1);
    await nodes['device-clear-diagnostic-run-in-panel'].fire('click');
    report = nodes['device-clear-diagnostic-output-in-panel'].value;
    assert.match(report, /确认层父容器：body/);
    assert.match(report, /检测点未被遮挡/);
    assert.match(report, /click处理=2/);
    assert.match(report, /已请求显示确认层/);
    app.context.PocketClearDiagnostics.error(Error('PRIVATE_LEARNING_CONTENT_UID_123'));
    app.windowListeners.error({ filename: 'http://localhost/js/device-local-clear-ui.js', error: TypeError('PRIVATE_LEARNING_CONTENT_UID_123') });
    report = nodes['device-clear-diagnostic-output'].value;
    assert.ok(!report.includes('PRIVATE_LEARNING_CONTENT_UID_123'));
    assert.match(report, /TypeError/);
    assert.match(report, /代码=UNKNOWN/);
    app.context.PocketClearDiagnostics.error(Object.assign(Error('PRIVATE_LEARNING_CONTENT_UID_123'), {
      pocketClearCode: 'LOCK_BUSY', pocketClearStage: 'exclusive-acquire'
    }));
    report = nodes['device-clear-diagnostic-output'].value;
    assert.match(report, /代码=LOCK_BUSY；阶段=exclusive-acquire；分类=锁冲突/);
    assert.ok(!report.includes('PRIVATE_LEARNING_CONTENT_UID_123'));
    await nodes['device-clear-diagnostic-copy-in-panel'].fire('click');
    assert.equal(app.copied(), report);
    app.deny(); await nodes['device-clear-diagnostic-copy-in-panel'].fire('click');
    assert.equal(nodes['device-clear-diagnostic-output-in-panel'].selected, true);
    await nodes['device-local-clear-cancel'].fire('click');
    assert.equal(nodes['device-local-clear-confirm'].hidden, true);
    assert.equal(app.calls.clear, 0); assert.equal(app.calls.storage, 0); assert.equal(app.calls.firebase, 0);
  }
  assert.ok(!/showModal\(|\b(?:alert|confirm|prompt)\(/.test(uiSource));
  console.log('PASS: phone/tablet viewport DOM mocks, one body-level click confirmation, cancel safety, read-only diagnosis, click/binding/visibility traces, redacted errors, explicit copy/fallback and zero storage/Firebase access.');
})().catch(error => { console.error(error); process.exitCode = 1; });
