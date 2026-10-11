'use strict';
const assert=require('node:assert/strict');
const {remote}=require('./pocket-cloud-fixture.cjs');
function fenced(){
 const cloud=remote(), cycles=new Map(), stages=new Map();
 const key=(u,id)=>u+'/'+id;
 const valid=(uid,g)=>{const c=cycles.get(uid);if(!c||c.uid!==uid||![2,3].includes(c.protocolVersion)||!c.rulesVerified||c.generation!==g)throw Object.assign(Error('permission-denied: stale generation'),{conflict:true});return c;};
 cloud.adapter.generation=async uid=>structuredClone(cycles.get(uid)||null);
 cloud.adapter.stage=async(uid,id,g)=>{valid(uid,g);stages.set(key(uid,id),g);};
 const write=cloud.adapter.writeChunk;
 cloud.adapter.writeChunk=async(uid,id,i,v)=>{valid(uid,v.generation);assert.equal(stages.get(key(uid,id)),v.generation);return write(uid,id,i,v);};
 const commit=cloud.adapter.commit;
 cloud.adapter.commit=async(uid,id,expected,v,guard)=>{
  if(cloud.stats.onCommit){const fn=cloud.stats.onCommit;cloud.stats.onCommit=null;await fn();}
  const c=valid(uid,v.generation);if(c.lastRevision!==expected)throw Object.assign(Error('durable revision conflict'),{conflict:true});
  const h=cloud.heads.get(uid);if(h&&h.generation!==v.generation)throw Object.assign(Error('head generation conflict'),{conflict:true});
  await commit(uid,id,expected,v,guard);cloud.heads.get(uid).generation=v.generation;c.lastRevision=v.revision;
 };
 cloud.adapter.inspectCloudDeletion=async uid=>{const h=!cloud.heads.has(uid),s=![...cloud.manifests.keys()].some(k=>k.startsWith(uid+'/')),u=![...stages.keys()].some(k=>k.startsWith(uid+'/'));return {remaining:!h||!s||!u,headEmpty:h,snapshotsEmpty:s,uploadsEmpty:u,complete:false};};
 cloud.rotate=g=>cycles.set('A',{uid:'A',generation:g,protocolVersion:2,rulesVerified:true,lastRevision:0});
 cloud.clearIndexes=()=>{cloud.heads.clear();cloud.manifests.clear();stages.clear();};
 const claims=new Set(); cloud.stats.initializations=0;
 cloud.enableInitialization=()=>{cloud.adapter.initializeGeneration=async(uid,g,guard=()=>{})=>{
  if(cloud.stats.denyInitialize)throw Error('permission-denied');
  if(cloud.stats.beforeInitialize)await cloud.stats.beforeInitialize();guard();
  if(cloud.heads.has(uid))throw Error('云端存在有效备份');
  if(claims.has(uid+'/'+g)||cycles.get(uid)?.generation===g)throw Error('used token');
  claims.add(uid+'/'+g);cycles.set(uid,{uid,generation:g,protocolVersion:3,rulesVerified:true,lastRevision:0});cloud.stats.initializations++;return structuredClone(cycles.get(uid));
 };};
 return Object.assign(cloud,{cycles,stages,claims});
}

module.exports={fenced};
