const {chromium}=require('playwright');
const {spawn}=require('node:child_process');
const {mkdtempSync,rmSync,readFileSync,mkdirSync}=require('node:fs');
const {tmpdir}=require('node:os');const {join,resolve}=require('node:path');const assert=require('node:assert/strict');
const data=mkdtempSync(join(tmpdir(),'atelier-safety-')),base='http://127.0.0.1:18952';
let server=spawn('python',[resolve('app/app.py')],{env:{...process.env,ATELIER_DATA_DIR:data,ATELIER_NO_BROWSER:'1',ATELIER_PORT:'18952'},stdio:'ignore'});
async function api(path,method='GET',body,safe=false){const r=await fetch(base+path,{method,headers:{'Content-Type':'application/json',...(safe?{Origin:base,'X-Atelier-Safety':'1'}:{})},body:body===undefined?undefined:JSON.stringify(body)});const j=await r.json();if(!r.ok)throw Object.assign(Error(j.error||path),{status:r.status});return j}
async function ready(){for(let i=0;i<150;i++){try{if((await fetch(base+'/api/runtime-version')).ok)return}catch{}await new Promise(r=>setTimeout(r,100))}throw Error('Server not ready')}
(async()=>{let browser;try{
 await ready();const task=await api('/api/tasks','POST',{title:'Tâche avant restauration'});
 browser=await chromium.launch({headless:true});const page=await browser.newPage({viewport:{width:1440,height:1000},acceptDownloads:true});const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto(base);await page.evaluate(()=>{localStorage.setItem('test-safety-preference','Dessin et préférence');showView('settings')});await page.locator('.atelier-settings-nav [data-target=settingsSafetyCard]').click();await page.locator('#safetyDiagnostics').filter({hasText:'Intégrité : ok'}).waitFor();
 const download=page.waitForEvent('download');await page.locator('#safetyExport').click();const file=await download;const payload=JSON.parse(readFileSync(await file.path(),'utf8'));assert.equal(payload.format,'atelier-complete-backup-v1');assert.equal(payload.browser.local_storage['test-safety-preference'],'Dessin et préférence');assert.ok(payload.tables.tasks.rows.some(row=>row.includes('Tâche avant restauration')));
 const denied=await fetch(base+'/api/safety/export',{method:'POST',headers:{'Content-Type':'application/json'},body:'{}'});assert.equal(denied.status,403);
 await api('/api/tasks/'+task.id,'PUT',{title:'Après la sauvegarde'});await page.evaluate(()=>localStorage.setItem('test-safety-preference','Après la copie'));
 await page.locator('#safetyFile').setInputFiles({name:'Sauvegarde.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(payload))});await page.locator('#safetyConfirmRestore').waitFor();
 // A real reviewed recovery stops and restarts this disposable server only.
 page.once('dialog',dialog=>dialog.accept());await page.locator('#safetyConfirmRestore').click();await new Promise(r=>setTimeout(r,1500));await ready();
 for(let i=0;i<120;i++){const tasks=await api('/api/tasks');if(tasks.some(t=>t.title==='Tâche avant restauration'))break;if(i===119)throw Error('Restoration not applied');await new Promise(r=>setTimeout(r,100))}
 await page.waitForFunction(()=>localStorage.getItem('test-safety-preference')==='Dessin et préférence');assert.ok((await api('/api/safety/status')).recovery.restored_at);
 // Simulate a lost POST response: replay the same mutation token, one task only.
 const operation={title:'Création à rejouer',_sync:{id:'browser-replay-000001'}};
 const first=await api('/api/tasks','POST',operation),second=await api('/api/tasks','POST',operation);assert.equal(first.id,second.id);assert.equal((await api('/api/tasks')).filter(x=>x.title==='Création à rejouer').length,1);
 const current=(await api('/api/tasks')).find(x=>x.id===task.id);await api('/api/tasks/'+task.id,'PUT',{title:'Autre fenêtre'});
 await assert.rejects(()=>api('/api/tasks/'+task.id,'PUT',{title:'Version ancienne',_sync:{id:'browser-conflict-0001',base:{title:current.title}}}),e=>e.status===409);
 assert.equal((await api('/api/tasks')).find(x=>x.id===task.id).title,'Autre fenêtre');
 mkdirSync('artifacts',{recursive:true});await page.evaluate(()=>showView('settings'));await page.locator('.atelier-settings-nav [data-target=settingsSafetyCard]').click();await page.locator('#safetyRefresh').click();await page.screenshot({path:'artifacts/utility-safety.png'});assert.deepEqual(errors,[]);console.log('PASS: full export, strict origin, verified import, actual recovery/restart, browser settings, replay and conflict protection');
 }finally{if(browser)await browser.close();try{await api('/api/shutdown','POST',{})}catch{}if(server.exitCode===null)server.kill();await new Promise(r=>setTimeout(r,700));rmSync(data,{recursive:true,force:true})}
})().catch(e=>{console.error(e);process.exitCode=1});
