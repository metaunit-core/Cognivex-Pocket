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
  function migrateMaterialLinks(state) {
    let changed = false;
    state.materials.forEach(material => {
      if (material.externalLinksVersion === 1) return;
      ['video', 'output'].forEach(kind => {
        const property = `${kind}Links`;
        const candidates = Array.isArray(material[property]) ? [...material[property]] : [];
        (material.groups || []).forEach(group => {
          if (Array.isArray(group[property])) candidates.push(...group[property]);
          if (normalizeUri(group[`${kind}Url`])) candidates.push({ url: group[`${kind}Url`] });
        });
        const byUrl = new Map();
        const ids = new Set();
        candidates.forEach(entry => {
          if (!entry || typeof entry !== 'object') return;
          const url = normalizeUri(entry.url);
          if (!url) return;
          const title = typeof entry.title === 'string' ? entry.title.trim() : '';
          const existing = byUrl.get(url);
          if (existing) {
            if (!existing.title && title) existing.title = title;
            return;
          }
          let id = typeof entry.id === 'string' ? entry.id.trim() : '';
          if (!id || ids.has(id)) {
            let index = byUrl.size + 1;
            do { id = `material-${kind}-link-${index++}`; } while (ids.has(id));
          }
          ids.add(id);
          byUrl.set(url, { id, title, url });
        });
        material[property] = [...byUrl.values()].map(entry => ({
          ...entry, title: entry.title || (kind === 'video' ? '本组视频' : '本组输出')
        }));
      });
      // Retained Group fields are archival only; never re-import after edits/deletions.
      material.externalLinksVersion = 1;
      changed = true;
    });
    return changed;
  }
  global.PocketExternalLinks = Object.freeze({ normalizeUri, canNavigate, migrateMaterialLinks });
})(globalThis);
