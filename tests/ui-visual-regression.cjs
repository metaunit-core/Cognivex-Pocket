'use strict';
const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),{spawnSync}=require('node:child_process');
const suites=['environment-isolation','executor','review-policy','review-order-directions','review-admission','daily-review-groups','daily-reverse-review','daily-review-admission-attention','today-prior-material-review','today-new-material-review','relearning-forward','relearning','video-step-status','material-append','material-regroup','material-summary','grouping-panels','new-material-entry-fold','new-material-back','quick-material','material-deletion','material-metadata-edit','focus-review','focus-review-all','focus-review-bulk-removal','focus-review-metrics-sync','learning-question-removal','learning-backup','json-recovery','learning-archive','links-regression','navigation','device-local-clear','firebase-ui','cloud-backup','independent-practice'];
const results=[];
const baselineFile=path.join(os.tmpdir(),'pocket-ui-unit-baseline-20261106.json');
const baseline=process.argv.includes('--baseline') ? null : JSON.parse(fs.readFileSync(baselineFile,'utf8'));
for(const name of suites){
 if(baseline && !baseline.find(item=>item.name===name)?.passed){results.push({...baseline.find(item=>item.name===name),skipped:true});console.log('SKIP pre-existing failure: '+name);continue;}
 const file=path.join(__dirname,name+'.test.cjs');
 const result=spawnSync(process.execPath,[file],{cwd:path.resolve(__dirname,'..'),encoding:'utf8',timeout:45000,windowsHide:true});
 const entry={name,passed:result.status===0,error:result.error?.message || null,output:(result.stdout || '')+(result.stderr || '')};results.push(entry);
 console.log((entry.passed?'PASS ':'FAIL ')+name+(entry.passed?'':': '+entry.output.slice(0,240).replace(/\n/g,' ')));
}
if(process.argv.includes('--baseline')){fs.writeFileSync(baselineFile,JSON.stringify(results,null,2));console.log('Baseline: '+baselineFile);}
else{
 const regressions=results.filter(item=>!item.passed && baseline.find(old=>old.name===item.name)?.passed);
 const output=path.join(os.tmpdir(),'pocket-ui-unit-after-20261106.json');fs.writeFileSync(output,JSON.stringify(results,null,2));
 console.log(JSON.stringify({passed:results.filter(item=>item.passed).length,total:results.length,preexistingFailures:results.filter(item=>!item.passed && !regressions.includes(item)).map(item=>item.name),regressions:regressions.map(item=>item.name),report:output}));
 if(regressions.length)process.exitCode=1;
}
