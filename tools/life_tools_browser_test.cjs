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
  for(let i=0;i<4;i++)await api('/api/events','POST',{
    title:'Autre rendez-vous '+i,event_date:date,start_time:'18:'+String(i*10).padStart(2,'0'),category:'general'
  });
  await page.evaluate(()=>refresh());
  const expand=page.locator('#homeUpcoming .home-upcoming-toggle');
  await expand.waitFor();
  assert.equal(await page.locator('#homeUpcoming .home-appt-row').count(),3);
  await expand.click();
  assert.ok(await page.locator('#homeUpcoming .home-appt-row').count()>=5);
  assert.equal(await page.locator('#homeUpcoming .home-upcoming-toggle').getAttribute('aria-expanded'),'true');
  await page.locator('#homeUpcoming .home-upcoming-toggle').click();
  assert.equal(await page.locator('#homeUpcoming .home-appt-row').count(),3);
  await page.evaluate(()=>showView('trackers'));
  // Nouvelle interprétation validée par les visuels : plusieurs tableaux,
  // lignes (habitudes) x jours, couleurs, valeurs optionnelles et archives.
  const boardForm=page.locator('#trackerBoardCreateForm');
  assert.equal(await boardForm.isVisible(),false,'Creation form should be collapsed by default');
  await page.locator('#trackerBoardCreateToggle').click();
  assert.equal(await boardForm.isVisible(),true,'New board opens its form');
  await boardForm.locator('[name=title]').fill('Bien-être');
  await boardForm.locator('[name=color]').selectOption('rose');
  await boardForm.locator('button[type=submit]').click();
  await page.locator('.tracker-board-rose').waitFor();
  await page.waitForFunction(()=>{const form=document.querySelector('#trackerBoardCreateForm');
    return form&&!form.elements.title.disabled&&!form.elements.title.value;});
  await boardForm.locator('[name=title]').fill('Projets');
  await boardForm.locator('[name=color]').selectOption('mauve');
  await boardForm.locator('button[type=submit]').click();
  await page.waitForFunction(async()=>{const names=(await (await fetch('/api/tracker-boards')).json()).map(b=>b.title);
    return names.includes('Bien-être')&&names.includes('Projets');});
  let boards=[];
  // Wait for a *separate* client to see both committed rows. The browser's
  // prior wait can otherwise race the API read after rapid saves.
  for(let attempt=0;attempt<40;attempt++){
    boards=await api('/api/tracker-boards');
    if(boards.some(b=>b.title==='Bien-être')&&boards.some(b=>b.title==='Projets'))break;
    await new Promise(resolve=>setTimeout(resolve,100));
  }
  const wellness=boards.find(b=>b.title==='Bien-être');
  const projects=boards.find(b=>b.title==='Projets');
  assert.ok(wellness&&projects&&wellness.id!==projects.id,'Expected distinct named boards: '+JSON.stringify(boards.map(b=>({id:b.id,title:b.title}))));
  const wellnessCard=page.locator('.tracker-board').filter({has:page.locator('h3:text-is("Bien-être")')});
  await wellnessCard.click({button:'right'});
  const boardMenu=page.locator('.tracker-board-popup');
  await boardMenu.waitFor();
  assert.match(await boardMenu.innerText(),/Archiver le tableau/);
  await page.keyboard.press('Escape');
  assert.equal(await boardMenu.count(),0,'Right-click menu dismisses without changing the board');
  await wellnessCard.locator('.tracker-add-row [name=title]').fill('Boire de l’eau');
  await wellnessCard.locator('.tracker-add-row [name=mode]').selectOption('check');
  await wellnessCard.locator('.tracker-add-row button').click();
  await page.waitForFunction(async id=>(
    await (await fetch('/api/tracker-boards')).json()).find(b=>b.id===id)?.rows.some(r=>r.title==='Boire de l’eau'),wellness.id);
  await wellnessCard.locator('.tracker-grid-line').filter({hasText:'Boire de l’eau'}).waitFor();
  await wellnessCard.locator('.tracker-add-row [name=title]').fill('Sommeil');
  await wellnessCard.locator('.tracker-add-row [name=mode]').selectOption('number');
  await wellnessCard.locator('.tracker-add-row button').click();
  await page.waitForFunction(async id=>(
    await (await fetch('/api/tracker-boards')).json()).find(b=>b.id===id)?.rows.some(r=>r.title==='Sommeil'),wellness.id);
  await wellnessCard.locator('.tracker-grid-line').filter({hasText:'Sommeil'}).waitFor();
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
  await page.waitForFunction(async({id,day})=> (await (await fetch('/api/tracker-boards')).json())
    .find(b=>b.id===id)?.rows.find(r=>r.title==='Sommeil')?.marks?.[day]==='7.5',{id:wellness.id,day:date});
  await page.reload({waitUntil:'domcontentloaded'});
  await page.evaluate(()=>showView('trackers'));
  await page.waitForFunction(()=>document.querySelectorAll('.tracker-board').length===2);
  assert.equal(await page.locator('.tracker-board').count(),2,'All boards survive a full reload');
  assert.equal(await page.locator('.tracker-board-rose .tracker-day-done').count(),2);
  await api('/api/tracker-boards/'+wellness.id,'PUT',{archived:true});
  await page.evaluate(()=>loadLifeTools());
  await page.waitForFunction(()=>document.querySelectorAll('.tracker-board').length===1);
  await page.evaluate(()=>showView('settings'));
  await page.waitForFunction(()=>document.getElementById('settingsTrackerHistory')?.textContent);
  await page.locator('#trackerBoardArchivesToggle').click();
  await page.locator('.tracker-archived-entry').filter({hasText:'Bien-être'})
    .getByRole('button',{name:'Restaurer'}).click();
  await page.waitForFunction(()=>document.querySelectorAll('.tracker-board').length===2);
  boards=await api('/api/tracker-boards');
  assert.equal(boards.find(b=>b.id===wellness.id).rows.find(r=>r.title==='Sommeil').marks[date],'7.5');
  assert.equal(boards.find(b=>b.id===wellness.id).rows.find(r=>r.title==='Boire de l’eau').marks[date],'1');
  await page.evaluate(()=>showView('trackers'));
  // Different boards can have their own schedules and navigation; one
  // bimonthly board must not affect the monthly Habitudes board.
  const createScheduled=async(title,preset)=>{
    await boardForm.locator('[name=title]').fill(title);
    await boardForm.locator('[name=period_preset]').selectOption(preset);
    await boardForm.locator('button[type=submit]').click();
    await page.waitForFunction(async title=>
      (await (await fetch('/api/tracker-boards')).json()).some(b=>b.title===title),title);
    await page.locator('#trackerBoardCreateForm [name=title]').waitFor({state:'visible'});
    await page.waitForFunction(()=>
      !document.querySelector('#trackerBoardCreateForm [name=title]')?.disabled);
    const rows=await api('/api/tracker-boards');
    return rows.find(b=>b.title===title);
  };
  const fortnight=await createScheduled('Ménage 2 semaines','weeks:2');
  const twoMonths=await createScheduled('Entretien 2 mois','months:2');
  const yearly=await createScheduled('Administratif annuel','years:1');
  await boardForm.locator('[name=title]').fill('Projet 10 jours');
  await boardForm.locator('[name=period_preset]').selectOption('custom');
  await boardForm.locator('[name=custom_count]').fill('10');
  await boardForm.locator('[name=custom_unit]').selectOption('days');
  await boardForm.locator('button[type=submit]').click();
  await page.waitForFunction(async()=>(await (await fetch('/api/tracker-boards')).json())
    .some(b=>b.title==='Projet 10 jours'));
  await page.waitForFunction(()=>
    !document.querySelector('#trackerBoardCreateForm [name=title]')?.disabled);
  const allWindows=await page.evaluate(async()=>(await (await fetch(
    '/api/tracker-boards?periods=1')).json()));
  assert.equal(allWindows.length,6,'All named boards must be present: '+JSON.stringify(allWindows.map(b=>b.title)));
  for(const title of ['Bien-être','Projets','Ménage 2 semaines','Entretien 2 mois','Administratif annuel','Projet 10 jours'])
    assert.ok(allWindows.some(b=>b.title===title),'Board missing: '+title);
  const weekWindow=allWindows.find(x=>x.id===fortnight.id).period;
  const bimonthWindow=allWindows.find(x=>x.id===twoMonths.id).period;
  const yearlyWindow=allWindows.find(x=>x.id===yearly.id).period;
  const customWindow=allWindows.find(x=>x.title==='Projet 10 jours').period;
  assert.equal(weekWindow.columns.length,14,'Two weeks contain 14 daily cells');
  assert.ok([59,60,61,62].includes(bimonthWindow.columns.length),
    'Two months need daily columns, including leap years');
  assert.equal(yearlyWindow.columns.length,12,'An annual grid has 12 months');
  assert.equal(yearlyWindow.granularity,'months');
  assert.equal(customWindow.columns.length,10);
  const cleaningCard=page.locator('.tracker-board').filter({has:page.locator('h3:text-is("Ménage 2 semaines")')});
  assert.match(await cleaningCard.locator('.tracker-board-cadence').innerText(),/2 semaines/);
  await cleaningCard.locator('.tracker-add-row [name=title]').fill('Passer l’aspirateur');
  await cleaningCard.locator('.tracker-add-row button[type=submit]').click();
  await page.waitForFunction(async id=>(await (await fetch('/api/tracker-boards')).json())
    .find(b=>b.id===id)?.rows.length===1,fortnight.id);
  await cleaningCard.locator('.tracker-day-cell').first().click();
  const firstDay=weekWindow.columns[0].day;
  await page.waitForFunction(async({id,day})=>{
    const list=await (await fetch('/api/tracker-boards?periods=1')).json();
    return list.find(b=>b.id===id)?.rows[0]?.marks[day]==='1';
  },{id:fortnight.id,day:firstDay});
  const oldLabel=await cleaningCard.locator('.tracker-board-range').innerText();
  await cleaningCard.locator('.tracker-period-next').click();
  await page.waitForFunction(({label})=>{
    const card=[...document.querySelectorAll('.tracker-board')]
      .find(x=>x.querySelector('h3')?.textContent==='Ménage 2 semaines');
    return card&&card.querySelector('.tracker-board-range')?.textContent!==label;
  },{label:oldLabel});
  assert.equal(await page.locator('.tracker-board').filter({has:page.locator('h3:text-is("Bien-être")')})
    .locator('.tracker-grid-dates .tracker-grid-day').count(),new Date(new Date().getFullYear(),new Date().getMonth()+1,0).getDate(),
    'Navigating one board leaves the existing monthly board untouched');
  await cleaningCard.locator('.tracker-period-back').click();
  await page.waitForFunction(({label})=>{
    const card=[...document.querySelectorAll('.tracker-board')]
      .find(x=>x.querySelector('h3')?.textContent==='Ménage 2 semaines');
    return card?.querySelector('.tracker-board-range')?.textContent===label;
  },{label:oldLabel});
  await page.reload({waitUntil:'domcontentloaded'});
  await page.evaluate(()=>showView('trackers'));
  await page.waitForFunction(()=>document.querySelectorAll('.tracker-board').length===6);
  assert.equal(await page.locator('.tracker-board').count(),6);
  assert.ok(await page.locator('.tracker-board').filter({has:page.locator('h3:text-is("Ménage 2 semaines")')})
    .locator('.tracker-day-done').first().isVisible());
  // Rhythm may be changed without erasing the original, date-keyed record.
  const response=await page.evaluate(async id=>{
    const res=await fetch('/api/tracker-boards/'+id,{
      method:'PUT',headers:{'Content-Type':'application/json'},
      body:JSON.stringify({period_unit:'months',period_count:2})
    });return res.status;
  },fortnight.id);
  assert.equal(response,200);
  const updated=(await api('/api/tracker-boards')).find(b=>b.id===fortnight.id);
  assert.equal(updated.period_unit,'months');
  assert.equal(updated.period_count,2);
  // The historic entry remains in SQLite (even if the new time window differs).
  assert.equal((await page.evaluate(async day=>{
    const list=await (await fetch('/api/tracker-boards?month='+day.slice(0,7))).json();
    return list.find(b=>b.title==='Ménage 2 semaines')?.rows[0]?.marks?.[day];
  },firstDay)),'1');
  await page.locator('.tracker-legacy-section summary').click();
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
  assert.equal(await page.locator('#journalTrackerSummary').count(),0,
    'Trackers must not be copied into the Journal. Daily Tracker lives on Home.');
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
