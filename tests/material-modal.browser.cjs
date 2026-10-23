'use strict';
// Localhost-only browser smoke test. Uses an isolated temporary browser profile and synthetic records.
const assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path'), http = require('node:http');
const { seed } = require('./helpers/pocket-learning-ui.cjs');
let playwright;
try { playwright = require('playwright'); } catch (_) {
  playwright = require(path.join(path.dirname(process.execPath), 'node_modules/playwright'));
}
const root = path.resolve(__dirname, '..'), key = 'pocket-development-v1:cognivex-pocket-state';
const server = http.createServer((request, response) => {
  const file = path.resolve(root, '.' + new URL(request.url, 'http://localhost').pathname.replace(/\/$/, '/index.html'));
  if (!file.startsWith(root + path.sep)) { response.writeHead(403).end(); return; }
  try {
    const mime = { '.js': 'text/javascript', '.css': 'text/css', '.html': 'text/html', '.json': 'application/json' };
    response.setHeader('Content-Type', mime[path.extname(file)] || 'text/plain'); response.end(fs.readFileSync(file));
  } catch (_) { response.writeHead(404).end(); }
});
(async () => {
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const origin = `http://127.0.0.1:${server.address().port}`;
  const executablePath = process.env.POCKET_TEST_BROWSER || 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
  const browser = await playwright.chromium.launch({ executablePath, headless: true });
  try {
    for (const viewport of [{ width: 390, height: 844 }, { width: 768, height: 1024 }, { width: 1024, height: 768 }, { width: 1440, height: 900 }]) {
      const context = await browser.newContext({ viewport, acceptDownloads: true, hasTouch: viewport.width < 1100 });
      await context.route('**/*', route => route.request().url().startsWith(origin + '/') ? route.continue() : route.abort());
      const state = seed(40); state.materials[0].title = '待删除的独立模拟资料';
      state.materials[1].groups[0].start = 3; state.materials[1].groups[0].end = 10;
      state.materials[1].groups[0].questionRange = '3-7,10';
      await context.addInitScript(({ key, state }) => {
        if (!localStorage.getItem(key)) {
          localStorage.setItem(key, JSON.stringify(state));
          localStorage.setItem('pocket-development-v1:pocket-last-view-v1', JSON.stringify({ page: 'home' }));
        }
      }, { key, state });
      const page = await context.newPage(), errors = [];
      page.on('pageerror', e => errors.push(e.message));
      await page.goto(origin, { waitUntil: 'networkidle' });
      assert.equal(await page.locator('#quick-material-entry').isVisible(), true);
      assert.equal(await page.locator('#quick-material-entry').evaluate(n => n.parentElement.previousElementSibling.id), 'start-button');
      await page.locator('#learned-material-details').click();
      const dialog = page.locator('#materials-dialog'); await dialog.waitFor({ state: 'visible' });
      assert.equal(await dialog.locator('input[type=checkbox]').count(), 40);
      const layout = await dialog.evaluate(node => {
        const r = node.getBoundingClientRect(), body = node.querySelector('.materials-dialog-body');
        return { left: r.left, right: r.right, top: r.top, bottom: r.bottom, width: innerWidth, height: innerHeight,
          horizontal: node.scrollWidth > node.clientWidth, scrollable: body.scrollHeight > body.clientHeight };
      });
      assert.ok(layout.left >= 0 && layout.right <= layout.width && layout.top >= 0 && layout.bottom <= layout.height, JSON.stringify(layout));
      assert.equal(layout.horizontal, false); assert.equal(layout.scrollable, true);
      await dialog.locator('[data-material-id="m1"]').check();
      await page.locator('#delete-selected-materials').click();
      assert.match(await page.locator('#materials-delete-confirm').innerText(), /待删除的独立模拟资料/);
      await page.getByRole('button', { name: '取消', exact: true }).click();
      assert.equal(await page.evaluate(key => JSON.parse(localStorage.getItem(key)).materials.length, key), 40);
      await page.locator('#delete-selected-materials').click(); await page.locator('#confirm-delete-materials').click();
      await page.locator('#materials-dialog-status').filter({ hasText: '已删除 1 条' }).waitFor();
      assert.equal(await dialog.locator('input[type=checkbox]').count(), 39);
      await page.getByRole('button', { name: '关闭', exact: true }).click();
      await page.locator('#pocket-settings > summary').click();
      await page.locator('#learning-backup-files > summary').click();
      const [download] = await Promise.all([page.waitForEvent('download'), page.locator('#export-learning-archive').click()]);
      const markdown = fs.readFileSync(await download.path(), 'utf8');
      assert.doesNotMatch(markdown, /待删除的独立模拟资料/); assert.match(markdown, /资料2/);
      const [jsonDownload] = await Promise.all([page.waitForEvent('download'), page.locator('#export-learning-backup').click()]);
      const json = JSON.parse(fs.readFileSync(await jsonDownload.path(), 'utf8'));
      assert.equal(JSON.parse(json.rawState).materials.some(m => m.id === 'm1'), false);
      await page.reload({ waitUntil: 'networkidle' }); await page.locator('#learned-material-details').click();
      assert.equal(await page.locator('#materials-dialog input[type=checkbox]').count(), 39);
      assert.deepEqual(errors, []);
      const artifacts = path.join(__dirname, 'artifacts'); fs.mkdirSync(artifacts, { recursive: true });
      await page.screenshot({ path: path.join(artifacts, `material-modal-${viewport.width}.png`) });
      await page.getByRole('button', { name: '关闭', exact: true }).click();
      await page.locator('#daily-reverse-review-entry').click();
      await page.locator('#group-key-questions-panel > summary').click();
      const choices = page.locator('.focus-number-choices');
      assert.deepEqual(await choices.locator('input').evaluateAll(nodes => nodes.map(n => Number(n.dataset.questionNumber))), [3, 4, 5, 6, 7, 10]);
      assert.equal(await page.locator('#group-key-questions-panel textarea').count(), 0);
      await choices.locator('[data-question-number="4"]').check(); await choices.locator('[data-question-number="7"]').check();
      await page.getByRole('button', { name: '加入重点复习系统', exact: true }).click();
      const collected = await page.evaluate(key => JSON.parse(localStorage.getItem(key)).focusReview.questions, key);
      assert.deepEqual(collected.map(q => [q.materialId, q.number]), [['m2', 4], ['m2', 7]]);
      assert.equal(await choices.evaluate(node => node.scrollWidth > node.clientWidth), false);
      await page.screenshot({ path: path.join(artifacts, `focus-number-choices-${viewport.width}.png`) });
      // Quick input stays independently available while today's review is unfinished.
      assert.equal(await page.locator('#quick-material-entry').isVisible(), true);
      const oldCheckpoint = await page.evaluate(key => { const state = JSON.parse(localStorage.getItem(key)); return JSON.stringify([state.currentSession, state.materialReviewSession, state.dailyReverseReview.round]); }, key);
      const oldCount = await page.evaluate(key => JSON.parse(localStorage.getItem(key)).materials.length, key);
      await page.locator('#quick-material-entry').click();
      await page.locator('#quick-material-subject').fill('数学'); await page.locator('#quick-material-title').fill('快捷模拟资料');
      await page.locator('#quick-material-questionRange').fill('1-10,13,15-18'); await page.locator('#quick-material-groupSize').fill('5');
      assert.match(await page.locator('#quick-material-preview').innerText(), /共3组/);
      assert.match(await page.locator('#quick-material-preview').innerText(), /第3组：13, 15-18/);
      assert.equal(await page.locator('#quick-material').evaluate(n => n.scrollWidth > n.clientWidth), false);
      await page.screenshot({ path: path.join(artifacts, `quick-material-${viewport.width}.png`) });
      await page.getByRole('button', { name: '保存学习资料', exact: true }).click();
      assert.equal(await page.locator('#quick-material').isVisible(), true);
      assert.equal(await page.locator('#quick-material-subject').inputValue(), '数学');
      for (const field of ['title', 'questionRange', 'groupSize']) assert.equal(await page.locator('#quick-material-' + field).inputValue(), '');
      assert.equal(await page.locator('#quick-material-preview').innerText(), '');
      assert.equal(await page.locator('#quick-material-status').innerText(), '学习资料保存成功，可继续新增下一份。');
      const quickSaved = await page.evaluate(key => JSON.parse(localStorage.getItem(key)), key);
      assert.equal(quickSaved.materials.length, oldCount + 1); assert.equal(quickSaved.materials.at(-1).status, 'completed');
      assert.deepEqual(quickSaved.materials.at(-1).groups.map(g => g.runs.length), [0,0,0]);
      assert.equal(JSON.stringify([quickSaved.currentSession, quickSaved.materialReviewSession, quickSaved.dailyReverseReview.round]), oldCheckpoint);
      for (const title of ['连续录入二', '连续录入三']) {
        await page.locator('#quick-material-title').fill(title);
        await page.locator('#quick-material-questionRange').fill('1-5'); await page.locator('#quick-material-groupSize').fill('2');
        await page.getByRole('button', { name: '保存学习资料', exact: true }).click();
        assert.equal(await page.locator('#quick-material').isVisible(), true);
      }
      assert.deepEqual(await page.evaluate(key => JSON.parse(localStorage.getItem(key)).materials.slice(-3).map(m => m.title), key), ['快捷模拟资料', '连续录入二', '连续录入三']);
      await page.reload({ waitUntil: 'networkidle' });
      assert.equal(await page.evaluate(key => JSON.parse(localStorage.getItem(key)).materials.at(-1).status, key), 'completed');
      await page.locator('#pocket-home-button').click();
      assert.equal(await page.locator('#quick-material-entry').isVisible(), true);
      const entryLayout=await page.locator('#quick-material-entry').evaluate(node=>{
        const left=node.getBoundingClientRect(),right=document.getElementById('learning-question-removal-entry').getBoundingClientRect();
        return {leftTop:left.top,rightTop:right.top,leftRight:left.right,rightLeft:right.left,rightEdge:right.right,width:innerWidth};
      });
      assert.ok(Math.abs(entryLayout.leftTop-entryLayout.rightTop)<1 && entryLayout.rightLeft>=entryLayout.leftRight && entryLayout.rightEdge<=entryLayout.width,JSON.stringify(entryLayout));
      await page.locator('#learning-question-removal-entry').click();
      await page.locator('#learning-removal-material').selectOption('m2');
      assert.deepEqual(await page.locator('#learning-removal-choices input').evaluateAll(nodes=>nodes.map(node=>Number(node.dataset.questionNumber))),[3,4,5,6,7,10]);
      const oldRange=await page.evaluate(key=>JSON.parse(localStorage.getItem(key)).materials.find(m=>m.id==='m2').questionRange,key);
      await page.locator('#learning-removal-choices [data-question-number="4"]').check();
      await page.getByRole('button',{name:'移除选中题目（1）',exact:true}).click();
      await page.locator('#learning-removal-confirm').getByRole('button',{name:'取消',exact:true}).click();
      assert.equal(await page.evaluate(key=>JSON.parse(localStorage.getItem(key)).materials.find(m=>m.id==='m2').questionRange,key),oldRange);
      await page.getByRole('button',{name:'移除选中题目（1）',exact:true}).click();
      await page.locator('#confirm-remove-learning-questions').click();
      assert.equal(await page.locator('#learning-removal-status').innerText(),'已移除 1 道题目。');
      assert.deepEqual(await page.locator('#learning-removal-choices input').evaluateAll(nodes=>nodes.map(node=>Number(node.dataset.questionNumber))),[3,5,6,7,10]);
      assert.equal(await page.locator('#learning-question-removal').evaluate(node=>node.scrollWidth>node.clientWidth),false);
      assert.deepEqual(await page.evaluate(key=>{const state=JSON.parse(localStorage.getItem(key));return state.focusReview.questions.filter(q=>window.PocketFocusReview.locate(state,q)).map(q=>q.number);},key),[7]);
      await page.reload({waitUntil:'networkidle'});
      assert.equal(await page.evaluate(key=>JSON.parse(localStorage.getItem(key)).materials.find(m=>m.id==='m2').groups[0].questionRange,key),'3, 5-7, 10');
      console.log(`PASS localhost Chromium ${viewport.width}x${viewport.height}: material modal/deletion, archive/JSON, checkbox collection, quick preview/save and reload.`);
      await context.close();
    }
  } finally { await browser.close(); }
})().catch(e => { console.error(e); process.exitCode = 1; }).finally(() => server.close());
