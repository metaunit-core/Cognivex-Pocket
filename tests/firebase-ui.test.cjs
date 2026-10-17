'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const html = fs.readFileSync(path.join(__dirname, '../index.html'), 'utf8');
// Check real markup nesting: every advanced action remains available and folded.
const stack = [], ancestors = new Map();
for (const match of html.matchAll(/<\/?([a-z][\w-]*)\b[^>]*>/gi)) {
  const tag = match[1].toLowerCase(), text = match[0];
  if (text.startsWith('</')) { assert.equal(stack.pop()?.tag, tag, 'balanced HTML: ' + text); continue; }
  const id = /\bid="([^"]+)"/.exec(text)?.[1];
  if (id) ancestors.set(id, stack.map(item => item.id));
  if (!['meta', 'link', 'input', 'br', 'hr', 'img', 'source', 'wbr'].includes(tag)) stack.push({ tag, id });
}
assert.equal(stack.length, 0);
assert.ok(!ancestors.has("reset-data-button"));
assert.ok(!ancestors.has("learning-data-deletion"));
const intro='Firebase 是云端自动备份，不用看懂里面的数据；JSON 是完整数据备份母本，出问题时可以用来恢复；学习档案是 Markdown 文件，排版清楚，方便直接查看学习记录。';
assert.equal(html.split(intro).length-1,1);
for (const id of ['safety-local-state','safety-cloud-state','safety-json-state','learning-backup-files','export-learning-backup','export-learning-archive','learning-backup-status']) assert.ok(ancestors.get(id).includes('learning-data-safety'), id+' stays inside the single safety card');
assert.ok(!ancestors.has('manual-cloud-check-area'));
assert.ok(!ancestors.has('manual-cloud-restart'));
for (const id of ['deletion-guide','firebase-new-start-area','firebase-new-start']) assert.ok(ancestors.get(id).includes('learning-backup-files'), id+' stays inside backup/export');
assert.ok(!ancestors.has('fresh-start-area'));
assert.ok(!ancestors.has('fresh-start-submit'));
assert.ok(html.indexOf(intro)>html.indexOf('01 学习数据安全') && html.indexOf(intro)<html.indexOf('① 保存状态'));
assert.match(html, /<details id="learning-backup-files" class="backup-subsection"/);
assert.doesNotMatch(html, /js\/local-reset-ui\.js/);
const sections = { 'firebase-compare': 'firebase-advanced', 'firebase-history': 'firebase-restore', 'firebase-bind-cloud': 'firebase-restore', 'firebase-emergency-export': 'firebase-restore', 'export-learning-backup': 'learning-backup-files', 'verify-learning-backup': 'firebase-restore', 'firebase-logout': 'firebase-account' };
for (const [id, section] of Object.entries(sections)) assert.ok(ancestors.get(id).includes(section), id + ' stays in its folded section');
assert.ok(!ancestors.get('firebase-retry').includes('firebase-advanced'));
assert.ok(!ancestors.has('firebase-bind-local'));
assert.ok(!ancestors.has('firebase-enable'));
assert.match(html, /<details id="firebase-advanced" class="data-management-section">/);
assert.doesNotMatch(html, /选择性删除资料|清空全部学习数据|永久销毁全部学习数据|安全界面尚未接入/);
assert.doesNotMatch(html, /清空本机学习数据|高级数据管理 → 本机数据管理/);
assert.ok(ancestors.get('export-learning-archive').includes('learning-backup-files'));
assert.match(html, /id="export-learning-backup"[^>]*>导出 JSON 备份/);
const descriptions = {
  'firebase-logout': '退出云端账号，不删除学习记录。',
  'firebase-retry': '云端备份失败时，重新上传本地记录。',
  'firebase-compare': '本地和云端记录不同时，检查并选择保留哪份。',
  'firebase-bind-cloud': '从 Firebase 找回最近备份的学习记录。',
  'firebase-history': '查看以前保存的版本，必要时找回旧记录。',
  'firebase-emergency-export': '恢复云端数据前，先保存当前本地记录。',
  'export-learning-backup': '保存完整数据，用于备份和恢复。',
  'export-learning-archive': '导出排版好的 Markdown 文件，可在 VS Code 中预览。仅供阅读，JSON 才是完整备份。',
  'verify-learning-backup': '检查 JSON 备份是否有效，不会导入数据。'
};
for (const [id, description] of Object.entries(descriptions)) {
  const area = html.match(new RegExp('<div class="data-management-action">\\s*(<button id="' + id + '"[^>]*>[^<]*</button>)\\s*<p class="data-management-help" id="' + id + '-help">([^<]*)</p>\\s*</div>'));
  assert.ok(area, id + ' and explanation share a wrapper');
  assert.equal(area[2], description);
  assert.ok(area[1].includes('aria-describedby="' + id + '-help"'));
}
const nodes = new Map();
const get = id => {
  if (!nodes.has(id)) nodes.set(id, { textContent: '', disabled: false, hidden: false, addEventListener() {}, replaceChildren() {} });
  return nodes.get(id);
};
const context = vm.createContext({ PocketEnvironment: { firebaseAllowed: true, isTest: false }, document: { getElementById: get }, window: {},
  connectFirebase: async () => { throw Error('isolated test: no Firebase connection'); } });
const source = fs.readFileSync(path.join(__dirname, '../js/firebase-ui.js'), 'utf8').replace(/^import[^\n]*\n/, '');
vm.runInContext(source, context);
function render(patch) {
  context.fixture = { user: { uid: 'A', email: 'a@example.test' }, bound: true, status: '备份成功', lastSuccessAt: 1000000, pending: false, localStatus: '已保存', ...patch };
  vm.runInContext('render(fixture)', context);
}
render({});
assert.equal(get('firebase-backup-status').textContent.split('\n').length, 5);
assert.match(get('firebase-backup-status').textContent, /自动备份已开启/);
assert.equal(get('firebase-login-fields').hidden, true);
assert.equal(get('firebase-enable').hidden, true);
render({ bound: false, status: '等待开启自动备份', comparison: { local: { summary: { counts: {} }, backup: { exportedAt: '2026-10-12' }, hash: 'aaa' }, cloud: null } });
assert.equal(get('firebase-enable').hidden, false);
assert.equal(get('firebase-enable').disabled, false);
render({ bound: false, status: '发现两份不同的学习记录，需要确认', comparison: { local: { summary: { counts: {} }, backup: { exportedAt: '2026-10-12' }, hash: 'aaa' }, cloud: { summary: { counts: {} }, backup: { exportedAt: '2026-10-12' }, manifest: { dataHash: 'bbb' } }, head: {} } });
assert.equal(get('firebase-enable').hidden, true);
assert.match(get('firebase-backup-status').textContent, /发现两份不同/);
assert.match(get('firebase-comparison').textContent, /数量相同也不代表内容一致/);
render({ status: '失败', reason: '云端备份权限不足' });
assert.match(get('firebase-backup-status').textContent, /权限不足/);
assert.equal(get('firebase-retry-area').hidden, false);
assert.equal(get('firebase-copy-checksums').disabled, true);
render({ connected: true });
assert.match(get('firebase-backup-status').textContent, /云端连接：已连接/);
assert.equal(get('firebase-retry-area').hidden, true);
render({ status: '数据冲突' });
assert.equal(get('firebase-conflict-entry').hidden, false);
context.document.getElementById = id => ['firebase-bind-local', 'firebase-enable', 'firebase-bind-local-area', 'firebase-enable-area'].includes(id) ? null : get(id);
render({ status: '数据冲突' });
console.log('PASS: removed local-confirm controls, missing-node-safe render, preserved exports and Firebase status/conflict behavior.');

