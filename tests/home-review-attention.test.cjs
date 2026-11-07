'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const source=fs.readFileSync(path.join(__dirname,'../js/app.js'),'utf8');
const implementation=source.slice(source.indexOf('  function refreshHomeShortcuts('),source.indexOf('  function renderHomeGrouping('));
const nodes=Object.fromEntries(['learned','review','video','grouping'].map(name=>['home-'+name+'-shortcut',{setAttribute(key,value){this[key]=value;}}]));
const apply=new Function('document','activeHomePanel',implementation+'return refreshHomeShortcuts;')({getElementById:id=>nodes[id]},'review');
for(const selected of [false,true])for(const daily of [false,true])for(const focus of [false,true]){
  apply({selected,daily,focus});
  assert.equal(nodes['home-review-shortcut'].className.includes('daily-review-attention'),selected||daily||focus);
  for(const name of ['learned','video','grouping'])assert.equal(nodes['home-'+name+'-shortcut'].className.includes('daily-review-attention'),false);
}
console.log('PASS all eight attention OR combinations, including single-source reminders, all-off and untouched other shortcuts.');
