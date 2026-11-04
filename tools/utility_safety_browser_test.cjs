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
 // Private health drafts survive reload and a failed write without duplicating entries.
 await page.goto(base+'/mental-health.html');await page.getByPlaceholder('Titre de ma page').waitFor();
 await page.getByPlaceholder('Titre de ma page').fill('Brouillon privé');await page.getByPlaceholder('Tout ce que tu souhaites écrire…').fill('Texte conservé après coupure');await page.reload();
 await page.getByPlaceholder('Tout ce que tu souhaites écrire…').waitFor();assert.equal(await page.getByPlaceholder('Tout ce que tu souhaites écrire…').inputValue(),'Texte conservé après coupure');
 await page.route('**/api/mobile/mental',route=>route.request().method()==='POST'?route.abort():route.continue());
 await page.getByRole('button',{name:'Ajouter une page',exact:true}).click();await page.getByRole('button',{name:'Revoir ma sauvegarde non envoyée'}).waitFor();
 assert.equal(await page.getByPlaceholder('Tout ce que tu souhaites écrire…').inputValue(),'Texte conservé après coupure');await page.unroute('**/api/mobile/mental');
 await page.getByRole('button',{name:'Ajouter une page',exact:true}).click();await page.locator('#entries article').filter({hasText:'Brouillon privé'}).waitFor();
 assert.equal((await api('/api/mobile/mental')).data.journal.filter(x=>x.title==='Brouillon privé').length,1);
 await page.reload();await page.getByPlaceholder('Tout ce que tu souhaites écrire…').waitFor();assert.equal(await page.getByPlaceholder('Tout ce que tu souhaites écrire…').inputValue(),'');
 await page.goto(base);await page.waitForFunction(()=>typeof showView==='function');
 await page.evaluate(()=>showView('cuisine'));const timerForm=page.locator('#kitchenTimerForm');await timerForm.locator('[name=label]').fill('Four indépendant');await timerForm.locator('[name=minutes]').fill('3');await timerForm.locator('button').click();await page.locator('#kitchenTimerRows article').filter({hasText:'Four indépendant'}).waitFor();
 await timerForm.locator('[name=label]').fill('Œufs indépendants');await timerForm.locator('[name=minutes]').fill('2');await timerForm.locator('button').click();await page.waitForFunction(()=>document.querySelectorAll('#kitchenTimerRows article').length===2);
 const cooking=(await api('/api/reminders')).filter(x=>x.title.startsWith('Cuisine · '));assert.equal(cooking.length,2);const oven=page.locator('#kitchenTimerRows article').filter({hasText:'Four indépendant'});await oven.getByRole('button',{name:'Pause',exact:true}).click();await oven.getByRole('button',{name:'Reprendre',exact:true}).waitFor();assert.equal((await api('/api/reminders')).filter(x=>x.title.startsWith('Cuisine · ')).length,1);
 await oven.getByRole('button',{name:'Reprendre',exact:true}).click();await oven.getByRole('button',{name:'Pause',exact:true}).waitFor();assert.equal((await api('/api/reminders')).filter(x=>x.title.startsWith('Cuisine · ')).length,2);await page.reload();await page.evaluate(()=>showView('cuisine'));await page.waitForFunction(()=>document.querySelectorAll('#kitchenTimerRows article').length===2);
 // A recurring reminder finishes one date only; Android actions survive lost replies.
 const today=new Date().toISOString().slice(0,10),event=await api('/api/events','POST',{title:'Rappel quotidien',event_date:today,start_time:'10:00',recurrence:'daily',reminders:[{title:'Préparation quotidienne',remind_at:today+'T09:45'}]});
 const occurrences=(await api('/api/reminders')).filter(r=>r.entity_type==='event'&&r.entity_id===event.id);assert.ok(occurrences.length>30);const current=occurrences.find(r=>r.instance_date===today);assert.ok(current.id<0);assert.ok(Number.isFinite(current.trigger_at_ms));
 const completion={operation_id:'android-finish-unique-0001',reminder_id:current.id,due_key:current.remind_at,action:'finish'};
 assert.deepEqual(await api('/api/reminders/mobile-action','POST',completion),await api('/api/reminders/mobile-action','POST',completion));assert.ok(!(await api('/api/reminders')).some(r=>r.id===current.id));assert.ok((await api('/api/reminders')).some(r=>r.entity_id===event.id));
 await assert.rejects(()=>api('/api/reminders/mobile-action','POST',{...completion,operation_id:'android-stale-unique-0002'}),e=>e.status===409);
 const next=(await api('/api/reminders')).find(r=>r.entity_id===event.id),later=new Date(next.trigger_at_ms+600000).toISOString().slice(0,19);await api('/api/reminders/'+next.id+'/snooze','PUT',{snoozed_until:later});assert.equal((await api('/api/reminders')).find(r=>r.id===next.id).snoozed_until,later);
 mkdirSync('artifacts',{recursive:true});await page.evaluate(()=>showView('settings'));await page.locator('.atelier-settings-nav [data-target=settingsSafetyCard]').click();await page.locator('#safetyRefresh').click();await page.screenshot({path:'artifacts/utility-safety.png'});assert.deepEqual(errors,[]);console.log('PASS: full export, strict origin, verified import, actual recovery/restart, browser settings, replay and conflict protection');
 }finally{if(browser)await browser.close();try{await api('/api/shutdown','POST',{})}catch{}if(server.exitCode===null)server.kill();await new Promise(r=>setTimeout(r,700));rmSync(data,{recursive:true,force:true})}
})().catch(e=>{console.error(e);process.exitCode=1});
