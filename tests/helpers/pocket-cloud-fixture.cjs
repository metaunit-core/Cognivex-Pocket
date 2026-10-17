'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { webcrypto } = require('node:crypto');
const { TextEncoder } = require('node:util');
const sources = Object.fromEntries(['data-deletion', 'cloud-backup', 'learning-backup', 'storage'].map(name =>
  [name, fs.readFileSync(path.join(__dirname, '../../js', name + '.js'), 'utf8')]));
const initial = () => ({ version: 1, review: { lastReviewedAt: null, roundHistory: [] },
  currentSession: { currentStep: 'output', currentGroupIndex: 0 }, materials: [
    { id: 'A', groups: [{ id: 'a1', keyQuestions: '第3题', runs: [{ startedAt: 1, completedAt: 2 }] }], materialReviewHistory: [] }
  ], future: { preserve: '未知 🧠' } });
function remote() {
  const heads = new Map(), manifests = new Map(), chunks = new Map();
  const stats = { commits: 0, writes: 0, fail: false, partial: false, onCommit: null, onWrite: null, afterCommit: false };
  const id = (uid, snapshot) => uid + '/' + snapshot;
  const adapter = {
    async head(uid) { if (stats.fail) throw Error('Offline'); return heads.get(uid) || null; },
    async manifest(uid, snapshot) { return manifests.get(id(uid, snapshot)) || null; },
    async chunk(uid, snapshot, index) { return chunks.get(id(uid, snapshot) + '/' + index) || null; },
    async writeChunk(uid, snapshot, index, value) {
      if (stats.fail || stats.partial) throw Error('Write denied');
      assert.equal(chunks.has(id(uid, snapshot) + '/' + index), false);
      chunks.set(id(uid, snapshot) + '/' + index, structuredClone(value)); stats.writes++;
      if (stats.onWrite) { const fn = stats.onWrite; stats.onWrite = null; await fn(); }
    },
    async commit(uid, snapshot, expected, manifest, guard = () => {}) {
      if (stats.onCommit) { const fn = stats.onCommit; stats.onCommit = null; await fn(); }
      guard();
      if ((heads.get(uid)?.revision || 0) !== expected) throw Object.assign(Error('Conflict'), { conflict: true });
      assert.equal(manifests.has(id(uid, snapshot)), false);
      manifests.set(id(uid, snapshot), structuredClone({ ...manifest, createdAt: Date.now() }));
      heads.set(uid, { uid, revision: expected + 1, snapshotId: snapshot, dataHash: manifest.dataHash }); stats.commits++;
      if (stats.afterCommit) throw Error('Lost acknowledgement');
    },
    async list(uid) { return [...manifests].filter(([key]) => key.startsWith(uid + '/')).map(([key, value]) => ({ id: key.split('/')[1], ...value })); }
  };
  return { adapter, heads, manifests, chunks, stats };
}
function local(cloud, seed = initial(), existing, locks) {
  const store = existing || new Map();
  if (!existing) {
    store.set('cognivex-pocket-state', JSON.stringify(seed));
    store.set('pocket-listening-start-v1', JSON.stringify({ subject: { status: 'paused', remaining: 5000 } }));
    store.set('pocket-training-sop-model-v1', JSON.stringify({ purpose: '输入' }));
    store.set('pocket-last-view-v1', JSON.stringify({ page: 'learning' }));
    store.set('pocket-view-history-v1', JSON.stringify([{ page: 'home' }]));
    store.set('firebase:authUser:secret', 'must never upload');
  }
  let online = true, clock = 1000000, failKey = null;
  const timers = new Map(); let timerId = 0;
  const setTimeout = (fn, delay) => { const id = ++timerId; timers.set(id, { fn, delay }); return id; };
  const context = vm.createContext({ crypto: webcrypto, TextEncoder, structuredClone, console,
    setTimeout, clearTimeout: id => timers.delete(id),
    navigator: { locks: locks || { request: async (name, options, fn) => fn({ name }) } },
    localStorage: { get length() { return store.size; }, key: i => [...store.keys()][i] ?? null, getItem: key => store.get(key) ?? null,
      setItem(key, value) { if (key === failKey) { failKey = null; throw Error('Quota blocked'); } store.set(key, value); },
      removeItem(key) { if (key === failKey) { failKey = null; throw Error('Removal blocked'); } store.delete(key); } } });
  require('./environment.cjs')(context);
  for (const name of ['data-deletion', 'cloud-backup', 'learning-backup', 'storage']) vm.runInContext(sources[name], context);
  const engine = context.PocketCloudBackup.createEngine({ adapter: cloud.adapter, now: () => clock,
    online: () => online, debounce: 15, interval: 300, setTimeout, clearTimeout: id => timers.delete(id) });
  return { context, engine, store, timers, online(value) { online = value; }, advance(value) { clock += value; },
    fail(key) { failKey = key; }, async fire() { const next = [...timers.values()].pop(); timers.clear(); if (next) await next.fn(); await new Promise(resolve => setImmediate(resolve)); },
    change(fn) { const state = context.PocketStorage.loadState(); return context.PocketStorage.updateState(state, fn); } };
}
async function bind(device, uid = 'A', allowLoss = false) {
  await device.engine.setUser({ uid, email: uid + '@example.test' });
  if (device.engine.view().bound && !device.engine.view().comparison) return;
  const compared = device.engine.view().comparison || await device.engine.compare();
  await device.engine.bindLocal(compared, allowLoss);
}

module.exports = { local, remote, bind, initial };
