'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { webcrypto } = require('node:crypto');
const { TextEncoder } = require('node:util');
const { Blob } = require('node:buffer');
(async () => {
  const state = { version: 1, currentSession: null, review: { lastReviewedAt: null }, secretInternal: 'DO-NOT-SHOW', materials: [
    { id: 'material-private-id', subject: '数学', title: '函数 | <script>\n[专题]*_`\\', status: 'learning', unknownField: 'JSON-ONLY', groups: [
      { id: 'group-private-id', start: 0, end: 9, executionCompleted: false, outputCompleted: true, keyQuestions: '第 3 | 4 题\r\n<重点> & **提示**', runs: [
        { startedAt: 0, completedAt: 60000, mode: 'new', outputCompleted: true, result: '完成 | 待复习\n<结果>', accuracyPercent: 80, durationMs: 60000, privateFuture: { keep: true } },
        { mode: 'review', completedAt: null, outputCompleted: false, accuracy: 0, durationSeconds: 0 },
      ] },
      { start: 10, end: 12, runs: [{ mode: 'material-review', accuracy: '75%', duration: '2 分钟' }] },
    ] },
    { id: 'empty-material', subject: '数学', title: '空资料', status: 'completed', groups: [] },
    { id: 'english', subject: '英语', title: '阅读', groups: [{}] },
  ] };
  const raw = JSON.stringify(state, null, 2), store = new Map([['cognivex-pocket-state', raw]]);
  let writes = 0, blob, urls = 0, revokes = 0;
  const downloads = [], nodes = new Map();
  function element() { return { events: {}, disabled: false, textContent: '', value: '', addEventListener(name, fn) { this.events[name] = fn; }, click() { this.clicked = true; }, remove() {} }; }
  for (const id of ['export-learning-backup', 'export-learning-archive', 'verify-learning-backup', 'learning-backup-file', 'learning-backup-status']) nodes.set(id, element());
  const context = vm.createContext({ crypto: webcrypto, TextEncoder, Blob,
    URL: { createObjectURL(value) { blob = value; urls++; return 'blob:mock'; }, revokeObjectURL() { revokes++; } },
    setTimeout(fn) { fn(); },
    document: { getElementById: id => nodes.get(id), createElement() { const anchor = element(); downloads.push(anchor); return anchor; }, body: { appendChild() {} } },
    localStorage: { getItem: key => store.get(key) ?? null, setItem() { writes++; throw Error('Unexpected write'); }, removeItem() { writes++; throw Error('Unexpected delete'); } },
  });
  require('./helpers/environment.cjs')(context);
  for (const name of ['learning-backup', 'learning-archive']) vm.runInContext(fs.readFileSync(path.join(__dirname, '../js', name + '.js'), 'utf8'), context);
  const date = '2026-10-12T12:34:56.000Z', archive = context.PocketLearningArchive;
  const markdown = archive.render(raw, date);
  assert.match(markdown, /^# Cognivex Pocket 学习档案\n/);
  assert.match(markdown, /## 一、已学习全部资料的学习数据/);
  assert.match(markdown, /## 二、重点复习系统学习数据\n\n暂无重点复习数据/);
  assert.match(markdown, /备份时间：2026-10-12 12:34:56.000 UTC/);
  assert.match(markdown, /Material：3\n- Group：3\n- Run：3（全部资料累计训练次数）/);
  assert.equal((markdown.match(/### 学科：数学/g) || []).length, 1);
  assert.match(markdown, /### 学科：英语/);
  assert.match(markdown, /学习状态：学习中/);
  assert.match(markdown, /学习状态：已完成/);
  assert.match(markdown, /学习状态：未记录/);
  assert.equal((markdown.match(/^\*\*分组记录\*\*$/gm) || []).length, 3);
  assert.match(markdown, /> \*\*资料概况\*\*\n>\n> 分组数量：2\\\n> 训练记录：3（本资料累计训练次数）\\\n> 学习状态：学习中\n\n\*\*分组记录\*\*/);
  assert.match(markdown, /> 分组数量：0\\\n> 训练记录：0（本资料累计训练次数）\\\n> 学习状态：已完成/);
  assert.doesNotMatch(markdown, /训练历史|现有进度|简单题|边界题|难题|最新成绩记录于/m);
  assert.match(markdown, /\| 第1组 \| 0-9 \| 80% \| 未填写 \|/);
  assert.match(markdown, /\| 第2组 \| 10-12 \| 未填写 \| 未填写 \| 未填写 \|/);
  assert.match(markdown, /\| 第1组 \| 未填写 \| 未填写 \| 未填写 \| 未填写 \|/);
  assert.equal((markdown.match(/\| 组别 \| 题号范围 \| 最新正确率 \| 最新用时 \| 本组重点题目 \|/g) || []).length, 3);
  assert.match(markdown, /第 3 \\\| 4 题<br>&lt;重点&gt; &amp;/);
  assert.ok(markdown.indexOf('| 第1组 | 0-9') < markdown.indexOf('| 第2组 | 10-12'));
  assert.match(markdown, /函数 \\\| &lt;script&gt;<br>\\\[专题\\\]/);

  assert.doesNotMatch(markdown, /<script>|material-private-id|group-private-id|DO-NOT-SHOW|JSON-ONLY|privateFuture/);
  assert.match(markdown, /仅供阅读/);
  const before = JSON.stringify([...store]);
  await nodes.get('export-learning-backup').events.click();
  assert.equal(downloads.length, 1); assert.match(downloads[0].download, /\.json$/);
  const backup = JSON.parse(await blob.text());
  assert.equal(backup.rawState, raw);
  assert.deepEqual(JSON.parse(backup.rawState), state);
  assert.equal(backup.backupVersion, 2);
  assert.match(backup.checksum.value, /^[a-f0-9]{64}$/);
  assert.equal((await context.PocketLearningBackup.verify(JSON.stringify(backup))).valid, true);
  nodes.get('export-learning-archive').events.click();
  assert.equal(downloads.length, 2); assert.match(downloads[1].download, /\.md$/);
  assert.equal(downloads[1].clicked, true);
  assert.equal(blob.type, 'text/markdown;charset=utf-8');
  assert.match(await blob.text(), /Material：3/);
  assert.equal(urls, 2); assert.equal(revokes, 2);
  assert.equal(JSON.stringify([...store]), before);
  const empty = JSON.stringify({ version: 1, currentSession: null, review: { lastReviewedAt: null }, materials: [] });
  assert.match(archive.render(empty, date), /Material：0\n- Group：0\n- Run：0/);
  assert.equal(archive.render(null, date).trimEnd().endsWith('## 三、已熟练并移除的所有题目\n\n暂无已熟练并移除的题目'), true);
  store.delete('cognivex-pocket-state'); nodes.get('export-learning-archive').events.click();
  assert.equal(downloads.length, 3); assert.match(await blob.text(), /Material：0/);
  assert.throws(() => archive.render('{bad', date), /先导出 JSON/);
  store.set('cognivex-pocket-state', '{bad'); nodes.get('export-learning-archive').events.click();
  assert.equal(downloads.length, 3);
  assert.match(nodes.get('learning-backup-status').textContent, /导出失败/);
  assert.equal(nodes.get('export-learning-archive').disabled, false);
  context.localStorage.getItem = () => { throw Error('Storage denied'); };
  nodes.get('export-learning-archive').events.click();
  assert.equal(downloads.length, 3);
  assert.match(nodes.get('learning-backup-status').textContent, /Storage denied/);
  assert.equal(writes, 0);
  console.log('PASS: separate JSON/Markdown downloads, raw unknown-field and SHA-256 preservation, real counts/subjects/status, concise per-material headings without group/run details, missing/zero fields, Chinese/HTML/Markdown escaping, empty and invalid data, no storage writes.');
})().catch(error => { console.error(error); process.exitCode = 1; });
