'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { local, remote, bind } = require('./helpers/pocket-cloud-fixture.cjs');
// A browser-like lock manager: callback completion schedules release on a
// later task, while request() resolves only AFTER that release. Real holders
// and pending requests are tracked separately for each simulated window.
function lockManager() {
  const held = new Set(), pending = [], closed = new Set();
  function compatible(job) { return ![...held].some(lock => lock.name === job.name && (lock.mode === 'exclusive' || job.mode === 'exclusive')); }
  function finish(job, value, error) {
    setImmediate(() => { held.delete(job); error ? job.reject(error) : job.resolve(value); drain(); });
  }
  function grant(job) {
    held.add(job);
    Promise.resolve().then(() => job.fn({ name: job.name, mode: job.mode }))
      .then(value => finish(job, value), error => finish(job, null, error));
  }
  function drain() {
    for (let i = 0; i < pending.length;) {
      const job = pending[i];
      if (!compatible(job)) { i++; continue; }
      pending.splice(i, 1); grant(job);
    }
  }
  return { held,
    client(id) { return { request(name, options, fn) {
      return new Promise((resolve, reject) => {
        const job = { id, name, mode: options.mode || 'exclusive', fn, resolve, reject };
        setImmediate(() => {
          if (closed.has(id)) { reject(Error('Window closed')); return; }
          if (compatible(job)) grant(job);
          else if (options.ifAvailable) Promise.resolve().then(() => fn(null)).then(resolve, reject);
          else pending.push(job);
        });
      });
    }, async query() {
      return { held: [...held].map(job => ({ name: job.name, mode: job.mode })), pending: pending.map(job => ({ name: job.name, mode: job.mode })) };
    } }; },
    close(id) {
      closed.add(id);
      for (const job of [...held]) if (job.id === id) { held.delete(job); job.reject(Error('Window closed')); }
      for (let i = pending.length - 1; i >= 0; i--) if (pending[i].id === id) pending.splice(i, 1)[0].reject(Error('Window closed'));
      drain();
    }
  };
}
const settle = async () => { for (let i = 0; i < 8; i++) await new Promise(resolve => setImmediate(resolve)); };
const source = fs.readFileSync(path.join(__dirname, '../js/data-deletion.js'), 'utf8');
(async () => {
  // Reproduce the previous bug: the current window itself denies the upgrade.
  const legacy = lockManager(), client = legacy.client('current');
  let entered, release;
  const ready = new Promise(resolve => { entered = resolve; });
  const holding = client.request('pocket-learning-session-v1', { mode: 'shared' }, async () => {
    entered(); await new Promise(resolve => { release = resolve; });
  });
  await ready; release();
  const selfBlocked = await client.request('pocket-learning-session-v1', { mode: 'exclusive', ifAvailable: true }, lock => !lock);
  assert.equal(selfBlocked, true, 'legacy release/request ordering must reproduce single-window false positive');
  await holding;
  // Production code waits for release completion, including delayed release.
  const cloud = remote(), manager = lockManager(), first = local(cloud, undefined, undefined, manager.client('first'));
  await settle(); await bind(first);
  assert.equal(manager.held.size, 1);
  vm.runInContext(source, first.context); await settle();
  assert.equal(manager.held.size, 1, 'duplicate script cannot count the current window twice');
  first.store.set('pocket-window-stale-marker', JSON.stringify({ id: 'closed', lastSeen: 0 }));
  const remoteBefore = JSON.stringify({ heads: [...cloud.heads], manifests: [...cloud.manifests], chunks: [...cloud.chunks] });
  const second = local(cloud, null, first.store, manager.client('second')); await settle();
  assert.equal(manager.held.size, 2);
  const localBefore = JSON.stringify([...first.store]);
  await assert.rejects(first.context.PocketDataDeletion.clearLocal(first.context.PocketDataDeletion.preview().raw), error => error.pocketClearCode === 'LOCK_BUSY' && error.pocketClearStage === 'exclusive-acquire');
  await settle();
  assert.equal(JSON.stringify([...first.store]), localBefore);
  assert.equal(manager.held.size, 2, 'failed attempt reacquires one current-window shared lock');
  const rejectedAttempt = first.context.PocketDataDeletion.lockState();
  assert.equal(rejectedAttempt.held, true);
  assert.equal(rejectedAttempt.acquisition.sharedHeld, false, 'the failure snapshot must not confuse reacquisition with self-lock');
  assert.equal(rejectedAttempt.acquisition.holders, 1);
  assert.equal(rejectedAttempt.acquisition.attempts, 1, 'a real holder must never be retried or bypassed');
  manager.close('second'); await settle();
  assert.equal(manager.held.size, 1);
  const message = await first.context.PocketDataDeletion.clearLocal(first.context.PocketDataDeletion.preview().raw);
  assert.equal(message, '本机学习数据已清空，Firebase 云端备份保留，自动备份已暂停。');
  assert.equal(first.store.has('cognivex-pocket-state'), false);
  assert.equal(first.store.has('pocket-window-stale-marker'), true, 'old storage markers never determine liveness');
  assert.equal(JSON.stringify({ heads: [...cloud.heads], manifests: [...cloud.manifests], chunks: [...cloud.chunks] }), remoteBefore);
  await settle(); manager.close('first'); await settle();
  const refreshed = local(cloud, null, first.store, manager.client('refreshed')); await settle();
  refreshed.context.PocketStorage.loadState(); await refreshed.engine.setUser({ uid: 'A' });
  await refreshed.engine.retry(); await refreshed.fire();
  assert.equal(refreshed.engine.view().localReset, true);
  assert.equal(JSON.parse(refreshed.store.get('cognivex-pocket-state')).materials.length, 0);
  assert.equal(JSON.stringify({ heads: [...cloud.heads], manifests: [...cloud.manifests], chunks: [...cloud.chunks] }), remoteBefore);
  // Native lock failures and a queued startup lock get their actual reasons.
  const denied = local(remote(), undefined, undefined, { request: () => Promise.reject(Error('SecurityError: denied')) });
  await settle();
  await assert.rejects(denied.context.PocketDataDeletion.clearLocal(denied.context.PocketDataDeletion.preview().raw), error => error.pocketClearCode === 'LOCK_FAILURE' && error.pocketClearStage === 'session-enter');
  assert.equal(denied.store.has('cognivex-pocket-state'), true);
  const stalled = local(remote(), undefined, undefined, { request: () => new Promise(() => {}) });
  const stalledClear = stalled.context.PocketDataDeletion.clearLocal(stalled.context.PocketDataDeletion.preview().raw);
  const timeoutCheck = assert.rejects(stalledClear, error => error.pocketClearCode === 'LOCK_TIMEOUT' && error.pocketClearStage === 'session-enter');
  await settle();
  [...stalled.timers.values()].find(timer => timer.delay === 5000).fn(); await timeoutCheck;
  assert.equal(stalled.store.has('cognivex-pocket-state'), true);
  // Duplicate confirmation while one reset is running is not blamed on tabs.
  const concurrentManager = lockManager(), concurrent = local(remote(), undefined, undefined, concurrentManager.client('one'));
  await settle();
  const raw = concurrent.context.PocketDataDeletion.preview().raw;
  const clearing = concurrent.context.PocketDataDeletion.clearLocal(raw);
  await assert.rejects(concurrent.context.PocketDataDeletion.clearLocal(raw), /本机清空正在进行/);
  await clearing;
  const lifecycle = {}, cachedManager = lockManager(), cachedCloud = remote();
  const cached = local(cachedCloud, undefined, undefined, cachedManager.client('cached'), lifecycle);
  await settle();
  const current = local(cachedCloud, null, cached.store, cachedManager.client('visible'));
  await settle();
  assert.equal(cachedManager.held.size, 2);
  lifecycle.pagehide();
  assert.throws(() => cached.context.PocketDataDeletion.ensureReady(), error => error.pocketClearCode === 'PAGE_SUSPENDED');
  await settle();
  assert.equal(cachedManager.held.size, 1, 'a retained document must release its shared lock on pagehide');
  await current.context.PocketDataDeletion.clearLocal(current.context.PocketDataDeletion.preview().raw);
  await settle();
  lifecycle.pageshow();
  assert.throws(() => cached.context.PocketDataDeletion.ensureReady(), error => error.pocketClearCode === 'PAGE_SUSPENDED');
  await settle();
  assert.throws(() => cached.context.PocketDataDeletion.ensureReady(), /已清空/);
  assert.equal(cached.store.has('cognivex-pocket-state'), false);
  assert.equal(cachedCloud.stats.writes, 0); assert.equal(cachedCloud.stats.commits, 0);
  lifecycle.pagehide(); lifecycle.pageshow();
  await settle();
  assert.equal([...cachedManager.held].filter(lock => lock.id === 'cached').length, 1);
  const earlyEvents = {}, earlyManager = lockManager();
  const early = local(remote(), undefined, undefined, earlyManager.client('early'), earlyEvents);
  earlyEvents.pagehide(); earlyEvents.pageshow();
  await settle();
  assert.equal(earlyManager.held.size, 1, 'early hide/show must not retain or duplicate the startup lock');
  early.context.PocketDataDeletion.ensureReady();
  const transientManager = lockManager(), nativeClient = transientManager.client('transient');
  let refusedOnce = false;
  const transient = local(remote(), undefined, undefined, {
    query: nativeClient.query,
    request(name, options, callback) {
      if (options.mode === 'exclusive' && !refusedOnce) { refusedOnce = true; return Promise.resolve(callback(null)); }
      return nativeClient.request(name, options, callback);
    }
  });
  await settle();
  let continueWork;
  const workFinished = new Promise(resolve => { continueWork = resolve; });
  const upgrade = transient.context.PocketDataDeletion.exclusive(() => workFinished, { pauseWrites: true });
  assert.throws(() => transient.context.PocketDataDeletion.ensureReady(), error => error.pocketClearCode === 'LOCAL_WRITES_PAUSED');
  await settle();
  assert.equal(transient.context.PocketDataDeletion.lockState().exclusiveHeld, true);
  assert.equal(transient.context.PocketDataDeletion.lockState().acquisition.attempts, 2);
  continueWork(); await upgrade; await settle();
  transient.context.PocketDataDeletion.ensureReady();
  assert.equal(transient.context.PocketDataDeletion.lockState().pauseWrites, false);
  console.log('PASS: reproduced legacy self-lock race; asynchronous release fixes single-window reset, real second-window protection, closed/stale/duplicate/refreshed windows, persistent upload pause, no cloud restore/write, specific errors and concurrency.');
})().catch(error => { console.error(error); process.exitCode = 1; });
