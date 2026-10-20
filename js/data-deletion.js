(function (global) {
  'use strict';
  const pocketLocalStore = globalThis.PocketEnvironment.requireStorage();
  // Loading the script twice must not give the current page two session locks.
  if (global.PocketDataDeletion) return;
  const EPOCH = 'pocket-data-epoch-v1';
  let bootEpoch = pocketLocalStore.getItem(EPOCH);
  let releaseSession, sessionError = null, clearing = false, sessionTransition = false;
  let sessionEntered = Promise.resolve(), sessionFinished = Promise.resolve();
  let suspended = false, resuming = false, held = false, exclusiveHeld = false, phase = 'idle';
  function failure(code, stage, message) {
    return Object.assign(Error(message), { pocketClearCode: code, pocketClearStage: stage });
  }
  function assertActive() {
    if (suspended || resuming) throw failure('PAGE_SUSPENDED', 'lifecycle', '页面已离开或正在恢复，未继续清除。请返回页面后重试。');
  }
  function holdSession() {
    if (!global.navigator?.locks || suspended) return;
    sessionError = null;
    let entered;
    sessionEntered = new Promise(resolve => { entered = resolve; });
    sessionFinished = Promise.resolve().then(() => global.navigator.locks.request('pocket-learning-session-v1', { mode: 'shared' }, async () => {
      held = true;
      await new Promise(release => { releaseSession = release; entered(); if (suspended) release(); });
      held = false;
    })).catch(error => { sessionError = error; entered(); });
    sessionEntered.then(() => { if (!suspended && !sessionError) resuming = false; });
  }
  holdSession();
  global.addEventListener?.('pagehide', () => {
    suspended = true;
    const entered = sessionEntered;
    entered.then(() => { releaseSession?.(); });
    releaseSession?.();
  });
  global.addEventListener?.('pageshow', () => {
    if (!suspended) return;
    suspended = false; resuming = !!global.navigator?.locks;
    if (clearing || sessionTransition) return;
    sessionTransition = true;
    sessionFinished.then(() => {
      releaseSession = null; holdSession(); sessionTransition = false;
    });
  });
  async function waitForSession(promise, message) {
    let timeout;
    try {
      await Promise.race([promise, new Promise((_, reject) => {
        timeout = global.setTimeout(() => reject(failure('LOCK_TIMEOUT', phase, message)), 5000);
      })]);
    } finally { global.clearTimeout(timeout); }
  }
  async function exclusive(work) {
    assertActive();
    if (!global.navigator?.locks) throw Error('当前浏览器无法安全隔离其他窗口，请使用支持安全锁的最新版浏览器。');
    if (clearing) throw Error('本机清空正在进行，请等待当前操作结束。');
    if (sessionTransition) throw Error('浏览器仍在释放当前窗口的会话锁，未清空本机数据。请稍后重试。');
    clearing = true;
    let released = false;
    try {
      phase = 'session-enter';
      await waitForSession(sessionEntered, '等待浏览器会话锁超时，尚未清空本机数据。请稍后重试。');
      if (sessionError) throw Error('无法建立本机会话锁：' + sessionError.message);
      releaseSession?.(); released = true;
      phase = 'session-release';
      // Resolving the callback only requests release. The request promise settles
      // after the browser has actually released the lock, before we upgrade it.
      await waitForSession(sessionFinished, '浏览器尚未释放当前窗口的会话锁，未清空本机数据。请稍后重试。');
      if (sessionError) throw Error('当前窗口的会话锁释放失败：' + sessionError.message);
      phase = 'exclusive-acquire';
      return await global.navigator.locks.request('pocket-learning-session-v1', { mode: 'exclusive', ifAvailable: true }, async lock => {
        if (!lock) throw failure('LOCK_BUSY', phase, '浏览器未授予独占锁。请先关闭其他 Pocket 页面（包括后台保留页面），再重试；尚未清除数据。');
        assertActive();
        exclusiveHeld = true; phase = 'clear-work';
        try { return await work(); } finally { exclusiveHeld = false; }
      });
    } catch (error) {
      if (error?.pocketClearCode) throw error;
      if (phase !== 'clear-work') throw failure('LOCK_FAILURE', phase, '安全锁申请或释放失败，未清除数据。请复制诊断结果后重试。');
      try { error.pocketClearStage = phase; } catch (_) {}
      throw error;
    } finally {
      // After a release timeout, finish releasing before reacquiring; never
      // create a second current-page lock while the first one is still held.
      if (released || sessionError) {
        sessionTransition = true;
        sessionFinished.then(() => { releaseSession = null; holdSession(); sessionTransition = false; });
      }
      clearing = false;
    }
  }
  function ensureReady() {
    assertActive();
    const marker = JSON.parse(pocketLocalStore.getItem('pocket-local-reset-v1') || 'null');
    if (marker && marker.status !== 'complete') throw Error('本机清空未完成，已暂停学习保存，请重试清空。');
    if (pocketLocalStore.getItem(EPOCH) !== bootEpoch) throw Error('本机学习数据已清空，请重新加载后继续。');
  }
  function counts(materials) {
    return { materials: materials.length, groups: materials.reduce((sum, m) => sum + (m.groups || []).length, 0),
      runs: materials.reduce((sum, m) => sum + (m.groups || []).reduce((n, g) => n + (g.runs || []).length, 0), 0) };
  }
  function preview() {
    const raw = pocketLocalStore.getItem('cognivex-pocket-state');
    return { raw, counts: counts(raw === null ? [] : JSON.parse(raw).materials || []) };
  }
  async function clearLocal(expectedRaw) {
    return exclusive(async () => {
      if (pocketLocalStore.getItem('cognivex-pocket-state') !== expectedRaw) throw Error('学习记录已变化，请重新查看数量后确认。');
      const cloud = global.PocketCloudBackup;
      if (!cloud) throw Error('备份保护尚未就绪，未清空数据。');
      await cloud.pauseForLocalReset();
      assertActive();
      const keys = [...cloud.DATA_KEYS, cloud.JOURNAL, 'pocket-data-deletion-v1'];
      for (let i = 0; i < pocketLocalStore.length; i++) {
        const key = pocketLocalStore.key(i);
        if (key?.startsWith('pocket-cloud-emergency-')) keys.push(key);
      }
      const original = keys.map(key => [key, pocketLocalStore.getItem(key)]);
      try {
        for (const key of keys) pocketLocalStore.removeItem(key);
        if (keys.some(key => pocketLocalStore.getItem(key) !== null)) throw Error('本机数据移除验证失败。');
        pocketLocalStore.setItem(EPOCH, global.crypto.randomUUID());
        const marker = JSON.parse(pocketLocalStore.getItem(cloud.LOCAL_RESET));
        pocketLocalStore.setItem(cloud.LOCAL_RESET, JSON.stringify({ ...marker, status: 'complete' }));
        return cloud.RESET_STATUS;
      } catch (error) {
        let rollbackError = '';
        try { for (const [key, raw] of original) { if (raw !== null) pocketLocalStore.setItem(key, raw); } }
        catch (rollback) { rollbackError = '部分本机数据未能回滚，请保持页面并重试。' + rollback.message; }
        throw Error('清空失败，自动备份保持暂停。' + (rollbackError || '原本机记录已保留，可重试。') + error.message);
      }
    });
  }
  function acceptLocalTestReset() {
    global.PocketLocalTestTools.assertAllowed();
    if (!clearing) throw Error('测试清空必须持有安全窗口锁。');
    bootEpoch = pocketLocalStore.getItem(EPOCH);
  }
  global.PocketDataDeletion = Object.freeze({ EPOCH, ensureReady, counts, preview, clearLocal, exclusive, acceptLocalTestReset,
    assertActive, lockState: () => ({ revision: 'clear-lock-r1', phase, held, exclusiveHeld, suspended, resuming, clearing, sessionTransition }) });
})(globalThis);
