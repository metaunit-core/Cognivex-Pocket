// Run: node tests/links-regression.test.cjs. Isolated DOM/storage only.
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const source=fs.readFileSync(path.join(__dirname,'executor.test.cjs'),'utf8');
const checks=`
data.clear();app=boot();app.nodes['start-button'].fire('click');createMaterial('数学','链接回归','1-2','1');
for(const kind of ['video','output']) {
  const label=kind==='video'?'视频':'输出';app=boot();click(app,label);
  const checkpoint=JSON.stringify(saved().currentSession);
  click(app,'＋ 新增链接');fill(app,'group-'+kind+'-title','入口1');fill(app,'group-'+kind+'-url',kind+':one');submit(app);
  assert.equal(saved().materials[0][kind+'Links'].length,1);assert.equal(JSON.stringify(saved().currentSession),checkpoint);
  app=boot();click(app,label);click(app,'修改');fill(app,'group-'+kind+'-title','已编辑');fill(app,'group-'+kind+'-url',kind+':edited');submit(app);
  assert.equal(saved().materials[0][kind+'Links'][0].url,kind+':edited');assert.equal(JSON.stringify(saved().currentSession),checkpoint);
  app=boot();click(app,label);confirmReset=false;click(app,'删除');assert.equal(saved().materials[0][kind+'Links'].length,1);
  confirmReset=true;click(app,'删除');confirmReset=false;assert.equal(saved().materials[0][kind+'Links'].length,0);
  assert.equal(JSON.stringify(saved().currentSession),checkpoint);
  app=boot();click(app,label);click(app,'＋ 新增链接');fill(app,'group-'+kind+'-title','共享入口');fill(app,'group-'+kind+'-url',kind+':shared');submit(app);
}
finishActiveMaterial();const linkOwner=saved().materials[0];const savedLinks=JSON.stringify([linkOwner.videoLinks,linkOwner.outputLinks]);
app.nodes['start-review-button'].fire('click');assert.equal(JSON.stringify([saved().materials[0].videoLinks,saved().materials[0].outputLinks]),savedLinks);
for(const kind of ['video','output']) {
  app=boot();click(app,kind==='video'?'视频':'输出');
  assert.ok(walk(app.nodes['learning-content']).some(n=>n.tag==='a'&&n.href===kind+':shared'));
}
console.log('PASS: VIDEO/OUTPUT named link add/edit/delete/cancellation, independent stores, shared Group review access and no checkpoint advancement.');
`;
vm.runInNewContext(source+checks,{require,__dirname,console,URL},{filename:__filename});
