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
  // Joindre un fichier réel depuis le formulaire du calendrier, le relire et
  // vérifier qu'un autre rendez-vous n'a pas accès aux mêmes octets.
  const eventDetails=(await api('/api/events?start='+date+'&end='+date))
    .find(x=>x.id===event.id);
  await page.evaluate(e=>openEventModal(e),eventDetails);
  const fileText='Pièce jointe du rendez-vous, conservée dans SQLite.';
  await page.locator('#eventAttachmentInput').setInputFiles({
    name:'convocation.txt',mimeType:'text/plain',buffer:Buffer.from(fileText,'utf8')
  });
  await page.waitForFunction(()=>document.querySelectorAll('.event-document-row').length===1);
  const files=await api('/api/events/'+event.id+'/attachments');
  assert.equal(files.length,1);
  assert.equal((await fetch(base+'/api/events/'+event.id+'/attachments/'+files[0].id)).status,200);
  assert.equal(await (await fetch(base+'/api/events/'+event.id+'/attachments/'+files[0].id)).text(),fileText);
  const stranger=await fetch(base+'/api/events/'+(event.id+9999)+'/attachments/'+files[0].id);
  assert.equal(stranger.status,404);
  const fakePdf=await fetch(base+'/api/events/'+event.id+'/attachments',{
    method:'POST',headers:{'Content-Type':'application/json'},
    body:JSON.stringify({filename:'mensonge.pdf',mime_type:'application/pdf',
      base64:Buffer.from('not actually a pdf').toString('base64')})
  });
  assert.equal(fakePdf.status,400);
  await page.locator('#cancelEvent').click();
  await page.reload({waitUntil:'domcontentloaded'});
  await page.evaluate(()=>refresh());
  assert.equal((await api('/api/events?start='+date+'&end='+date))
    .find(x=>x.id===event.id)?.attachments?.length,1,
    'Documents du rendez-vous toujours présents après F5');
  assert.ok((await page.locator('#homeDeadlineLines').innerText()).includes('16h30'));
  for(let i=0;i<4;i++)await api('/api/events','POST',{
    title:'Autre rendez-vous '+i,event_date:date,start_time:'18:'+String(i*10).padStart(2,'0'),category:'general'
  });
  await page.evaluate(()=>refresh());
  await page.evaluate(()=>{
    state.cursor=new Date();state.calendarMode='month';applyCalendarMode();showView('calendar');renderMonth();
  });
  const dayToggle=page.locator('#monthGrid .day-list-toggle[aria-label="Voir tous les rendez-vous du '+date+'"]');
  await dayToggle.click();
  assert.ok(await page.locator('#modalBody .calendar-day-list .event-pill').count()>=5);
  await page.locator('#calendarDayAdd').click();
  const dayForm=page.locator('#eventForm');
  assert.ok(await dayForm.count(),
    'Bouton Ajouter dans la liste du jour doit ouvrir le formulaire. Modale : '+
    (await page.locator('#modalBody').innerText())+' · JS : '+JSON.stringify(errors));
  assert.equal(await dayForm.locator('[name=event_date]').inputValue(),date);
  await page.locator('#cancelEvent').click();
  await page.evaluate(()=>showView('home'));
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
  await wellnessCard.locator('.tracker-grid-line[data-tracker-row-id="'+numberRow.id+'"] .tracker-row-move[aria-label^="Monter"]').click();
  await page.waitForFunction(async({boardId,rowId})=>{
    const found=(await (await fetch('/api/tracker-boards')).json()).find(b=>b.id===boardId);
    return found?.rows[0]?.id===rowId;
  },{boardId:wellness.id,rowId:numberRow.id});
  // L'API confirme d'abord la transaction ; attendre ensuite le nouveau rendu
  // avant de comparer la navigation serveur et la vraie position affichée.
  await page.waitForFunction(({boardId,rowId})=>{
    const boards=[...document.querySelectorAll('.tracker-board')];
    const target=boards.find(el=>el.querySelector('h3')?.textContent==='Bien-être');
    const first=target?.querySelector('.tracker-grid-line[data-tracker-row-id]');
    return Number(first?.dataset.trackerRowId)===rowId;
  },{boardId:wellness.id,rowId:numberRow.id},{timeout:12000});
  current=(await api('/api/tracker-boards')).find(b=>b.id===wellness.id);
  assert.equal(current.rows[0].id,numberRow.id);
  assert.equal(current.rows[1].id,checkRow.id);
  const badMove=await fetch(base+'/api/tracker-board-rows/'+numberRow.id+'/move',{
    method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify({direction:'left'})
  });
  assert.equal(badMove.status,400);

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
  await page.waitForFunction(()=>[...document.querySelectorAll('.tracker-grid-line')].some(row=>row.textContent.includes('Boire de l’eau')&&row.querySelector('.tracker-day-cell[aria-pressed="true"]')));
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
  const archivedWellness=(await api('/api/tracker-boards?archived=1'))
    .find(x=>x.id===wellness.id);
  assert.ok(archivedWellness?.archive_summary,'Archived board exposes a dated report');
  assert.equal(archivedWellness.archive_summary.done,0,
    'Current-month marks should not be fabricated in the previous completed month');
  assert.equal(archivedWellness.archive_summary.eligible,0,
    'Rows created after the last completed month are not penalized');
  const archivedCard=page.locator('.tracker-archived-entry').filter({hasText:'Bien-être'});
  assert.match(await archivedCard.locator('.tracker-archive-recap').innerText(),/Aucun jour éligible/);
  await page.locator('.tracker-archived-entry').filter({hasText:'Bien-être'})
    .getByRole('button',{name:'Restaurer'}).click();
  await page.waitForFunction(()=>document.querySelectorAll('.tracker-board').length===2);
  boards=await api('/api/tracker-boards');
  assert.equal(boards.find(b=>b.id===wellness.id).rows.find(r=>r.title==='Sommeil').marks[date],'7.5');
  assert.equal(boards.find(b=>b.id===wellness.id).rows.find(r=>r.title==='Boire de l’eau').marks[date],'1');
  await page.evaluate(()=>showView('trackers'));
  await page.locator('#trackerBoardCreateToggle').click();
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
  const admin=(await api('/api/admin')).find(x=>x.title==='Dossier CAF');
  await page.locator('#adminList .life-card[data-admin-id="'+admin.id+'"] .life-admin-event-select')
    .selectOption(String(event.id));
  await page.waitForFunction(async({id,eid})=>
    (await (await fetch('/api/admin')).json()).find(x=>x.id===id)?.event_id===eid,
    {id:admin.id,eid:event.id});
  const linked=(await api('/api/events')).find(x=>x.id===event.id);
  assert.ok(linked.admin_links.some(x=>x.id===admin.id),'Event exposes linked admin without creating another event');
  const fileName='pièce-test.txt',sample='Dossier de test — reste dans SQLite.';
  await page.locator('#adminList .life-card[data-admin-id="'+admin.id+'"] input[type=file]')
    .setInputFiles({name:fileName,mimeType:'text/plain',buffer:Buffer.from(sample,'utf8')});
  await page.waitForFunction(async id=>(await (await fetch('/api/admin')).json())
    .find(x=>x.id===id)?.attachments?.length===1,admin.id);
  let att;
  for(let retry=0;retry<35;retry++){
    const fresh=(await api('/api/admin')).find(x=>x.id===admin.id);
    att=fresh?.attachments?.[0];
    if(att)break;
    await new Promise(resolve=>setTimeout(resolve,100));
  }
  assert.ok(att,'Uploaded file must remain in SQLite after asynchronous UI reload');
  const attachmentResponse=await fetch(base+'/api/admin/'+admin.id+'/attachments/'+att.id);
  assert.equal(attachmentResponse.status,200);
  assert.equal(await attachmentResponse.text(),sample);
  assert.match(attachmentResponse.headers.get('content-disposition'),/attachment/);
  assert.equal(attachmentResponse.headers.get('x-content-type-options'),'nosniff');
  const invalid=await fetch(base+'/api/admin/'+admin.id+'/attachments',{
    method:'POST',headers:{'Content-Type':'application/json'},
    body:JSON.stringify({filename:'../escape.txt',mime_type:'text/plain',
      base64:Buffer.from(sample).toString('base64')})});
  assert.equal(invalid.status,400,'No path traversal in filenames');
  const wrongOwner=await fetch(base+'/api/admin/'+(admin.id+1000)+'/attachments/'+att.id);
  assert.equal(wrongOwner.status,404,'Attachments cannot be fetched by another dossier');
  await page.reload({waitUntil:'domcontentloaded'});
  await page.evaluate(()=>showView('admin'));
  await page.locator('#adminList .life-card[data-admin-id="'+admin.id+'"] a').first().waitFor();
  assert.equal((await api('/api/admin')).find(x=>x.id===admin.id).event_id,event.id);
  await page.evaluate(()=>showView('home'));
  await page.locator('#journalNextPage').click();
  assert.equal(await page.locator('#journalTrackerSummary').count(),0,
    'Trackers must not be copied into the Journal. Daily Tracker lives on Home.');
  assert.match(await page.locator('#journalAdminSummary').innerText(),/Dossier CAF/);
  // La démarche n'est jamais effacée par un archivage ; elle reste
  // récupérable avec ses pièces jointes et son lien calendrier.
  await page.evaluate(()=>showView('admin'));
  await page.locator('#adminList .life-card[data-admin-id="'+admin.id+'"] .life-admin-archive-action').click();
  await page.locator('#atelierDialogConfirm').click();
  await page.waitForFunction(async identity=>{
    const active=await (await fetch('/api/admin')).json();
    const archived=await (await fetch('/api/admin?archived=1')).json();
    return !active.some(x=>x.id===identity)&&archived.some(x=>x.id===identity&&x.attachments?.length===1);
  },admin.id);
  const archived=await api('/api/admin?archived=1');
  assert.equal(archived.find(x=>x.id===admin.id).event_id,event.id);
  assert.equal((await fetch(base+'/api/admin/'+admin.id+'/attachments/'+att.id)).status,200,
    'Archived files remain available and unchanged');
  await page.locator('#adminArchivesToggle').click();
  await page.locator('#adminArchivedList .life-card[data-admin-id="'+admin.id+'"] button')
    .filter({hasText:'Restaurer'}).click();
  await page.waitForFunction(async identity=>
    (await (await fetch('/api/admin')).json()).some(x=>x.id===identity&&x.attachments?.length===1),admin.id);
  assert.equal((await api('/api/admin?archived=1')).some(x=>x.id===admin.id),false);
  const invalidArchive=await fetch(base+'/api/admin/'+admin.id,{
    method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify({archived:'oui'})
  });
  assert.equal(invalidArchive.status,400);
  const editCard=page.locator('#adminList .life-card[data-admin-id="'+admin.id+'"]');
  await editCard.locator('.life-admin-edit-details summary').click();
  await editCard.locator('.life-admin-edit-form [name=title]').fill('Dossier CAF modifié');
  await editCard.locator('.life-admin-edit-form [name=category]').fill('Famille');
  await editCard.locator('.life-admin-edit-form [name=due_date]').fill('2026-11-01');
  await editCard.locator('.life-admin-edit-form button[type=submit]').click();
  await page.waitForFunction(async identity=>{
    const found=(await (await fetch('/api/admin')).json()).find(x=>x.id===identity);
    return found?.title==='Dossier CAF modifié'&&found.category==='Famille'&&
      found.due_date==='2026-11-01'&&found.attachments?.length===1;
  },admin.id);
  await page.reload({waitUntil:'domcontentloaded'});
  const savedAdmin=(await api('/api/admin')).find(x=>x.id===admin.id);
  assert.equal(savedAdmin.title,'Dossier CAF modifié');
  assert.equal(savedAdmin.event_id,event.id);
  assert.equal(savedAdmin.attachments.length,1);
  await page.evaluate(()=>showView('home'));
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
  // Une idée destinée aux Rappels attend une vraie date et une heure, sans
  // déclencher de notification fantôme.
  const remindersBefore=(await api('/api/reminders')).length;
  await page.evaluate(()=>lifeOpenCapture());
  await page.locator('#quickCaptureText').fill('#Rappels Faire le dossier CAF\navec justificatif');
  await page.locator('#quickCaptureSend').click();
  await page.waitForFunction(async()=>{
    const c=await (await fetch('/api/captures')).json();
    return c.some(x=>x.destination==='rappels'&&x.body.includes('justificatif'));
  });
  assert.equal((await api('/api/reminders')).length,remindersBefore);
  await page.evaluate(()=>showView('captures'));
  const reminderCapture=page.locator('.life-capture').filter({hasText:'Faire le dossier CAF'});
  assert.match(await reminderCapture.locator('.life-capture-pending').innerText(),/pas encore un rappel/);
  await reminderCapture.getByRole('button',{name:'Planifier un vrai rappel'}).click();
  assert.equal(await page.locator('#standaloneReminderForm [name=title]').inputValue(),'Faire le dossier CAF');
  assert.equal(await page.locator('#standaloneReminderForm [name=time]').inputValue(),'');
  await page.locator('#cancelStandaloneReminder').click();
  // La capture reste consultable sans être prétendue convertie.
  assert.ok((await api('/api/captures')).some(x=>x.destination==='rappels'&&!x.seen));
  await page.evaluate(()=>lifeOpenCapture());
  await page.locator('#quickCaptureText').fill('#Tracker Ranger les dossiers');
  await page.locator('#quickCaptureSend').click();
  await page.waitForFunction(async()=>(
    await (await fetch('/api/captures')).json()
  ).some(x=>x.destination==='tracker'&&x.body==='Ranger les dossiers'));
  await page.evaluate(()=>showView('captures'));
  const trackerCapture=page.locator('.life-capture').filter({hasText:'Ranger les dossiers'});
  assert.match(await trackerCapture.locator('.life-capture-pending').innerText(),/aucune ligne de Tracker/);
  await trackerCapture.getByRole('button',{name:'Ouvrir mes Trackers'}).click();
  assert.equal(await page.evaluate(()=>state.view),'trackers');
  assert.ok((await api('/api/captures')).filter(x=>['tracker','rappels'].includes(x.destination)).length>=2);
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
  // Le dernier Post-it peut être récupéré depuis Paramètres, sans avoir
  // besoin d'un compagnon Windows déjà ouvert ni d'une fenêtre dans l'Atelier.
  const postit=await api('/api/postits','POST',{
    title:'Archives E2E',body:'Première ligne'+String.fromCharCode(10)+'Deuxième ligne',
    color:'mauve',shape:'rounded'
  });
  await api('/api/postits/'+postit.id,'PUT',{archived:true});
  assert.equal((await api('/api/postits')).some(n=>n.id===postit.id),false);
  const badStatus=await fetch(base+'/api/postits/'+postit.id,{
    method:'PUT',headers:{'Content-Type':'application/json'},
    body:JSON.stringify({archived:'false'})
  });
  assert.equal(badStatus.status,400,'Archived must be a real boolean');
  await page.reload({waitUntil:'domcontentloaded'});
  await page.evaluate(()=>showView('settings'));
  await page.locator('#settingsDesktopPostitArchives summary').click();
  const archivedItem=page.locator('.postit-archive-entry[data-postit-id="'+postit.id+'"]');
  await archivedItem.waitFor();
  assert.equal(await archivedItem.getByText('Première ligne').count(),0,
    'The archive list shows names only, never Post-it contents');
  await archivedItem.getByRole('button',{name:'Restaurer le Post-it Archives E2E'}).click();
  await page.waitForFunction(async id=>{
    const notes=await (await fetch('/api/postits')).json();
    return notes.some(n=>n.id===id&&n.archived===0);
  },postit.id);
  const restored=(await api('/api/postits')).find(n=>n.id===postit.id);
  assert.equal(restored.body,'Première ligne'+String.fromCharCode(10)+'Deuxième ligne');
  assert.equal(restored.color,'mauve');
  assert.equal((await api('/api/postits?archived=1')).some(n=>n.id===postit.id),false);
  assert.equal(await page.locator('.postit-archive-entry[data-postit-id="'+postit.id+'"]').count(),0);
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
  // Canva-like regression: all eight grips really receive pointer events,
  // anchor the opposite edge, and persist the result. Previously several
  // visible grips had pointer-events:none and were impossible to use.
  const baseline={x:500,y:255,width:350,height:220};
  const grips=[
    ['nw','layout-corner-nw',-25,-20],
    ['ne','layout-corner-ne',35,-20],
    ['sw','layout-corner-sw',-25,25],
    ['se','layout-resize-handle',35,25],
    ['left','layout-side-left',-25,0],
    ['right','layout-width-handle',35,0],
    ['top','layout-side-top',0,-25],
    ['bottom','layout-height-handle',0,30]
  ];
  for(const [axis,klass,dx,dy] of grips){
    await page.evaluate(b=>{
      const item=globalLayoutItems.find(it=>it.id==='homeBudgetWidget');
      const next={...readGlobalLayout(item),...b,scale:1};
      saveGlobalLayout(item,next);applyGlobalLayout(item,next);selectHomeCanvasItem(item);
    },baseline);
    const handle=page.locator('#homeBudgetWidget .'+klass);
    await handle.waitFor({state:'visible'});
    assert.equal(await handle.evaluate(el=>getComputedStyle(el).pointerEvents),
      'auto',axis+' must be clickable');
    const rect=await handle.boundingBox();
    assert.ok(rect?.width>0&&rect?.height>0,axis+' has a tangible hit target');
    const center={x:rect.x+rect.width/2,y:rect.y+rect.height/2};
    const initial=await page.evaluate(()=>{
      const item=globalLayoutItems.find(it=>it.id==='homeBudgetWidget');
      const d=readGlobalLayout(item),r=item.el.getBoundingClientRect();
      return {...d,width:r.width,height:r.height};
    });
    await page.mouse.move(center.x,center.y);
    await page.mouse.down();
    await page.mouse.move(center.x+dx,center.y+dy,{steps:7});
    await page.mouse.up();
    const after=await page.evaluate(()=>{
      const item=globalLayoutItems.find(it=>it.id==='homeBudgetWidget');
      return readGlobalLayout(item);
    });
    assert.ok(after.width>0&&after.height>0,axis+' must keep positive size');
    const left=['nw','sw','left'].includes(axis);
    const top=['nw','ne','top'].includes(axis);
    const right=['ne','se','right'].includes(axis);
    const bottom=['sw','se','bottom'].includes(axis);
    const near=(a,b,msg)=>assert.ok(Math.abs(a-b)<4,msg+': '+a+' vs '+b);
    if(left)near(after.x+after.width,initial.x+initial.width,axis+' keeps right edge');
    if(top)near(after.y+after.height,initial.y+initial.height,axis+' keeps bottom edge');
    if(right)near(after.x,initial.x,axis+' keeps left edge');
    if(bottom)near(after.y,initial.y,axis+' keeps top edge');
    if(['nw','ne','sw','se'].includes(axis))
      near(after.width/after.height,initial.width/initial.height,axis+' preserves ratio');
    if(['left','right'].includes(axis))near(after.height,initial.height,axis+' only adjusts width');
    if(['top','bottom'].includes(axis))near(after.width,initial.width,axis+' only adjusts height');
    assert.ok(Math.abs(after.width-initial.width)>4||Math.abs(after.height-initial.height)>4,
      axis+' must respond to drag');
  }
  // Shift overrides proportional scaling on a corner, as in graphical editors.
  await page.evaluate(b=>{
    const item=globalLayoutItems.find(it=>it.id==='homeBudgetWidget');
    const d={...readGlobalLayout(item),...b};saveGlobalLayout(item,d);
    applyGlobalLayout(item,d);selectHomeCanvasItem(item);
  },baseline);
  const se=await page.locator('#homeBudgetWidget .layout-resize-handle').boundingBox();
  const mx=se.x+se.width/2,my=se.y+se.height/2;
  await page.mouse.move(mx,my);
  await page.keyboard.down('Shift');
  await page.mouse.down();
  await page.mouse.move(mx+55,my+10,{steps:6});
  await page.mouse.up();
  await page.keyboard.up('Shift');
  const stretched=await page.evaluate(()=>readGlobalLayout(
    globalLayoutItems.find(it=>it.id==='homeBudgetWidget')));
  assert.ok(stretched.width>baseline.width+35);
  assert.ok(stretched.height<baseline.height+24);
  await page.reload({waitUntil:'domcontentloaded'});
  await page.locator('#journalPageNumber').waitFor();
  const persisted=await page.evaluate(()=>readGlobalLayout(
    globalLayoutItems.find(it=>it.id==='homeBudgetWidget')));
  assert.equal(persisted.width,stretched.width);
  assert.equal(persisted.height,stretched.height);

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
