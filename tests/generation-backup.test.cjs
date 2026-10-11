'use strict';
const assert=require('node:assert/strict');
const {local,remote,bind,initial}=require('./helpers/pocket-cloud-fixture.cjs');
const {fenced}=require('./helpers/pocket-generation-fixture.cjs');
const pause=device=>device.store.set('pocket-local-reset-v1',JSON.stringify({version:1,status:'complete',uid:'A'}));
(async()=>{
 const cloud=fenced();cloud.rotate('old-cycle-000000000001');const old=local(cloud);await bind(old);assert.equal(cloud.stats.commits,1);
 old.change(s=>{s.materials[0].groups[0].keyQuestions='old pending payload';});old.advance(500);
 let entered,release;const ready=new Promise(r=>entered=r);cloud.stats.onCommit=()=>{entered();return new Promise(r=>release=r);};
 const request=old.engine.retry();await ready;
 cloud.clearIndexes();cloud.rotate('new-cycle-000000000002');
 const device=local(cloud);pause(device);await device.engine.setUser({uid:'A'});
 let report=await device.engine.prepareRestartAutoBackup();assert.equal(report.automaticBackupSafe,true);assert.equal(report.historicalDeletionVerified,false);assert.equal(device.engine.view().paused,true);assert.equal(cloud.stats.commits,1);
 await device.engine.restartAutoBackup(report);assert.equal(device.engine.view().paused,false);assert.equal(cloud.heads.get('A').generation,'new-cycle-000000000002');
 const freshId=cloud.heads.get('A').snapshotId;release();await request;assert.equal(cloud.heads.get('A').snapshotId,freshId);assert.equal(old.engine.view().paused,true);
 await assert.rejects(cloud.adapter.stage('A','legacy'),/stale generation/);await assert.rejects(cloud.adapter.stage('A','old','old-cycle-000000000001'),/stale generation/);
 device.change(s=>{s.materials[0].groups[0].keyQuestions='new learning';});device.advance(500);await device.engine.retry();assert.equal(cloud.heads.get('A').revision,2);assert.equal(cloud.cycles.get('A').lastRevision,2);
 const resumed=local(cloud,null,device.store);await resumed.engine.setUser({uid:'A'});assert.equal(resumed.engine.view().paused,false);assert.equal(resumed.engine.view().bound,true);resumed.change(s=>{s.materials[0].groups[0].keyQuestions='after refresh';});resumed.advance(500);await resumed.engine.retry();assert.equal(cloud.heads.get('A').revision,3);
 // Deleting head cannot make an old revision eligible again, even without rotation.
 cloud.heads.clear();await assert.rejects(cloud.adapter.commit('A','ABA',0,{generation:'new-cycle-000000000002'},()=>{}),/durable revision/);
 const blocked=local(cloud);pause(blocked);await blocked.engine.setUser({uid:'A'});report=await blocked.engine.prepareRestartAutoBackup();assert.equal(report.automaticBackupSafe,false);assert.ok(report.blockers.includes('cloud-records-remain'));
 cloud.clearIndexes();report=await blocked.engine.prepareRestartAutoBackup();assert.ok(report.blockers.includes('new-generation-required'));
 cloud.rotate('next-cycle-000000000003');report=await blocked.engine.prepareRestartAutoBackup();assert.equal(report.automaticBackupSafe,true);
 const marker=blocked.store.get('pocket-local-reset-v1');blocked.change(s=>{s.changed=true;});await assert.rejects(blocked.engine.restartAutoBackup(report),/本机记录已变化/);assert.equal(blocked.store.get('pocket-local-reset-v1'),marker);
 report=await blocked.engine.prepareRestartAutoBackup();cloud.stats.partial=true;await assert.rejects(blocked.engine.restartAutoBackup(report),/Write denied/);assert.equal(blocked.engine.view().paused,true);
 const refreshed=local(cloud,null,blocked.store);await refreshed.engine.setUser({uid:'A'});await refreshed.engine.retry();assert.equal(refreshed.engine.view().paused,true);
 // Empty actual learning state is captured/read-back safely, still only after explicit confirmation.
 cloud.clearIndexes();cloud.rotate('empty-cycle-000000000004');cloud.stats.partial=false;const blank=local(cloud);for(const k of blank.context.PocketCloudBackup.DATA_KEYS)blank.store.delete(k);pause(blank);await blank.engine.setUser({uid:'A'});report=await blank.engine.prepareRestartAutoBackup();assert.equal(report.localCounts.materials,0);await blank.engine.restartAutoBackup(report);assert.equal(blank.engine.view().paused,false);
 assert.equal(cloud.heads.has('A'),false);await blank.engine.retry();assert.equal(cloud.heads.has('A'),false);blank.store.set('cognivex-pocket-state',JSON.stringify(initial()));await blank.engine.retry();assert.equal(cloud.heads.get('A').generation,'empty-cycle-000000000004');
 console.log('PASS: simulated rule fence rejects legacy/old-generation requests and in-flight old device, durable counter prevents ABA, explicit new-cycle upload/readback and subsequent upload, indexes/tasks protection, changed local data, upload failure and refresh retain pause, empty local state safe.');
})().catch(e=>{console.error(e);process.exitCode=1;});
