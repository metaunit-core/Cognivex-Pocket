'use strict';
const assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path'), http = require('node:http');
const playwright = require(path.join(path.dirname(process.execPath), 'node_modules/playwright'));
const root = path.resolve(__dirname, '..');
const script = fs.readFileSync(path.join(root, 'js/ai-learning-diagnosis.js'), 'utf8');
const expected = script.match(/const instruction = `([\s\S]*?)`;/)[1];
assert.equal((expected.match(/^## /gm) || []).length, 7);
assert.ok(expected.startsWith('# Cognivex Pocket｜AI 学习诊断\n'));
assert.ok(expected.endsWith('最后返回一句可长期复习的「一句话心得」。'));
const server = http.createServer((request, response) => {
  const pathname = new URL(request.url, 'http://localhost').pathname;
  const file = path.resolve(root, '.' + (pathname === '/' ? '/index.html' : pathname));
  if (!file.startsWith(root + path.sep)) return response.writeHead(403).end();
  try {
    let content = fs.readFileSync(file, 'utf8');
    // Use the real page/CSS, enabling only this independent feature: no app, storage or Firebase execution.
    if (file.endsWith('index.html')) content = content.replace(/<script\b[^>]*>[\s\S]*?<\/script>/g, tag => tag.includes('src="js/ai-learning-diagnosis.js"') ? tag : '');
    response.setHeader('Content-Type', file.endsWith('.js') ? 'text/javascript' : file.endsWith('.css') ? 'text/css' : 'text/html');
    response.end(content);
  } catch (_) { response.writeHead(404).end(); }
});
(async () => {
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const origin = `http://127.0.0.1:${server.address().port}`;
  let browser;
  try {
    browser = await playwright.chromium.launch({ executablePath: 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', headless: true });
    for (const width of [390, 768, 1024, 1440]) {
      const context = await browser.newContext({ viewport: { width, height: 1024 } });
      await context.route('**/*', route => route.request().url().startsWith(origin + '/') ? route.continue() : route.abort());
      await context.addInitScript(() => {
        localStorage.setItem('mock-learning-data', '{"untouched":true}');
        window.copied = [];
        Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: async text => { window.copied.push(text); } } });
      });
      const page = await context.newPage();
      await page.goto(origin);
      await page.evaluate(() => {
        const button = document.getElementById('copy-ai-learning-diagnosis');
        for (let parent = button.parentElement; parent; parent = parent.parentElement) {
          if (parent.tagName === 'DETAILS') parent.open = true;
          if (parent.hidden) parent.hidden = false;
        }
      });
      const button = page.locator('#copy-ai-learning-diagnosis');
      assert.ok(await button.isVisible());
      assert.equal(await page.locator('.archive-export-actions > button').count(), 2);
      await button.click();
      await page.waitForFunction(() => document.getElementById('ai-learning-diagnosis-status').textContent === '已复制，可粘贴到 ChatGPT');
      assert.deepEqual(await page.evaluate(() => window.copied), [expected]);
      assert.equal(await page.evaluate(() => localStorage.getItem('mock-learning-data')), '{"untouched":true}');
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
      // Pending clipboard operation prevents duplicate clicks; rejection must never claim success.
      await page.evaluate(() => {
        navigator.clipboard.writeText = () => new Promise((resolve, reject) => { window.rejectCopy = reject; });
        document.getElementById('copy-ai-learning-diagnosis').click();
      });
      assert.ok(await button.isDisabled());
      await page.evaluate(() => window.rejectCopy(new Error('permission denied')));
      await page.waitForFunction(() => !document.getElementById('copy-ai-learning-diagnosis').disabled);
      assert.match(await page.locator('#ai-learning-diagnosis-status').textContent(), /复制失败/);
      // Older browser fallback copies exactly the same static instruction and removes its temporary field.
      await page.evaluate(() => {
        Object.defineProperty(navigator, 'clipboard', { value: undefined });
        document.execCommand = command => { window.fallback = { command, value: document.activeElement.value }; return true; };
      });
      await button.click();
      assert.deepEqual(await page.evaluate(() => window.fallback), { command: 'copy', value: expected });
      assert.equal(await page.locator('#ai-learning-diagnosis-status').textContent(), '已复制，可粘贴到 ChatGPT');
      assert.equal(await page.locator('textarea[style*="position: fixed"]').count(), 0);
      await page.evaluate(() => { document.execCommand = () => false; });
      await button.click();
      assert.match(await page.locator('#ai-learning-diagnosis-status').textContent(), /复制失败/);
      await context.close();
    }
    console.log('PASS localhost: complete static instruction, adjacent visible button at 390/768/1024/1440px, clipboard success/failure, pending guard, legacy fallback, unchanged mock storage, no external services.');
  } finally { await browser?.close(); await new Promise(resolve => server.close(resolve)); }
})().catch(error => { console.error(error); process.exitCode = 1; });
