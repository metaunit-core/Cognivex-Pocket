(function (global) {
  'use strict';
  const KEY = 'pocket-daily-review-test-date-v1';
  function localStore() {
    const env = global.PocketEnvironment;
    if (!env || env.isTest !== true || env.firebaseAllowed !== false) throw Error('仅允许本地测试环境使用模拟日期。');
    const url = new URL(global.location.href), host = url.hostname.toLowerCase();
    if (!(url.protocol === 'file:' || host === 'localhost' || host.endsWith('.localhost') || host === '[::1]' || /^127(?:\.\d{1,3}){3}$/.test(host))) throw Error('当前地址不是本地开发预览。');
    return env.requireStorage();
  }
  try { localStore(); } catch (_) { return; }
  const get = id => global.document?.getElementById(id);
  function realDay() {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  }
  function valid(value) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || value.startsWith('0000')) return false;
    const d = new Date(value + 'T12:00:00');
    return Number.isFinite(d.getTime()) && `${String(d.getFullYear()).padStart(4, '0')}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}` === value;
  }
  function dayOverride() {
    const value = localStore().getItem(KEY);
    return value && valid(value) ? value : null;
  }
  function render() {
    const value = dayOverride();
    if (get('daily-test-date')) get('daily-test-date').value = value || realDay();
    if (get('daily-test-date-status')) get('daily-test-date-status').textContent = value ? `每日复习使用模拟日期：${value}；其他时间保持真实。` : '每日复习使用设备真实日期。';
  }
  function changed() {
    render();
    global.dispatchEvent(new Event('pocket-daily-test-date-change'));
  }
  function set(value) {
    if (!valid(value)) throw Error('请选择有效的测试日期。');
    localStore().setItem(KEY, value); changed();
  }
  function reset() { localStore().removeItem(KEY); changed(); }
  global.PocketDailyTestDate = Object.freeze({ dayOverride, set, reset });
  const tools = get('daily-test-tools');
  if (tools) {
    try { render(); tools.hidden = false; }
    catch (_) { return; }
    function action(task) {
      try { task(); } catch (error) { get('daily-test-date-status').textContent = error.message; }
    }
    get('daily-test-date').addEventListener('change', () => action(() => set(get('daily-test-date').value)));
    get('daily-test-date-reset').addEventListener('click', () => action(reset));
    global.addEventListener?.('storage', event => {
      if (event.key === null || event.key === global.PocketEnvironment.prefix + KEY) action(changed);
    });
  }
})(globalThis);
