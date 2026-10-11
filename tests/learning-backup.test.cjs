'use strict';
// All storage and DOM are simulated; no real browser data is accessed.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { webcrypto } = require('node:crypto');
const { TextEncoder } = require('node:util');
const source = fs.readFileSync(path.join(__dirname, '../js/learning-backup.js'), 'utf8');

module.exports = (async () => {
  const state = { version: 1, review: { lastReviewedAt: 123, unlock: { usedAt: null } },
    currentSession: { currentStep: 'output', currentGroupIndex: 1, future: '断点' },
    materialReviewSession: { queue: [{ materialId: 'A', groupId: 'a2' }], currentQueueIndex: 0 },
    futureField: { text: '未知字段 🧠', array: [1, null] }, materials: [
      { id: 'A', addedToReviewAt: 100, videoLinks: [{ url: 'https://example.com' }], outputLinks: [],
        materialReviewHistory: [{ completedAt: 120 }], groups: [
          { id: 'a1', keyQuestions: '第3题', runs: [{ completedAt: 100, extra: true }] },
          { id: 'a2', runs: [{ currentStep: 'output' }, { completedAt: 110 }] }] },
      { id: 'B', groups: [{}], future: { intact: true } }
    ] };
  let raw = JSON.stringify(state, null, 3), writes = 0, removed = 0, downloads = [], revoked = [];
  const original = raw;
  const extra = new Map([
    ['pocket-listening-start-v1', JSON.stringify({ subject: { status: 'paused', remaining: 3000, future: true } })],
    ['pocket-training-sop-model-v1', JSON.stringify({ purpose: '训练', future: '未知输入' })],
    ['pocket-last-view-v1', JSON.stringify({ page: 'learning', outputPage: 'questions' })],
    ['pocket-view-history-v1', JSON.stringify([{ page: 'home' }])],
    ['firebase:authUser:secret', 'DO NOT EXPORT'], ['pocket-unknown-auth', 'DO NOT EXPORT']
  ]);
  const nodes = new Map();
  function element() { return { events: {}, disabled: false, textContent: '', value: '',
    addEventListener(name, handler) { this.events[name] = handler; },
    click() { this.clicked = true; }, remove() { removed++; } }; }
  for (const id of ['export-learning-backup', 'verify-learning-backup', 'learning-backup-file', 'learning-backup-status']) nodes.set(id, element());
  let emittedBlob;
  const context = vm.createContext({ crypto: webcrypto, TextEncoder, Blob: require('node:buffer').Blob,
    URL: { createObjectURL(blob) { emittedBlob = blob; return 'blob:mock'; }, revokeObjectURL(url) { revoked.push(url); } },
    setTimeout(callback) { callback(); },
    document: { getElementById(id) { return nodes.get(id); }, createElement() { const anchor = element(); downloads.push(anchor); return anchor; }, body: { appendChild() {} } },
    localStorage: { getItem(key) { assert.ok(['cognivex-pocket-state', 'pocket-listening-start-v1', 'pocket-training-sop-model-v1', 'pocket-last-view-v1', 'pocket-view-history-v1'].includes(key)); return key === 'cognivex-pocket-state' ? raw : extra.get(key) ?? null; },
      setItem() { writes++; throw Error('Unexpected write'); }, removeItem() { writes++; throw Error('Unexpected delete'); } } });
  vm.runInContext(source, context);
  const api = context.PocketLearningBackup;
  const backup = await api.create();
  assert.equal(backup.rawState, original);
  assert.deepEqual(JSON.parse(backup.rawState), state);
  assert.equal(backup.stateVersion, 1);
  assert.match(backup.checksum.value, /^[a-f0-9]{64}$/);
  assert.equal(backup.backupVersion, 2);
  assert.equal(backup.entries.length, 5);
  assert.equal(JSON.stringify(backup).includes('DO NOT EXPORT'), false);
  for (const entry of backup.entries.slice(1)) assert.equal(entry.content, extra.get(entry.key));
  const corruptEntry = JSON.parse(JSON.stringify(backup)); corruptEntry.entries[1].content = '{}';
  assert.equal((await api.verify(JSON.stringify(corruptEntry))).valid, false);
  const missingEntry = JSON.parse(JSON.stringify(backup)); missingEntry.entries.pop();
  await assert.rejects(api.verify(JSON.stringify(missingEntry)), /清单/);
  const renamedEntry = JSON.parse(JSON.stringify(backup)); renamedEntry.entries[1].key = 'firebase:authUser:secret';
  await assert.rejects(api.verify(JSON.stringify(renamedEntry)), /清单/);
  const legacy = { format: backup.format, backupVersion: 1, exportedAt: backup.exportedAt, stateVersion: 1, rawState: original };
  legacy.checksum = { algorithm: 'SHA-256', value: require('node:crypto').createHash('sha256').update(JSON.stringify([
    legacy.format, 1, legacy.exportedAt, 1, original])).digest('hex') };
  const legacyReport = await api.verify(JSON.stringify(legacy));
  assert.equal(legacyReport.valid, true); assert.equal(legacyReport.scope.filter(x => x.present).length, 1);
  const report = await api.verify(JSON.stringify(backup));
  assert.equal(report.scope.filter(x => x.present).length, 5);
  assert.equal(report.valid, true); assert.equal(report.materials, 2); assert.equal(report.groups, 3); assert.equal(report.runs, 3);
  const changed = JSON.parse(JSON.stringify(backup)); changed.rawState = changed.rawState.replace('第3题', '第7题');
  assert.equal((await api.verify(JSON.stringify(changed))).checksumValid, false);
  const changedDate = { ...backup, exportedAt: '2000-01-01T00:00:00.000Z' };
  assert.equal((await api.verify(JSON.stringify(changedDate))).valid, false);
  await assert.rejects(api.verify('{'), /有效 JSON/);
  await assert.rejects(api.verify(JSON.stringify(state)), /结构/);
  await assert.rejects(api.verify(JSON.stringify({ ...backup, backupVersion: 99 })), /版本/);
  raw = '{damaged';
  assert.equal((await api.create()).rawState, raw);
  assert.equal((await api.verify(JSON.stringify(await api.create()))).valid, false);
  raw = JSON.stringify({ ...state, version: 99 });
  assert.equal((await api.verify(JSON.stringify(await api.create()))).valid, false);
  raw = JSON.stringify({ ...state, materials: [state.materials[0], state.materials[0]] });
  assert.ok((await api.verify(JSON.stringify(await api.create()))).issues.some(x => x.includes('重复')));
  const duplicate = JSON.parse(original); duplicate.materials[0].groups[1].id = 'a1'; raw = JSON.stringify(duplicate);
  assert.equal((await api.verify(JSON.stringify(await api.create()))).valid, false);
  raw = null;
  assert.equal((await api.verify(JSON.stringify(await api.create()))).valid, true);
  const savedExtra = new Map(extra); extra.clear();
  await assert.rejects(api.create(), /尚无/);
  for (const [key, value] of savedExtra) extra.set(key, value);
  raw = original;
  await nodes.get('export-learning-backup').events.click();
  assert.equal(downloads.length, 1); assert.match(downloads[0].download, /^Pocket-backup-.*\.json$/);
  assert.equal(downloads[0].clicked, true); assert.equal(removed, 1); assert.equal(revoked.length, 1);
  assert.equal((await api.verify(await emittedBlob.text())).valid, true);
  nodes.get('verify-learning-backup').events.click(); assert.equal(nodes.get('learning-backup-file').clicked, true);
  nodes.get('learning-backup-file').files = [{ text: async () => JSON.stringify(backup) }];
  await nodes.get('learning-backup-file').events.change();
  assert.match(nodes.get('learning-backup-status').textContent, /资料：2 · Group：3 · Run：3/);
  assert.match(nodes.get('learning-backup-status').textContent, /未写入或恢复/);
  assert.match(nodes.get('learning-backup-status').textContent, /泛听计时/);
  nodes.get('learning-backup-file').files = [{ text: async () => JSON.stringify(legacy) }];
  await nodes.get('learning-backup-file').events.change();
  assert.match(nodes.get('learning-backup-status').textContent, /旧版未覆盖/);
  context.crypto = null;
  await nodes.get('export-learning-backup').events.click(); assert.equal(nodes.get('export-learning-backup').disabled, false);
  assert.match(nodes.get('learning-backup-status').textContent, /导出失败/);
  context.crypto = webcrypto; context.localStorage.getItem = () => { throw Error('Storage denied'); };
  await assert.rejects(api.create(), /Storage denied/);
  assert.equal(writes, 0); assert.equal(raw, original);
  console.log('PASS: exact raw/unknown-field preservation, SHA-256 integrity, counts, legacy data, damaged originals, invalid/duplicate/version detection, read-only file validation, download UI and failure paths.');
})();
if (require.main === module) module.exports.catch(error => { console.error(error); process.exitCode = 1; });
