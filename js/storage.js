(function (global) {
  'use strict';
  const pocketLocalStore = globalThis.PocketEnvironment.requireStorage();
  const KEY = 'cognivex-pocket-state';

  let notice = '';
  let readBlocked = false;

  function getInitialState() {
    return {
      version: 1,
      review: { lastReviewedAt: null },
      currentSession: null,
      materials: []
    };
  }

  function validate(state) {
    if (!state || state.version !== 1 || !Array.isArray(state.materials) ||
        state.materials.some(material => !material || typeof material.id !== 'string' || !Array.isArray(material.groups) ||
          material.groups.some(group => !group || typeof group !== 'object' ||
            (group.runs !== undefined && !Array.isArray(group.runs)))) ||
        !state.review || typeof state.review !== 'object' ||
        !(state.review.lastReviewedAt === null ||
          (Number.isFinite(state.review.lastReviewedAt) && state.review.lastReviewedAt >= 0 &&
           state.review.lastReviewedAt <= 8640000000000000)) ||
        !(state.currentSession === null ||
          (typeof state.currentSession === 'object' && !Array.isArray(state.currentSession) &&
           typeof state.currentSession.currentStep === 'string'))) {
      throw new Error('本机学习数据格式无法读取。');
    }
    return state;
  }

  function loadState() {
    notice = '';
    readBlocked = false;
    let state;
    let shouldSave = true;
    try {
      global.PocketCloudSignal?.ensureReady();
      const raw = pocketLocalStore.getItem(KEY);
      if (raw !== null) {
        state = validate(JSON.parse(raw));
        shouldSave = false;
      } else state = getInitialState();
    } catch (error) {
      state = getInitialState();
      readBlocked = true; shouldSave = false;
      notice = '本机学习数据无法读取，原数据已保留，当前禁止写入。请先备份或修复数据。';
      global.PocketCloudSignal?.failed(error);
    }
    if (!readBlocked && global.PocketExternalLinks?.migrateMaterialLinks(state)) shouldSave = true;
    try {
      if (shouldSave) saveState(state);
    } catch (error) {
      notice = '无法保存到本机。请检查浏览器存储设置后重新打开；当前操作不会被标记为已保存。';
    }
    return state;
  }

  function saveState(state) {
    try {
    global.PocketCloudSignal?.ensureReady();
    if (readBlocked) throw new Error('原数据读取失败，禁止覆盖。');
    validate(state);
    pocketLocalStore.setItem(KEY, JSON.stringify(state));
    global.PocketCloudSignal?.saved(KEY);
    } catch (error) { global.PocketCloudSignal?.failed(error); throw error; }
  }

  // 先写入完整快照，再返回新状态供 UI 使用。写入失败时保留旧状态。
  function updateState(state, change) {
    if (readBlocked) throw new Error('原数据读取失败，禁止覆盖。');
    const stored = pocketLocalStore.getItem(KEY);
    let current;
    try {current=stored===null ? null : JSON.stringify(JSON.parse(stored));} catch (_) {current=null;}
    if (current !== JSON.stringify(state)) throw new Error('其他窗口已更新数据，请刷新后重试。');
    const next = JSON.parse(JSON.stringify(state));
    change(next);
    saveState(next);
    return next;
  }

  function resetState() {
    throw new Error('请使用设置中的「清空本机学习数据」，先暂停自动备份并完成安全确认。');
  }
  function renameMaterial(state, id, title) {
    if (typeof title !== 'string' || !title.trim()) throw Error('资料名称不能为空。');
    return updateState(state, next => {
      const material = next.materials.find(item => item.id === id);
      if (!material || material.status !== 'completed') throw Error('已学资料已变化，请刷新后重试。');
      material.title = title.trim();
    });
  }

  global.PocketStorage = Object.freeze({
    KEY, getInitialState, loadState, saveState, updateState, resetState, renameMaterial,
    getNotice: () => notice,
    // 保留第一版模块名称，兼容已有调用。
    createState: getInitialState, load: loadState, save: saveState, update: updateState
  });
})(globalThis);
