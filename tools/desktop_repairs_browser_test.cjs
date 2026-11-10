/* Real SQLite + UI: removing implicit/grouped/duplicate-title tracker tabs. */
const {chromium}=require('playwright'),{spawn}=require('node:child_process');
const fs=require('node:fs'),{join}=require('node:path'),{tmpdir}=require('node:os'),assert=require('node:assert/strict');
const data=fs.mkdtempSync(join(tmpdir(),'atelier-desktop-repairs-')),base='http://127.0.0.1:18979';
const server=spawn('python',['app/app.py'],{env:{...process.env,ATELIER_DATA_DIR:data,ATELIER_PORT:'18979',ATELIER_NO_BROWSER:'1'},stdio:'ignore'});
async function api(path,method='GET',body){const r=await fetch(base+path,{method,headers:{'Content-Type':'application/json'},body:body===undefined?undefined:JSON.stringify(body)});const value=await r.json();assert.ok(r.ok,JSON.stringify(value));return value}
const action=(action,payload,operation_id=crypto.randomUUID())=>api('/api/studio/actions','POST',{operation_id,action,payload});
(async()=>{let browser;try{
 for(let i=0;i<120;i++){try{await api('/api/runtime-version');break}catch{}await new Promise(r=>setTimeout(r,100))}
 const boards=[];
 for(let i=0;i<4;i++)boards.push(await api('/api/tracker-boards','POST',{title:'Même titre',color:'sage',period_unit:'months',period_count:1}));
 const row=await api('/api/tracker-boards/'+boards[0].id+'/rows','POST',{title:'À garder',mode:'check'});
 const day=new Date().toLocaleDateString('sv-SE');await action('tracker-mark',{row_id:row.id,day,base:null,value:true});
 for(const [id,ids]of [['group-a',[boards[1].id,boards[2].id]],['group-b',[boards[2].id,boards[3].id]]])await action('save',{id,kind:'tracker-tab',revision:0,data:{title:'Même titre',board_ids:ids}});
 browser=await chromium.launch({headless:true});const page=await browser.newPage({viewport:{width:1440,height:1000}}),errors=[];
 page.on('pageerror',e=>errors.push(e.message));let accept=true;page.on('dialog',d=>accept?d.accept():d.dismiss());
 async function ready(){await page.waitForFunction(()=>AtelierStudio.ready);await page.evaluate(()=>showView('trackers'));await page.waitForFunction(()=>lifeBoards.length>0)}
 await page.goto(base);await ready();
 const tab=id=>page.locator('#studioTrackerTabs [data-tab-id="'+id+'"]');
 async function remove(id){await tab(id).click({button:'right'});await page.getByRole('menuitem',{name:'Supprimer l’onglet',exact:true}).click()}
 accept=false;await remove('board-'+boards[0].id);assert.equal(await tab('board-'+boards[0].id).count(),1);
 accept=true;await remove('board-'+boards[0].id);await tab('board-'+boards[0].id).waitFor({state:'detached'});
 await page.reload();await ready();assert.equal(await tab('board-'+boards[0].id).count(),0);
 await remove('group-a');await tab('group-a').waitFor({state:'detached'});
 await page.reload();await ready();assert.equal(await tab('group-a').count(),0);assert.equal(await tab('board-'+boards[1].id).count(),0);assert.equal(await tab('group-b').count(),1);
 await tab('group-b').click();assert.equal(await page.locator('.studio-tracker-document').count(),2,'Shared board remains in the other tab');
 await page.evaluate(()=>showView('settings'));await page.locator('.atelier-settings-nav [data-target=settingsTrackerArchivesCard]').click();await page.locator('#trackerBoardArchivesToggle').click();
 const archived=page.locator('.tracker-archived-entry');await archived.first().waitFor();assert.equal(await archived.count(),2);
 // Restore the first implicit board through its real archive button.
 await page.locator('[data-archived-board-id="'+boards[0].id+'"]').getByRole('button',{name:'Restaurer',exact:true}).click();
 await page.waitForFunction(id=>lifeBoards.some(b=>b.id===id),boards[0].id);
 await page.evaluate(()=>showView('trackers'));await tab('board-'+boards[0].id).click();
 assert.equal(await page.locator('[data-tracker-row-id="'+row.id+'"] [aria-pressed=true]').count(),1,'Restored board retains its mark');
 await page.reload();await ready();await tab('board-'+boards[0].id).click();assert.equal(await page.locator('[data-tracker-row-id="'+row.id+'"] [aria-pressed=true]').count(),1);
 fs.mkdirSync('artifacts',{recursive:true});await page.screenshot({path:'artifacts/desktop-tracker-restored.png'});
 // Real entries and predictions tint the day without adding thick frames.
 await page.clock.setFixedTime(new Date('2026-11-10T12:00:00'));
 for(const start of ['2026-09-14','2026-10-12','2026-11-09'])await api('/api/cycle-periods','POST',{start_date:start,end_date:start==='2026-11-09'?'2026-11-11':null});
 await page.evaluate(async()=>{await refreshOrganisation();state.cursor=new Date(2026,10,10);showView('calendar');setCalendarMode('month')});
 await page.locator('#monthGrid .cycle-recorded').first().waitFor();
 const recorded=await page.locator('#monthGrid [data-date="2026-11-09"]').evaluate(el=>getComputedStyle(el).backgroundImage);
 assert.match(recorded,/189, 81, 97/,'Recorded periods use a light red wash');
 await page.evaluate(()=>setCalendarMode('week'));
 const styles=await page.evaluate(()=>{const style=selector=>{const s=getComputedStyle(document.querySelector(selector));return {color:s.backgroundColor,image:s.backgroundImage,top:s.borderTopWidth,bottom:s.borderBottomWidth}};return {recorded:style('#weekGrid .week-slot.cycle-recorded'),ordinary:style('#weekGrid .week-slot:not(.cycle-recorded):not(.week-current-day)')}});
 assert.notEqual(styles.recorded.color,styles.ordinary.color);assert.equal(styles.recorded.image,styles.ordinary.image);
 assert.equal(styles.recorded.top,'0px');assert.equal(styles.recorded.bottom,'1px');
 await page.evaluate(()=>{state.cursor=parseYMD(cycleEstimate().next);renderMonth();setCalendarMode('month')});
 const forecast=await page.locator('#monthGrid .cycle-forecast').first().evaluate(el=>getComputedStyle(el).backgroundImage);
 assert.match(forecast,/189, 81, 97, 0\.086/,'Estimates use the same red with lower opacity');assert.notEqual(forecast,recorded);
 assert.equal(await page.locator('.calendar-cycle-band').count(),0);
 assert.doesNotMatch(await page.locator('#calendarCycleSummary').innerText(),/avant les règles estimées/);
 const forecastDay=await page.locator('#monthGrid .cycle-forecast').first().getAttribute('data-date');
 const ordinaryDay=await page.locator('#monthGrid .day-cell:not(.cycle-forecast):not(.outside)').first().getAttribute('data-date');
 for(const event_date of [forecastDay,ordinaryDay])await api('/api/events','POST',{title:'Même rendez-vous',event_date,start_time:'14:00',end_time:'15:00'});
 await page.evaluate(()=>refresh());
 const appearance=async day=>page.locator('#monthGrid [data-date="'+day+'"] .event-pill').evaluate(el=>{const s=getComputedStyle(el);return {height:el.getBoundingClientRect().height,padding:s.padding,lineHeight:s.lineHeight,font:s.font,border:s.borderWidth}});
 assert.deepEqual(await appearance(forecastDay),await appearance(ordinaryDay),'Same appointment thickness on forecast and ordinary days');
 await page.locator('#calendarView').screenshot({path:'artifacts/desktop-calendar-lighter-red.png'});
 // Header creates exactly one note; all-notes reopening is a separate command.
 const requests=[];
 await page.route('**/api/desktop-postits/status',route=>route.fulfill({json:{available:true,running:true,startup:false}}));
 await page.route('**/api/desktop-postits/new',async route=>{requests.push(route.request().postDataJSON());await new Promise(r=>setTimeout(r,200));await route.fulfill({status:201,json:{ok:true,id:99}})});
 await page.evaluate(()=>{const button=document.getElementById('quickPostitsHeader');button.click();button.click();startDesktopPostits(true)});
 await page.waitForFunction(()=>!desktopPostitsBusy&&!document.getElementById('quickPostitsHeader').disabled);
 assert.equal(requests.length,1,'Double click/concurrent controls create only one request');
 assert.match(requests[0].operation_id,/^[0-9a-f-]{36}$/);
 await page.locator('#quickPostitsHeader').click();await page.waitForFunction(()=>!desktopPostitsBusy);
 assert.equal(requests.length,2,'A later deliberate click creates one additional note');
 assert.notEqual(requests[0].operation_id,requests[1].operation_id);
 assert.deepEqual(errors,[]);console.log('PASS: cancel/remove implicit and grouped tabs, identical titles, shared boards, F5 persistence, real archive restore with original marks');
}finally{if(browser)await browser.close();server.kill();await new Promise(r=>server.once('close',r));fs.rmSync(data,{recursive:true,force:true})}})().catch(e=>{console.error(e);process.exitCode=1});
