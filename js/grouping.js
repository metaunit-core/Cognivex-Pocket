(function (global) {
  'use strict';

  function calculateGroups(range, size) {
    const match = /^\s*(\d+)\s*-\s*(\d+)\s*$/.exec(range);
    if (!match) return { groups: [], error: '请输入题号范围，例如 1-30。' };
    const start = Number(match[1]);
    const end = Number(match[2]);
    const count = Number(size);
    if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start > end) {
      return { groups: [], error: '起始题号必须小于或等于结束题号。' };
    }
    if (!/^\s*\d+\s*$/.test(String(size)) || !Number.isSafeInteger(count) || count <= 0) {
      return { groups: [], error: '每组题数必须为大于 0 的整数。' };
    }
    const groups = [];
    let current = start;
    while (current <= end) {
      const groupEnd = current + Math.min(count - 1, end - current);
      groups.push({ start: current, end: groupEnd });
      if (groupEnd === end) break;
      current = groupEnd + 1;
    }
    return { groups, error: '' };
  }

  global.PocketGrouping = Object.freeze({ calculateGroups });
})(globalThis);
