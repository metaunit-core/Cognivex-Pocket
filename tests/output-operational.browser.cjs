'use strict';
const assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path'), http = require('node:http'), vm = require('node:vm');
const { seed } = require('./helpers/pocket-learning-ui.cjs');
const playwright = require(path.join(path.dirname(process.execPath), 'node_modules/playwright'));
const root = path.resolve(__dirname, '..'), key = 'pocket-development-v1:cognivex-pocket-state';
const config = { window: {} };
vm.runInNewContext(fs.readFileSync(path.join(root, 'js/output-operational-data.js'), 'utf8'), config);
vm.runInNewContext(fs.readFileSync(path.join(root, 'js/output-sop-data.js'), 'utf8'), config);
const data = config.window.PocketOutputOperationalData;
const methodology = config.window.PocketOutputSOPData;
assert.deepEqual(Array.from(data.problems.stages, s => s.nodes.length), [8, 5, 8, 4, 5, 7, 3]);
assert.deepEqual(Array.from(data.knowledge.stages, s => s.nodes.length), [6, 0, 6]);
assert.deepEqual(Array.from(data.knowledge.stages[1].methods, m => m.nodes.length), [5, 7, 5]);
const all = Object.values(data).flatMap(m => m.stages.flatMap(s => [...s.nodes, ...s.methods.flatMap(m => m.nodes)]));
assert.equal(all.length, 69); assert.equal(new Set(all.map(n => n.id)).size, 69);
for (const n of all) for (const field of ['id','stageId','name','trigger','question','action','standard','shortQuestion','shortAction','shortStandard']) assert.ok(n[field], n.id + ':' + field);
const server = http.createServer((request, response) => {
  const file = path.resolve(root, '.' + new URL(request.url, 'http://localhost').pathname.replace(/\/$/, '/index.html'));
  if (!file.startsWith(root + path.sep)) return response.writeHead(403).end();
  try { response.setHeader('Content-Type', ({'.js':'text/javascript','.css':'text/css','.html':'text/html'})[path.extname(file)] || 'text/plain'); response.end(fs.readFileSync(file)); }
  catch (_) { response.writeHead(404).end(); }
});
(async () => {
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const origin = `http://127.0.0.1:${server.address().port}`;
  let browser;
  try {
    browser = await playwright.chromium.launch({executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', headless:true});
    for (const width of [390, 768, 1024, 1440]) {
      const context = await browser.newContext({viewport:{width,height:1024}});
      await context.route('**/*', route => route.request().url().startsWith(origin + '/') ? route.continue() : route.abort());
      const initial = seed(2);
      initial.materials[0].status = 'learning';
      initial.currentSession = { materialId:'m1',currentGroupIndex:0,currentRunIndex:0,currentStep:'output',mode:'new',schedulerState:{phase:'new',newGroupIndex:0,reviewGroupIndex:0} };
      const raw = JSON.stringify(initial);
      await context.addInitScript(({key,raw}) => {
        if (!localStorage.getItem(key)) {
          localStorage.setItem(key, raw);
          localStorage.setItem('pocket-development-v1:pocket-last-view-v1', JSON.stringify({page:'learning',outputPage:'questions'}));
        }
      }, {key,raw});
      const page = await context.newPage(); await page.goto(origin, {waitUntil:'networkidle'});
      const errors = []; page.on('pageerror', e => errors.push(e.message));
      const archiveBefore = await page.evaluate(key => PocketLearningArchive.render(localStorage.getItem(key), '2026-10-24T00:00:00Z'), key);
      // Enter via the real current Group OUTPUT page, without advancing its task.
      const learningBefore = await page.evaluate(key => localStorage.getItem(key), key);
      for (const [name, title] of [['problems','做题'],['knowledge','知识点']]) {
        await page.locator('#learning-content .output-entry').filter({has:page.locator('strong', {hasText:new RegExp('^' + title + '$')})}).click();
        const original = page.locator('#output-model-home');
        assert.deepEqual(await original.locator(':scope > *').evaluateAll(nodes => nodes.map(n => n.tagName)), ['H1','P','BUTTON','BUTTON']);
        assert.equal(await original.locator('details').count(), 0);
        const originalText = await original.innerText();
        const versionCards = original.locator('.output-version-entry');
        assert.deepEqual(await versionCards.locator('strong').allTextContents(), [data[name].title, title + ' OUTPUT｜方法论版']);
        const entryBoxes = await versionCards.evaluateAll(nodes => nodes.map(n => { const r=n.getBoundingClientRect(); return {top:r.top,bottom:r.bottom}; }));
        assert.ok(entryBoxes[0].bottom < entryBoxes[1].top, 'version cards never overlap');
        if (width === 390 || width === 768) await page.screenshot({path:path.join(__dirname,'artifacts',`output-model-home-${name}-${width}.png`),fullPage:true});
        await original.locator('.output-methodology-entry').click();
        const theory = page.locator('#output-methodology-view');
        assert.ok(await theory.isVisible());
        assert.ok(!await original.isVisible());
        assert.equal(await theory.locator('h1').textContent(), title + ' OUTPUT｜方法论版');
        const cards = theory.locator(':scope > details');
        assert.equal(await cards.count(), name === 'problems' ? 8 : 3);
        for (const [index, expected] of methodology[name].stages.entries()) {
          const card = cards.nth(index);
          assert.match(await card.locator('summary').textContent(), new RegExp(expected.title.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')));
          await card.locator('summary').click();
          assert.ok((await card.innerText()).includes(expected.chain));
          assert.ok((await card.innerText()).includes(expected.purpose));
          if (width === 390) {
            await card.getByRole('button',{name:'详细操作 →',exact:true}).click();
            const detail = page.locator('#output-sop > section').nth(1);
            assert.equal(await detail.locator('h1').textContent(), expected.title);
            const text = await detail.innerText();
            for (const node of expected.nodes) for (const field of ['name','operation','question']) assert.ok(text.includes(node[field]), node[field]);
            for (const note of expected.notes) for (const item of [note.title,...note.items]) assert.ok(text.includes(item), item);
            if (name === 'knowledge' && index === 1) {
              for (const method of methodology.methods) {
                await detail.getByRole('button',{name:method.title + ' →',exact:true}).click();
                const methodText = await detail.innerText();
                assert.ok(methodText.includes(method.purpose));
                for (const node of method.nodes) for (const field of ['name','operation','question']) assert.ok(methodText.includes(node[field]));
                for (const note of method.notes) for (const item of [note.title,...note.items]) assert.ok(methodText.includes(item));
                await page.locator('#output-sop > .practice-back').click();
              }
            }
            if (name === 'problems' && index === 2) assert.equal(await detail.locator('textarea').inputValue(), methodology.aiPrompt);
            await page.locator('#output-sop > .practice-back').click();
            assert.ok(await theory.isVisible());
            assert.notEqual(await cards.nth(index).getAttribute('open'), null);
          }
        }
        if (name === 'problems') for (const text of methodology.cycle) assert.ok((await theory.locator('details').last().textContent()).includes(text));
        await page.reload({waitUntil:'networkidle'});
        assert.ok(await theory.isVisible());
        assert.equal(await theory.locator('details[open]').count(), methodology[name].stages.length);
        assert.equal(await theory.locator('h1').textContent(), title + ' OUTPUT｜方法论版');
        await page.locator('#output-sop > .practice-back').click();
        assert.ok(await original.isVisible());
        assert.equal(await original.innerText(), originalText);
        assert.equal(await original.locator('details').count(), 0);
        await page.locator('.output-operational-entry').click();
        const operational = page.locator('#output-operational-view');
        const stepTotal = name === 'problems' ? 40 : 29;
        assert.equal(await operational.locator('.operational-status-button').count(), stepTotal);
        assert.equal(await operational.locator('.operational-status-button[data-state="idle"]').count(), stepTotal);
        assert.equal(await operational.locator('h1').textContent(), data[name].title);
        assert.equal(await operational.locator('details[open]').count(), 0);
        assert.equal(await operational.getByRole('button',{name:'详细引导',exact:true}).getAttribute('aria-pressed'), 'true');
        const stage = operational.locator('.operational-stage').first();
        await stage.locator(':scope > summary').click();
        const first = stage.locator('.operational-step').first();
        const status = first.locator('..').locator('.operational-status-button');
        const menu = first.locator('..').locator('.operational-status-menu');
        await status.click();
        assert.equal(await first.getAttribute('open'), null, 'status control must not expand guidance');
        const menuBox = await menu.boundingBox(), statusBox = await status.boundingBox();
        assert.ok(statusBox.width >= 44 && statusBox.height >= 44);
        assert.ok(menuBox.x >= 0 && menuBox.x + menuBox.width <= width && menuBox.y >= 0 && menuBox.y + menuBox.height <= 1024, 'menu stays inside viewport');
        if (width === 390 && name === 'problems') await page.screenshot({path:path.join(__dirname,'artifacts','output-operational-status-menu-390.png')});
        await menu.getByRole('button',{name:'✓ 已完成',exact:true}).click();
        assert.equal(await status.getAttribute('data-state'), 'done');
        assert.ok(!await menu.isVisible());
        await first.locator('summary').click();
        assert.ok(await first.getByRole('heading',{name:'什么时候做？',exact:true}).isVisible());
        await operational.getByRole('button',{name:'简短提示',exact:true}).click();
        assert.ok(await first.getByRole('heading',{name:'问',exact:true}).isVisible());
        assert.equal(await first.locator('h3').count(), 3);
        assert.equal(await first.getAttribute('open'), '');
        await operational.getByRole('button',{name:'独立执行',exact:true}).click();
        assert.equal(await status.getAttribute('data-state'), 'done');
        assert.equal(await operational.locator('h3:visible').count(), 0);
        assert.equal(await operational.locator('.operational-memory:visible').count(), 0);
        const reveal = first.getByRole('button',{name:'查看检查标准',exact:true});
        await reveal.click(); assert.equal(await first.locator('h3:visible').count(), 4);
        await first.getByRole('button',{name:'隐藏检查标准',exact:true}).click(); assert.equal(await first.locator('h3:visible').count(), 0);
        const second = stage.locator('.operational-step').nth(1);
        await second.locator('summary').click(); assert.equal(await first.getAttribute('open'), null);
        assert.equal(await second.locator('h3:visible').count(), 0);
        const status2 = second.locator('..').locator('.operational-status-button');
        async function selectState(button, value) {
          await button.click();
          await button.locator('..').getByRole('button',{name:value,exact:true}).click();
        }
        await selectState(status, '◉ 进行中');
        await selectState(status2, '◉ 进行中');
        assert.equal(await status.getAttribute('data-state'), 'done', 'previous completed mark restored, never fabricated');
        assert.equal(await operational.locator('[data-state="doing"]').count(), 1);
        await selectState(status2, '! 卡住了');
        assert.ok(await second.locator('.operational-stuck-help').isVisible());
        assert.equal(await second.locator('h3:visible').count(), 0, 'stuck does not reveal independent guidance');
        await second.getByRole('button',{name:'查看本环节详细指导',exact:true}).click();
        assert.equal(await second.locator('h3:visible').count(), 4);
        await second.getByRole('button',{name:'收起本环节详细指导',exact:true}).click();
        assert.equal(await second.locator('h3:visible').count(), 0);
        await second.getByRole('button',{name:'重新尝试',exact:true}).click();
        assert.equal(await status2.getAttribute('data-state'), 'doing');
        await selectState(status, '◉ 进行中');
        assert.equal(await status2.getAttribute('data-state'), 'stuck', 'previous stuck state restored');
        await status.click();
        await operational.locator('h1').click(); assert.ok(!await menu.isVisible());
        await status.click(); await page.keyboard.press('Escape'); assert.ok(!await menu.isVisible());
        // Every stable ID, including duplicate A/B/C names, owns its own state.
        await operational.evaluate(container => {
          for (const control of container.querySelectorAll('.operational-status-control')) control.querySelectorAll('.operational-status-menu > button')[2].click();
        });
        assert.equal(await operational.locator('[data-state="done"]').count(), stepTotal);
        await stage.getByRole('button',{name:'重置本阶段状态',exact:true}).click();
        assert.equal(await operational.locator('[data-state="idle"]').count(), name === 'problems' ? 8 : 6);
        assert.equal(await operational.locator('[data-state="done"]').count(), stepTotal - (name === 'problems' ? 8 : 6));
        await selectState(status2, '○ 未开始');
        assert.equal(await status2.getAttribute('data-state'), 'idle');
        // Situation navigation reuses the same steps, modes and temporary status session.
        await selectState(status, '✓ 已完成');
        await operational.locator('.output-situations-entry').click();
        const situations = page.locator('#output-situations-view');
        assert.ok(await situations.isVisible());
        assert.ok(!await operational.isVisible());
        const ordered = Array.from(data[name].stages).flatMap(s => [...s.nodes,...s.methods.flatMap(m => m.nodes)]);
        assert.deepEqual(await situations.locator('.situation-trigger').allTextContents(), ordered.map(n => n.trigger));
        assert.equal(await situations.locator('.operational-step').count(), stepTotal);
        const situationStages = situations.locator(':scope > .situation-stage');
        assert.equal(await situationStages.count(), name === 'problems' ? 7 : 3);
        assert.equal(await situations.locator('.situation-stage[open]').count(), 1);
        assert.notEqual(await situationStages.first().getAttribute('open'), null);
        assert.equal(await situations.locator('.operational-step[open]').count(), 0);
        assert.equal(await situations.locator('.situation-trigger:visible').count(), name === 'problems' ? 8 : 6);
        async function revealSituation(step) {
          await step.evaluate(node => {
            const parents = [];
            for (let parent = node.parentElement; parent; parent = parent.parentElement) if (parent.tagName === 'DETAILS') parents.push(parent);
            parents.reverse().forEach(parent => { if (!parent.open) parent.querySelector('summary').click(); });
          });
        }
        if (width === 390 || width === 768) await page.screenshot({path:path.join(__dirname,'artifacts',`output-situations-folded-${name}-${width}.png`),fullPage:true});
        for (let index = 1; index < await situationStages.count(); index++) {
          await situationStages.nth(index).locator(':scope > summary').click();
          assert.equal(await situations.locator('.situation-stage[open]').count(), 1);
          assert.equal(await situationStages.nth(index - 1).getAttribute('open'), null);
        }
        await situationStages.first().locator(':scope > summary').click();
        assert.equal(await situations.locator('.situation-stage[open]').count(), 1);
        await situationStages.first().locator(':scope > summary').click();
        assert.equal(await situations.locator('.situation-stage[open]').count(), 0);
        await situationStages.first().locator(':scope > summary').click();
        if (name === 'knowledge') {
          assert.equal(await situations.locator('.situation-branch').count(), 3);
          await situationStages.nth(1).locator(':scope > summary').click();
          assert.match(await situations.innerText(), /A、B、C 是可选方式，不强制全部完成/);
          assert.equal(await situations.locator('.situation-branch[open]').count(), 0);
          assert.equal(await situationStages.nth(1).locator('.situation-trigger:visible').count(), 0);
          for (const [index, count] of [5,7,5].entries()) {
            const branch = situations.locator('.situation-branch').nth(index);
            await branch.locator(':scope > summary').click();
            assert.equal(await situations.locator('.situation-branch[open]').count(), 1);
            assert.equal(await branch.locator('.situation-trigger:visible').count(), count);
          }
        }
        const situationFirst = situations.locator('.operational-step').first();
        await revealSituation(situationFirst);
        await situationFirst.locator('summary').click();
        assert.equal(await situationFirst.locator('h3:visible').count(), 0, 'inherited independent mode never auto-reveals');
        await situationFirst.getByRole('button',{name:'查看检查标准',exact:true}).click();
        assert.equal(await situationFirst.locator('h3:visible').count(), 4);
        await situationFirst.getByRole('button',{name:'隐藏检查标准',exact:true}).click();
        const situationStatus = situationFirst.locator('..').locator('.operational-status-button');
        assert.equal(await situationStatus.getAttribute('data-state'), 'done');
        await selectState(situationStatus, '◉ 进行中');
        const situationLast = situations.locator('.operational-step').last();
        const lastStatus = situationLast.locator('..').locator('.operational-status-button');
        await revealSituation(situationLast);
        await selectState(lastStatus, '◉ 进行中');
        assert.equal(await situationStatus.getAttribute('data-state'), 'done');
        assert.equal(await situations.locator('[data-state="doing"]').count(), 1);
        // Check every situation against the same original component output, not copied prose.
        if (width === 390) {
          await situations.locator('.operational-step').evaluateAll(cards => cards.forEach(card => { card.open = false; }));
          for (const [mode, fields] of [['详细引导',['trigger','question','action','standard']],['简短提示',['shortQuestion','shortAction','shortStandard']]]) {
            await situations.locator(':scope > .operational-modes').getByRole('button',{name:mode,exact:true}).evaluate(button => button.click());
            for (const n of ordered) {
              const step = situations.locator('#situation-' + n.id);
              await revealSituation(step);
              await step.locator('summary').evaluate(summary => summary.click());
              assert.deepEqual(await step.locator('.operational-guidance p').allTextContents(), fields.map(k => n[k]));
              assert.equal(await situations.locator('.operational-step[open]').count(), 1);
              await step.locator('summary').evaluate(summary => summary.click());
              assert.equal(await situations.locator('.operational-step[open]').count(), 0);
            }
          }
        }
        await situations.locator(':scope > .operational-modes').getByRole('button',{name:'独立执行',exact:true}).click();
        await revealSituation(situationFirst);
        await situationFirst.locator('summary').evaluate(summary => { if (!summary.parentElement.open) summary.click(); });
        await situationFirst.locator('.situation-modes').getByRole('button',{name:'简短提示',exact:true}).click();
        assert.equal(await situationFirst.locator('h3:visible').count(), 3);
        await situationFirst.locator('.situation-modes').getByRole('button',{name:'独立执行',exact:true}).click();
        await selectState(situationStatus, '! 卡住了');
        assert.equal(await situationFirst.locator('h3:visible').count(), 0);
        assert.ok(await situationFirst.locator('.operational-stuck-help').isVisible());
        if (width === 390 || width === 768) await page.screenshot({path:path.join(__dirname,'artifacts',`output-situations-${name}-${width}.png`),fullPage:true});
        assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
        await page.locator('#output-sop > .practice-back').click();
        assert.ok(await operational.isVisible());
        assert.equal(await status.getAttribute('data-state'), 'stuck');
        assert.equal(await operational.locator('[data-state="doing"]').count(), 1);
        assert.equal(await operational.locator('.operational-status-button').last().getAttribute('data-state'), 'doing');
        // Reopening the original stage does not replace the shared status with a fresh default.
        await stage.locator(':scope > summary').click();
        await stage.getByRole('button',{name:'重置本阶段状态',exact:true}).click();
        await second.locator('summary').click();
        if (width === 390) {
          // Check every supplied step, including optional A/B/C: no generic or missing content.
          for (const s of data[name].stages) for (const n of [...s.nodes,...s.methods.flatMap(m => m.nodes)]) {
            for (const [mode, fields] of [['详细引导',['trigger','question','action','standard']], ['简短提示',['shortQuestion','shortAction','shortStandard']]]) {
              await operational.getByRole('button',{name:mode,exact:true}).evaluate(button => button.click());
              const values = await page.locator('#operational-' + n.id + ' .operational-guidance p').allTextContents();
              assert.deepEqual(values, fields.map(k => n[k]));
            }
          }
        }
        assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
        if (width === 390 || width === 768) {
          await operational.getByRole('button',{name:'详细引导',exact:true}).click();
          await first.locator('summary').click();
          await selectState(status, '! 卡住了');
          await page.screenshot({path:path.join(__dirname,'artifacts',`output-operational-status-${name}-${width}.png`),fullPage:true});
        }
        await page.locator('#output-sop > .practice-back').click();
        assert.ok(await original.isVisible());
        assert.equal(await original.innerText(), originalText);
        await page.locator('.output-operational-entry').click();
        await page.locator('#pocket-back-button').click(); assert.ok(await original.isVisible());
        await page.locator('.output-operational-entry').click();
        await page.reload({waitUntil:'networkidle'});
        assert.ok(await operational.isVisible());
        assert.equal(await operational.locator('h1').textContent(), data[name].title);
        await page.locator('#pocket-home-button').click();
        assert.ok(await page.locator('#pocket-main').isVisible()); assert.ok(!await page.locator('#output-sop').isVisible());
        await page.evaluate(() => PocketLearning.resume());
      }
      assert.equal(await page.evaluate(key => localStorage.getItem(key), key), learningBefore);
      assert.equal(await page.evaluate(key => PocketLearningArchive.render(localStorage.getItem(key), '2026-10-24T00:00:00Z'), key), archiveBefore);
      assert.deepEqual(errors, []);
      await context.close();
    }
    console.log('PASS localhost OUTPUT: 40+29 ordered situations, original trigger text/A-B-C branches, shared three-mode guidance and stable-ID statuses across views, inline mode controls, accordion/checks, original methodology/navigation, 390/768/1024/1440px, unchanged learning state/archive.');
  } finally { await browser?.close(); await new Promise(resolve => server.close(resolve)); }
})().catch(error => {console.error(error);process.exitCode=1;});
