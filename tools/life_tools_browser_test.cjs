const {chromium}=require('playwright');
const {spawn}=require('node:child_process');
const {mkdtempSync,rmSync}=require('node:fs');
const {tmpdir}=require('node:os');
const {join,resolve}=require('node:path');
const assert=require('node:assert/strict');
const port=18812,base='http://127.0.0.1:'+port;
const data=mkdtempSync(join(tmpdir(),'atelier-life-tools-'));
const server=spawn('python',[resolve(__dirname,'..','app','app.py')],{
  env:{...process.env,ATELIER_DATA_DIR:data,ATELIER_NO_BROWSER:'1',ATELIER_PORT:String(port)},stdio:'ignore'
});
async function ready(){for(let i=0;i<120;i++){try{if((await fetch(base+'/api/version')).ok)return}catch{}await new Promise(r=>setTimeout(r,150))}throw Error('Server startup timeout')}
async function api(path,method='GET',body){
 const r=await fetch(base+path,{method,headers:{'Content-Type':'application/json'},body:body===undefined?undefined:JSON.stringify(body)});
 const j=await r.json();if(!r.ok)throw Error(path+' '+r.status+' '+JSON.stringify(j));return j;
}
(async()=>{
 let browser;
 try{
  await ready();browser=await chromium.launch({headless:true});
  const page=await browser.newPage({viewport:{width:1665,height:900}});
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto(base,{waitUntil:'domcontentloaded'});
  await page.locator('#journalPageNumber').waitFor();
  assert.equal(await page.locator('#journalPageNumber').innerText(),'1–2');
  await page.locator('#journalNextPage').click();
  assert.equal(await page.locator('#journalPageNumber').innerText(),'3–4');
  assert.ok(await page.locator('#journalBook').evaluate(el=>el.classList.contains('journal-page-2')));
  await page.locator('#journalBackToToday').click();
  const today=new Date(),date=today.getFullYear()+'-'+String(today.getMonth()+1).padStart(2,'0')+'-'+String(today.getDate()).padStart(2,'0');
  const task=await api('/api/tasks','POST',{title:'Journal tâche interactive',due_date:date,due_time:'14:45'});
  await page.evaluate(()=>refresh());
  const check=page.locator('#homeTodayTasks .journal-task-check').first();
  await check.waitFor();await check.check();
  await page.waitForFunction(async id=>(await (await fetch('/api/tasks')).json()).some(x=>x.id===id&&x.completed),task.id);
  const event=await api('/api/events','POST',{title:'RDV du journal',event_date:date,start_time:'16:30',category:'important'});
  await page.evaluate(()=>refresh());
  assert.ok((await page.locator('#homeDeadlineLines').innerText()).includes('16h30'));
  await page.evaluate(()=>showView('trackers'));
  // Nouvelle interprétation validée par les visuels : plusieurs tableaux,
  // lignes (habitudes) x jours, couleurs, valeurs optionnelles et archives.
  const boardForm=page.locator('#trackerBoardCreateForm');
  await boardForm.locator('[name=title]').fill('Bien-être');
  await boardForm.locator('[name=color]').selectOption('rose');
  await boardForm.locator('button[type=submit]').click();
  await page.locator('.tracker-board-rose').waitFor();
  await boardForm.locator('[name=title]').fill('Projets');
  await boardForm.locator('[name=color]').selectOption('mauve');
  await boardForm.locator('button[type=submit]').click();
  await page.waitForFunction(async()=> (await (await fetch('/api/tracker-boards')).json()).length===2);
  let boards=await api('/api/tracker-boards');
  const wellness=boards.find(b=>b.title==='Bien-être');
  const projects=boards.find(b=>b.title==='Projets');
  assert.ok(wellness&&projects&&wellness.id!==projects.id);
  const wellnessCard=page.locator('.tracker-board').filter({has:page.locator('h3:text-is("Bien-être")')});
  await wellnessCard.locator('.tracker-add-row [name=title]').fill('Boire de l’eau');
  await wellnessCard.locator('.tracker-add-row [name=mode]').selectOption('check');
  await wellnessCard.locator('.tracker-add-row button').click();
  await page.waitForFunction(async id=>(
    await (await fetch('/api/tracker-boards')).json()).find(b=>b.id===id)?.rows.length===1,wellness.id);
  await wellnessCard.locator('.tracker-add-row [name=title]').fill('Sommeil');
  await wellnessCard.locator('.tracker-add-row [name=mode]').selectOption('number');
  await wellnessCard.locator('.tracker-add-row button').click();
  await page.waitForFunction(async id=>(
    await (await fetch('/api/tracker-boards')).json()).find(b=>b.id===id)?.rows.length===2,wellness.id);
  boards=await api('/api/tracker-boards');
  let current=boards.find(b=>b.id===wellness.id);
  const checkRow=current.rows.find(x=>x.title==='Boire de l’eau');
  const numberRow=current.rows.find(x=>x.title==='Sommeil');
  assert.equal(checkRow.mode,'check');
  assert.equal(numberRow.mode,'number');
  const todayN=new Date().getDate()-1;
  const checked=wellnessCard.locator('.tracker-grid-line').filter({hasText:'Boire de l’eau'})
    .locator('.tracker-day-cell').nth(todayN);
  await checked.click();
  await page.waitForFunction(async({id,day})=>{
    const boards=await (await fetch('/api/tracker-boards')).json();
    return boards.find(b=>b.id===id)?.rows.find(r=>r.title==='Boire de l’eau')?.marks?.[day]==='1';
  },{id:wellness.id,day:date});
  assert.equal(await checked.getAttribute('aria-pressed'),'true');
  await checked.click();
  await page.waitForFunction(async({id,day})=>{
    const boards=await (await fetch('/api/tracker-boards')).json();
    return boards.find(b=>b.id===id)?.rows.find(r=>r.title==='Boire de l’eau')?.marks?.[day]===undefined;
  },{id:wellness.id,day:date});
  await checked.click();
  const numberCell=wellnessCard.locator('.tracker-grid-line').filter({hasText:'Sommeil'})
    .locator('.tracker-day-cell').nth(todayN);
  await numberCell.click();
  const editor=wellnessCard.locator('.tracker-number-editor');
  await editor.fill('7.5');
  await editor.press('Enter');
  await page.waitForFunction(async({id,day})=>{
    const boards=await (await fetch('/api/tracker-boards')).json();
    return boards.find(b=>b.id===id)?.rows.find(r=>r.title==='Sommeil')?.marks?.[day]==='7.5';
  },{id:wellness.id,day:date});
  await page.locator('#trackerMonthPrev').click();
  await page.waitForFunction(()=>document.querySelector('#trackerMonthLabel')?.textContent!==
    new Intl.DateTimeFormat('fr-FR',{month:'long',year:'numeric'}).format(new Date()));
  await page.locator('#trackerMonthToday').click();
  await page.waitForFunction(async id=> (await (await fetch('/api/tracker-boards')).json())
    .find(b=>b.id===id)?.rows.find(r=>r.title==='Sommeil')?.marks?.[date]==='7.5',wellness.id);
  await page.reload({waitUntil:'domcontentloaded'});
  await page.evaluate(()=>showView('trackers'));
  assert.equal(await page.locator('.tracker-board').count(),2,'All boards survive a full reload');
  assert.equal(await page.locator('.tracker-board-rose .tracker-day-done').count(),2);
  await api('/api/tracker-boards/'+wellness.id,'PUT',{archived:true});
  await page.evaluate(()=>loadLifeTools());
  await page.waitForFunction(()=>document.querySelectorAll('.tracker-board').length===1);
  await page.locator('#trackerBoardArchivesToggle').click();
  await page.locator('.tracker-archived-entry').filter({hasText:'Bien-être'})
    .getByRole('button',{name:'Restaurer'}).click();
  await page.waitForFunction(()=>document.querySelectorAll('.tracker-board').length===2);
  boards=await api('/api/tracker-boards');
  assert.equal(boards.find(b=>b.id===wellness.id).rows.find(r=>r.title==='Sommeil').marks[date],'7.5');
  assert.equal(boards.find(b=>b.id===wellness.id).rows.find(r=>r.title==='Boire de l’eau').marks[date],'1');
  await page.locator('#trackerCreateForm [name=title]').fill('Lecture');
  await page.locator('#trackerCreateForm [name=unit]').fill('pages');
  await page.locator('#trackerCreateForm button[type=submit]').click();
  await page.locator('#trackerList .life-card').first().waitFor();
  const tracker=(await api('/api/trackers'))[0];
  await page.locator('#trackerList [name=value]').first().fill('42');
  await page.locator('#trackerList button[type=submit]').first().click();
  await page.waitForFunction(async id=>(await (await fetch('/api/trackers')).json()).some(x=>x.id===id&&x.entries.some(e=>e.value===42)),tracker.id);
  await page.evaluate(()=>showView('admin'));
  await page.locator('#adminCreateForm [name=title]').fill('Dossier CAF');
  await page.locator('#adminCreateForm button[type=submit]').click();
  await page.locator('#adminList .life-card').first().waitFor();
  await page.locator('#adminList select.life-status').first().selectOption('waiting');
  await page.waitForFunction(async()=>(await (await fetch('/api/admin')).json()).some(x=>x.title==='Dossier CAF'&&x.status==='waiting'));
  await page.evaluate(()=>showView('home'));
  await page.locator('#journalNextPage').click();
  assert.match(await page.locator('#journalTrackerSummary').innerText(),/Lecture/);
  assert.match(await page.locator('#journalAdminSummary').innerText(),/Dossier CAF/);
  await page.evaluate(()=>lifeOpenCapture());
  await page.locator('#quickCaptureText').fill('#Car');
  await page.locator('#quickCaptureSuggestions button').first().waitFor({state:'visible'});
  await page.locator('#quickCaptureSuggestions button').first().click();
  await page.locator('#quickCaptureText').fill('#Carnet Première idée\nDeuxième ligne');
  await page.locator('#quickCaptureSend').click();
  await page.waitForFunction(async()=>(await (await fetch('/api/captures')).json()).some(x=>x.body.includes('Deuxième ligne')));
  await page.evaluate(()=>showView('captures'));
  await page.locator('.life-capture.life-unread').first().waitFor({state:'visible'});
  await page.locator('.life-capture-body').first().click();
  await page.waitForFunction(async()=>(await (await fetch('/api/captures')).json()).every(x=>x.seen===1));
  await page.evaluate(()=>lifeOpenCapture());
  await page.locator('#quickCaptureText').fill('#Tâches Nouvelle tâche via capture');
  await page.locator('#quickCaptureSend').click();
  await page.waitForFunction(async()=>(await (await fetch('/api/tasks')).json()).some(x=>x.title==='Nouvelle tâche via capture'));
  // Both Windows editions must accept only their own localhost origin.
  // This disposable test server uses a third port and must not start a real updater.
  for(const [path,header,body] of [
    ['/api/update/start','X-Atelier-Update',{revision:'0'.repeat(40)}],
    ['/api/desktop-postits/new','X-Atelier-Desktop',{}]
  ]){
    const wrong=await fetch(base+path,{method:'POST',
      headers:{Origin:'http://127.0.0.1:8876',[header]:'1','Content-Type':'application/json'},
      body:JSON.stringify(body)});
    assert.equal(wrong.status,403,path+' must reject a foreign localhost origin');
    const own=await fetch(base+path,{method:'POST',
      headers:{Origin:base,[header]:'1','Content-Type':'application/json'},
      body:JSON.stringify(body)});
    assert.equal(own.status,409,path+' should pass the origin check and then fail its TEST-only guard');
  }
  await page.evaluate(()=>showView('settings'));
  assert.ok((await page.locator('#settingsRunningEdition').innerText()).includes('Installation locale (port 18812)'));
  await page.locator('#settingsReminderSound').check();
  assert.equal(await page.evaluate(()=>localStorage.getItem('atelierReminderSound')),'1');
  await page.locator('#settingsTestReminderSound').click();
  await page.locator('#settingsQuickCaptureShortcut').focus();
  await page.keyboard.press('Control+Alt+KeyJ');
  await page.waitForFunction(()=>document.querySelector('#settingsQuickCaptureShortcut').value==='Ctrl+Alt+J');
  assert.equal((await api('/api/quick-capture/hotkey')).shortcut,'Ctrl+Alt+J');
  await page.keyboard.press('Control+Alt+KeyJ');
  assert.equal(await page.locator('#quickCaptureOverlay').evaluate(el=>!el.classList.contains('hidden')),true);
  await page.keyboard.press('Escape');
  await page.evaluate(()=>showView('home'));
  await page.locator('#globalLayoutEdit').click();
  const corner=page.locator('#openCalendarCard .layout-corner-nw');
  assert.ok(await corner.count(),'Top-left resize handle exists');
  assert.equal(await corner.evaluate(el=>getComputedStyle(el).cursor),'nwse-resize');
  await page.locator('#globalLayoutEdit').click();
  await page.reload({waitUntil:'domcontentloaded'});
  assert.ok((await api('/api/trackers'))[0].entries.some(x=>x.value===42));
  assert.equal((await api('/api/admin'))[0].status,'waiting');
  assert.ok((await api('/api/captures')).some(x=>x.body.includes('Deuxième ligne')));
  assert.equal(await page.evaluate(()=>localStorage.getItem('atelierReminderSound')),'1');
  assert.deepEqual(errors,[]);
  console.log('PASS: visual tracker boards (multiple boards, day grid, numeric cells, monthly navigation, archive/restore and reload), preserved legacy measures, journal checkboxes, admin, capture, sound, origins and layout');
 }finally{
  if(browser)await browser.close();
  server.kill();rmSync(data,{recursive:true,force:true,maxRetries:5,retryDelay:150});
 }
})().catch(e=>{console.error(e);process.exitCode=1});
