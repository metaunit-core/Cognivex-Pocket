(function (global) {
  'use strict';
  const blockedSchemes = new Set(['javascript', 'data', 'vbscript']);
  // Store exactly the exported address, trimming only its ends. No format conversion.
  function normalizeUri(value) {
    return typeof value === 'string' ? value.trim() : '';
  }
  function canNavigate(value) {
    const uri = normalizeUri(value);
    if (!uri) return false;
    // Check the protocol as a browser sees it: ignore ASCII edge controls and embedded tabs/newlines.
    const inspected = uri.replace(/^[\u0000-\u0020]+|[\u0000-\u0020]+$/g, '').replace(/[\t\n\r]/g, '');
    const match = /^([a-z][a-z0-9+.-]*):/i.exec(inspected);
    return !match || !blockedSchemes.has(match[1].toLowerCase());
  }
  global.PocketExternalLinks = Object.freeze({ normalizeUri, canNavigate });
})(globalThis);
