(function (global) {
  'use strict';
  // Loading the script twice must not give the current page two session locks.
  if (global.PocketDataDeletion) return;
  const EPOCH = 'pocket-data-epoch-v1';
  const bootEpoch = global.localStorage.getItem(EPOCH);
  let releaseSession, sessionError = null, clearing = false, sessionTransition = false;
  let sessionEntered = Promise.resolve(), sessionFinished = Promise.resolve();
  function holdSession() {
    if (!global.navigator?.locks) return;
    sessionError = null;
    let entered;
    sessionEntered = new Promise(resolve => { entered = resolve; });
    sessionFinished = Promise.resolve().then(() => global.navigator.locks.request('pocket-learning-session-v1', { mode: 'shared' }, async () => {
      await new Promise(release => { releaseSession = release; entered(); });
    })).catch(error => { sessionError = error; entered(); });
  }
  holdSession();
  async function waitForSession(promise, message) {
    let timeout;
    try {
      await Promise.race([promise, new Promise((_, reject) => {
        timeout = global.setTimeout(() => reject(Error(message)), 5000);
      })]);
    } finally { global.clearTimeout(timeout); }
  }
  async function exclusive(work) {
    if (!global.navigator?.locks) throw Error('当前浏览器无法安全隔离其他窗口，请使用支持安全锁的最新版浏览器。');
    if (clearing) throw Error('本机清空正在进行，请等待当前操作结束。');
    if (sessionTransition) throw Error('浏览器仍在释放当前窗口的会话锁，未清空本机数据。请稍后重试。');
    clearing = true;
    let released = false;
    try {
      await waitForSession(sessionEntered, '等待浏览器会话锁超时，尚未清空本机数据。请稍后重试。');
      if (sessionError) throw Error('无法建立本机会话锁：' + sessionError.message);
      releaseSession?.(); released = true;
      // Resolving the callback only requests release. The request promise settles
      // after the browser has actually released the lock, before we upgrade it.
      await waitForSession(sessionFinished, '浏览器尚未释放当前窗口的会话锁，未清空本机数据。请稍后重试。');
      if (sessionError) throw Error('当前窗口的会话锁释放失败：' + sessionError.message);
      return await global.navigator.locks.request('pocket-learning-session-v1', { mode: 'exclusive', ifAvailable: true }, async lock => {
        if (!lock) throw Error('请先关闭其他 Pocket 标签页或窗口，再清空本机数据。');
        return work();
      });
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
    const marker = JSON.parse(global.localStorage.getItem('pocket-local-reset-v1') || 'null');
    if (marker && marker.status !== 'complete') throw Error('本机清空未完成，已暂停学习保存，请重试清空。');
    if (global.localStorage.getItem(EPOCH) !== bootEpoch) throw Error('本机学习数据已清空，请重新加载后继续。');
  }
  function counts(materials) {
    return { materials: materials.length, groups: materials.reduce((sum, m) => sum + (m.groups || []).length, 0),
      runs: materials.reduce((sum, m) => sum + (m.groups || []).reduce((n, g) => n + (g.runs || []).length, 0), 0) };
  }
  function preview() {
    const raw = global.localStorage.getItem('cognivex-pocket-state');
    return { raw, counts: counts(raw === null ? [] : JSON.parse(raw).materials || []) };
  }
  async function clearLocal(expectedRaw) {
    return exclusive(async () => {
      if (global.localStorage.getItem('cognivex-pocket-state') !== expectedRaw) throw Error('学习记录已变化，请重新查看数量后确认。');
      const cloud = global.PocketCloudBackup;
      if (!cloud) throw Error('备份保护尚未就绪，未清空数据。');
      await cloud.pauseForLocalReset();
      const keys = [...cloud.DATA_KEYS, cloud.JOURNAL, 'pocket-data-deletion-v1'];
      for (let i = 0; i < global.localStorage.length; i++) {
        const key = global.localStorage.key(i);
        if (key?.startsWith('pocket-cloud-emergency-')) keys.push(key);
      }
      const original = keys.map(key => [key, global.localStorage.getItem(key)]);
      try {
        for (const key of keys) global.localStorage.removeItem(key);
        if (keys.some(key => global.localStorage.getItem(key) !== null)) throw Error('本机数据移除验证失败。');
        global.localStorage.setItem(EPOCH, global.crypto.randomUUID());
        const marker = JSON.parse(global.localStorage.getItem(cloud.LOCAL_RESET));
        global.localStorage.setItem(cloud.LOCAL_RESET, JSON.stringify({ ...marker, status: 'complete' }));
        return cloud.RESET_STATUS;
      } catch (error) {
        let rollbackError = '';
        try { for (const [key, raw] of original) { if (raw !== null) global.localStorage.setItem(key, raw); } }
        catch (rollback) { rollbackError = '部分本机数据未能回滚，请保持页面并重试。' + rollback.message; }
        throw Error('清空失败，自动备份保持暂停。' + (rollbackError || '原本机记录已保留，可重试。') + error.message);
      }
    });
  }
  global.PocketDataDeletion = Object.freeze({ EPOCH, ensureReady, counts, preview, clearLocal, exclusive });
})(globalThis);
