import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import path from 'node:path';import os from 'node:os';import {spawn} from 'node:child_process';
const directory=fs.mkdtempSync(path.join(os.tmpdir(),'tubeflow-locks-'));process.env.TUBEFLOW_DATA_DIR=directory;
const {atomicJson}=await import('../dist/services/accounts.js');const {store}=await import('../dist/services/store.js');const {retryFileOperation}=await import('../dist/services/file-retry.js');
async function lock(file,milliseconds){
 const command=`$handle=[System.IO.File]::Open($env:TUBEFLOW_LOCK_FILE,[System.IO.FileMode]::Open,[System.IO.FileAccess]::Read,[System.IO.FileShare]::None); [Console]::WriteLine('LOCKED'); Start-Sleep -Milliseconds ${milliseconds}; $handle.Dispose()`;
 const child=spawn('powershell.exe',['-NoProfile','-Command',command],{windowsHide:true,env:{...process.env,TUBEFLOW_LOCK_FILE:file},stdio:['ignore','pipe','pipe']});
 const done=new Promise((resolve,reject)=>{child.once('error',reject);child.once('exit',code=>code===0?resolve():reject(Error(`Lock helper failed: ${code}`)));});
 await new Promise((resolve,reject)=>{child.stdout.on('data',data=>{if(String(data).includes('LOCKED'))resolve();});child.once('error',reject);child.once('exit',code=>{if(code!==0)reject(Error('File lock could not be acquired'));});});
 return {done};
}
test('Windows JSON replacement survives a real temporary exclusive lock',{skip:process.platform!=='win32'},async()=>{
 const file=path.join(directory,'atomic.json');atomicJson(file,{version:1});const held=await lock(file,250);
 atomicJson(file,{version:2});await held.done;assert.deepEqual(JSON.parse(fs.readFileSync(file)),{version:2});
 assert.equal(fs.readdirSync(directory).some(f=>f.endsWith('.tmp')),false);
});
test('Windows store reads retry real locks and persistent locks never become an empty store',{skip:process.platform!=='win32'},async()=>{
 store.add('scripts',{id:'kept',name:'Original'});const file=path.join(directory,'scripts.json');
 let held=await lock(file,250);assert.equal(store.getById('scripts','kept').name,'Original');await held.done;
 held=await lock(file,1500);assert.throws(()=>store.add('scripts',{id:'new',name:'Do not overwrite'}),/EPERM|EBUSY|EACCES/);await held.done;
 assert.deepEqual(store.get('scripts'),[{id:'kept',name:'Original'}]);
});
test('non-lock failures are not retried',()=>{
 let calls=0;assert.throws(()=>retryFileOperation(()=>{calls++;throw new SyntaxError('corrupt');}),/corrupt/);assert.equal(calls,1);
});
test.after(()=>fs.rmSync(directory,{recursive:true,force:true}));
