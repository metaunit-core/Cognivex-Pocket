(function (global) {
  'use strict';
  // Runtime origin only: no device detection, query switches or build-time test flag.
  const location = global.location;
  const host = (location?.hostname || '').toLowerCase();
  const loopback = host === 'localhost' || host.endsWith('.localhost') || host === '[::1]' || host === '::1' || /^127(?:\.\d{1,3}){3}$/.test(host);
  const privateHost = /^(10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/.test(host) || host.endsWith('.local') || /^\[f[cd]/.test(host) || /^\[fe[89ab]/.test(host);
  // Non-HTTPS previews fail closed, including Live Server on LAN addresses.
  const isTest = !location || location.protocol !== 'https:' || loopback || privateHost;
  const prefix = isTest ? 'pocket-development-v1:' : '';
  const native = global.localStorage;
  const keys = () => Array.from({ length: native.length }, (_, i) => native.key(i)).filter(key => key?.startsWith(prefix));
  const storage = isTest ? Object.freeze({
    get length() { return keys().length; },
    key(index) { return keys()[index]?.slice(prefix.length) ?? null; },
    getItem(key) { return native.getItem(prefix + String(key)); },
    setItem(key, value) { native.setItem(prefix + String(key), String(value)); },
    removeItem(key) { native.removeItem(prefix + String(key)); },
    clear() { keys().forEach(key => native.removeItem(key)); }
  }) : native;
  Object.defineProperty(global, 'PocketEnvironment', { value: Object.freeze({ isTest, firebaseAllowed: !isTest, storage, prefix }), writable: false, configurable: false });
  global.document?.addEventListener('DOMContentLoaded', () => {
    const banner = global.document.getElementById('environment-banner');
    if (banner) banner.hidden = !isTest;
  });
})(globalThis);
