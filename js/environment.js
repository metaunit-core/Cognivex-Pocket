(function (global) {
  'use strict';
  const BLOCKED = '安全阻断：环境初始化失败，已停止学习存储与 Firebase。请检查页面文件后重新加载。';
  function show(message) {
    const banner = global.document?.getElementById('environment-banner');
    if (banner) { banner.textContent = message; banner.hidden = !message; }
  }
  let environment, initialized = false;
  try {
    const url = new URL(global.location.href);
    if (!['http:', 'https:', 'file:'].includes(url.protocol)) throw Error('无法识别的页面地址');
    const path = decodeURIComponent(url.pathname);
    const unambiguous = !/%(?:2f|5c|25)/i.test(url.pathname) && !path.includes('\\');
    const official = url.origin === 'https://metaunit-core.github.io' && !url.username && !url.password && unambiguous &&
      (path === '/Cognivex-Pocket' || path.startsWith('/Cognivex-Pocket/'));
    const isTest = !official;
    const prefix = isTest ? 'pocket-development-v1:' : '';
    const native = global.localStorage;
    if (!native || !['getItem', 'setItem', 'removeItem'].every(key => typeof native[key] === 'function')) throw Error('本机存储不可用');
    function ready() {
      if (!initialized || global.PocketEnvironment !== environment || !Object.isFrozen(environment)) throw Error(BLOCKED);
    }
    const keys = () => Array.from({ length: native.length }, (_, i) => native.key(i)).filter(key => key?.startsWith(prefix));
    const storage = isTest ? Object.freeze({
      get length() { ready(); return keys().length; },
      key(index) { ready(); return keys()[index]?.slice(prefix.length) ?? null; },
      getItem(key) { ready(); return native.getItem(prefix + String(key)); },
      setItem(key, value) { ready(); native.setItem(prefix + String(key), String(value)); },
      removeItem(key) { ready(); native.removeItem(prefix + String(key)); },
      clear() { ready(); keys().forEach(key => native.removeItem(key)); }
    }) : native;
    environment = Object.freeze({ version: 1, isTest, firebaseAllowed: official, prefix,
      get storage() { ready(); return storage; },
      requireStorage() { ready(); return storage; },
      assertFirebaseAllowed() { ready(); if (!official) throw Error('测试环境禁止连接 Firebase。'); }
    });
    Object.defineProperty(global, 'PocketEnvironment', { value: environment, writable: false, configurable: false });
    global.document?.addEventListener?.('DOMContentLoaded', () => show(isTest ? '测试环境｜不会连接 Firebase' : ''));
    initialized = true;
  } catch (_) {
    show(BLOCKED);
    global.document?.addEventListener?.('DOMContentLoaded', () => show(BLOCKED));
  }
})(globalThis);
