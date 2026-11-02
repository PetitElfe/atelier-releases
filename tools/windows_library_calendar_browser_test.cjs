const {chromium}=require('playwright');
const {spawn}=require('node:child_process');
const {mkdtempSync,rmSync}=require('node:fs');
const {tmpdir}=require('node:os');
const {join,resolve}=require('node:path');
const assert=require('node:assert/strict');
const data=mkdtempSync(join(tmpdir(),'atelier-library-decor-')),base='http://127.0.0.1:18812';
const server=spawn('python',[resolve('app/app.py')],{env:{...process.env,ATELIER_DATA_DIR:data,ATELIER_NO_BROWSER:'1',ATELIER_PORT:'18812'},stdio:'ignore'});
async function api(path,method='GET',body){const r=await fetch(base+path,{method,headers:{'Content-Type':'application/json'},body:body===undefined?undefined:JSON.stringify(body)});assert.ok(r.ok,path);return r.json()}
(async()=>{let browser;try{
 for(let i=0;i<100;i++){try{await api('/api/runtime-version');break}catch{}await new Promise(r=>setTimeout(r,100))}
 const domain=await api('/api/objective-nodes','POST',{node_type:'domain',title:'Étagère de test'});
 const other=await api('/api/objective-nodes','POST',{node_type:'domain',title:'Autre domaine'});
 const book=await api('/api/objective-library-sections','POST',{node_id:domain.id,title:'Mon vrai carnet',section_type:'notes'});
 const one=await api('/api/objective-library-entries','POST',{section_id:book.id,title:'Page une',notes:'Texte initial',done:false});
 const two=await api('/api/objective-library-entries','POST',{section_id:book.id,title:'Page deux',notes:'Autre page',done:false});
 browser=await chromium.launch({headless:true});const page=await browser.newPage({viewport:{width:1440,height:1000}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto(base);await page.waitForFunction(()=>state.objectiveNodes?.length>0);
 await page.evaluate(id=>{showView('library');openLibraryDomain(id)},domain.id);
 const shelf=page.locator('#libraryRealShelf');await shelf.locator('[data-notebook-id]').waitFor();
 assert.equal(await shelf.locator('.library-shelf-book').count(),2);
 await shelf.locator('[data-notebook-id]').click();await page.locator('#libraryPageBody').waitFor();
 await page.evaluate(id=>{librarySelectedPageId=id;renderLibraryNotebookContent(objectiveNodeById(librarySelectedDomainId))},one.id);
 await page.locator('#libraryPageBody').fill('Contenu conservé après navigation');
 await page.locator('#libraryDomainQuickContext #libraryQuickProgress').click();
 await shelf.locator('[data-notebook-id]').click();
 assert.equal(await page.evaluate(()=>Number(librarySelectedPageId)),one.id);
 assert.match(await page.locator('#libraryPageBody').innerText(),/Contenu conservé/);
 // A failed save must prevent replacing the active editor.
 await page.evaluate(()=>{window.restoreFlush=flushLibraryAutosave;flushLibraryAutosave=async()=>false});
 await page.locator('#libraryDomainQuickContext #libraryQuickProgress').click();
 assert.equal(await page.evaluate(()=>Number(librarySelectedPageId)),one.id);
 await page.evaluate(()=>{flushLibraryAutosave=window.restoreFlush});
 // A delayed response for an abandoned domain must not overwrite the new one.
 let release;const held=new Promise(r=>release=r);
 await page.route('**/api/objective-library?node_id='+domain.id,async route=>{await held;await route.continue()});
 await page.evaluate(({a,b})=>{openLibraryDomain(a);openLibraryDomain(b)},{a:domain.id,b:other.id});
 await page.waitForFunction(id=>libraryNotebookState.domainId===id&&!libraryNotebookState.loading,other.id);release();
 await page.waitForTimeout(300);assert.equal(await page.evaluate(()=>libraryNotebookState.domainId),other.id);
 await page.unroute('**/api/objective-library?node_id='+domain.id);
 await page.evaluate(()=>{showView('calendar');state.cursor=new Date(2026,10,3);renderMonth();renderWeek()});
 await page.evaluate(()=>openCalendarDecoration('2026-11-03'));
 const dlg=page.locator('#calendarDecorDialog');await dlg.locator('[name=scope]').selectOption('month');
 const png=await page.evaluate(()=>{const c=document.createElement('canvas');c.width=4;c.height=4;c.getContext('2d').fillRect(0,0,4,4);return c.toDataURL('image/png').split(',')[1]});
 await dlg.locator('[name=image]').setInputFiles({name:'fixture.png',mimeType:'image/png',buffer:Buffer.from(png,'base64')});
 await page.waitForFunction(()=>document.querySelector('.calendar-decor-status').textContent.includes('Image prête'));
 await dlg.locator('[name=opacity]').fill('62');await dlg.locator('[name=opacity]').dispatchEvent('input');
 await dlg.locator('[name=color]').evaluate(el=>{el.value='#ffcc88';el.dispatchEvent(new Event('input',{bubbles:true}))});
 await dlg.locator('[data-decor=save]').click();
 const cell=page.locator('#monthGrid [data-date="2026-11-03"]');
 assert.equal(await cell.locator('img').evaluate(el=>el.style.opacity),'0.62');
 assert.equal(await cell.locator('.day-number').evaluate(el=>el.style.color),'rgb(255, 204, 136)');
 await page.evaluate(()=>openCalendarDecoration('2026-11-03'));await dlg.locator('[data-decor=remove]').click();await dlg.locator('[data-decor=save]').click();
 assert.equal(await cell.locator('img').count(),0);assert.equal(await page.locator('[data-date="2026-11-04"] img').count(),1);
 await page.evaluate(()=>openCalendarDecoration('2026-11-03'));await dlg.locator('[data-decor=inherit]').click();await dlg.locator('[data-decor=save]').click();assert.equal(await cell.locator('img').count(),1);
 await page.reload();await page.waitForFunction(()=>typeof state!=='undefined'&&state.events);
 await page.evaluate(()=>{showView('calendar');state.cursor=new Date(2026,10,3);renderMonth()});assert.equal(await cell.locator('img').count(),1);
 assert.deepEqual(errors,[]);console.log('PASS: shelf, remembered page, guarded saves, domain race, monthly image, opacity, colour, overrides and reload');
}finally{if(browser)await browser.close();server.kill();rmSync(data,{recursive:true,force:true})}})().catch(e=>{console.error(e);process.exitCode=1});
