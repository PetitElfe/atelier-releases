const {chromium}=require('playwright'),{spawn}=require('node:child_process'),fs=require('node:fs'),{join}=require('node:path'),{tmpdir}=require('node:os'),assert=require('node:assert/strict');
const data=fs.mkdtempSync(join(tmpdir(),'atelier-repeat-order-')),base='http://127.0.0.1:18983',proc=spawn('python',['app/app.py'],{env:{...process.env,ATELIER_DATA_DIR:data,ATELIER_PORT:'18983',ATELIER_NO_BROWSER:'1'},stdio:'ignore'});
async function api(path,method='GET',body){const r=await fetch(base+path,{method,headers:{'Content-Type':'application/json'},body:body===undefined?undefined:JSON.stringify(body)}),j=await r.json();assert.ok(r.ok,path+' '+JSON.stringify(j));return j}
(async()=>{let browser;try{
 for(let i=0;i<100;i++){try{await api('/api/version');break}catch{}await new Promise(r=>setTimeout(r,100))}
 browser=await chromium.launch({headless:true});const page=await browser.newPage({viewport:{width:1440,height:1000}}),errors=[];page.on('pageerror',e=>errors.push(e.message));page.on('dialog',d=>d.accept());await page.goto(base);await page.waitForFunction(()=>AtelierStudio.ready);await page.evaluate(()=>showView('trackers'));
 await page.locator('#studioTrackerTabs .studio-tabs > button:not([role=tab])').click();
 assert.equal(await page.locator('#studioFormHost [name=title]').getAttribute('required'),null);
 await page.locator('#studioFormHost [name=period]').selectOption('weeks:2:auto');await page.locator('#studioFormHost button[type=submit]').click();await page.locator('.studio-tracker-document').waitFor();
 assert.match(await page.locator('.studio-tracker-title').innerText(),/Deux semaines/);
 await page.locator('.studio-tracker-document .studio-add-line').click();
 await page.locator('#studioFormHost [name=title]').fill('Linge mardi et samedi');
 for(const box of await page.locator('#studioFormHost [name=weekdays]').all())await box.setChecked(['1','5'].includes(await box.getAttribute('value')));
 assert.equal(await page.locator('#studioFormHost [name=interval_weeks]').inputValue(),'2');
 const anchor=await page.locator('#studioFormHost [name=anchor_monday]').inputValue();
 await page.locator('#studioFormHost button[type=submit]').click();await page.locator('.studio-tracker-document .tracker-day-cell').first().waitFor();
 assert.equal(await page.locator('.studio-tracker-document .tracker-day-cell').count(),2,'Two days on the active week, no cells on the alternate week');
 const snapshot=await api('/api/studio/snapshot'),board=snapshot.boards.find(b=>b.rows.some(r=>r.title==='Linge mardi et samedi')),row=board.rows[0];
 assert.deepEqual(row.weekdays,[1,5]);assert.equal(row.interval_weeks,2);assert.equal(board.custom_title,'');
 const cells=page.locator('.studio-tracker-document .tracker-day-cell'),day=await cells.first().getAttribute('data-tracker-day');await cells.first().click();await page.waitForFunction(()=>document.querySelector('.studio-tracker-document .tracker-day-cell[aria-pressed=true]'));
 const off=new Date(day+'T12:00:00');off.setDate(off.getDate()+7);const offDay=off.toLocaleDateString('sv-SE');
 assert.ok((await api('/api/tracker-boards/daily?day='+day)).items.some(i=>i.row_id===row.id));assert.ok(!(await api('/api/tracker-boards/daily?day='+offDay)).items.some(i=>i.row_id===row.id));
 const rejected=await fetch(base+'/api/tracker-board-rows/'+row.id+'/mark',{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify({day:offDay,value:true})});assert.equal(rejected.status,409);
 await page.locator('.studio-tracker-document .tracker-row-label button').click();await page.locator('#studioFormHost [name=interval_weeks]').selectOption('1');await page.locator('#studioFormHost button[type=submit]').click();await page.waitForFunction(()=>document.querySelectorAll('.studio-tracker-document .tracker-day-cell').length===4);
 assert.equal((await api('/api/studio/snapshot')).boards.find(b=>b.id===board.id).rows[0].marks[day],'1','Changing cadence preserves old marks');
 await page.getByRole('tab',{name:'To-do list',exact:true}).click();
 const center=await page.locator('.studio-todo-list').evaluate(el=>{const a=el.getBoundingClientRect(),b=el.parentElement.getBoundingClientRect();return {width:a.width,delta:Math.abs((a.left+a.right-b.left-b.right)/2)}});assert.ok(center.width<=460&&center.delta<2,'Daily list is compact and centered '+JSON.stringify(center));
 const tabs=page.locator('#studioTrackerTabs [role=tab]'),ids=await tabs.evaluateAll(a=>a.map(n=>n.dataset.tabId));await tabs.first().dragTo(tabs.last());const reordered=await tabs.evaluateAll(a=>a.map(n=>n.dataset.tabId));assert.notDeepEqual(reordered,ids);await page.reload();await page.waitForFunction(()=>AtelierStudio.ready);await page.evaluate(()=>showView('trackers'));await page.waitForFunction(()=>document.querySelectorAll('#studioTrackerTabs [role=tab]').length>=2);assert.deepEqual(await page.locator('#studioTrackerTabs [role=tab]').evaluateAll(a=>a.map(n=>n.dataset.tabId)),reordered);
 await page.locator('#sideNavHeaderToggle').click();const drawer=page.locator('#sideNav .side-nav-links button:not(#renameNavButton)'),before=await drawer.evaluateAll(a=>a.map(n=>n.dataset.view||n.id));const visibleDrawer=page.locator('#sideNav .side-nav-links button:not(#renameNavButton):visible');await visibleDrawer.first().dragTo(visibleDrawer.nth(2));const after=await drawer.evaluateAll(a=>a.map(n=>n.dataset.view||n.id));assert.notDeepEqual(after,before);
 await page.reload();await page.waitForFunction(()=>AtelierStudio.ready);assert.deepEqual(await drawer.evaluateAll(a=>a.map(n=>n.dataset.view||n.id)),after);assert.equal(await page.locator('#sideNav .side-nav-links > :last-child').getAttribute('id'),'renameNavButton');
 assert.deepEqual(errors,[]);fs.mkdirSync('artifacts',{recursive:true});await page.screenshot({path:'artifacts/tracker-schedule-order.png'});console.log('PASS: optional automatic French title, Tuesday/Saturday, alternate weeks and daily API guards, cadence edit preserves marks, compact centered daily list, real tab/drawer drag/drop and F5');
}finally{if(browser)await browser.close();proc.kill();await new Promise(r=>proc.once('close',r));fs.rmSync(data,{recursive:true,force:true})}})().catch(e=>{console.error(e);process.exitCode=1});
