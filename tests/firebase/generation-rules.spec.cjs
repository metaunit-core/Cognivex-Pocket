'use strict';
// Local demo emulator ONLY. Never production credentials or actual user records.
const fs=require('node:fs'),path=require('node:path');
const {initializeTestEnvironment,assertFails,assertSucceeds}=require('@firebase/rules-unit-testing');
const {doc,setDoc,getDoc,updateDoc,deleteDoc,writeBatch,serverTimestamp}=require('firebase/firestore');
(async()=>{
 if(!/^(localhost|127\.0\.0\.1):8085$/.test(process.env.FIRESTORE_EMULATOR_HOST||''))throw Error('Only isolated local emulator port 8085 is allowed');
 const env=await initializeTestEnvironment({projectId:'demo-pocket-backup-test',firestore:{rules:fs.readFileSync(path.join(__dirname,'../../firestore.rules'),'utf8')}});
 try {
  await env.clearFirestore();const db=env.authenticatedContext('A').firestore(),other=env.authenticatedContext('B').firestore(),guest=env.unauthenticatedContext().firestore();
  const ref=(d,p)=>doc(d,'users/A/'+p),gen='generation-new-00000001',old='generation-old-00000001',hash='a'.repeat(64);
  async function adminCycle(g,revision=0,verified=true){await env.withSecurityRulesDisabled(async c=>setDoc(ref(c.firestore(),'backup/generation'),{uid:'A',generation:g,protocolVersion:2,rulesVerified:verified,lastRevision:revision}));}
  const stage=(id,g)=>setDoc(ref(db,'uploads/'+id),{uid:'A',...(g?{generation:g}:{}),createdAt:serverTimestamp()});
  const chunk=(id,g)=>setDoc(ref(db,'snapshots/'+id+'/chunks/0'),{uid:'A',generation:g,index:0,content:'fixture',hash});
  function commit(id,g,rev){const b=writeBatch(db);b.update(ref(db,'backup/generation'),{lastRevision:rev});b.set(ref(db,'snapshots/'+id),{uid:'A',generation:g,formatVersion:1,status:'complete',chunkCount:1,bytes:7,payloadHash:hash,dataHash:hash,exportedAt:'2026-10-12T00:00:00.000Z',counts:{materials:0,groups:0,runs:0},revision:rev,createdAt:serverTimestamp()});b.set(ref(db,'backup/head'),{uid:'A',generation:g,revision:rev,snapshotId:id,dataHash:hash,updatedAt:serverTimestamp()});return b.commit();}
  await assertFails(stage('unconfigured',gen));await adminCycle(old);await assertSucceeds(stage('pending',old));await assertSucceeds(chunk('pending',old));
  await adminCycle(gen); // Simulate Console provisioning; no client can rotate.
  await assertFails(stage('legacy'));await assertFails(stage('stale',old));await assertFails(chunk('pending',old));await assertFails(commit('pending',old,1));
  await assertFails(setDoc(ref(db,'backup/generation'),{uid:'A',generation:old,protocolVersion:2,rulesVerified:true,lastRevision:0}));
  await assertFails(deleteDoc(ref(db,'backup/generation')));await assertFails(updateDoc(ref(db,'backup/generation'),{lastRevision:1}));
  await assertFails(getDoc(ref(other,'backup/generation')));await assertFails(getDoc(ref(guest,'backup/generation')));
  await assertSucceeds(stage('first',gen));await assertSucceeds(chunk('first',gen));await assertSucceeds(commit('first',gen,1));await assertSucceeds(getDoc(ref(db,'backup/head')));
  await assertSucceeds(stage('second',gen));await assertSucceeds(chunk('second',gen));await assertFails(commit('second',gen,1));await assertSucceeds(commit('second',gen,2));
  await assertFails(updateDoc(ref(db,'snapshots/first'),{bytes:9}));await assertFails(deleteDoc(ref(db,'snapshots/first')));await assertFails(deleteDoc(ref(db,'backup/head')));
  // Admin-deleted head cannot reset the durable counter (ABA).
  await env.withSecurityRulesDisabled(async c=>deleteDoc(ref(c.firestore(),'backup/head')));
  await assertSucceeds(stage('aba',gen));await assertSucceeds(chunk('aba',gen));await assertFails(commit('aba',gen,1));
  await adminCycle('unverified-cycle-00001',0,false);await assertFails(stage('not-verified','unverified-cycle-00001'));
  // Client bootstrap is a narrowly authorized atomic pair, not Admin access.
  const auto='automatic-cycle-000001',next='automatic-cycle-000002';
  function initialize(g,uid='A'){const b=writeBatch(db);b.set(doc(db,'users/'+uid+'/backup/generation'),{uid,generation:g,protocolVersion:3,rulesVerified:true,lastRevision:0});b.set(doc(db,'users/'+uid+'/backupCycles/'+g),{uid,generation:g,createdAt:serverTimestamp()});return b.commit();}
  await assertFails(setDoc(ref(db,'backup/generation'),{uid:'A',generation:auto,protocolVersion:3,rulesVerified:true,lastRevision:0}));
  await assertFails(initialize(auto,'B'));
  await assertSucceeds(initialize(auto));
  await assertFails(deleteDoc(ref(db,'backupCycles/'+auto)));
  await assertFails(updateDoc(ref(db,'backupCycles/'+auto),{generation:old}));
  await assertSucceeds(stage('automatic',auto));await assertSucceeds(chunk('automatic',auto));await assertSucceeds(commit('automatic',auto,1));
  await assertFails(initialize(next)); // Valid head must never be overwritten by bootstrap.
  await env.withSecurityRulesDisabled(async c=>deleteDoc(ref(c.firestore(),'backup/head')));
  await assertSucceeds(initialize(next)); // Head was manually removed; an unused cycle is allowed.
  await assertFails(initialize(auto)); // Used token may never regain authority.
  await assertFails(stage('old-auto',auto));
  console.log('PASS: actual generation rules deny legacy/stale/inflight writes, client rotation, counter-only writes, cross-account access and immutable history; accept atomic new-cycle backups and reject ABA.');
 }finally{await env.cleanup();}
})().catch(e=>{console.error(e);process.exitCode=1;});
