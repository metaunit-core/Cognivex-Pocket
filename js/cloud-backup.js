(function (global) {
  'use strict';
  const pocketLocalStore = globalThis.PocketEnvironment.requireStorage();
  const CONTROL = 'pocket-cloud-control-v1';
  const JOURNAL = 'pocket-cloud-restore-journal-v1';
  const LOCAL_RESET = 'pocket-local-reset-v1';
  const FRESH_START = 'pocket-fresh-start-v1';
  const NEW_START = 'pocket-cloud-new-start-v1';
  const newStartMarker = () => JSON.parse(pocketLocalStore.getItem(NEW_START) || 'null');
  const freshStartMarker = () => JSON.parse(pocketLocalStore.getItem(FRESH_START) || 'null');
  const OFFLINE_PAUSE = 'pocket-offline-restore-pause-v1';
  const offlinePause = () => JSON.parse(pocketLocalStore.getItem(OFFLINE_PAUSE) || 'null');
  const RESET_STATUS = '本机学习数据已清空，Firebase 云端备份保留，自动备份已暂停。';
  const engines = new Set();
  function resetMarker() {
    const value = JSON.parse(pocketLocalStore.getItem(LOCAL_RESET) || 'null');
    // Older persisted local resets also enter the new manual-deletion gate.
    return value ? { ...value, waitingCloudDeletion: true } : null;
  }
  const DATA_KEYS = ['cognivex-pocket-state', 'pocket-listening-start-v1', 'pocket-training-sop-model-v1',
    'pocket-last-view-v1', 'pocket-view-history-v1'];
  const DAY = 86400000;
  const listeners = new Set();
  let recoveryError = '', controlError = '', localStatus = '已保存';
  function control() {
    const raw = pocketLocalStore.getItem(CONTROL);
    if (raw === null) return { version: 1, dirty: true };
    const value = JSON.parse(raw);
    if (!value || value.version !== 1 || typeof value !== 'object') throw Error('备份控制状态损坏，请先导出本地数据。');
    return value;
  }
  function saveControl(value) { pocketLocalStore.setItem(CONTROL, JSON.stringify(value)); }
  function rawEntries() { return DATA_KEYS.map(key => ({ key, content: pocketLocalStore.getItem(key) })); }
  function writeEntries(entries) {
    if (!Array.isArray(entries) || entries.length !== DATA_KEYS.length || entries.some((entry, i) =>
        entry.key !== DATA_KEYS[i] || !(entry.content === null || typeof entry.content === 'string'))) throw Error('恢复键清单异常。');
    for (const entry of entries) {
      if (entry.content === null) pocketLocalStore.removeItem(entry.key);
      else pocketLocalStore.setItem(entry.key, entry.content);
    }
  }
  function recoverPending() {
    try {
      const raw = pocketLocalStore.getItem(JOURNAL);
      if (!raw && offlinePause()?.status === 'restoring') pocketLocalStore.setItem(OFFLINE_PAUSE, JSON.stringify({ version: 1, status: 'complete' }));
      if (resetMarker() && (!raw || JSON.parse(raw).kind !== 'json')) return true;
      if (raw !== null) {
        const journal = JSON.parse(raw);
        if (journal.version !== 1 || !journal.originalControl || !journal.entries) throw Error('恢复日志无法读取。');
        writeEntries(journal.entries);
        saveControl(journal.originalControl);
        pocketLocalStore.removeItem(JOURNAL);
        if (journal.kind === 'json') pocketLocalStore.setItem(OFFLINE_PAUSE, JSON.stringify({ version: 1, status: 'complete' }));
      }
      recoveryError = '';
    } catch (error) { recoveryError = '恢复中断，已保留应急副本；本地写入暂停：' + error.message; }
    return !recoveryError;
  }
  function notify() { for (const listener of listeners) { try { listener(); } catch (_) {} } }
  const signal = {
    saved(key) {
      if (!DATA_KEYS.includes(key)) return;
      localStatus = '已保存';
      try { const value = control(); value.dirty = true; saveControl(value); controlError = ''; }
      catch (error) { controlError = '学习数据已保存，待同步标记保存失败：' + error.message; }
      notify();
    },
    failed(error) { localStatus = '保存失败：' + error.message; notify(); },
    ensureReady() { if (newStartMarker()) throw Error('重新开始云端备份尚未完成，本机数据保留，请在高级管理中重试。'); if (freshStartMarker()) throw Error('清空同步尚未完成，请重试清空或安全取消；原数据已保留保护。'); global.PocketDataDeletion?.ensureReady(); if (recoveryError) throw Error(recoveryError); if (offlinePause()?.status === 'restoring') throw Error('JSON 恢复未完成，学习写入已暂停，请刷新处理恢复日志。'); },
    localStatus: () => recoveryError || localStatus,
    subscribe(listener) { listeners.add(listener); return () => listeners.delete(listener); },
    recoverPending
  };
  global.PocketCloudSignal = Object.freeze(signal);
  recoverPending();

  async function sha(text) {
    const bytes = new TextEncoder().encode(text);
    const digest = await global.crypto.subtle.digest('SHA-256', bytes);
    return Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('');
  }
  function summary(backup) {
    const state = backup.rawState === null ? null : JSON.parse(backup.rawState);
    const materials = (state?.materials || []).map(material => ({ id: material.id,
      histories: (material.materialReviewHistory || []).length,
      groups: material.groups.map((group, index) => ({ id: group.id || '@' + index, runs: (group.runs || []).length })) }));
    return { materials, history: (state?.review?.roundHistory || []).length,
      archived: (state?.review?.archivedSessions || []).length,
      auxiliary: backup.entries.filter(entry => entry.key !== DATA_KEYS[0]).map(entry => ({ key: entry.key, present: entry.content !== null })),
      counts: { materials: materials.length, groups: materials.reduce((n, m) => n + m.groups.length, 0),
        runs: materials.reduce((n, m) => n + m.groups.reduce((total, group) => total + group.runs, 0), 0) } };
  }
  function losses(previous, next) {
    if (!previous) return [];
    const issues = [];
    for (const material of previous.materials) {
      const current = next.materials.find(item => item.id === material.id);
      if (!current) { issues.push('资料消失：' + material.id); continue; }
      if (current.histories < material.histories) issues.push('资料复习历史减少：' + material.id);
      for (const group of material.groups) {
        const now = current.groups.find(item => item.id === group.id);
        if (!now) issues.push('Group 消失：' + material.id + '/' + group.id);
        else if (now.runs < group.runs) issues.push('Run 历史减少：' + material.id + '/' + group.id);
      }
    }
    if (next.history < previous.history) issues.push('全局复习历史减少。');
    if ((next.archived || 0) < (previous.archived || 0)) issues.push('旧复习队列归档减少。');
    for (const entry of previous.auxiliary || []) {
      if (entry.present && !next.auxiliary?.find(item => item.key === entry.key)?.present) issues.push('长期保存数据键消失：' + entry.key);
    }
    return issues;
  }
  function failureReason(error) {
    if (error.code === 'permission-denied' || /Missing or insufficient permissions/.test(error.message)) return '云端备份权限不足，请检查 Firebase 安全规则。学习记录仍保存在本机。';
    if (error.code === 'unavailable' || /offline|network/i.test(error.message)) return '网络暂时不可用，联网后会自动重试。学习记录仍保存在本机。';
    return error.message;
  }
  function createEngine(options) {
    global.PocketEnvironment.assertFirebaseAllowed();
    if (global.PocketEnvironment?.isTest) throw Error('测试环境禁止启动 Firebase 备份、读取或恢复。');
    const adapter = options.adapter;
    const backupAPI = options.backup || global.PocketLearningBackup;
    const now = options.now || Date.now;
    const setTimer = options.setTimeout || global.setTimeout.bind(global);
    const clearTimer = options.clearTimeout || global.clearTimeout.bind(global);
    const online = options.online || (() => global.navigator?.onLine !== false);
    const debounce = options.debounce ?? 15000;
    const interval = options.interval ?? 300000;
    let user = null, epoch = 0, busy = false, timer = null, comparison = null, restartPreview = null, freshStartBusy = false, latestProof = null;
    let state = { status: '未登录', connected: false, reason: '' }, sessionCommit = null;
    let newStartPreview = null, newStartBusy = false;
    function publish(patch) { state = { ...state, ...patch }; options.onChange?.(view()); }
    function confirmLatest(uid, id, manifest, backup) {
      latestProof = { uid, id, revision: manifest.revision, generation: manifest.generation, hash: manifest.dataHash,
        entries: JSON.stringify(backup.entries.map(entry => [entry.key, entry.content])) };
    }
    function recordedTime(head, manifest, previous = null) {
      if (Number.isFinite(previous) && previous > 0) return previous;
      const value = head?.updatedAt?.toMillis?.() || manifest?.createdAt?.toMillis?.() || (typeof manifest?.createdAt === 'number' ? manifest.createdAt : null);
      return Number.isFinite(value) && value > 0 ? value : previous;
    }
    function view() {
      let meta = {};
      try { meta = control(); } catch (error) { state.reason = error.message; }
      const reset = resetMarker();
      const offline = offlinePause();
      const latestVerified = !!latestProof && latestProof.uid === user?.uid && meta.owner === user?.uid && meta.bound === true && meta.hash === latestProof.hash && meta.revision === latestProof.revision && meta.snapshotId === latestProof.id && meta.generation === latestProof.generation && latestProof.entries === JSON.stringify(rawEntries().map(entry => [entry.key, entry.content]));
      return { ...state, ...(reset ? { status: reset.status === 'complete' ? RESET_STATUS : '本机清空未完成，自动备份已暂停，请重试。' } : {}), user, comparison, localReset: !!reset, localResetUid: reset?.uid || null, waitingCloudDeletion: !!reset?.waitingCloudDeletion, bound: !reset && !offline && meta.owner === user?.uid && meta.bound === true,
        localStatus: signal.localStatus(), lastSuccessAt: meta.owner === user?.uid ? meta.lastSuccessAt || null : null,
        latestVerified, online: online(), pending: meta.dirty !== false || !latestVerified, paused: !!meta.pause || !!reset || !!offline || !!freshStartMarker() || !!newStartMarker(),
        newStartPending: !!newStartMarker(),
        freshStartPending: !!freshStartMarker(),
        offlineRestorePaused: !!offline, restoreVerifiedAt: meta.restoreVerifiedAt || null,
        controlError, emergencyKey: meta.emergencyKey || null };
    }
    function check(token, uid, deleting = false) {
      if (!deleting && newStartMarker()) throw Error('正在重新开始云端备份，旧任务已隔离。');
      if (epoch !== token || user?.uid !== uid) throw Error('账号已变化，操作已取消。');
      if (offlinePause()?.status === 'restoring') throw Error('JSON 恢复正在进行，旧云端任务已隔离。');
      if (resetMarker()?.status !== 'complete' && resetMarker()) throw Error('本机清空未完成，云端操作已暂停。');
      if (!deleting && freshStartMarker()) throw Error('清空同步尚未完成，旧任务已隔离。');
      if (!deleting) global.PocketDataDeletion?.ensureReady();
    }
    async function capture() {
      const backup = await backupAPI.create();
      const verified = await backupAPI.verify(JSON.stringify(backup));
      if (!verified.valid || backup.backupVersion !== 2) throw Error('检测到数据异常，已暂停备份：' + verified.issues.join('；'));
      return { backup, summary: summary(backup), hash: await sha(JSON.stringify(backup.entries.map(entry => [entry.key, entry.content]))) };
    }
    async function readSnapshot(uid, id) {
      const manifest = await adapter.manifest(uid, id);
      if (!manifest || manifest.uid !== uid || manifest.formatVersion !== 1 || manifest.status !== 'complete' ||
          !Number.isInteger(manifest.chunkCount) || manifest.chunkCount < 1 || manifest.chunkCount > 256) throw Error('快照描述无效或账号不匹配。');
      let text = '';
      for (let index = 0; index < manifest.chunkCount; index++) {
        const chunk = await adapter.chunk(uid, id, index);
        if (!chunk || chunk.uid !== uid || chunk.index !== index || (manifest.generation && chunk.generation !== manifest.generation) || typeof chunk.content !== 'string' ||
            await sha(chunk.content) !== chunk.hash) throw Error('快照分片缺失或损坏。');
        text += chunk.content;
      }
      if (await sha(text) !== manifest.payloadHash || new TextEncoder().encode(text).length !== manifest.bytes) throw Error('快照完整校验失败。');
      const report = await backupAPI.verify(text);
      if (!report.valid || report.backupVersion !== 2) throw Error('云端学习数据校验失败。');
      const backup = JSON.parse(text);
      if (await sha(JSON.stringify(backup.entries.map(entry => [entry.key, entry.content]))) !== manifest.dataHash) throw Error('云端数据摘要不匹配。');
      return { backup, report, manifest, summary: summary(backup) };
    }
    async function cycle(uid) {
      if (!adapter.generation) return null; // Legacy injected test adapters only; real adapter always requires a rule-enforced protocol.
      const c = await adapter.generation(uid);
      if (!c || Object.keys(c).length !== 5 || !['uid', 'generation', 'protocolVersion', 'rulesVerified', 'lastRevision'].every(key => Object.hasOwn(c, key)) || c.uid !== uid || ![2, 3].includes(c.protocolVersion) || c.rulesVerified !== true || !/^[A-Za-z0-9_-]{16,64}$/.test(c.generation || '') || !Number.isSafeInteger(c.lastRevision) || c.lastRevision < 0) throw Object.assign(Error('尚未配置并验证旧写入保护，自动备份保持暂停。'), { conflict: true });
      return c;
    }
    async function compare() {
      if (busy) throw Error('备份正在执行，请稍后比较。');
      if (!user) throw Error('请先登录。');
      const uid = user.uid, token = epoch;
      publish({ status: '正在比较', reason: '' });
      try {
        const local = await capture();
        const head = await adapter.head(uid); check(token, uid);
        const cloud = head ? await readSnapshot(uid, head.snapshotId) : null; check(token, uid);
        if (head && (head.uid !== uid || head.dataHash !== cloud.manifest.dataHash || head.revision !== cloud.manifest.revision)) throw Error('云端备份指针与历史版本不一致，已暂停备份。');
        const generation = await cycle(uid); check(token, uid);
        comparison = { local, cloud, head, uid, token, generation };
        const meta = control();
        if (!resetMarker() && !offlinePause() && !meta.pause && (!generation || meta.generation === generation.generation) && cloud && local.hash === cloud.manifest.dataHash) {
          await bindLocal(comparison);
        } else if (meta.owner === uid && meta.bound && !meta.pause && (!generation || meta.generation === generation.generation)
            && (head?.revision || 0) === (meta.revision || 0) && (head?.snapshotId || null) === (meta.snapshotId || null)) {
          publish({ status: '待备份', reason: '', connected: true }); schedule();
        } else {
          publish({ status: cloud ? '发现两份不同的学习记录，需要确认' : '等待开启自动备份', reason: meta.owner === uid ? meta.reason || '' : '', connected: true });
        }
        return comparison;
      } catch (error) { if (token === epoch) publish({ status: '失败', reason: failureReason(error), connected: false }); throw error; }
    }
    async function setUser(next) {
      epoch++; clearTimer(timer); timer = null; comparison = null; user = next; latestProof = null;
      publish({ status: next ? '正在检查账号' : '未登录', reason: '', connected: false });
      if (!next) return;
      const token = epoch;
      try {
        const meta = control();
        if (newStartMarker()) { publish({ status: '已暂停', reason: '重新开始云端备份未完成，请在高级管理中重试。' }); return; }
        if (freshStartMarker()) { publish({ status: '清空同步尚未完成，请重试', reason: '' }); return; }
        if (resetMarker()) { publish({ status: RESET_STATUS }); return; }
        if (meta.owner === next.uid && meta.bound && !meta.pause) { publish({ status: '待备份' }); schedule(0); }
        else await compare();
      } catch (error) {
        if (token === epoch) { publish({ status: '失败', reason: failureReason(error) }); schedule(60000); }
      }
    }
    function schedule(delay = debounce) {
      clearTimer(timer);
      if (!user) return;
      if (resetMarker() || freshStartMarker() || newStartMarker()) return;
      if (offlinePause()) return;
      try { global.PocketDataDeletion?.ensureReady(); } catch (_) { return; }
      timer = setTimer(() => { timer = null; return sync().catch(() => {}); }, delay);
    }
    async function upload(captured, expected, token, uid, deleting = false, generation = null, uploadId = null, beforeCommit = () => {}) {
      const guard = () => check(token, uid, deleting);
      const text = JSON.stringify(captured.backup);
      const bytes = new TextEncoder().encode(text).length;
      if (bytes > 32 * 1024 * 1024) throw Error('完整备份超过 32 MiB 安全上限，请导出并联系维护者升级。');
      // 60k UTF-16 units <= 240k UTF-8 bytes, comfortably below Firestore 1 MiB.
      const chunks = [];
      for (let offset = 0; offset < text.length;) {
        let end = Math.min(text.length, offset + 60000);
        if (end < text.length && /[\uD800-\uDBFF]/.test(text[end - 1])) end--;
        const content = text.slice(offset, end);
        chunks.push({ uid, ...(generation ? { generation } : {}), index: chunks.length, content, hash: await sha(content) }); offset = end;
      }
      if (chunks.length > 256) throw Error('备份分片数量超出安全上限。');
      const id = uploadId || global.crypto.randomUUID();
      guard(); await adapter.stage?.(uid, id, generation);
      for (let index = 0; index < chunks.length; index++) {
        guard(); await adapter.writeChunk(uid, id, index, chunks[index]);
      }
      let readback = '';
      for (let index = 0; index < chunks.length; index++) {
        guard(); const chunk = await adapter.chunk(uid, id, index);
        if (!chunk || chunk.uid !== uid || chunk.index !== index || await sha(chunk.content) !== chunks[index].hash || chunk.hash !== chunks[index].hash) throw Error('上传分片读回校验失败。');
        readback += chunk.content;
      }
      if (readback !== text) throw Error('上传完整内容读回校验失败。');
      const manifest = { uid, ...(generation ? { generation } : {}), formatVersion: 1, status: 'complete', chunkCount: chunks.length, bytes,
        payloadHash: await sha(text), dataHash: captured.hash, exportedAt: captured.backup.exportedAt,
        counts: captured.summary.counts, revision: expected + 1 };
      guard();
      beforeCommit(); guard();
      await adapter.commit(uid, id, expected, manifest, guard); guard();
      const confirmed = await readSnapshot(uid, id); guard();
      sessionCommit = { uid, snapshotId: id, revision: confirmed.manifest.revision,
        committedAt: recordedTime(null, confirmed.manifest) };
      return { id, manifest: confirmed.manifest };
    }
    async function sync(force = false) {
      if (busy || !user) return;
      if (newStartMarker()) { publish({ status: '已暂停', reason: '重新开始云端备份未完成，请在高级管理中重试。' }); return; }
      if (freshStartMarker()) { publish({ status: '清空同步尚未完成，请重试' }); return; }
      const uid = user.uid, token = epoch;
      let meta;
      try {
        meta = control(); signal.ensureReady();
        if (resetMarker()) { publish({ status: RESET_STATUS }); return; }
        if (offlinePause()) { publish({ status: 'JSON 恢复后自动备份已暂停，请比较后确认。' }); return; }
        if (meta.owner !== uid || !meta.bound) { await compare(); return; }
        if (meta.pause) { publish({ status: meta.pause, reason: meta.reason }); return; }
        if (!online()) { publish({ status: '待备份', reason: '离线，联网后重试。' }); return; }
        if (!force && latestProof && meta.lastSuccessAt && now() - meta.lastSuccessAt < interval) { schedule(interval - (now() - meta.lastSuccessAt)); return; }
        if (rawEntries().every(entry => entry.content === null)) { publish({ status: '待备份', reason: '本机暂无学习记录，开始学习后自动备份。' }); return; }
        busy = true; publish({ status: '正在备份', reason: '' });
        const captured = await capture(); check(token, uid);
        const generation = await cycle(uid); check(token, uid);
        if (generation && meta.generation !== generation.generation) throw Object.assign(Error('备份周期或版本已变化，请比较后确认；旧设备不能自动重新绑定。'), { conflict: true });
        const head = await adapter.head(uid); check(token, uid);
        const cloud = head ? await readSnapshot(uid, head.snapshotId) : null; check(token, uid);
        if (head && (head.uid !== uid || head.dataHash !== cloud.manifest.dataHash || head.revision !== cloud.manifest.revision)) throw Error('云端备份指针与历史版本不一致，已暂停备份。');
        // A committed upload can lose its acknowledgement. Only reconcile a newer
        // revision after reading back the exact local payload in the same cycle.
        if (generation && (generation.lastRevision !== (head?.revision || 0) ||
            (head && (head.generation !== generation.generation || cloud.manifest.generation !== generation.generation)) ||
            (meta.revision !== generation.lastRevision &&
              (!head || head.revision <= (meta.revision || 0) || head.dataHash !== captured.hash)))) {
          throw Object.assign(Error('备份周期或版本已变化，请比较后确认；旧设备不能自动重新绑定。'), { conflict: true });
        }
        if ((head?.revision || 0) !== (meta.revision || 0) || (head?.snapshotId || null) !== (meta.snapshotId || null)) {
          // A retry after an uncertain commit may safely recognize its exact confirmed data.
          if (!head || head.dataHash !== captured.hash) throw Object.assign(Error('另一设备已更新云端，请比较两份数据。'), { conflict: true });
          meta.revision = head.revision; meta.snapshotId = head.snapshotId; meta.base = cloud.summary;
        }
        const issues = losses(meta.base, captured.summary);
        if (issues.length && meta.allowedHash !== captured.hash) throw Object.assign(Error(issues.join('；')), { anomaly: true });
        if (head?.dataHash === captured.hash) {
          confirmLatest(uid, head.snapshotId, cloud.manifest, cloud.backup);
          meta.hash = captured.hash; meta.base = captured.summary; meta.lastSuccessAt = recordedTime(head, cloud.manifest, meta.lastSuccessAt || null); meta.dirty = false;
          saveControl(meta); publish({ status: '备份成功', connected: true }); return;
        }
        const uploaded = await upload(captured, meta.revision || 0, token, uid, false, generation?.generation);
        confirmLatest(uid, uploaded.id, uploaded.manifest, captured.backup);
        // Read control again: never erase a dirty marker created while uploading.
        const latest = control(); check(token, uid);
        const current = await capture(); check(token, uid);
        Object.assign(latest, { owner: uid, generation: uploaded.manifest.generation, bound: true, revision: uploaded.manifest.revision, snapshotId: uploaded.id,
          hash: captured.hash, base: captured.summary, lastSuccessAt: now(), dirty: current.hash !== captured.hash, pause: null, reason: '', allowedHash: null });
        saveControl(latest); publish({ status: latest.dirty ? '待备份' : '备份成功', connected: true });
        if (latest.dirty) schedule(interval);
        adapter.prune?.(uid, uploaded.manifest.revision).catch(() => {});
      } catch (error) {
        if (token !== epoch) return;
        const status = error.conflict ? '数据冲突' : error.anomaly || /数据异常/.test(error.message) ? '检测到数据异常，已暂停备份' : '失败';
        try {
          const latest = control(); latest.dirty = true;
          if (error.conflict || error.anomaly || /数据异常/.test(error.message)) { latest.pause = status; latest.reason = error.message; }
          saveControl(latest);
        } catch (storageError) { controlError = storageError.message; }
        publish({ status, reason: failureReason(error), connected: false });
        if (status === '失败') schedule(60000);
      } finally { busy = false; if (token !== epoch && user) schedule(0); }
    }
    async function diagnose() {
      if (!user) throw Error('请先登录 Firebase。');
      const uid = user.uid, token = epoch;
      const entries = rawEntries(), meta = control();
      const localHash = await sha(JSON.stringify(entries.map(entry => [entry.key, entry.content])));
      const head = await adapter.head(uid);
      const generation = await cycle(uid);
      const snapshot = head ? await readSnapshot(uid, head.snapshotId) : null;
      const finalHead = await adapter.head(uid), finalGeneration = await cycle(uid);
      if (token !== epoch || user?.uid !== uid) throw Error('账号已变化，请重新核查。');
      const headIdentity = h => JSON.stringify(h ? [h.uid, h.generation, h.revision, h.snapshotId, h.dataHash] : null);
      const stable = headIdentity(head) === headIdentity(finalHead) && JSON.stringify(generation) === JSON.stringify(finalGeneration) && JSON.stringify(entries) === JSON.stringify(rawEntries()) && JSON.stringify(meta) === JSON.stringify(control());
      const verified = stable && !!head && head.uid === uid && head.revision === snapshot.manifest.revision && head.dataHash === snapshot.manifest.dataHash && (!generation || (head.generation === generation.generation && snapshot.manifest.generation === generation.generation && head.revision === generation.lastRevision));
      const matches = verified && localHash === head.dataHash;
      return { uid, checkedAt: now(), stable, serverVerified: verified, contentMatches: matches,
        localRevision: meta.owner === uid ? meta.revision ?? null : null, cloudRevision: head?.revision ?? null,
        localGeneration: meta.owner === uid ? meta.generation || null : null, cloudGeneration: head?.generation || null,
        localHash, cloudHash: head?.dataHash || null, headPath: `users/${uid}/backup/head`,
        snapshotPath: head ? `users/${uid}/snapshots/${head.snapshotId}` : null,
        lastCloudCommitAt: recordedTime(head, snapshot?.manifest),
        sessionCommit: sessionCommit?.uid === uid ? { ...sessionCommit } : null,
        pending: stable ? !matches : null };
    }
    async function bindLocal(expectedComparison, allowLoss = false, confirmedReset = false) {
      if (resetMarker()?.waitingCloudDeletion) throw Error('等待手动删除云端数据并完成安全验证，自动备份保持暂停。');
      if (offlinePause() && !confirmedReset) throw Error('JSON 恢复后需要明确确认重新绑定，自动备份保持暂停。');
      if (resetMarker() && !confirmedReset) throw Error('清空本机后，必须明确确认重新绑定云端。');
      if (busy) throw Error('备份正在执行，请稍后绑定。');
      const compared = expectedComparison;
      if (!compared || compared !== comparison) throw Error('请先重新比较。');
      check(compared.token, compared.uid);
      const current = await capture(); check(compared.token, compared.uid);
      if (current.hash !== compared.local.hash) throw Error('本地数据已变化，请重新比较后确认。');
      const head = await adapter.head(compared.uid); check(compared.token, compared.uid);
      if ((head?.revision || 0) !== (compared.head?.revision || 0)
          || (head?.snapshotId || null) !== (compared.head?.snapshotId || null)
          || (head?.dataHash || null) !== (compared.head?.dataHash || null)) throw Error('云端已变化，请重新比较。');
      const generation = await cycle(compared.uid); check(compared.token, compared.uid);
      const binding = control();
      if (generation && binding.owner === compared.uid && binding.bound && binding.generation !== generation.generation) throw Error('当前设备绑定的是旧备份周期，不能以本机数据重新绑定新周期。请保留本机 JSON 备份，核对当前云端记录；此操作不会初始化新周期。');
      if (generation && (generation.generation !== compared.generation?.generation || generation.lastRevision !== (head?.revision || 0) || (head && head.generation !== generation.generation))) throw Error('备份周期或云端版本已变化，请重新比较；不能覆盖旧周期备份。');
      const finalLocal = await capture(); check(compared.token, compared.uid);
      if (finalLocal.hash !== current.hash) throw Error('本地数据已变化，请重新比较后确认。');
      const issues = losses(compared.cloud?.summary, current.summary);
      if (issues.length && !allowLoss) throw Error('当前本地版本缺少云端记录。请先导出，并明确确认这是合法删除或选择恢复。');
      const meta = control();
      const identical = compared.cloud && current.hash === compared.cloud.manifest.dataHash;
      const previousSuccess = meta.owner === compared.uid && meta.snapshotId === head?.snapshotId && meta.hash === compared.cloud?.manifest.dataHash ? meta.lastSuccessAt : null;
      Object.assign(meta, { owner: compared.uid, generation: generation?.generation, bound: true, dirty: true, revision: head?.revision || 0,
        snapshotId: head?.snapshotId || null, base: compared.cloud?.summary || null,
        pause: null, reason: '', allowedHash: allowLoss ? current.hash : null, hash: null, lastSuccessAt: null });
      if (identical) {
        confirmLatest(compared.uid, head.snapshotId, compared.cloud.manifest, compared.cloud.backup);
        Object.assign(meta, { dirty: false, hash: current.hash,
          lastSuccessAt: recordedTime(head, compared.cloud.manifest, previousSuccess) });
      }
      saveControl(meta);
      if (confirmedReset && offlinePause()) pocketLocalStore.removeItem(OFFLINE_PAUSE);
      if (confirmedReset) pocketLocalStore.removeItem(LOCAL_RESET);
      comparison = null;
      if (identical) publish({ status: '备份成功', reason: '', connected: true });
      else await sync(true);
    }
    async function prepareRestore(id) {
      if (resetMarker()?.waitingCloudDeletion) throw Error('等待手动删除云端数据期间，不恢复旧记录。自动备份保持暂停。');
      if (busy) throw Error('备份正在执行，请稍后恢复。');
      if (!user) throw Error('请先登录。');
      const uid = user.uid, token = epoch;
      const snapshot = await readSnapshot(uid, id); check(token, uid);
      const original = rawEntries(), originalControl = control();
      const rescueKey = 'pocket-cloud-emergency-' + global.crypto.randomUUID();
      const rescueText = JSON.stringify({ version: 1, createdAt: now(), entries: original, originalControl });
      pocketLocalStore.setItem(rescueKey, rescueText);
      if (pocketLocalStore.getItem(rescueKey) !== rescueText) throw Error('应急副本未能可靠保存，禁止恢复。');
      const meta = control(); meta.emergencyKey = rescueKey; saveControl(meta);
      return { uid, token, id, snapshot, original, rescueKey, rescueText };
    }
    async function applyRestore(prepared) {
      check(prepared.token, prepared.uid); signal.ensureReady();
      if (pocketLocalStore.getItem(prepared.rescueKey) !== prepared.rescueText) throw Error('应急副本已变化或丢失，禁止恢复。');
      if (JSON.stringify(rawEntries()) !== JSON.stringify(prepared.original)) throw Error('本地数据已变化，请重新预览恢复。');
      const head = await adapter.head(prepared.uid); check(prepared.token, prepared.uid);
      const originalControl = control();
      pocketLocalStore.setItem(JOURNAL, JSON.stringify({ version: 1, entries: prepared.original, originalControl }));
      try {
        writeEntries(prepared.snapshot.backup.entries);
        const restored = await capture(); check(prepared.token, prepared.uid);
        if (restored.hash !== prepared.snapshot.manifest.dataHash) throw Error('恢复后内容校验不一致。');
        const base = head ? await readSnapshot(prepared.uid, head.snapshotId) : null; check(prepared.token, prepared.uid);
        const meta = { ...originalControl, owner: prepared.uid, bound: true, dirty: true, revision: head?.revision || 0,
          snapshotId: head?.snapshotId || null, base: base?.summary || null, allowedHash: restored.hash,
          pause: originalControl.pause || null, reason: originalControl.reason || '', hash: null, lastSuccessAt: null,
          restoreVerifiedAt: now(), emergencyKey: prepared.rescueKey };
        saveControl(meta); pocketLocalStore.removeItem(JOURNAL);
        pocketLocalStore.removeItem(LOCAL_RESET);
        publish({ status: '恢复完成，请重新加载 Pocket', connected: true });
      } catch (error) {
        if (resetMarker()) { writeEntries(prepared.original); saveControl(originalControl); pocketLocalStore.removeItem(JOURNAL); }
        else recoverPending();
        throw Error('恢复失败；' + (recoveryError || '已回滚原数据。') + ' ' + error.message);
      }
    }
    async function restore(prepared) {
      const isolate = options.isolateRestore || global.PocketDataDeletion?.exclusive;
      if (!isolate) throw Error('安全窗口锁未就绪，禁止恢复。');
      return isolate(async () => {
        if (busy || active > 1) throw Error('备份或其他云端操作尚未结束，请稍后恢复。');
        busy = true;
        try { return await applyRestore(prepared); }
        finally { busy = false; }
      });
    }
    async function history() {
      if (!user) throw Error('请先登录。');
      const uid = user.uid, token = epoch;
      const list = await adapter.list(uid); check(token, uid); publish({ historyCount: list.length }); return list;
    }
    function persistFresh(value) {
      const text = JSON.stringify(value); pocketLocalStore.setItem(FRESH_START, text);
      if (pocketLocalStore.getItem(FRESH_START) !== text) throw Error('清空操作记录未能可靠保存，未删除本机记录。');
      publish({});
    }
    async function clearAndRestart(confirmation) {
      if (confirmation !== 'CLEAR') throw Error('请输入 CLEAR 后确认。');
      if (freshStartBusy) throw Error('清空正在进行，请勿重复点击。');
      if (!user) throw Error('请先登录 Firebase。');
      if (!online()) throw Error('当前离线，未清空；请联网后重试。');
      if (resetMarker() || offlinePause()) throw Error('已有备份暂停或恢复流程，请先完成原流程；未清空。');
      freshStartBusy = true;
      try {
        return await global.PocketDataDeletion.exclusive(async () => {
          let operation = freshStartMarker();
          const uid = user.uid;
          if (operation && operation.uid !== uid) throw Error('请登录发起清空时的 Firebase 账号。');
          if (!operation) {
            signal.ensureReady();
            const meta = control();
            if (meta.owner !== uid || !meta.bound || meta.pause) throw Error('请先恢复正常自动备份或处理冲突，再清空。');
            const original = await capture();
            const entries = DATA_KEYS.map((key, index) => ({ key, content: index === 0 ? JSON.stringify(global.PocketStorage.getInitialState()) : null }));
            const backup = await backupAPI.createFromEntries(entries);
            if (!(await backupAPI.verify(JSON.stringify(backup))).valid) throw Error('空学习状态完整性验证失败。');
            operation = { version: 1, uid, generation: meta.generation, expectedRevision: meta.revision || 0,
              expectedSnapshotId: meta.snapshotId || null, originalEntries: rawEntries(), originalHash: original.hash,
              emptyEntries: entries, backup, hash: await sha(JSON.stringify(entries.map(entry => [entry.key, entry.content]))),
              phase: 'prepared', id: null, localEpoch: global.crypto.randomUUID() };
            if (await sha(JSON.stringify(operation.originalEntries.map(entry => [entry.key, entry.content]))) !== original.hash) throw Error('本机记录已变化，请重新确认。');
            persistFresh(operation); // Must precede draining old work or any cloud write.
          }
          // The action itself is not tracked, so this barrier cannot wait for itself.
          let timeout;
          try { await Promise.race([Promise.all([...engines].map(stop => stop())), new Promise((_, reject) => {
            timeout = global.setTimeout(() => reject(Error('旧任务尚未结束，请稍后重试；本机数据未清空。')), 10000);
          })]); } finally { global.clearTimeout(timeout); }
          const token = epoch, guard = () => check(token, uid, true);
          guard();
          if (operation.version !== 1 || !operation.generation || !Number.isSafeInteger(operation.expectedRevision) || operation.expectedRevision < 0 || !['prepared','uploading','committing','committed','applying'].includes(operation.phase)) throw Error('清空操作记录异常，已保留数据，请导出并检查。');
          const report = await backupAPI.verify(JSON.stringify(operation.backup)); guard();
          if (!report.valid || report.materials !== 0 || report.groups !== 0 || report.runs !== 0 || JSON.stringify(operation.backup.entries.map(e => [e.key,e.content])) !== JSON.stringify(operation.emptyEntries.map(e => [e.key,e.content])) || await sha(JSON.stringify(operation.emptyEntries.map(e => [e.key,e.content]))) !== operation.hash) throw Error('待清空版本校验失败，未清空。');
          const currentHash = await sha(JSON.stringify(rawEntries().map(e => [e.key,e.content])));
          if (operation.phase !== 'applying' && currentHash !== operation.originalHash) throw Error('本机记录已变化，未清空。请取消并重新确认。');
          if (operation.phase === 'applying' && rawEntries().some((e,i) => e.content !== operation.originalEntries[i].content && e.content !== operation.emptyEntries[i].content)) throw Error('本机记录与清空操作不一致，已保留，请检查。');
          let c = await cycle(uid), head = await adapter.head(uid); guard();
          if (!c || c.generation !== operation.generation) throw Error('云端备份周期已变化，请处理冲突；未清空。');
          // A lost acknowledgement may belong to an earlier retry of this same
          // authorized empty payload. Recognize it only at the exact next revision.
          if (head?.dataHash === operation.hash && head?.generation === operation.generation && head?.revision === operation.expectedRevision + 1) {
            operation.id = head.snapshotId; persistFresh(operation);
          }
          let snapshot = operation.id ? await adapter.manifest(uid, operation.id) : null; guard();
          if (snapshot) {
            const verified = await readSnapshot(uid, operation.id); guard();
            if (verified.manifest.dataHash !== operation.hash || verified.manifest.generation !== operation.generation || verified.manifest.revision !== operation.expectedRevision + 1) throw Error('清空备份与操作记录不一致，未清空。');
          } else {
            if (operation.phase === 'committed' || operation.phase === 'applying') throw Error('已提交的清空快照无法读回，请联网后重试；原数据仍受保护。');
            if (c.lastRevision !== operation.expectedRevision || (head?.revision || 0) !== operation.expectedRevision || (head?.snapshotId || null) !== operation.expectedSnapshotId) throw Error('云端已被其他任务更新，请安全取消后处理冲突；未清空。');
            if (head) {
              const previous = await readSnapshot(uid, head.snapshotId); guard();
              if (head.uid !== uid || head.generation !== operation.generation || previous.manifest.revision !== head.revision || previous.manifest.dataHash !== head.dataHash) throw Error('云端现有备份校验失败，未清空。');
            }
            operation.id = global.crypto.randomUUID(); operation.phase = 'uploading'; persistFresh(operation);
            const captured = { backup: operation.backup, hash: operation.hash, summary: summary(operation.backup) };
            // This confirmed operation alone bypasses losses; ordinary sync remains guarded.
            await upload(captured, operation.expectedRevision, token, uid, true, operation.generation, operation.id, () => { operation.phase = "committing"; persistFresh(operation); }); guard();
          }
          head = await adapter.head(uid); c = await cycle(uid); guard();
          if (head?.snapshotId !== operation.id || head?.dataHash !== operation.hash || head?.generation !== operation.generation || head?.revision !== operation.expectedRevision + 1 || c.lastRevision !== operation.expectedRevision + 1) throw Error('云端最新版本已变化或未确认，请重试；未删除本机原记录。');
          operation.phase = 'committed'; persistFresh(operation);
          operation.phase = 'applying'; persistFresh(operation);
          writeEntries(operation.emptyEntries);
          if (await sha(JSON.stringify(rawEntries().map(e => [e.key,e.content]))) !== operation.hash) throw Error('本机空状态校验失败，请重试完成清空。');
          guard();
          pocketLocalStore.setItem(global.PocketDataDeletion.EPOCH, operation.localEpoch);
          const meta = { ...control(), owner: uid, generation: operation.generation, bound: true,
            revision: operation.expectedRevision + 1, snapshotId: operation.id, hash: operation.hash,
            base: summary(operation.backup), dirty: false, pause: null, reason: '', allowedHash: null, lastSuccessAt: now(), freshStartCompletedAt: now() };
          saveControl(meta);
          if (JSON.stringify(control()) !== JSON.stringify(meta)) throw Error('备份控制状态保存校验失败，请重试完成清空。');
          pocketLocalStore.removeItem(FRESH_START);
          if (freshStartMarker()) throw Error('清空操作记录未释放，请重试。');
          localStatus = '已保存'; controlError = '';
          confirmLatest(uid, operation.id, { revision: operation.expectedRevision + 1, generation: operation.generation, dataHash: operation.hash }, operation.backup);
          publish({ status: '备份成功', reason: '', connected: true }); notify();
          return { message: '学习数据已清空，可以重新开始学习', reload: true };
        });
      } catch (error) { publish({ status: '清空未完成', reason: error.message }); throw error; }
      finally { freshStartBusy = false; }
    }
    async function cancelFreshStart() {
      if (freshStartBusy) throw Error('清空仍在进行，请等待。');
      const op = freshStartMarker(); if (!op) return;
      if (!user || user.uid !== op.uid || !online()) throw Error('请登录原账号并联网后安全取消。');
      freshStartBusy = true;
      try { return await global.PocketDataDeletion.exclusive(async () => {
        await Promise.all([...engines].map(stop => stop()));
        const token = epoch; check(token, op.uid, true);
        const manifest = op.id ? await adapter.manifest(op.uid, op.id) : null; check(token, op.uid, true);
        if (manifest || ['committed','applying'].includes(op.phase)) throw Error('云端已提交清空版本，请重试完成本机清空，不能恢复上传旧本机数据。');
        if (op.phase === 'committing') {
          const c = await cycle(op.uid), head = await adapter.head(op.uid); check(token, op.uid, true);
          // A server read showing no manifest alone cannot prove an uncertain
          // request was never committed. Only a later, different valid version
          // makes its expected revision permanently ineligible.
          if (!c || c.generation !== op.generation || c.lastRevision <= op.expectedRevision || head?.revision !== c.lastRevision || head?.dataHash === op.hash) throw Error('提交结果尚未确定，请重试完成清空；暂不能安全取消。');
          await readSnapshot(op.uid, head.snapshotId); check(token, op.uid, true);
        }
        if (await sha(JSON.stringify(rawEntries().map(e=>[e.key,e.content]))) !== op.originalHash) throw Error('本机记录已变化，暂不能取消。');
        pocketLocalStore.removeItem(FRESH_START); publish({ status: '待备份', reason: '' }); schedule();
      }); } finally { freshStartBusy = false; }
    }
    async function prepareNewBackup() {
      newStartPreview = null;
      if (!user || !online()) throw Error('请登录 Firebase 并联网后检查。');
      if (freshStartMarker() || offlinePause()?.status === 'restoring' || resetMarker()?.status === 'clearing' || recoveryError) throw Error('已有未完成的数据操作，请先处理；本机数据未改变。');
      if (newStartBusy || busy || [...engines].some(stop => stop.pending() > 0)) throw Error('仍有云端任务，请稍后检查。');
      if (!adapter.initializeGeneration || !adapter.verifyWriteFence || !adapter.cycleClaim || !adapter.generation) throw Error('当前客户端无法验证旧写入保护，禁止初始化。');
      const uid = user.uid, token = epoch, pending = newStartMarker();
      if (pending && (pending.version !== 1 || pending.uid !== uid || !['prepared','initializing','initialized','uploading','committing'].includes(pending.phase))) throw Error('初始化日志异常或账号不同，请保留数据并登录原账号。');
      const local = await capture(), head = await adapter.head(uid), generation = await adapter.generation(uid);
      if (token !== epoch || user?.uid !== uid) throw Error('账号已变化，请重新检查。');
      if (head && !(pending && head.generation === pending.generation && head.revision === 1 && head.dataHash === pending.localHash)) throw Error('云端 head 仍存在，禁止新周期覆盖；请使用现有数据比较。');
      if (pending && local.hash !== pending.localHash) throw Error('初始化期间本机内容已变化，未执行，请先保留 JSON 并核查。');
      newStartPreview = Object.freeze({ uid, token, checkedAt: now(), localHash: local.hash, counts: { ...local.summary.counts },
        generationMissing: !generation, oldLocalGeneration: control().generation || null,
        expectedGeneration: pending?.expectedGeneration ?? JSON.stringify(generation), pending: !!pending });
      return newStartPreview;
    }
    async function startNewBackup(prepared, confirmation) {
      if (confirmation !== 'RESTART_WITH_VERIFIED_RULES') throw Error('请确认已部署 Pocket protocol 3 Rules，并明确确认重新开始。');
      if (!prepared || prepared !== newStartPreview || prepared.token !== epoch || prepared.uid !== user?.uid || now() - prepared.checkedAt > 300000) throw Error('检查结果已过期，请重新检查。');
      if (newStartBusy || !online()) throw Error('正在初始化或当前离线，未重复执行。');
      if (!global.PocketDataDeletion?.exclusive) throw Error('安全窗口锁未就绪，禁止初始化。');
      newStartBusy = true;
      try { return await global.PocketDataDeletion.exclusive(async () => {
        const uid = prepared.uid;
        if (user?.uid !== uid) throw Error('账号已变化，未初始化。');
        const local = await capture();
        if (local.hash !== prepared.localHash) throw Error('本机内容已变化，请重新检查并确认。');
        const operation = newStartMarker() || { version: 1, uid, generation: global.crypto.randomUUID(), localHash: local.hash,
          expectedGeneration: prepared.expectedGeneration, phase: 'prepared', snapshotId: null };
        if (operation.uid !== uid || operation.localHash !== local.hash) throw Error('日志与当前数据不一致，未执行。');
        const persist = () => {
          const text = JSON.stringify(operation); pocketLocalStore.setItem(NEW_START, text);
          if (pocketLocalStore.getItem(NEW_START) !== text) throw Error('初始化日志保存失败，已停止云端操作。');
        };
        persist();
        let timeout;
        try { await Promise.race([Promise.all([...engines].map(stop => stop())), new Promise((_, reject) => {
          timeout = global.setTimeout(() => reject(Error('旧任务尚未结束，请稍后重试。')), 10000);
        })]); } finally { global.clearTimeout(timeout); }
        const token = epoch, guard = () => check(token, uid, true);
        guard(); publish({ status: '正在验证旧写入保护', reason: '' });
        const verifyFence = async () => {
          const proof = await adapter.verifyWriteFence(uid, guard); guard();
          if (proof?.legacyDenied !== true || proof?.staleDenied !== true) throw Error('无法验证旧设备写入已被拒绝，禁止初始化。');
        };
        await verifyFence();
        let head = await adapter.head(uid), c = await adapter.generation(uid); guard();
        if (c?.generation !== operation.generation) {
          if (head || JSON.stringify(c) !== operation.expectedGeneration) throw Error('云端已被其他任务修改，禁止重新初始化；请核查当前周期。');
          operation.phase = 'initializing'; persist();
          await adapter.initializeGeneration(uid, operation.generation, guard, operation.expectedGeneration); guard();
        }
        c = await cycle(uid); guard();
        const claim = await adapter.cycleClaim(uid, operation.generation); guard();
        if (c?.generation !== operation.generation || c.protocolVersion !== 3 || ![0,1].includes(c.lastRevision) || claim?.uid !== uid || claim.generation !== operation.generation || !claim.createdAt) throw Error('新周期及不可复用凭据未通过服务端校验，继续暂停。');
        await verifyFence(); operation.phase = 'initialized'; persist();
        head = await adapter.head(uid); guard();
        if (!head) {
          if (c.lastRevision !== 0) throw Error('新周期已有提交但 head 缺失，禁止重置或重复上传。');
          operation.snapshotId = global.crypto.randomUUID(); operation.phase = 'uploading'; persist();
          publish({ status: '正在备份', reason: '' });
          await upload(local, 0, token, uid, true, operation.generation, operation.snapshotId,
            () => { operation.phase = 'committing'; persist(); }); guard();
        }
        await verifyFence();
        head = await adapter.head(uid); c = await cycle(uid); guard();
        if (!head || head.uid !== uid || head.generation !== operation.generation || head.revision !== 1 || head.dataHash !== local.hash || c.generation !== operation.generation || c.lastRevision !== 1) throw Error('首次备份最新指针或周期不一致，继续暂停，请重试核查。');
        const snapshot = await readSnapshot(uid, head.snapshotId); guard();
        if (snapshot.manifest.generation !== operation.generation || snapshot.manifest.revision !== 1 || snapshot.manifest.dataHash !== local.hash) throw Error('首次备份读回未通过，继续暂停。');
        const current = await capture(); guard();
        const dirty = current.hash !== local.hash || JSON.stringify(rawEntries().map(e => [e.key,e.content])) !== JSON.stringify(local.backup.entries.map(e => [e.key,e.content]));
        saveControl({ ...control(), owner: uid, generation: operation.generation, bound: true, revision: 1, snapshotId: head.snapshotId,
          hash: local.hash, base: local.summary, lastSuccessAt: now(), dirty, pause: null, reason: '', allowedHash: null });
        confirmLatest(uid, head.snapshotId, snapshot.manifest, snapshot.backup);
        pocketLocalStore.removeItem(LOCAL_RESET); pocketLocalStore.removeItem(OFFLINE_PAUSE); pocketLocalStore.removeItem(NEW_START);
        if (newStartMarker()) throw Error('初始化日志未释放，请重试核查。');
        newStartPreview = null; localStatus = '已保存';
        publish({ status: dirty ? '待备份' : '备份成功', reason: '', connected: true }); if (dirty) schedule(); return view();
      }); } catch (error) { publish({ status: '已暂停', reason: error.message }); throw error; }
      finally { newStartBusy = false; }
    }
    async function prepareRestartAutoBackup() {
      restartPreview = null;
      const marker = resetMarker();
      if (!marker?.waitingCloudDeletion || marker.status !== 'complete') throw Error('请先完成本机清空。');
      if (!user) throw Error('请先登录 Firebase，才能检查当前账号 UID。自动备份保持暂停。');
      const uid = user.uid, token = epoch;
      if (marker.uid && marker.uid !== uid) throw Error('当前 Firebase UID 与清空时的账号不同，请登录原账号。自动备份保持暂停。');
      if (!marker.uid) pocketLocalStore.setItem(LOCAL_RESET, JSON.stringify({ ...marker, uid }));
      if ([...engines].some(stop => stop.pending() > 0)) throw Error('本机仍有尚未完成的备份或恢复任务，请等待任务结束后重试。自动备份保持暂停。');
      if (!online()) throw Error('当前离线，无法验证云端。自动备份保持暂停。');
      if (!adapter.inspectCloudDeletion) throw Error('当前客户端缺少完整云端检查能力，自动备份保持暂停。');
      const result = await adapter.inspectCloudDeletion(uid); check(token, uid);
      const entries = rawEntries();
      const local = entries.every(entry => entry.content === null) ? { summary: { counts: { materials: 0, groups: 0, runs: 0 } }, hash: await sha(JSON.stringify(entries.map(entry => [entry.key, entry.content]))) } : await capture();
      check(token, uid);
      if ([...engines].some(stop => stop.pending() > 0)) throw Error('本机旧任务尚未结束，请稍后重新检查。自动备份保持暂停。');
      const indexes = { head: result.headEmpty, snapshots: result.snapshotsEmpty, uploads: result.uploadsEmpty };
      const indexCheckPassed = result.remaining === false && Object.values(indexes).every(empty => empty === true);
      const blockers = [];
      if (!indexCheckPassed) blockers.push(result.remaining ? 'cloud-records-remain' : 'index-check-incomplete');
      // History destruction and safe restart are different questions. Orphan
      // chunks do not block a new cycle; the missing server write fence does.
      let generation = null, protectionReason = '';
      try { generation = await cycle(uid); check(token, uid); } catch (error) { if (token !== epoch || user?.uid !== uid) throw error; protectionReason = error.message; }
      if (!generation) blockers.push('server-generation-fence-missing');
      else if (generation.lastRevision !== 0 || generation.generation === control().generation) blockers.push('new-generation-required');
      restartPreview = Object.freeze({ uid, token, checkedAt: now(), indexes,
        indexCheckPassed, historicalDeletionVerified: false, automaticBackupSafe: blockers.length === 0, generation, protectionReason,
        canInitialize: indexCheckPassed && typeof adapter.initializeGeneration === "function",
        localCounts: { ...local.summary.counts }, localHash: local.hash,
        blockers, message: indexCheckPassed ? '云端当前备份为空。历史残留分片无法完全验证。' : '云端仍有记录或检查未完成，请先处理后重试。' });
      return restartPreview;
    }
    async function restartAutoBackup(prepared) {
      if (!prepared || prepared !== restartPreview) throw Error('请先重新检查自动备份恢复条件。');
      check(prepared.token, prepared.uid);
      if (!resetMarker() || !prepared.indexCheckPassed) throw Error('云端索引检查尚未通过，自动备份保持暂停。');
      if (!prepared.automaticBackupSafe && !prepared.canInitialize) throw Error('需要先配置服务器端备份代际保护，防止旧设备和旧请求覆盖新周期。自动备份保持暂停。');
      if ([...engines].some(stop => stop.pending() > 0) || busy) throw Error('仍有未完成任务，自动备份保持暂停。');
      return global.PocketDataDeletion.exclusive(async () => {
        busy = true;
        try {
          const empty = rawEntries().every(entry => entry.content === null);
          const captured = empty ? { hash: await sha(JSON.stringify(rawEntries().map(entry => [entry.key, entry.content]))), summary: { counts: { materials: 0, groups: 0, runs: 0 } } } : await capture(); check(prepared.token, prepared.uid);
          if (captured.hash !== prepared.localHash) throw Error('本机记录已变化，请重新检查后确认。');
          let c;
          if (prepared.canInitialize) {
            // Runs only after explicit confirmation, under the local exclusive lock.
            // Transaction and deployed Rules arbitrate concurrent cloud head creation.
            const before = await adapter.inspectCloudDeletion(prepared.uid); check(prepared.token, prepared.uid);
            if (before.remaining !== false || !before.headEmpty || !before.snapshotsEmpty || !before.uploadsEmpty) throw Error('云端存在记录，请先处理冲突；自动备份保持暂停。');
            const id = global.crypto.randomUUID();
            await adapter.initializeGeneration(prepared.uid, id, () => check(prepared.token, prepared.uid));
            c = await cycle(prepared.uid); check(prepared.token, prepared.uid);
            if (c?.generation !== id || c.protocolVersion !== 3) throw Error('保护初始化未通过，自动备份保持暂停。');
          } else c = await cycle(prepared.uid);
          check(prepared.token, prepared.uid);
          const indexes = await adapter.inspectCloudDeletion(prepared.uid); check(prepared.token, prepared.uid);
          if ((!prepared.canInitialize && c.generation !== prepared.generation.generation) || c.lastRevision !== 0 || indexes.remaining !== false || !indexes.headEmpty || !indexes.snapshotsEmpty || !indexes.uploadsEmpty) throw Error('云端状态已变化，请重新检查；自动备份保持暂停。');
          if (empty) {
            // Do not publish an empty cloud backup. The server-provisioned fence
            // already protects this cycle; the first real learning edit uploads it.
            saveControl({ ...control(), owner: prepared.uid, generation: c.generation, bound: true, revision: 0, snapshotId: null, hash: null, base: null, lastSuccessAt: null, dirty: true, pause: null, reason: '' });
            pocketLocalStore.removeItem(OFFLINE_PAUSE); pocketLocalStore.removeItem(LOCAL_RESET);
            restartPreview = null; publish({ status: '待备份', reason: '本机暂无学习记录，开始学习后自动备份。', connected: true }); return { empty: true };
          }
          const uploaded = await upload(captured, 0, prepared.token, prepared.uid, true, c.generation);
          const head = await adapter.head(prepared.uid); check(prepared.token, prepared.uid);
          if (head?.snapshotId !== uploaded.id || head?.generation !== c.generation || head?.dataHash !== captured.hash) throw Error('新周期读回校验失败，自动备份保持暂停。');
          const current = await capture(); check(prepared.token, prepared.uid);
          confirmLatest(prepared.uid, uploaded.id, uploaded.manifest, captured.backup);
          saveControl({ ...control(), owner: prepared.uid, generation: c.generation, bound: true, revision: 1, snapshotId: uploaded.id, hash: captured.hash, base: captured.summary, lastSuccessAt: now(), dirty: current.hash !== captured.hash, pause: null, reason: '' });
          // Persist success first; markers remain throughout upload and read-back.
          pocketLocalStore.removeItem(OFFLINE_PAUSE);
          pocketLocalStore.removeItem(LOCAL_RESET);
          restartPreview = null; publish({ status: current.hash === captured.hash ? '备份成功' : '待备份', connected: true });
          schedule(); return uploaded;
        } catch (error) { publish({ reason: error.message }); throw error; }
        finally { busy = false; }
      });
    }
    let active = 0;
    const idle = new Set();
    const track = fn => async (...args) => {
      active++;
      try { return await fn(...args); }
      finally { if (--active === 0) { for (const resolve of idle) resolve(); idle.clear(); } }
    };
    sync = track(sync); compare = track(compare); bindLocal = track(bindLocal);
    prepareRestore = track(prepareRestore); restore = track(restore); setUser = track(setUser);
    const barrier = () => {
      epoch++; clearTimer(timer); timer = null; comparison = null; publish({});
      return active ? new Promise(resolve => idle.add(resolve)) : Promise.resolve();
    };
    barrier.user = () => user;
    barrier.pending = () => active;
    engines.add(barrier);
    const unsubscribe = signal.subscribe(() => { publish({}); schedule(); });
    return Object.freeze({ view, setUser, compare, bindLocal, sync, history, prepareRestore, restore, readSnapshot, diagnose,
      clearAndRestart, cancelFreshStart, verifyManualCloudDeletion: prepareRestartAutoBackup, prepareRestartAutoBackup, restartAutoBackup, prepareNewBackup, startNewBackup,
      retry: () => sync(true), changed: () => { publish({}); schedule(); },
      dispose() { epoch++; unsubscribe(); clearTimer(timer); engines.delete(barrier); }, summary, losses });
  }
  async function pauseForLocalReset() {
    if (freshStartMarker()) throw Error('请先完成当前清空同步流程，不能同时执行旧本机清空。');
    const previous = resetMarker();
    const uid = previous?.uid || [...engines].map(stop => stop.user()?.uid).find(Boolean) || null;
    pocketLocalStore.setItem(LOCAL_RESET, JSON.stringify({ version: 1, status: 'clearing', waitingCloudDeletion: true, uid }));
    let timeout;
    try {
      await Promise.race([Promise.all([...engines].map(stop => stop())), new Promise((_, reject) => {
        timeout = global.setTimeout(() => reject(Error('旧云端任务尚未结束，未清空本机数据。请联网后重试。')), 10000);
      })]);
    } finally { global.clearTimeout(timeout); }
    const meta = control();
    saveControl({ version: 1, owner: meta.owner, generation: meta.generation, lastSuccessAt: meta.lastSuccessAt,
      bound: false, dirty: false, pause: RESET_STATUS, reason: '' });
  }
  const filePreparations = new WeakSet();
  async function prepareFileRestore(text) {
    const report = await global.PocketLearningBackup.verify(text);
    if (!report.valid) throw Error('JSON 完整性检查未通过：' + report.issues.join('；'));
    signal.ensureReady();
    const backup = JSON.parse(text), original = rawEntries(), originalControl = control();
    const targets = report.backupVersion === 1 ? original.map((entry, i) => ({ ...entry, content: i === 0 ? backup.rawState : entry.content })) : backup.entries.map(({ key, content }) => ({ key, content }));
    const rescueKey = 'pocket-cloud-emergency-' + global.crypto.randomUUID();
    const rescueText = JSON.stringify({ version: 1, createdAt: Date.now(), entries: original, originalControl });
    pocketLocalStore.setItem(rescueKey, rescueText);
    if (pocketLocalStore.getItem(rescueKey) !== rescueText) throw Error('应急副本未能可靠保存，禁止恢复。');
    saveControl({ ...originalControl, emergencyKey: rescueKey });
    const localReport = original[0].content === null ? { materials: 0, groups: 0, runs: 0 } : global.PocketLearningBackup.inspect(original[0].content);
    const prepared = Object.freeze({ report, text, original, targets, originalControl, localReport, rescueKey, rescueText });
    filePreparations.add(prepared); return prepared;
  }
  async function restoreFile(prepared) {
    if (!filePreparations.has(prepared)) throw Error('请重新选择并预览 JSON 备份。');
    if (!global.PocketDataDeletion?.exclusive) throw Error('当前浏览器无法安全隔离其他窗口，未恢复数据。');
    return global.PocketDataDeletion.exclusive(async () => {
      signal.ensureReady();
      if (JSON.stringify(rawEntries()) !== JSON.stringify(prepared.original)) throw Error('本机数据已变化，请重新预览。');
      if (pocketLocalStore.getItem(prepared.rescueKey) !== prepared.rescueText) throw Error('应急副本丢失或损坏，禁止恢复。');
      const checked = await global.PocketLearningBackup.verify(prepared.text);
      if (!checked.valid) throw Error('恢复文件校验失败。');
      const source = JSON.parse(prepared.text);
      const targets = checked.backupVersion === 1 ? prepared.original.map((entry, i) => ({ ...entry, content: i === 0 ? source.rawState : entry.content })) : source.entries.map(({ key, content }) => ({ key, content }));
      pocketLocalStore.setItem(OFFLINE_PAUSE, JSON.stringify({ version: 1, status: 'restoring' }));
      let timeout;
      try {
        await Promise.race([Promise.all([...engines].map(stop => stop())), new Promise((_, reject) => {
          timeout = global.setTimeout(() => reject(Error('旧云端任务尚未结束，未恢复本机数据。')), 10000);
        })]);
        if (JSON.stringify(rawEntries()) !== JSON.stringify(prepared.original)) throw Error('本机数据已变化，请重新预览。');
        const previous = control();
        saveControl({ ...previous, bound: false, pause: previous.pause || 'JSON 恢复后自动备份已暂停，请比较后确认。', emergencyKey: prepared.rescueKey });
        const journal = JSON.stringify({ version: 1, kind: 'json', entries: prepared.original, originalControl: previous });
        pocketLocalStore.setItem(JOURNAL, journal);
        if (pocketLocalStore.getItem(JOURNAL) !== journal) throw Error('恢复日志无法可靠保存。');
        writeEntries(targets);
        if (JSON.stringify(rawEntries()) !== JSON.stringify(targets)) throw Error('恢复后的原始内容校验失败。');
        pocketLocalStore.setItem(OFFLINE_PAUSE, JSON.stringify({ version: 1, status: 'complete' }));
        const meta = control(); meta.restoreVerifiedAt = Date.now(); saveControl(meta);
        pocketLocalStore.setItem(global.PocketDataDeletion.EPOCH, global.crypto.randomUUID());
        pocketLocalStore.removeItem(JOURNAL);
        filePreparations.delete(prepared); recoveryError = ''; localStatus = '已保存'; notify();
        return { ...checked, restored: true };
      } catch (error) {
        const raw = pocketLocalStore.getItem(JOURNAL);
        if (raw && JSON.parse(raw).kind === 'json') recoverPending();
        else pocketLocalStore.setItem(OFFLINE_PAUSE, JSON.stringify({ version: 1, status: 'complete' }));
        throw Error('JSON 恢复失败；' + (recoveryError || '原本机记录已保留，自动备份仍暂停。') + error.message);
      } finally { global.clearTimeout(timeout); }
    });
  }
  global.PocketCloudBackup = Object.freeze({ createEngine, sha, summary, losses, CONTROL, JOURNAL, DATA_KEYS, LOCAL_RESET, OFFLINE_PAUSE, RESET_STATUS, FRESH_START, freshStartMarker, pauseForLocalReset, prepareFileRestore, restoreFile });
})(globalThis);
