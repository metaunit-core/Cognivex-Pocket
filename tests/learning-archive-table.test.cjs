'use strict';
const assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path'), vm = require('node:vm');
const { boot, seed } = require('./helpers/pocket-learning-ui.cjs');
const app = boot({ location: new URL('http://localhost:4173/'), focusReview: true });
for (const name of ['learning-backup', 'learning-archive']) vm.runInContext(fs.readFileSync(path.join(__dirname, '../js/' + name + '.js'), 'utf8'), app.context);
const state = seed(2), first = state.materials[0].groups[0];
first.start = 1; first.end = 2; first.latestAccuracyRatio = '2/2'; first.latestAccuracyPercent = 100; first.latestDurationMinutes = 5;
first.keyQuestions = '第2题 | 备注\\\n<重点> **提示**';
state.materials[0].groups.push({ start: 3, end: 4, latestAccuracyRatio: '1/2', latestDurationMinutes: 8, keyQuestions: '第3题', runs: [] }, { start: 5, end: 5, runs: [] });
const raw = JSON.stringify(state), before = JSON.stringify([...app.store]);
const md = app.context.PocketLearningArchive.render(raw, '2026-10-22T00:00:00.000Z');
const main = md.split('## 二、重点复习系统学习数据')[0];
assert.equal((main.match(/^\| 组别 \| 题号范围 \| 最新正确率 \| 最新用时 \| 本组重点题目 \|$/gm) || []).length, 2);
assert.equal((main.match(/^\| 第\d+组 /gm) || []).length, 4);
assert.match(main, /\| 第1组 \| 1-2 \| 2\/2 \| 5分钟 \| 第2题 \\\| 备注\\\\<br>&lt;重点&gt; \\\*\\\*提示/);
assert.match(main, /\| 第2组 \| 3-4 \| 1\/2 \| 8分钟 \| 第3题 \|/);
assert.match(main, /\| 第3组 \| 5 \| 未填写 \| 未填写 \| 未填写 \|/);
for (const line of main.split('\n').filter(line => line.startsWith('|'))) {
  // Escaped pipes inside content must not add a column.
  assert.equal(line.replace(/\\\|/g, '').split('|').length - 1, 6, line);
}
assert.doesNotMatch(main, /最新成绩记录于|第\d+次训练|\*\*第 \d+ 组\*\*|^- 题号范围：/m);
assert.match(main, /Material：2\n- Group：4\n- Run：2（全部资料累计训练次数）/);
assert.equal(md.split('## 二、重点复习系统学习数据')[1].split('## 三、已熟练并移除的所有题目')[0], '\n\n暂无重点复习数据\n\n');
assert.equal(JSON.stringify(state), raw); assert.equal(JSON.stringify([...app.store]), before);
const overview = main.match(/> \*\*资料概况\*\*[\s\S]*?\n\n\*\*分组记录\*\*/)[0];
assert.match(overview, /> 分组数量：3\\\n> 训练记录：1（本资料累计训练次数）\\\n> 学习状态：已完成/);
assert.ok(overview.split('\n').slice(0, -2).every(line => line.startsWith('>')));
// A mixed Group uses current material names and displays its shared grade only once.
const model = app.context.PocketFocusReview;
model.add(state, 'm1', 0, '1、2'); model.add(state, 'm2', 0, '2');
const id = model.create(state, '数学', 3, model.available(state, '数学').map(q => q.id));
model.start(state, id);
while (model.active(state)) model.transition(state, model.active(state).run.id, 'finish', { accuracy: '999/10000', durationMinutes: '23' });
state.materials[1].title = '新资料 | 名称';
const mixedRaw = JSON.stringify(state), exported = app.context.PocketLearningArchive.render(mixedRaw);
const section = exported.split('## 二、重点复习系统学习数据')[1];
assert.match(section, /### 重点 Group 1\n\n> \*\*学科：数学\*\*\n\n\| 资料名称 \| 对应题号 \| 最新正确率 \| 最新用时 \|/);
assert.match(section, /\| 资料1 \| 第1、2题 \| 999\/10000 \| 23分钟 \|\n\| 新资料 \\\| 名称 \| 第2题 \| — \| — \|/);
assert.equal((section.match(/999\/10000/g) || []).length, 1);
assert.doesNotMatch(exported, /最新成绩记录于|完整 Group 复习|第\d+次|<table|<blockquote|<style/);
for (const line of section.split('\n').filter(line => line.startsWith('|'))) assert.equal(line.replace(/\\\|/g, '').split('|').length - 1, 5);
assert.equal(JSON.stringify(state), mixedRaw); assert.equal(JSON.stringify([...app.store]), before);
const hiddenTitle = '## 三、已熟练并移除的所有题目';
assert.ok(exported.includes(hiddenTitle+'\n\n暂无已熟练并移除的题目'));
assert.doesNotMatch(exported,/已熟练及已移出的重点题|已熟练、已移出及来源不可用的重点题/);
state.focusReview.questions[0].status = 'mastered';
state.focusReview.questions[1].status = 'removed';
state.focusReview.questions[2].groupKey = 'id:missing';
const hiddenRaw = JSON.stringify(state), hiddenExport = app.context.PocketLearningArchive.render(hiddenRaw);
assert.equal(hiddenExport.split('## 二、重点复习系统学习数据')[0], exported.split('## 二、重点复习系统学习数据')[0]);
const hiddenSection = hiddenExport.split(hiddenTitle)[1];
assert.equal(hiddenSection, '\n\n| 学科 | 资料名称 | 题号 | 移除来源 |\n| --- | --- | --- | --- |\n' +
  '| 数学 | 资料1 | 第1题 | 重点复习系统 |\n| 数学 | 资料1 | 第2题 | 重点复习系统 |');
for (const line of hiddenSection.split('\n').filter(line => line.startsWith('|'))) assert.equal(line.replace(/\\\|/g, '').split('|').length - 1, 5);
assert.equal(JSON.stringify(state), hiddenRaw); assert.equal(JSON.stringify([...app.store]), before);
console.log('PASS localhost five-column tables, one row per Group, real grades/missing values, escaped pipes/newlines, unchanged statistics/second section and read-only state.');
