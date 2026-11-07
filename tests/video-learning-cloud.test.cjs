'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const {local,remote,bind}=require('./helpers/pocket-cloud-fixture.cjs');
const source=fs.readFileSync(path.join(__dirname,'../js/video-learning.js'),'utf8');
const links=fs.readFileSync(path.join(__dirname,'../js/external-links.js'),'utf8');
(async()=>{
  const cloud=remote(),first=local(cloud),second=local(cloud);
  for(const device of [first,second]){vm.runInContext(links,device.context);vm.runInContext(source,device.context);}
  let id;
  first.change(next=>{id=first.context.PocketVideoLearning.create(next,{title:'完整快照课程',subject:'数学',mode:'question',url:'https://example.test/video'});});
  first.change(next=>{first.context.PocketVideoLearning.update(next,id,'question',19);first.context.PocketVideoLearning.update(next,id,'position',4);first.context.PocketVideoLearning.update(next,id,'complete');});
  first.change(next=>{first.context.PocketVideoLearning.saveProgress(next,'continuous','step',3);first.context.PocketVideoLearning.saveProgress(next,'question','question',12);});
  await bind(first);
  const snapshot=cloud.heads.get('A').snapshotId,captured=await first.engine.readSnapshot('A',snapshot);
  assert.equal(captured.backup.entries.length,5);
  const expected=JSON.parse(first.store.get('cognivex-pocket-state')).videoLearning;
  assert.deepEqual(JSON.parse(captured.backup.rawState).videoLearning,expected);
  await second.engine.setUser({uid:'A'});
  await second.engine.restore(await second.engine.prepareRestore(snapshot));
  assert.deepEqual(JSON.parse(second.store.get('cognivex-pocket-state')).videoLearning,expected);
  assert.equal(cloud.stats.commits,1);
  first.engine.dispose();second.engine.dispose();
  console.log('PASS in-memory cloud adapter: unchanged five-key snapshot upload/readback/restore preserves independent video records, modes, positions and completion; no real Firebase.');
})().catch(error=>{console.error(error);process.exitCode=1;});
