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
    if(state.videoLearning!==undefined){
      if(!global.PocketVideoLearning)throw Error('视频学习模块未加载，禁止覆盖视频记录。');
      global.PocketVideoLearning.records(state);
    }
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
  function updateMaterialMetadata(state, id, field, value) {
    if (!['subject', 'title'].includes(field)) throw Error('只能修改学科或资料名称。');
    if (typeof value !== 'string' || !value.trim()) throw Error(field === 'subject' ? '学科不能为空。' : '资料名称不能为空。');
    return updateState(state, next => {
      const material = next.materials.find(item => item.id === id);
      if (!material || (material.status !== 'completed' && !(material.hasAppendedGroups === true && Number.isFinite(material.completedAt)))) throw Error('已学资料已变化，请刷新后重试。');
      material[field] = value.trim();
    });
  }
  function renameMaterial(state, id, title) {
    return updateMaterialMetadata(state, id, 'title', title);
  }
  function readMaterialSummary(id) {
    if (readBlocked) throw Error('原数据读取失败，禁止覆盖。');
    const latest = validate(JSON.parse(pocketLocalStore.getItem(KEY)));
    const matches = latest.materials.filter(material => material.id === id);
    if (matches.length !== 1) throw Error('资料不存在或 ID 重复。');
    const value = matches[0].questionSummary;
    if (value !== undefined && typeof value !== 'string') throw Error('原笔记格式异常，未覆盖原数据。');
    return value ?? '';
  }
  function updateMaterialSummary(id, value, expected) {
    if (readBlocked) throw Error('原数据读取失败，禁止覆盖。');
    if (typeof value !== 'string' || typeof expected !== 'string') throw Error('笔记必须为文本，未修改数据。');
    const raw = pocketLocalStore.getItem(KEY);
    if (raw === null) throw Error('资料状态已变化，未保存笔记。');
    const latest = validate(JSON.parse(raw));
    const matches = latest.materials.filter(material => material.id === id);
    if (matches.length !== 1) throw Error('资料不存在或 ID 重复，未保存笔记。');
    const previous = matches[0].questionSummary;
    if (previous !== undefined && typeof previous !== 'string') throw Error('原笔记格式异常，未覆盖原数据。');
    if ((previous ?? '') !== expected && previous !== value) throw Error('其他窗口已修改这份笔记；当前输入仍保留，请先核对，未覆盖已保存内容。');
    if (previous === value) return latest;
    return updateState(latest, next => { next.materials.find(material => material.id === id).questionSummary = value; });
  }

  global.PocketStorage = Object.freeze({
    KEY, getInitialState, loadState, saveState, updateState, resetState, renameMaterial, updateMaterialMetadata, readMaterialSummary, updateMaterialSummary,
    getNotice: () => notice,
    // 保留第一版模块名称，兼容已有调用。
    createState: getInitialState, load: loadState, save: saveState, update: updateState
  });
})(globalThis);
