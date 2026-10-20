(function (global) {
  'use strict';
  const VERSION = 'local-clear-v3';
  const JOURNAL = 'pocket-device-clear-journal-v1';
  const RESET = 'pocket-local-reset-v1';
  const EPOCH = 'pocket-data-epoch-v1';
  const CONTROL = 'pocket-cloud-control-v1';
  const KEYS = Object.freeze(['cognivex-pocket-state', 'pocket-listening-start-v1', 'pocket-training-sop-model-v1',
    'pocket-last-view-v1', 'pocket-view-history-v1', 'pocket-offline-backup-meta-v1',
    'pocket-daily-review-test-date-v1', 'pocket-data-deletion-v1']);
  const SAFETY_KEYS = [RESET, EPOCH, CONTROL, JOURNAL, 'pocket-cloud-restore-journal-v1',
    'pocket-offline-restore-pause-v1', 'pocket-fresh-start-v1', 'pocket-cloud-new-start-v1'];
  const emergency = key => /^pocket-cloud-emergency-[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(key || '');
  const allowed = key => KEYS.includes(key) || emergency(key);
  const learningSnapshot = values => JSON.stringify(values.filter(([key]) => key !== 'pocket-last-view-v1' && key !== 'pocket-view-history-v1'));
  let recoveryError = '', working = false;
  const previews = new WeakSet();
  function storage() {
    const env = global.PocketEnvironment;
    const descriptor = Object.getOwnPropertyDescriptor(global, 'PocketEnvironment');
    if (!env || !Object.isFrozen(env) || descriptor?.writable !== false || descriptor?.configurable !== false || env.version !== 1 ||
        (env.isTest !== true && env.isTest !== false) || env.firebaseAllowed !== !env.isTest || env.prefix !== (env.isTest ? 'pocket-development-v1:' : '')) throw Error('无法识别当前环境，未清除数据。');
    return env.requireStorage();
  }
  const readMarker = store => JSON.parse(store.getItem(RESET) || 'null');
  function entries(store, includeSafety = false) {
    if (!Number.isSafeInteger(store.length) || store.length < 0) throw Error('无法确定 Pocket 数据键。');
    const result = [];
    for (let index = 0; index < store.length; index++) {
      const key = store.key(index);
      if (!allowed(key) && !(includeSafety && SAFETY_KEYS.includes(key))) continue;
      const value = store.getItem(key);
      if (value === null) throw Error('本地数据正在变化，请重新检测。');
      result.push([key, value]);
    }
    return result.sort(([first], [second]) => first.localeCompare(second));
  }
  const bytes = values => values.reduce((total, [key, value]) => total + (global.PocketEnvironment.prefix.length + key.length + value.length) * 2, 0);
  function verifyEntries(store, values) {
    for (const [key, value] of values) if (store.getItem(key) !== value) throw Error('本地数据核对失败。');
  }
  function rollback(store, journal) {
    if (journal?.version !== 1 || !Array.isArray(journal.entries) || !journal.entries.every(entry => Array.isArray(entry) && entry.length === 2 && allowed(entry[0]) && typeof entry[1] === 'string') ||
        !(journal.epoch === null || typeof journal.epoch === 'string') || !readMarker(store)?.deviceOnly) throw Error('清除保护日志无法验证，已停止恢复与清除。');
    const rollingBack = JSON.stringify({ ...readMarker(store), status: 'clearing', failed: true });
    store.setItem(RESET, rollingBack);
    if (store.getItem(RESET) !== rollingBack) throw Error('无法建立回滚保护，已停止操作。');
    for (const [key, value] of journal.entries) store.setItem(key, value);
    if (journal.epoch === null) store.removeItem(EPOCH); else store.setItem(EPOCH, journal.epoch);
    verifyEntries(store, journal.entries);
    if (store.getItem(EPOCH) !== journal.epoch) throw Error('本地版本标记恢复失败。');
    const text = JSON.stringify({ ...readMarker(store), status: 'complete', failed: true });
    store.setItem(RESET, text);
    if (store.getItem(RESET) !== text) throw Error('回滚保护标记无法保存。');
    store.removeItem(JOURNAL);
    if (store.getItem(JOURNAL) !== null) throw Error('回滚保护日志无法移除。');
  }
  async function recover() {
    if (!global.PocketDataDeletion?.exclusive) throw Error('安全窗口锁尚未就绪，未恢复清除保护日志。');
    return global.PocketDataDeletion.exclusive(() => {
      const store = storage(), raw = store.getItem(JOURNAL);
      if (raw === null) return false;
      const marker = readMarker(store);
      if (!marker?.deviceOnly) throw Error('清除保护标记缺失，未操作现有数据。');
      const interrupted = marker.status !== 'complete' || marker.failed;
      if (interrupted) rollback(store, JSON.parse(raw));
      else store.removeItem(JOURNAL);
      recoveryError = ''; return interrupted;
    });
  }
  function preview() {
    if (recoveryError) throw Error(recoveryError);
    const store = storage();
    if (store.getItem(JOURNAL) !== null) throw Error('上次清除保护尚未完成，请刷新后重试。');
    for (const key of ['pocket-fresh-start-v1', 'pocket-cloud-new-start-v1', 'pocket-cloud-restore-journal-v1']) {
      if (store.getItem(key) !== null) throw Error('存在未完成的备份或恢复流程，未清除数据。');
    }
    const values = entries(store);
    const meta = JSON.parse(store.getItem(CONTROL) || 'null');
    const backupTime = meta && typeof meta.owner === 'string' && typeof meta.snapshotId === 'string' && typeof meta.hash === 'string' &&
      Number.isSafeInteger(meta.revision) && meta.revision > 0 && Number.isFinite(meta.lastSuccessAt) && meta.lastSuccessAt > 0 ? meta.lastSuccessAt : null;
    const result = Object.freeze({ environment: global.PocketEnvironment.isTest ? '开发测试版' : '正式版',
      bytes: bytes(values), snapshot: JSON.stringify(values), learningSnapshot: learningSnapshot(values), backupTime });
    previews.add(result); return result;
  }
  async function clear(prepared, confirmation) {
    if (confirmation !== '清除本地数据' || !previews.has(prepared)) throw Error('请完成两次确认，并准确输入「清除本地数据」。');
    if (working) throw Error('本地清除正在执行。');
    const deletion = global.PocketDataDeletion, cloud = global.PocketCloudBackup;
    if (!deletion?.exclusive || !cloud?.pauseForLocalReset) throw Error('云端隔离或安全锁尚未就绪，未清除数据。');
    working = true;
    try {
      return await deletion.exclusive(async () => {
        const store = storage();
        const current = preview();
        if (current.learningSnapshot !== prepared.learningSnapshot || current.environment !== prepared.environment) throw Error('本地记录已变化，请重新查看清除范围并确认。');
        const epoch = store.getItem(EPOCH);
        await cloud.pauseForLocalReset({ deviceOnly: true });
        deletion.assertActive?.();
        const originals = entries(store);
        if (learningSnapshot(originals) !== prepared.learningSnapshot) throw Error('暂停期间本地记录变化，未清除数据，请刷新后重新确认。');
        const journal = { version: 1, entries: originals, epoch };
        const text = JSON.stringify(journal);
        store.setItem(JOURNAL, text);
        if (store.getItem(JOURNAL) !== text) throw Error('清除回滚日志未能可靠保存，未清除数据。');
        try {
          for (const [key] of originals) store.removeItem(key);
          if (originals.some(([key]) => store.getItem(key) !== null)) throw Error('本地数据删除验证失败。');
          const nextEpoch = global.crypto.randomUUID();
          store.setItem(EPOCH, nextEpoch);
          if (store.getItem(EPOCH) !== nextEpoch) throw Error('清除版本标记无法保存。');
          const complete = JSON.stringify({ ...readMarker(store), deviceOnly: true, status: 'complete', failed: false, epoch: nextEpoch });
          store.setItem(RESET, complete);
          if (store.getItem(RESET) !== complete) throw Error('清除完成状态无法保存。');
          store.removeItem(JOURNAL);
          if (store.getItem(JOURNAL) !== null) throw Error('清除保护日志未能移除。');
        } catch (error) {
          try { rollback(store, journal); }
          catch (failure) { recoveryError = '回滚尚未完成，保护日志已保留，自动备份保持暂停。' + failure.message; }
          throw Error('清除失败，自动备份保持暂停。' + (recoveryError || '原本机记录已回滚。') + error.message);
        }
        previews.delete(prepared);
        return '本设备 Pocket 本地学习数据已清除';
      }, { pauseWrites: true });
    } finally { working = false; }
  }
  function usage() { return bytes(entries(storage(), true)); }
  function completed() {
    const store = storage(), marker = readMarker(store);
    if (!marker?.deviceOnly || marker.status !== 'complete' || marker.failed || typeof marker.epoch !== 'string' || marker.epoch !== store.getItem(EPOCH)) return false;
    const raw = store.getItem('cognivex-pocket-state');
    if (raw === null) return true;
    try {
      const state = JSON.parse(raw);
      return state?.version === 1 && Array.isArray(state.materials) && state.materials.length === 0 && state.currentSession === null &&
        !state.materialReviewSession && !state.dailyReviewSession && state.review?.lastReviewedAt === null &&
        (!state.review.roundHistory || (Array.isArray(state.review.roundHistory) && state.review.roundHistory.length === 0));
    } catch (_) { return false; }
  }
  global.PocketDeviceLocalData = Object.freeze({ VERSION, KEYS, JOURNAL, preview, clear, usage, completed, recover, getError: () => recoveryError });
  global.document?.addEventListener('DOMContentLoaded', async () => {
    try {
      if (storage().getItem(JOURNAL) !== null && await recover()) global.location.reload();
    } catch (error) {
      recoveryError = error.message;
      const status = global.document.getElementById('device-local-clear-status');
      if (status) status.textContent = '清除保护尚未完成：' + recoveryError;
    }
  });
})(globalThis);
