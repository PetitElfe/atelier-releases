const {chromium}=require('playwright'),{spawn}=require('node:child_process');
const fs=require('node:fs'),{join}=require('node:path'),{tmpdir}=require('node:os'),assert=require('node:assert/strict');
const data=fs.mkdtempSync(join(tmpdir(),'atelier-cycle-manual-')),base='http://127.0.0.1:19004';
const server=spawn('python',['app/app.py'],{env:{...process.env,ATELIER_DATA_DIR:data,ATELIER_PORT:'19004',ATELIER_NO_BROWSER:'1'},stdio:'ignore'});
async function api(path,method='GET',body){const r=await fetch(base+path,{method,headers:{'Content-Type':'application/json'},body:body?JSON.stringify(body):undefined});const result=await r.json();assert.ok(r.ok,JSON.stringify(result));return result}
const day=offset=>{const d=new Date();d.setDate(d.getDate()+offset);return d.toLocaleDateString('sv-SE')};
(async()=>{let browser;try{
 for(let i=0;i<150;i++){try{await api('/api/runtime-version');break}catch{}await new Promise(r=>setTimeout(r,100))}
 const old=day(-60);await api('/api/cycle-periods','POST',{start_date:old,notes:'Legacy note'});
 browser=await chromium.launch();const page=await browser.newPage({viewport:{width:1440,height:1000}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto(base);await page.waitForFunction(()=>window.AtelierStudio?.ready&&window.AtelierWorkspace);
 await page.evaluate(async()=>{localStorage.setItem('atelierCycleShowInfo','1');localStorage.setItem('atelierCycleShowMarks','1');showView('calendar');await refreshOrganisation()});
 assert.equal(await page.evaluate(day=>isRecordedCycleDay(day),day(-59)),false,'Legacy NULL end remains one day');
 await page.getByRole('button',{name:'Confirmer le début réel des règles',exact:true}).click();
 const form=page.locator('#studioFormHost');await form.locator('[name=start_date]').fill(day(-30));await form.locator('[type=submit]').click();await form.waitFor({state:'detached'});
 await page.getByRole('button',{name:'Terminer les règles aujourd’hui',exact:true}).waitFor();
 assert.equal(await page.evaluate(day=>isRecordedCycleDay(day),day(-1)),true,'Still recorded after 30 days until manual stop');
 assert.equal(await page.evaluate(day=>isRecordedCycleDay(day),day(1)),false,'No future day is recorded');
 assert.equal(await page.evaluate(day=>cycleForecastForDay(day),day(2)),null,'No predicted end of an open tracking');
 await page.reload();await page.waitForFunction(()=>window.AtelierStudio?.ready);await page.evaluate(async()=>{showView('calendar');await refreshOrganisation()});
 const stop=page.getByRole('button',{name:'Terminer les règles aujourd’hui',exact:true});await stop.waitFor();
 const today=page.locator('#monthGrid .day-cell.today');await today.click({button:'right'});
 const check=page.getByRole('menuitemcheckbox',{name:'Règles ce jour',exact:true});assert.equal(await check.getAttribute('aria-checked'),'true');await check.click();
 await page.waitForFunction(()=>!document.querySelector('#monthGrid .day-cell.today').classList.contains('cycle-recorded'));
 assert.equal(await page.evaluate(()=>!!cycleActivePeriod()),true,'Correcting a day does not finish the tracking');
 await today.click({button:'right'});assert.equal(await check.getAttribute('aria-checked'),'false');await check.click();
 await page.waitForFunction(()=>document.querySelector('#monthGrid .day-cell.today').classList.contains('cycle-recorded'));
 await stop.click();await page.waitForFunction(()=>!cycleActivePeriod());
 const periods=await api('/api/cycle-periods'),finished=periods.find(x=>x.start_date===day(-30));assert.equal(finished.end_date,day(0));assert.equal(finished.ongoing,0);
 assert.equal(periods.find(x=>x.start_date===old).notes,'Legacy note');
 assert.match(await page.locator('#calendarCycleSummary').innerText(),/terminées/);
 await page.reload();await page.waitForFunction(()=>window.AtelierStudio?.ready);await page.evaluate(async()=>{showView('calendar');await refreshOrganisation()});
 assert.equal(await page.getByRole('button',{name:'Terminer les règles aujourd’hui',exact:true}).count(),0);
 assert.equal(await page.evaluate(day=>isRecordedCycleDay(day),day(-1)),true,'Closed history remains recorded');
 assert.equal(await page.evaluate(day=>isRecordedCycleDay(day),day(1)),false);
 // Week header uses the same checkbox and the same corrected day as the month view.
 await page.evaluate(()=>{setCalendarMode('week');renderWeek()});
 const head=page.locator('.week-head.week-current-day');
 assert.equal(await head.evaluate(el=>el.classList.contains('cycle-recorded')),true);
 await head.click({button:'right'});await check.click();await page.waitForFunction(()=>!isRecordedCycleDay(ymd(new Date())));
 assert.equal(await head.evaluate(el=>el.classList.contains('cycle-recorded')),false);
 assert.equal((await api('/api/cycle-tracking')).overrides.find(x=>x.day===day(0)).recorded,0);
 assert.deepEqual(errors,[]);console.log('PASS: explicit start/finish beyond estimated duration, persisted ongoing state, no future marks/forecast, per-day checkbox in month calendar, ended history and legacy dates preserved');
}finally{await browser?.close();server.kill();await new Promise(r=>setTimeout(r,350));fs.rmSync(data,{recursive:true,force:true})}})().catch(e=>{console.error(e);process.exitCode=1});
