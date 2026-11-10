/* Real server + rendered UI: reversible removal, totals, zoom-aware labels and quiet forecasts. */
const {chromium}=require('playwright'),{spawn}=require('node:child_process');
const fs=require('node:fs'),{join}=require('node:path'),{tmpdir}=require('node:os'),assert=require('node:assert/strict');
const data=fs.mkdtempSync(join(tmpdir(),'atelier-budget-clarity-')),base='http://127.0.0.1:18974';
const server=spawn('python',['app/app.py'],{env:{...process.env,ATELIER_DATA_DIR:data,ATELIER_PORT:'18974',ATELIER_NO_BROWSER:'1'},stdio:'ignore'});
async function request(path,method='GET',body){const response=await fetch(base+path,{method,headers:{'Content-Type':'application/json'},body:body===undefined?undefined:JSON.stringify(body)});return {status:response.status,value:await response.json()}}
async function api(path,method='GET',body){const r=await request(path,method,body);if(r.status>=400)throw Error(path+' '+JSON.stringify(r));return r.value}
const shift=(days)=>{const d=new Date();d.setDate(d.getDate()+days);return d.toLocaleDateString('sv-SE')};
(async()=>{let browser;try{
 for(let i=0;i<120;i++){try{await api('/api/runtime-version');break}catch{}await new Promise(r=>setTimeout(r,100))}
 const month=shift(0).slice(0,7),first=month+'-01';
 await api('/api/budget/settings','PUT',{opening_balance:'2000',opening_date:first});
 const once=await api('/api/budget/entries','POST',{title:'Courses à corriger',kind:'expense',category:'Alimentation',amount:'25',date:first});
 await api('/api/budget/category-limits','PUT',{month,category:'Alimentation',amount:'100',revision:0});
 await api('/api/budget/entries/'+once.id+'/attachments','POST',{filename:'ticket.txt',mime_type:'text/plain',base64:Buffer.from('Justificatif conservé').toString('base64')});
 const rule=await api('/api/budget/rules','POST',{title:'Abonnement mensuel',kind:'fixed',category:'Loisirs',amount:'10',day_of_month:1,start_date:first});
 browser=await chromium.launch({headless:true});const page=await browser.newPage({viewport:{width:1862,height:1050}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto(base);await page.waitForFunction(()=>AtelierStudio.ready);await page.evaluate(()=>showView('budget'));await page.locator('#studioBudget').waitFor();
 const row=()=>page.locator(`.studio-ledger tr[data-entry-id="${once.id}"]`);
 assert.equal(await row().locator('button').count(),1,'A quiet row has only its options control');await row().click({button:'right'});await page.getByRole('menuitem',{name:'Modifier',exact:true}).click();await page.locator('#budgetCorrectionForm').waitFor();
 await page.locator('#budgetCorrectionForm [name=title]').fill('Courses corrigées');await page.locator('#budgetCorrectionForm [name=amount]').fill('30');await page.locator('#budgetCorrectionForm [type=submit]').click();
 await page.waitForFunction(id=>budgetData.entries.find(e=>e.id===id)?.amount_cents===3000,once.id);
 const before=await api('/api/budget?month='+month),old=before.entries.find(e=>e.id===once.id);
 await row().getByRole('button',{name:/Options de/}).click();await page.getByRole('menuitem',{name:'Supprimer cette ligne',exact:true}).click();assert.equal(await row().count(),1,'Opening deletion does not delete');
 await page.getByRole('button',{name:'Supprimer cette ligne',exact:true}).click();
 await page.waitForFunction(id=>budgetData.removed_entries.some(e=>e.id===id),once.id);
 const removed=await api('/api/budget?month='+month);
 assert.equal(removed.balance_cents,before.balance_cents+3000);assert.equal(removed.forecast_cents,before.forecast_cents+3000);
 assert.equal((await api('/api/budget/category-limits?month='+month))[0].spent_cents,0);
 assert.equal((await request('/api/budget/entries/'+once.id,'DELETE',{revision:old.revision})).status,409,'Stale deletion is rejected');
 assert.equal((await request('/api/budget/'+once.id+'/status','PUT',{status:'confirmed'})).status,409,'Old status writes cannot resurrect removed lines');
 await page.reload();await page.waitForFunction(()=>AtelierStudio.ready);await page.evaluate(()=>showView('budget'));await page.locator('.studio-budget-removed summary').click();
 await page.locator('.studio-budget-removed').getByRole('button',{name:'Restaurer',exact:true}).click();await row().waitFor();
 const restored=(await api('/api/budget?month='+month)).entries.find(e=>e.id===once.id);
 for(const key of ['status','scheduled_date','actual_date','amount_cents','notes','title'])assert.equal(restored[key],old[key],key+' survives restore');
 assert.equal((await api('/api/budget/entries/'+once.id+'/attachments')).length,1);
 assert.equal((await api('/api/budget/category-limits?month='+month))[0].spent_cents,3000);
 const recurring=(await api('/api/budget?month='+month)).entries.find(e=>e.rule_id===rule.id);
 const repeatRow=()=>page.locator(`.studio-ledger tr[data-entry-id="${recurring.id}"]`);
 await repeatRow().click({button:'right'});await page.getByRole('menuitem',{name:'Supprimer cette ligne',exact:true}).click();assert.equal(await page.locator('#studioFormHost select option').count(),2);
 await page.getByRole('button',{name:'Supprimer cette ligne',exact:true}).click();await page.waitForFunction(id=>budgetData.removed_entries.some(e=>e.id===id),recurring.id);
 await page.evaluate(()=>loadBudget());assert.equal(await repeatRow().count(),0,'Deleted recurring occurrence stays removed');
 const future=new Date(Number(month.slice(0,4)),Number(month.slice(5,7)),1).toLocaleDateString('sv-SE').slice(0,7);
 assert.equal((await api('/api/budget?month='+future)).entries.filter(e=>e.rule_id===rule.id).length,1,'Next month remains scheduled');
 await page.locator('.studio-budget-removed summary').click();await page.locator('.studio-budget-removed-row').filter({hasText:'Abonnement mensuel'}).getByRole('button',{name:'Restaurer'}).click();await repeatRow().waitFor();
 await repeatRow().click({button:'right'});await page.getByRole('menuitem',{name:'Supprimer cette ligne',exact:true}).click();await page.locator('#studioFormHost select').selectOption('repeat');await page.getByRole('button',{name:'Arrêter la répétition',exact:true}).click();
 await page.waitForFunction(id=>budgetData.rules.find(r=>r.id===id)?.active===0,rule.id);assert.equal(await repeatRow().count(),1,'Stopping recurrence keeps the current historical row');
 await repeatRow().focus();await page.keyboard.press('Shift+F10');await page.getByRole('menuitem',{name:'Modifier',exact:true}).waitFor();await page.keyboard.press('Escape');
 // Discoverable add form: recurring schedules and one-off payment status are distinct.
 await page.getByRole('button',{name:'+ Dépense',exact:true}).click();const form=page.locator('#studioFormHost');
 assert.equal(await form.locator('[name=status]').isVisible(),true);await form.locator('[name=repeat]').selectOption('monthly');assert.equal(await form.locator('[name=status]').isVisible(),false);
 await form.locator('[name=repeat]').selectOption('once');await form.locator('[name=title]').fill('Une seule fois');await form.locator('[name=amount]').fill('12.50');await form.locator('[name=status]').selectOption('planned');await form.getByRole('button',{name:'Enregistrer',exact:true}).click();
 await page.waitForFunction(()=>budgetData.entries.some(e=>e.title==='Une seule fois'&&e.status==='pending'));
 fs.mkdirSync('artifacts',{recursive:true});await page.locator('#studioBudget').screenshot({path:'artifacts/budget-clarity.png'});
 // A date hint must not obscure appointment labels or survive opening a dialog.
 await api('/api/events','POST',{title:'Événement témoin',event_date:shift(0),start_time:'14:00',end_time:'15:00'});
 await page.evaluate(async()=>{await refresh();showView('calendar');state.cursor=new Date();setCalendarMode('month')});
 const current=page.locator('#monthGrid .day-cell.today');await current.locator('.day-number').hover();await page.locator('#atelierRelativeDateFloat').waitFor({state:'visible'});
 await current.locator('.event-pill').hover();assert.equal(await page.locator('#atelierRelativeDateFloat').isVisible(),false,'Hovering an event leaves its text clear');
 await current.locator('.day-number').focus();assert.equal(await page.locator('#atelierRelativeDateFloat').isVisible(),true);await page.keyboard.press('Escape');assert.equal(await page.locator('#atelierRelativeDateFloat').isVisible(),false);
 // Predict a future date without altering the estimation algorithm.
 await api('/api/cycle-periods','POST',{start_date:shift(-53),end_date:null});await api('/api/cycle-periods','POST',{start_date:shift(-25),end_date:null});
 await page.evaluate(async()=>{await refreshOrganisation();showView('calendar');state.cursor=parseYMD(cycleEstimate().next);setCalendarMode('month')});
 await page.waitForFunction(()=>document.querySelector('#monthGrid .cycle-forecast .calendar-cycle-band')?.getBoundingClientRect().height>0);
 const marker=await page.evaluate(()=>{const el=document.querySelector('#monthGrid .cycle-forecast .calendar-cycle-band');const c=el.getBoundingClientRect(),parent=getComputedStyle(el.parentElement),s=getComputedStyle(el);return {width:c.width,height:c.height,text:el.textContent,label:el.getAttribute('aria-label'),border:s.borderBottomStyle,background:parent.backgroundImage,shadow:parent.boxShadow}});
 assert.ok(marker.width<=23&&marker.height<=4);assert.equal(marker.text,'');assert.match(marker.label,/Règles possibles/);assert.equal(marker.border,'dashed');assert.equal(marker.background,'none');assert.equal(marker.shadow,'none');
 const cases=[{w:1862,root:1,view:1,body:1},{w:1280,root:.8,view:1,body:1},{w:1280,root:1,view:1.2,body:1},{w:1280,root:1,view:1,body:1.35},{w:768,root:1,view:1,body:1}];
 for(const sample of cases){
  await page.setViewportSize({width:sample.w,height:1000});
  await page.evaluate(s=>{document.documentElement.style.zoom=String(s.root);document.body.style.zoom=String(s.body);document.querySelector('#calendarView').style.zoom=String(s.view)},sample);
  for(const index of [7,10,13]){
   const cell=page.locator('#monthGrid .day-cell').nth(index);await cell.locator('.day-number').hover();
   const metrics=await cell.evaluate(el=>{const c=el.getBoundingClientRect(),t=document.getElementById('atelierRelativeDateFloat').getBoundingClientRect();return {actual:t.left+t.width/2,expected:Math.max(8+t.width/2,Math.min(innerWidth-8-t.width/2,c.left+c.width/2)),left:t.left,right:t.right,width:innerWidth,tipTop:t.top,tipBottom:t.bottom,cellTop:c.top,cellBottom:c.bottom}});
   assert.ok(Math.abs(metrics.actual-metrics.expected)<1,'Centered tooltip '+JSON.stringify({sample,metrics}));assert.ok(metrics.left>=7&&metrics.right<=metrics.width-7,'Tooltip stays within viewport');assert.ok(metrics.tipBottom<=metrics.cellTop-4||metrics.tipTop>=metrics.cellBottom+4,'Date hint never covers the day or its appointments');
  }
 }
 await page.evaluate(()=>{document.documentElement.style.zoom='1';document.body.style.zoom='1';document.querySelector('#calendarView').style.zoom='1'});await page.setViewportSize({width:1400,height:1000});
 await page.locator('#monthGrid .day-cell').nth(10).locator('.day-number').hover();await page.keyboard.press('Tab');await page.locator('#monthGrid').screenshot({path:'artifacts/calendar-discreet-forecast.png'});
 await page.evaluate(()=>setCalendarMode('week'));
 const week=await page.locator('#weekGrid .week-head.cycle-forecast').first().evaluate(el=>{const pseudo=getComputedStyle(el,'::after');return {width:pseudo.width,border:pseudo.borderBottomStyle}});assert.equal(week.width,'22px');assert.equal(week.border,'dashed');
 const slot=await page.evaluate(()=>{const style=el=>{const s=getComputedStyle(el);return [s.backgroundImage,s.backgroundColor]};return {forecast:style(document.querySelector('#weekGrid .week-slot.cycle-forecast')),ordinary:style(document.querySelector('#weekGrid .week-slot:not(.cycle-forecast):not(.week-current-day)'))}});assert.deepEqual(slot.forecast,slot.ordinary,'Forecast keeps the ordinary hourly grid without a day-long colour wash');
 await page.evaluate(()=>{state.cursor=new Date(2026,10,17);setCalendarMode('month');renderMonth()});await page.clock.setFixedTime(new Date('2026-11-17T12:00:00'));await page.locator('#monthGrid [data-date="2026-11-13"] .day-number').hover();assert.equal(await page.locator('#atelierRelativeDateFloat').innerText(),'J+4');await page.screenshot({path:'artifacts/calendar-date-hint-fixed.png'});
 assert.deepEqual(errors,[]);console.log('PASS: visible edit/remove/restore, truthful cash/forecast/envelopes, receipts, stale-write guards, recurrence scopes, reload, one-off form and centered J labels at five viewport/zoom combinations; discreet month/week cycle indicators');
}finally{if(browser)await browser.close();server.kill();await new Promise(r=>server.once('close',r));fs.rmSync(data,{recursive:true,force:true})}})().catch(e=>{console.error(e);process.exitCode=1});
