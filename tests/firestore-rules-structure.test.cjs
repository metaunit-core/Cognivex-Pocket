'use strict';
// Structural regression only. This does NOT replace Firebase's Rules compiler.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
function checkStructure(source){
 const stack=[];let quote=null,comment=false,closed=false;const pairs={')':'(',']':'[','}':'{'};
 for(let i=0;i<source.length;i++){
  const c=source[i],next=source[i+1];
  if(comment){if(c==='\n')comment=false;continue;}
  if(quote){if(c==='\\'){i++;continue;}if(c===quote)quote=null;continue;}
  if(c==='/'&&next==='/'){comment=true;i++;continue;}
  if(c==="'"||c==='"'){assert.equal(closed,false,'text after closed service');quote=c;continue;}
  if(/\s/.test(c))continue;
  assert.equal(closed,false,'unexpected suffix after closed service');
  if('([{'.includes(c))stack.push(c);
  else if(pairs[c]){assert.equal(stack.pop(),pairs[c],'mismatched '+c+' near line '+source.slice(0,i).split('\n').length);if(c==='}'&&stack.length===0)closed=true;}
 }
 assert.equal(quote,null,'unterminated string');assert.equal(stack.length,0,'unclosed delimiters');assert.equal(closed,true,'service not closed');
}
const source=fs.readFileSync(path.join(__dirname,'../firestore.rules'),'utf8');checkStructure(source);
assert.equal((source.match(/service cloud\.firestore/g)||[]).length,1);
for(const name of ['owner','hash','cyclePath','active','bootstrap','staleUpload','validHead'])assert.equal((source.match(new RegExp('function '+name+'\\(','g'))||[]).length,1,'duplicate '+name);
assert.throws(()=>checkStructure(source.trimEnd()+')\nmatch /unexpected { allow read: if true; }'),/suffix|mismatched/);
assert.throws(()=>checkStructure(source.replace('&& bootstrap(uid)));','&& bootstrap(uid))));')),/mismatched/);
assert.throws(()=>checkStructure(source.slice(0,source.lastIndexOf('}'))),/unclosed/);
console.log('PASS: rules structural regression catches duplicated suffix, unmatched parentheses and unclosed service; Firebase compiler validation is still required.');
