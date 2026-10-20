'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const html = fs.readFileSync(path.join(__dirname, '../index.html'), 'utf8');
const version = html.match(/data-clear-version="([^"]+)"/)[1];
const source = fs.readFileSync(path.join(__dirname, '../js/device-local-clear-ui.js'), 'utf8');
const css = fs.readFileSync(path.join(__dirname, '../css/style.css'), 'utf8');
function boot(options = {}) {
  const nodes = {}, ids = ['confirm', 'status', 'text', 'submit', 'second', 'continue', 'open', 'cancel', 'title', 'preview', 'backup', 'version', 'progress'];
  for (const id of ids) nodes[id] = { hidden: ['confirm', 'second'].includes(id), disabled: id === 'submit', value: '', textContent: '', events: {},
    addEventListener(name, listener) { this.events[name] = listener; },
    focus() { if (options.focusFailure) throw Error('Focus unavailable'); },
    scrollIntoView(argument) { if (options.scrollOptionsFailure && typeof argument === 'object') throw Error('Scroll options unavailable'); this.revealed = true; },
    async fire(name, event) { return this.events[name]?.(event); } };
  nodes.root = { getAttribute: () => version };
  const counts = { previews: 0, clears: 0, reloads: 0, refreshes: 0 };
  let cleared = false;
  const service = { VERSION: version, preview() {
    counts.previews++; if (options.previewFailure) throw Error('本地数据读取失败');
    return { environment: '开发测试版', bytes: 1024, backupTime: null };
  }, async clear(prepared, text) {
    assert.equal(text, '清除本地数据'); counts.clears++;
    if (options.clearFailure) throw Error('无法取得安全锁，未清除数据');
    cleared = true; return '本设备 Pocket 本地学习数据已清除';
  }, completed: () => cleared, getError: () => '' };
  const body = { style: { overflow: 'auto' }, children: [], append(node) { node.parentElement = this; this.children.push(node); } };
  const context = vm.createContext({ Date, PocketDeviceLocalData: service, document: { body,
    getElementById: id => id === 'device-local-clear' ? nodes.root : nodes[id.replace('device-local-clear-', '')] },
    PocketLocalCapacity: { refresh() { counts.refreshes++; } }, location: { reload() { counts.reloads++; } } });
  vm.runInContext(source, context);
  return { nodes, counts, body };
}
const point = { clientX: 20, clientY: 20 };
async function tap(node) {
  let prevented = false;
  await node.fire('touchstart', { touches: [point] });
  await node.fire('touchend', { touches: [], changedTouches: [point], cancelable: true, preventDefault() { prevented = true; } });
  assert.equal(prevented, false);
  await node.fire('click', { detail: 1, preventDefault() {} });
}
module.exports = (async () => {
  const app = boot({ focusFailure: true, scrollOptionsFailure: true });
  await tap(app.nodes.open);
  assert.equal(app.nodes.confirm.hidden, false);
  assert.match(app.nodes.progress.textContent, /尚未删除/);
  assert.equal(app.counts.previews, 1); assert.equal(app.counts.clears, 0);
  assert.equal(app.nodes.confirm.parentElement, app.body);
  await app.nodes.open.fire('click', { detail: 1 });
  assert.equal(app.counts.previews, 1);
  assert.equal(app.body.children.length, 1);
  assert.equal(app.body.style.overflow, 'hidden');
  await tap(app.nodes.cancel);
  assert.equal(app.nodes.confirm.hidden, true);
  assert.equal(app.counts.clears, 0); assert.equal(app.body.style.overflow, 'auto');
  assert.match(app.nodes.status.textContent, /已取消/); assert.equal(app.nodes.status.revealed, true);
  await tap(app.nodes.open); await tap(app.nodes.continue);
  assert.equal(app.nodes.second.hidden, false); assert.equal(app.nodes.submit.disabled, true);
  app.nodes.text.value = '错误文字'; await app.nodes.text.fire('input');
  await tap(app.nodes.submit); assert.equal(app.counts.clears, 0);
  app.nodes.text.value = '清除本地数据'; await app.nodes.text.fire('compositionend');
  assert.equal(app.nodes.submit.disabled, false);
  await tap(app.nodes.submit);
  assert.equal(app.counts.clears, 1); assert.equal(app.counts.reloads, 1);
  assert.match(app.nodes.status.textContent, /已清除/); assert.equal(app.body.style.overflow, 'auto');
  const scroll = boot();
  await scroll.nodes.open.fire('touchstart', { touches: [point] });
  await scroll.nodes.open.fire('touchmove', { touches: [{ clientX: 20, clientY: 100 }] });
  await scroll.nodes.open.fire('touchend', { touches: [], changedTouches: [{ clientX: 20, clientY: 100 }], preventDefault() { throw Error('Must not cancel scrolling'); } });
  assert.equal(scroll.counts.previews, 0);
  await scroll.nodes.open.fire('click', { detail: 0 });
  assert.equal(scroll.nodes.confirm.hidden, false);
  const failure = boot({ clearFailure: true });
  await tap(failure.nodes.open); await tap(failure.nodes.continue);
  failure.nodes.text.value = '清除本地数据'; await failure.nodes.text.fire('change');
  await tap(failure.nodes.submit);
  assert.equal(failure.nodes.confirm.hidden, false); assert.equal(failure.counts.reloads, 0);
  assert.match(failure.nodes.status.textContent, /未清除/); assert.equal(failure.nodes.status.revealed, true);
  const unreadable = boot({ previewFailure: true }); await tap(unreadable.nodes.open);
  assert.equal(unreadable.nodes.confirm.hidden, true); assert.equal(unreadable.counts.clears, 0);
  assert.match(unreadable.nodes.status.textContent, /读取失败/);
  assert.match(css, /#device-local-clear-confirm \{ position: fixed; top: 0; right: 0; bottom: 0; left: 0; z-index: 100;/);
  assert.ok(!source.includes("addEventListener('touchend'"));
  assert.ok(!source.includes('lastTouch'));
  assert.match(html, /id="device-local-clear-confirm"[^>]*aria-modal="true"/);
  assert.ok(!/id="device-local-clear-open"[^>]*\bdisabled\b/.test(html));
  assert.ok(!/showModal\(|\b(?:alert|confirm|prompt)\(/.test(source));
  console.log('PASS: standard click activation after touch, one body-level confirmation, repeated-open idempotency, no touch interception, focus/scroll fallback, cancel/no deletion, IME confirmation, single clear and visible errors.');
})().catch(error => { console.error(error); process.exitCode = 1; });
