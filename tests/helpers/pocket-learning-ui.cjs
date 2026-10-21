'use strict';
const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm');
function boot({ store = new Map(), clock = { now: new Date(2026, 9, 18, 9).getTime() }, fail = { enabled: false }, location, device = {}, focusReview = false } = {}) {
  const nodes = {}, listeners = {}, writes = [], focus = [], scroll = [];
  let context;
  class Element {
    constructor(tag) { this.tag = tag; this.tagName = tag.toUpperCase(); this.children = []; this.events = {}; this.textContent = ''; this.value = ''; this.hidden = false; this.disabled = false; }
    append(...items) { items.forEach(item => { item.parentElement = this; }); this.children.push(...items); }
    prepend(...items) { items.forEach(item => { item.parentElement = this; }); this.children.unshift(...items); }
    remove() { if (this.parentElement) this.parentElement.children = this.parentElement.children.filter(node => node !== this); }
    replaceChildren(...items) { this.children = [...items]; }
    setAttribute(key, value) { this[key] = value; }
    removeAttribute(key) { delete this[key]; }
    addEventListener(name, fn) { (this.events[name] ||= []).push(fn); }
    fire(name, details = {}) { for (const fn of this.events[name] || []) fn({ preventDefault() {}, ...details }); }
    focus() { focus.push(this); }
    scrollIntoView() { scroll.push(this); }
    querySelector(selector) { return walk(this).find(n => n.tag === selector); }
    querySelectorAll(selector) { return walk(this).filter(n => selector === 'details[id]' && n.tag === 'details' && n.id); }
  }
  const walk = node => [node, ...node.children.flatMap(walk)];
  const html = fs.readFileSync(path.join(__dirname, '../../index.html'), 'utf8');
  for (const m of html.matchAll(/<([a-z0-9]+)\b[^>]*\bid="([^"]+)"[^>]*>/gi)) {
    const node = new Element(m[1]); node.id = m[2]; node.hidden = /\bhidden\b/.test(m[0]); node.disabled = /\bdisabled\b/.test(m[0]); nodes[node.id] = node;
  }
  const body = new Element('body'); body.append(...Object.values(nodes));
  const all = () => [...new Set(walk(body))];
  const document = { body, hidden: false, readyState: 'loading', createElement: tag => new Element(tag),
    getElementById: id => nodes[id] || all().find(node => node.id === id),
    addEventListener(name, fn) { (listeners[name] ||= []).push(fn); }, querySelectorAll: selector => all().filter(n => selector === 'details[id]' && n.tag === 'details' && n.id) };
  class TestDate extends Date { constructor(...args) { super(...(args.length ? args : [clock.now])); } static now() { return clock.now; } }
  context = vm.createContext({ document, location, navigator: device.navigator, matchMedia: device.matchMedia, confirm: device.confirm, setTimeout, clearTimeout, Intl, Date: TestDate, URL, Event, dispatchEvent(event) { for (const fn of listeners[event.type] || []) fn(event); return true; }, TextEncoder, crypto: require('node:crypto').webcrypto, scrollY: 250,
    scrollTo(x, y) { context.scrollY = y; }, addEventListener(name, fn) { (listeners[name] ||= []).push(fn); },
    localStorage: { get length() { return store.size; }, key: i => [...store.keys()][i] ?? null, getItem: key => store.get(key) ?? null, removeItem: key => store.delete(key),
      setItem(key, value) { if (fail.enabled) throw Error('Quota blocked'); store.set(key, value); writes.push([key, value]); } },
    PocketCloudSignal: { ensureReady() {}, saved() {}, failed() {} } });
  context.window = context;
  if (!location) require('./environment.cjs')(context);
  if (location) for (const name of ['environment', 'data-deletion', 'cloud-backup']) vm.runInContext(fs.readFileSync(path.join(__dirname, '../../js/' + name + '.js'), 'utf8'), context);
  for (const name of ['storage','grouping','scheduler','history','daily-review-test-date','daily-reverse-review',...(focusReview ? ['review-admission'] : []),'executor','material-review','external-links','navigation','review-ui',...(focusReview ? ['focus-review','focus-review-ui'] : []),'material-deletion','output-sop-data','output-sop','app','local-test-tools']) vm.runInContext(fs.readFileSync(path.join(__dirname, '../../js/' + name + '.js'), 'utf8'), context);
  for (const fn of listeners.DOMContentLoaded || []) fn(); document.readyState = 'complete';
  return { context, nodes, document, store, clock, fail, focus, scroll, writes, all,
    state: () => JSON.parse(store.get((context.PocketEnvironment?.prefix || '') + 'cognivex-pocket-state')),
    content: () => walk(nodes['learning-content']),
    fire: event => { for (const fn of listeners[event] || []) fn(); },
    button(label) { const node = walk(nodes['learning-content']).find(n => n.tag === 'button' && n.textContent === label); if (!node) throw Error('Missing button: ' + label); return node; } };
}
function seed(count = 9) {
  return { version: 1, review: { lastReviewedAt: null, policyVersion: 2, generation: 0, roundHistory: [] }, currentSession: null,
    materials: Array.from({ length: count }, (_, index) => ({ id: 'm' + (index + 1), sectionId: 'preserve-' + index, title: '资料' + (index + 1), subject: '数学',
      status: 'completed', createdAt: 1000 - index, completedAt: index + 1, addedToReviewAt: index + 1, totalGroups: 1,
      externalLinksVersion: 1, videoLinks: [{ id: 'v' + index, title: '视频', url: 'https://example.test/video/' + index }], outputLinks: [], materialReviewHistory: [],
      groups: [{ id: 'g' + (index + 1), start: index + 1, end: index + 1, addedToReviewAt: index + 1, videoCompleted: true, outputCompleted: true, executionCompleted: true,
        firstLearningCompletedAt: index + 1, latestAccuracyPercent: 80, latestDurationMinutes: 12, keyQuestions: '重点', runs: [{ mode: 'new', startedAt: 0, completedAt: index + 1, videoCompleted: true, outputCompleted: true }] }] })) };
}
module.exports = { boot, seed };
