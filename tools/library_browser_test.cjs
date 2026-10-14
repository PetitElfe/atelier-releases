// Reproduit le bug signalé : écrire -> Enregistré -> Accueil -> Bibliothèque.
const { chromium } = require('playwright');
const { spawn } = require('node:child_process');
const { mkdtempSync, rmSync } = require('node:fs');
const { tmpdir } = require('node:os');
const { join, resolve } = require('node:path');
const assert = require('node:assert/strict');
const port = 18766, base = 'http://127.0.0.1:' + port;
const data = mkdtempSync(join(tmpdir(), 'atelier-browser-'));
const appPath = resolve(__dirname, '..', 'app', 'app.py');
const proc = spawn('python', [appPath], {env:{...process.env,ATELIER_DATA_DIR:data,ATELIER_NO_BROWSER:'1',ATELIER_PORT:String(port)},stdio:'ignore'});
async function waitReady(){
 for(let i=0;i<100;i++){try{if((await fetch(base+'/api/runtime-version')).ok)return}catch{} await new Promise(r=>setTimeout(r,150))}
 throw Error('Atelier did not start');
}
async function api(path,method='GET',body){
 const r=await fetch(base+path,{method,headers:{'Content-Type':'application/json'},body:body?JSON.stringify(body):undefined});
 if(!r.ok)throw Error(path+': '+r.status);
 return r.json();
}
(async()=>{
 let browser;
 try {
  await waitReady();
  const domain=await api('/api/objective-nodes','POST',{node_type:'domain',title:'Test E2E',description:'',progress:0,status:'active'});
  const notebook=await api('/api/objective-library-sections','POST',{node_id:domain.id,title:'Carnet E2E',section_type:'notes'});
  await api('/api/objective-library-entries','POST',{section_id:notebook.id,title:'Page E2E',notes:'@@ATELIER_RICH_V1@@',url:'',done:false});
  browser=await chromium.launch({headless:true});
  const page=await browser.newPage();
  const pageErrors=[];
  page.on('pageerror',e=>{pageErrors.push(e.message);console.error('PAGE ERROR:',e.message)});
  await page.goto(base,{waitUntil:'domcontentloaded'});
  if(await page.locator('#sideNav').evaluate(el=>el.classList.contains('is-collapsed')))await page.locator('#sideNavToggle').click();
   await page.locator('.tabs button[data-view="library"]').click();
  await page.locator('.library-domain-open').filter({hasText:'Test E2E'}).click();
  await page.locator('#libraryDomainQuickContext .library-head-book').filter({hasText:'Carnet E2E'}).click();
  const editor=page.locator('#libraryPageBody');
  await editor.waitFor();
  await editor.fill('Test sauvegarde navigateur 0124');
  await page.waitForTimeout(1300);
  const status=await page.locator('#librarySaveState').textContent();
  assert.equal(status.trim(),'Enregistré','Save status after typing: '+status);
  // Contrôle géométrique du centrage après changement de page.
  await page.locator('#libraryPageReader').click();
  for(const pageNumber of [1,2]){
    await page.locator('#libraryReaderPageNumber').fill(String(pageNumber));
    await page.locator('#libraryReaderPageNumber').press('Tab');
    await page.locator('#libraryReaderPages .library-reader-sheet').first().waitFor();
    const center=await page.locator('#libraryReaderPages .library-reader-sheet').first().evaluate(el=>{
      const p=el.getBoundingClientRect(),container=document.querySelector('#libraryReaderPages').getBoundingClientRect();
      return Math.abs((p.left+p.right)/2-(container.left+container.right)/2);
    });
    assert.ok(center<5,'Reading page '+pageNumber+' off-center by '+center+'px');
  }
  await page.locator('#libraryReaderBack').click();
  await page.locator('#libraryPageBody').waitFor();
  await page.locator('#globalHomeShortcut').click();
  if(await page.locator('#sideNav').evaluate(el=>el.classList.contains('is-collapsed')))await page.locator('#sideNavToggle').click();
   await page.locator('.tabs button[data-view="library"]').click();
  await page.locator('#libraryPageBody').waitFor();
  const restored=await page.locator('#libraryPageBody').innerText();
  assert.ok(restored.includes('Test sauvegarde navigateur 0124'),'Text missing after returning from Accueil: '+restored);
  const back=await api('/api/objective-library?node_id='+domain.id);
  assert.ok(back.sections[0].entries[0].notes.includes('Test sauvegarde navigateur 0124'),'Text missing in persisted database');
  // Tester aussi la navigation avant la fin des 650 ms d'autosauvegarde.
  await page.locator('#libraryPageBody').fill('Brouillon 0124 navigation rapide');
  await page.locator('#globalHomeShortcut').click();
  if(await page.locator('#sideNav').evaluate(el=>el.classList.contains('is-collapsed')))await page.locator('#sideNavToggle').click();
   await page.locator('.tabs button[data-view="library"]').click();
  await page.locator('#libraryPageBody').waitFor();
  assert.match(await page.locator('#libraryPageBody').innerText(),/Brouillon 0124 navigation rapide/);
  await page.waitForTimeout(1500);
  await page.reload({waitUntil:'domcontentloaded'});
  if(await page.locator('#sideNav').evaluate(el=>el.classList.contains('is-collapsed')))await page.locator('#sideNavToggle').click();
   await page.locator('.tabs button[data-view="library"]').click();
  await page.locator('.library-domain-open').filter({hasText:'Test E2E'}).click();
  await page.locator('#libraryDomainQuickContext .library-head-book').filter({hasText:'Carnet E2E'}).click();
  assert.match(await page.locator('#libraryPageBody').innerText(),/Brouillon 0124 navigation rapide/);
  // Régression critique : un brouillon local restauré doit être réellement
  // renvoyé au serveur, y compris dans un nouveau domaine / carnet.
  const secondDomain=await api('/api/objective-nodes','POST',{node_type:'domain',title:'Santé mentale E2E',description:'',progress:0,status:'active'});
  const secondNotebook=await api('/api/objective-library-sections','POST',{node_id:secondDomain.id,title:'Traitement et ressentis E2E',section_type:'notes'});
  const secondPage=await api('/api/objective-library-entries','POST',{section_id:secondNotebook.id,title:'Nouvelle page',notes:'@@ATELIER_RICH_V1@@',url:'',done:false});
  await page.evaluate(({id})=>{
    localStorage.setItem('atelier-library-draft-v124-'+id,JSON.stringify({
      title:'Titre restauré',notes:'@@ATELIER_RICH_V1@@<p>Texte restauré depuis le brouillon</p>',updatedAt:Date.now()
    }));
  },{id:secondPage.id});
  // Le domaine a été créé par API après le chargement initial de l'interface :
  // recharger pour rafraîchir les domaines, sans perdre le brouillon local.
  await page.reload({waitUntil:'domcontentloaded'});
  await page.locator('#globalHomeShortcut').click();
  if(await page.locator('#sideNav').evaluate(el=>el.classList.contains('is-collapsed')))await page.locator('#sideNavToggle').click();
  await page.locator('.tabs button[data-view="library"]').click();
  await page.locator('.library-domain-open').filter({hasText:'Santé mentale E2E'}).click();
  await page.locator('#libraryDomainQuickContext .library-head-book').filter({hasText:'Traitement et ressentis E2E'}).click();
  await page.locator('#libraryPageBody').waitFor();
  assert.match(await page.locator('#libraryPageBody').innerText(),/Texte restauré depuis le brouillon/);
  await page.waitForFunction(()=>document.querySelector('#librarySaveState')?.textContent?.trim()==='Enregistré',null,{timeout:12000});
  const savedRecovered=await api('/api/objective-library?node_id='+secondDomain.id);
  assert.equal(savedRecovered.sections[0].entries[0].title,'Titre restauré');
  assert.match(savedRecovered.sections[0].entries[0].notes,/Texte restauré depuis le brouillon/,'Recovered draft must persist in SQLite');
  // Le sélecteur de domaines est masqué lorsqu'un carnet est ouvert.
  // Recharger la page pour retrouver la vue des domaines avant de rouvrir Test E2E.
  await page.reload({waitUntil:'domcontentloaded'});
  if(await page.locator('#sideNav').evaluate(el=>el.classList.contains('is-collapsed')))await page.locator('#sideNavToggle').click();
  await page.locator('.tabs button[data-view="library"]').click();
  await page.locator('.library-domain-open').filter({hasText:'Test E2E'}).click();
  await page.locator('#libraryDomainQuickContext .library-head-book').filter({hasText:'Carnet E2E'}).click();
  await page.locator('#libraryPageBody').waitFor();
  // Une feuille supplémentaire est toujours créée explicitement.
  const beforeA4=await api('/api/objective-library?node_id='+domain.id);
  const previousId=beforeA4.sections[0].entries[0].id;
  await page.locator('#libraryAddA4Sheet').click();
  await page.locator('.library-page-list-item').nth(1).waitFor();
  await page.locator('.library-page-list-item').nth(1).waitFor({state:'visible'});
  await page.waitForFunction(()=>document.querySelectorAll('.library-page-list-item').length===2&&document.querySelectorAll('.library-page-list-item')[1].classList.contains('active'));
  await page.locator('#libraryPageBody').waitFor();
  await page.locator('#libraryPageBody').fill('Texte deuxième feuille A4');
  await page.locator('#librarySaveNow').click();
  await page.waitForTimeout(850);
  const afterA4=await api('/api/objective-library?node_id='+domain.id);
  assert.equal(afterA4.sections[0].entries.length,2,'Manual A4 creates precisely one new page');
  assert.ok(afterA4.sections[0].entries.find(e=>e.id===previousId)?.notes.includes('Brouillon 0124'),'Previous page survived: '+JSON.stringify(afterA4.sections[0].entries.map(e=>({id:e.id,title:e.title,notes:e.notes.slice(0,160)}))));
  assert.ok(afterA4.sections[0].entries.some(e=>e.notes.includes('Texte deuxième feuille A4')),'Second sheet saved');
  await page.locator('.library-page-list-item').first().click();
  assert.match(await page.locator('#libraryPageBody').innerText(),/Brouillon 0124 navigation rapide/);
  // Annuler / rétablir après la saisie, sans attendre le délai de l'historique.
  await page.locator('#libraryPageBody').fill('Etat A de l editeur');
  await page.waitForTimeout(500);
  await page.locator('#libraryPageBody').fill('Etat B de l editeur');
  await page.locator('.library-format-btn[data-command="undo"]').click();
  assert.match(await page.locator('#libraryPageBody').innerText(),/Etat A de l editeur/,'Undo should work on first click');
  await page.locator('.library-format-btn[data-command="redo"]').click();
  assert.match(await page.locator('#libraryPageBody').innerText(),/Etat B de l editeur/,'Redo should restore latest edit');
  // Conserver les textes pour les tests d'export à suivre.
  await page.locator('#libraryPageBody').fill('Brouillon 0124 navigation rapide');
  await page.locator('#librarySaveNow').click();
  // Vérifier les trois téléchargements sans boîte d'impression.
  for(const format of ['HTML','TXT','PDF']){
    await page.locator('#libraryExportPage').click();
    const downloadPromise=page.waitForEvent('download');
    await page.locator('.library-export-choice').filter({hasText:format}).click();
    const download=await downloadPromise;
    assert.ok(download.suggestedFilename().toLowerCase().endsWith('.'+format.toLowerCase()),'Wrong export name: '+download.suggestedFilename());
  }
  // Mise en forme de la sélection uniquement.
  await page.locator('#libraryPageBody').fill('Texte gras et texte normal');
  await page.locator('#libraryPageBody').evaluate(el=>{
    const first=el.firstChild;
    const sel=window.getSelection(),range=document.createRange();
    range.setStart(first,0);range.setEnd(first,10);sel.removeAllRanges();sel.addRange(range);
    el.dispatchEvent(new MouseEvent('mouseup',{bubbles:true}));
  });
  await page.locator('.library-format-btn[data-command="bold"]').click();
  const formatted=await page.locator('#libraryPageBody').innerHTML();
  assert.ok(formatted.includes('Texte gras') && /<(?:b|strong)\b|font-weight\s*:\s*(?:bold|700)/i.test(formatted),'Selected words should be bold: '+formatted);
  assert.ok(!/<(?:b|strong)[^>]*>[^<]*texte normal/i.test(formatted),'Other words should remain normal');
  await page.locator('#librarySaveNow').click();
  // Lecture, retour à l'écriture et navigation entre feuilles.
  await page.locator('#libraryPageReader').click();
  await page.locator('#libraryReaderNext').click();
  await page.locator('#libraryReaderBack').click();
  await page.locator('#libraryPageBody').waitFor();
  await page.locator('#libraryPageBody').fill('Recherche cible une fois');
  await page.locator('#librarySaveNow').click();
  // Recherche dans l'éditeur, sans altérer le document.
  await page.locator('#libraryWriterFind').click();
  await page.locator('#libraryFindInput').fill('Recherche');
  assert.match(await page.locator('#libraryFindCount').textContent(),/1 \/ 1/);
  await page.locator('#libraryFindClose').click();
  await page.locator('#libraryPageReader').click();
  await page.locator('#libraryReaderToc').click();
  await page.locator('#libraryReaderTocList button').first().click();
  assert.equal(await page.locator('#libraryReaderPageNumber').inputValue(),'1','Double page starts from first sheet');
  await page.locator('#libraryReaderExpand').click();
  await page.locator('#libraryReaderSpreadToggle').click();
  const spreadGeometry=await page.locator('#libraryReaderPages').evaluate(root=>{
    const pages=[...root.querySelectorAll('.library-reader-sheet')].map(el=>el.getBoundingClientRect());
    return {count:pages.length,widths:pages.map(p=>p.width),tops:pages.map(p=>p.top)};
  });
  assert.equal(spreadGeometry.count,2,'Expected two sheets in spread mode');
  assert.ok(Math.abs(spreadGeometry.widths[0]-spreadGeometry.widths[1])<3,'Spread widths unequal');
  assert.ok(Math.abs(spreadGeometry.tops[0]-spreadGeometry.tops[1])<3,'Spread vertical alignment unequal');
  await page.locator('#libraryReaderSpreadToggle').click();
  await page.locator('#libraryReaderExpand').click();
  // Le sommaire occupe volontairement 235 px quand il est ouvert.
  // Le fermer avant de mesurer le centrage dans toute la fenêtre du lecteur.
  if(await page.locator('#libraryReaderTocPanel').isVisible())await page.locator('#libraryReaderTocClose').click();
  // À 100 %, la feuille ne doit pas déborder horizontalement du lecteur.
  const fit=await page.locator('#libraryReaderPages .library-reader-sheet').first().evaluate(el=>{
    const sheet=el.getBoundingClientRect(),frame=document.querySelector('.library-reader-layout').getBoundingClientRect();
    return {sheetWidth:sheet.width,frameWidth:frame.width};
  });
  assert.ok(fit.sheetWidth<=fit.frameWidth,'Reader sheet overflows viewport at 100%: '+JSON.stringify(fit));
  const position=await page.locator('#libraryReaderPages .library-reader-sheet').first().evaluate(el=>{
    const frame=document.querySelector('#libraryReaderPages').getBoundingClientRect(),sheet=el.getBoundingClientRect();
    return {offset:Math.abs((sheet.left+sheet.right)/2-(frame.left+frame.right)/2),sheetWidth:sheet.width};
  });
  assert.ok(position.offset<24,'Reading sheet must be centered, got '+JSON.stringify(position));
  await page.locator('#libraryZoomIn').click();
  assert.equal((await page.locator('#libraryReaderZoomLabel').textContent()).trim(),'110 %');
  await page.locator('#libraryReaderZoomLabel').click();
  assert.equal((await page.locator('#libraryReaderZoomLabel').textContent()).trim(),'100 %');
  // Revenir sur la seconde feuille, qui contient le texte de recherche.
  await page.locator('#libraryReaderPageNumber').fill('2');
  await page.locator('#libraryReaderPageNumber').press('Tab');
  console.log('READER PAGE CONTENT',JSON.stringify(await page.locator('#libraryReaderPages').innerText()));
  const afterReaderSave=await api('/api/objective-library?node_id='+domain.id);
  console.log('READER DATABASE PAGE DATA',JSON.stringify(afterReaderSave.sections[0].entries.map(x=>({id:x.id,notes:x.notes.slice(0,120)}))));
  await page.locator('#libraryReaderFind').click();
  await page.locator('#libraryFindInput').fill('Recherche');
  assert.match(await page.locator('#libraryFindCount').textContent(),/1 \/ 1/);
  await page.keyboard.press('Escape');
  assert.ok(await page.locator('#libraryFindBar').evaluate(el=>el.classList.contains('hidden')),'First Escape closes search');
  assert.ok(await page.locator('#libraryReaderPages').count(),'Escape from search must not close reader');
  await page.keyboard.press('Escape');
  await page.locator('#libraryPageBody').waitFor();
  await page.locator('#libraryPageReader').click();
  await page.locator('#libraryReaderBack').click();
  await page.locator('#libraryPageBody').waitFor();
  assert.ok(await page.locator('.library-progress-linear').count(),'Horizontal progress visible');
  await page.locator('#libraryPageReader').click();
  await page.locator('#libraryReaderExpand').click();
  await page.locator('#libraryReaderSpreadToggle').click();
  const spreadPosition=await page.locator('#libraryReaderPages .library-reader-sheet').first().evaluate(el=>{
    const area=document.querySelector('.library-reader-layout').getBoundingClientRect(),sheets=[...document.querySelectorAll('#libraryReaderPages .library-reader-sheet')].map(x=>x.getBoundingClientRect());
    const left=Math.min(...sheets.map(r=>r.left)),right=Math.max(...sheets.map(r=>r.right));
    return {count:sheets.length,offset:Math.abs((left+right)/2-(area.left+area.right)/2)};
  });
  assert.ok(spreadPosition.offset<28,'Spread must be centered, got '+JSON.stringify(spreadPosition));
  await page.locator('#libraryReaderBack').click();
  await page.locator('#libraryPageBody').waitFor();
  assert.ok(!await page.locator('body').evaluate(el=>el.classList.contains('library-page-expanded')),'X exits expanded reading');
  assert.ok(await page.locator('#libraryDomainQuickContext .library-head-books').count(),'Books beside domain title');
  // Le mode écriture agrandi se ferme aussi par X ou Échap.
  await page.locator('#libraryPageExpand').click();
  await page.locator('#libraryWritingClose').click();
  assert.ok(!await page.locator('body').evaluate(el=>el.classList.contains('library-page-expanded')),'Writing X exits expanded mode');
  await page.locator('#libraryPageExpand').click();
  await page.keyboard.press('Escape');
  assert.ok(!await page.locator('body').evaluate(el=>el.classList.contains('library-page-expanded')),'Writing Escape exits expanded mode');
  // Les liens à côté du domaine remplacent la grande colonne de gauche.
  assert.equal(await page.locator('.library-domain-sidebar').evaluate(el=>getComputedStyle(el).display),'none');
  await page.locator('#libraryQuickProgress').click();
  await page.locator('#libraryDomainQuickContext [data-notebook-id]').first().click();
  await page.locator('#libraryPageBody').waitFor();
  await page.locator('#globalHomeShortcut').click();
  assert.ok(await page.locator('body').evaluate(el=>!el.classList.contains('library-page-expanded')),'Home does not leave expanded state');

  // Régression calendrier : créer un rendez-vous depuis l'interface, attendre l'API,
  // puis vérifier sa persistance dans une base temporaire après rechargement.
  if(await page.locator('#sideNav').evaluate(el=>el.classList.contains('is-collapsed')))await page.locator('#sideNavToggle').click();
  await page.locator('.tabs button[data-view="calendar"]').click();
  await page.locator('#monthGrid .day-add').first().click();
  await page.locator('#eventForm input[name="title"]').fill('Rendez-vous persistant E2E');
  await page.locator('#eventForm input[name="event_date"]').fill('2026-10-20');
  await page.locator('#eventForm input[name="start_time"]').fill('14:30');
  await page.locator('#saveEvent').click();
  await page.locator('#eventForm').waitFor({state:'detached',timeout:12000});
  const savedAppointments=await api('/api/events?start=2026-10-20&end=2026-10-20');
  assert.ok(savedAppointments.some(e=>e.title==='Rendez-vous persistant E2E'),'Appointment must exist in SQLite after saving');
  assert.equal(await page.locator('#calendarView').evaluate(el=>el.classList.contains('active-view')),true,'Saving appointment must keep calendar visible');
  await page.reload({waitUntil:'domcontentloaded'});
  if(await page.locator('#sideNav').evaluate(el=>el.classList.contains('is-collapsed')))await page.locator('#sideNavToggle').click();
  await page.locator('.tabs button[data-view="calendar"]').click();
  await page.evaluate(()=>{state.cursor=parseYMD('2026-10-20');renderMonth()});
  await page.locator('#monthGrid .event-pill').filter({hasText:'Rendez-vous persistant E2E'}).waitFor({timeout:12000});
  // Un rappel autonome dupliqué doit conserver les valeurs éditables,
  // mais obtenir son propre identifiant après enregistrement.
  await page.evaluate(()=>showView('reminders'));
  const firstReminder=await api('/api/reminders','POST',{title:'Rappel modèle E2E',remind_at:'2026-10-21T09:00'});
  await page.reload({waitUntil:'domcontentloaded'});
  if(await page.locator('#sideNav').evaluate(el=>el.classList.contains('is-collapsed')))await page.locator('#sideNavToggle').click();
  await page.evaluate(()=>showView('reminders'));
  await page.locator('.reminder-row').filter({hasText:'Rappel modèle E2E'}).locator('.duplicate').click();
  assert.equal(await page.locator('#standaloneReminderForm input[name="title"]').inputValue(),'Rappel modèle E2E');
  await page.locator('#standaloneReminderForm input[name="title"]').fill('Rappel copie E2E');
  await page.locator('#saveStandaloneReminder').click();
  await page.locator('.reminder-row').filter({hasText:'Rappel copie E2E'}).waitFor({timeout:12000});
  const remindersAfter=await api('/api/reminders');
  assert.ok(remindersAfter.some(r=>r.title==='Rappel modèle E2E')&&remindersAfter.some(r=>r.title==='Rappel copie E2E'),'Both original reminder and copy must be kept');
  await page.locator('#globalHomeShortcut').click();
  // Organisation 0.14 : test de bout en bout sur des données temporaires.
  if(await page.locator('#sideNav').evaluate(el=>el.classList.contains('is-collapsed')))await page.locator('#sideNavToggle').click();
  await page.locator('.tabs button[data-view="organisation"]').click();
  await page.locator('#habitTitle').fill('Marche quotidienne E2E');
  await page.locator('#habitCreateForm button[type="submit"]').click();
  await page.locator('.habit-card').first().waitFor();
  assert.match(await page.locator('.habit-card').first().innerText(),/Marche quotidienne E2E/);
  await page.locator('.habit-card input[type="checkbox"]').first().check();
  await page.waitForTimeout(850);
  console.log('HABIT LABEL AFTER CHECK:',JSON.stringify(await page.locator('.habit-card-head small').first().innerText()));
  console.log('HABIT API:',JSON.stringify(await api('/api/habits')));
  assert.match(await page.locator('.habit-card-head small').first().innerText(),/1 \/ 7/);
  await page.locator('#cycleStart').fill('2026-08-01');
  await page.locator('#cycleForm button[type="submit"]').click();
  try{await page.waitForFunction(()=>document.querySelectorAll('.cycle-entry').length===1,null,{timeout:10000});}
  catch(err){
    console.log('CYCLE DIAGNOSTIC:',JSON.stringify({form:await page.locator('#cycleForm').evaluate(el=>({html:el.outerHTML,visible:!!el.offsetParent})),api:await api('/api/cycle-periods'),errors:pageErrors}));
    throw err;
  }
  // Une seule période connue doit suffire à surligner le calendrier.
  await page.locator('#globalHomeShortcut').click();
  if(await page.locator('#sideNav').evaluate(el=>el.classList.contains('is-collapsed')))await page.locator('#sideNavToggle').click();
  await page.locator('.tabs button[data-view="calendar"]').click();
  await page.evaluate(()=>{state.cursor=parseYMD("2026-08-01");renderMonth();renderWeek()});
  await page.waitForFunction(()=>document.querySelectorAll('.day-cell.cycle-recorded').length>0,null,{timeout:10000});
  const markedDay=page.locator('#monthGrid .day-cell.cycle-recorded').filter({has:page.locator('.day-number', {hasText:'1'})});
  assert.ok(await markedDay.count()>0,'Recorded 1 August must have cycle highlight');
  await page.locator('.calendar-modes button[data-calendar-mode="week"]').click();
  await page.waitForFunction(()=>document.querySelectorAll('#miniMonth .mday.cycle-recorded').length>0,null,{timeout:10000});
  await page.locator('#globalHomeShortcut').click();
  if(await page.locator('#sideNav').evaluate(el=>el.classList.contains('is-collapsed')))await page.locator('#sideNavToggle').click();
  await page.locator('.tabs button[data-view="organisation"]').click();
  await page.locator('.cycle-entry').first().waitFor();
  await page.locator('#cycleStart').fill('2026-08-29');
  await page.locator('#cycleForm button[type="submit"]').click();
  await page.waitForFunction(()=>document.querySelectorAll('.cycle-entry').length===2);
  assert.match(await page.locator('#cycleForecast').innerText(),/cycle moyen de 28 jours/);
  await page.locator('#globalHomeShortcut').click();
  if(await page.locator('#sideNav').evaluate(el=>el.classList.contains('is-collapsed')))await page.locator('#sideNavToggle').click();
  await page.locator('.tabs button[data-view="calendar"]').click();
  await page.locator('#calendarCycleHint').waitFor({state:'visible'});
  assert.match(await page.locator('#calendarCycleHint').innerText(),/Suivi du cycle/);
    assert.deepEqual(pageErrors,[],'Unexpected JavaScript exception during editor navigation');
  console.log('OK — editor saves across navigation, immediate exit and restart');
 } finally {if(browser)await browser.close();proc.kill();rmSync(data,{recursive:true,force:true})}
})().catch(e=>{console.error(e);process.exitCode=1});
