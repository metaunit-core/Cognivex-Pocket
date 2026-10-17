(function (global) {
  'use strict';
  const PREFIX = 'pocket-development-v1:';
  const KEYS = Object.freeze(['cognivex-pocket-state', 'pocket-listening-start-v1', 'pocket-training-sop-model-v1',
    'pocket-last-view-v1', 'pocket-view-history-v1', 'pocket-offline-backup-meta-v1', 'pocket-cloud-control-v1',
    'pocket-cloud-restore-journal-v1', 'pocket-local-reset-v1', 'pocket-fresh-start-v1', 'pocket-cloud-new-start-v1',
    'pocket-offline-restore-pause-v1', 'pocket-data-deletion-v1', 'pocket-daily-review-test-date-v1']);
  function assertAllowed() {
    const env = global.PocketEnvironment;
    const descriptor = Object.getOwnPropertyDescriptor(global, 'PocketEnvironment');
    if (!env || !descriptor || descriptor.writable !== false || descriptor.configurable !== false || !Object.isFrozen(env) || env.version !== 1 || env.isTest !== true || env.firebaseAllowed !== false || env.prefix !== PREFIX) throw Error('仅允许已确认的电脑本地测试环境清空测试数据。');
    const url = new URL(global.location.href), host = url.hostname.toLowerCase();
    const loopback = ['localhost', '[::1]'].includes(host) || host.endsWith('.localhost') || /^127(?:\.\d{1,3}){3}$/.test(host);
    if (!((url.protocol === 'file:' && !host) || (['http:', 'https:'].includes(url.protocol) && loopback))) throw Error('当前地址不是本地开发预览。');
    const nav = global.navigator;
    if (!/^(Win32|Win64|MacIntel|MacPPC|Linux x86_64)$/.test(nav?.platform || '') || nav.userAgentData?.mobile === true ||
      /Android|iPhone|iPad|iPod|Windows Phone|Mobile/i.test(nav.userAgent || '') || (/^Mac/.test(nav.platform) && nav.maxTouchPoints > 1) ||
      !global.matchMedia?.('(pointer: fine)').matches || !global.matchMedia?.('(hover: hover)').matches) throw Error('此清空工具仅供电脑端使用。');
    const store = env.requireStorage();
    if (store !== env.storage) throw Error('测试存储适配器未通过验证。');
    return store;
  }
  try { assertAllowed(); } catch (_) { return; }
  let busy = false;
  async function clear() {
    assertAllowed();
    if (busy) throw Error('测试数据正在清空，请稍候。');
    if (!global.confirm('确定清空电脑测试版的全部学习数据吗？此操作不可撤销，但不会影响手机正式版和 Firebase 云端备份。')) return false;
    busy = true;
    try {
      await global.PocketDataDeletion.exclusive(() => {
        const store = assertAllowed(), keys = [...KEYS];
        for (let i = 0; i < store.length; i++) {
          const key = store.key(i);
          if (/^pocket-cloud-emergency-[0-9a-f-]{36}$/i.test(key || '')) keys.push(key);
        }
        keys.push(global.PocketDataDeletion.EPOCH);
        const originals = keys.map(key => [key, store.getItem(key)]);
        try {
          for (const key of keys) store.removeItem(key);
          store.setItem(global.PocketDataDeletion.EPOCH, global.crypto.randomUUID());
          global.PocketDataDeletion.acceptLocalTestReset();
        } catch (error) {
          for (const [key, value] of originals) { if (value === null) store.removeItem(key); else store.setItem(key, value); }
          throw error;
        }
      });
      global.PocketCloudSignal.recoverPending(); // Test-only journals have been removed; no cloud engine exists.
      global.dispatchEvent(new Event('pocket-local-test-cleared'));
      global.PocketDailyTestDate?.reset();
      return true;
    } finally { busy = false; }
  }
  global.PocketLocalTestTools = Object.freeze({ assertAllowed, clear, KEYS });
  const button = global.document?.getElementById('clear-local-test-data');
  if (button) {
    button.hidden = false;
    button.addEventListener('click', async () => {
      button.disabled = true;
      const status = global.document.getElementById('clear-local-test-status');
      try { if (await clear()) status.textContent = '全部测试学习数据已清空，模拟日期已恢复真实日期。'; }
      catch (error) { status.textContent = '未能完成测试清空：' + error.message; }
      finally { button.disabled = false; }
    });
  }
})(globalThis);
