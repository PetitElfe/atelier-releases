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

  // ALPHA 0.18 — Paramètres : proposition TEST sur révision immuable.
  // Aucun téléchargement réel dans le test navigateur; le scénario Windows
  // vérifie séparément l'installation, la sauvegarde et le redémarrage.
  await page.route('**/api/update/check',route=>route.fulfill({
    status:200,contentType:'application/json',
    body:JSON.stringify({version:'0.18.0',installed_version:'0.18.0',
      available:true,channel:'TEST',revision:'a'.repeat(40),installed_build:'b23f591a'})
  }));
  await page.evaluate(()=>showView('settings'));
  await page.locator('#settingsCheckUpdates').click();
  await page.waitForFunction(()=>document.querySelector('#settingsUpdateMessage')?.textContent.includes('Nouvelle révision 0.18.0 disponible'));
  assert.equal(await page.locator('#settingsInstalledVersion').innerText(),'0.18.0 · TEST · build b23f591a');
  assert.ok(await page.locator('#settingsInstallUpdate').isVisible(),'Le bouton Installer doit apparaître quand une révision TEST est disponible');
  assert.ok(await page.locator('#settingsInstallUpdate').isEnabled(),'Le bouton Installer doit être utilisable');
  await page.evaluate(()=>localStorage.setItem('atelierUpdateSmoke','test'));
  const browserBackup=page.waitForEvent('download');
  await page.locator('#settingsExportBrowserData').click();
  assert.match((await browserBackup).suggestedFilename(),/^atelier-reglages-navigateur-.*\.json$/);
  await page.unroute('**/api/update/check');
  await page.evaluate(()=>showView('home'));

  // Post-it : création, auto-sauvegarde en SQLite, couleur et forme après F5.
  await page.locator('#homeNewPostit').click();
  await page.locator('#postitEditForm').waitFor();
  await page.locator('#postitEditForm input[name="title"]').fill('Mon Post-it de test');
  await page.locator('#postitEditForm textarea[name="body"]').fill('Un rappel important avec https://example.com');
  await page.locator('#postitEditForm select[name="color"]').selectOption('deep-green');
  await page.locator('#postitEditForm select[name="shape"]').selectOption('square');
  await page.locator('#postitEditorClose').click();
  await page.locator('#postitEditForm').waitFor({state:'detached'});
  const savedPostit=(await api('/api/postits')).find(n=>n.title==='Mon Post-it de test');
  assert.ok(savedPostit&&savedPostit.color==='deep-green'&&savedPostit.shape==='square'&&savedPostit.body.includes('example.com'),
    'Les modifications doivent être sauvegardées dans la base SQLite, pas seulement le navigateur');
  await page.reload({waitUntil:'domcontentloaded'});
  await page.locator('.home-postit[data-postit-id="'+savedPostit.id+'"]').waitFor();
  assert.ok(await page.locator('.home-postit[data-postit-id="'+savedPostit.id+'"]').evaluate(
    el=>el.classList.contains('postit-deep-green')&&el.classList.contains('postit-square')
       &&!!el.querySelector('a[href^="https://example.com"]')),
    'Le Post-it et son lien doivent réapparaître après F5');


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
  await page.locator('#libraryCompactPageSelect').waitFor({state:'visible'});
  await page.waitForFunction(()=>document.querySelector('#libraryCompactPageSelect')?.options.length===2&&
    document.querySelector('#libraryCompactPageSelect')?.selectedIndex===1);
  assert.equal(await page.locator('.library-page-sidebar').isVisible(),false,'Sidebar should give all width to the sheet');
  await page.locator('#libraryPageBody').waitFor();
  await page.locator('#libraryPageBody').fill('Texte deuxième feuille A4');
  await page.locator('#librarySaveNow').click();
  await page.waitForTimeout(850);
  const afterA4=await api('/api/objective-library?node_id='+domain.id);
  assert.equal(afterA4.sections[0].entries.length,2,'Manual A4 creates precisely one new page');
  assert.ok(afterA4.sections[0].entries.find(e=>e.id===previousId)?.notes.includes('Brouillon 0124'),'Previous page survived: '+JSON.stringify(afterA4.sections[0].entries.map(e=>({id:e.id,title:e.title,notes:e.notes.slice(0,160)}))));
  assert.ok(afterA4.sections[0].entries.some(e=>e.notes.includes('Texte deuxième feuille A4')),'Second sheet saved');
  await page.locator('#libraryCompactPageSelect').selectOption(String(previousId));
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
  await page.locator('#addReminder').click();
  await page.locator('#reminderEditor .reminder-name').fill('Rappel du rendez-vous E2E');
  await page.locator('#reminderEditor .reminder-date').fill('2026-10-19');
  await page.locator('#reminderEditor .reminder-time').fill('09:00');
  await page.locator('#saveEvent').click();
  await page.locator('#eventForm').waitFor({state:'detached',timeout:12000});
  const savedAppointments=await api('/api/events?start=2026-10-20&end=2026-10-20');
  assert.ok(savedAppointments.some(e=>e.title==='Rendez-vous persistant E2E'),'Appointment must exist in SQLite after saving');
  assert.equal(await page.locator('#calendarView').evaluate(el=>el.classList.contains('active-view')),true,'Saving appointment must keep calendar visible');

  // ALPHA 0.18.0 : le mensuel conserve 42 cases égales même si le titre est long.
  // Le choix de couleur est indépendant de la catégorie du rendez-vous.
  const longEvent=await api('/api/events','POST',{
    title:'Un rendez-vous médical dont le titre dépasse très largement la largeur de la case',
    event_date:'2026-10-20',start_time:'10:15',end_time:'13:15',
    category:'medical',color:'mauve',show_in_month:true
  });
  const allDayEvent=await api('/api/events','POST',{
    title:'Événement toute la journée E2E',event_date:'2026-10-21',all_day:true,
    color:'pink',show_in_month:true
  });
  const overlapEvent=await api('/api/events','POST',{
    title:'Deuxième rendez-vous simultané E2E',event_date:'2026-10-20',
    start_time:'11:00',end_time:'12:45',category:'general',
    color:'deep-blue',show_in_month:true
  });
  const savedColors=await api('/api/events?start=2026-10-20&end=2026-10-21');
  assert.equal(savedColors.find(e=>e.id===longEvent.id)?.color,'mauve',
    'La couleur mauve doit rester enregistrée indépendamment de la catégorie médicale');
  assert.equal(savedColors.find(e=>e.id===allDayEvent.id)?.color,'pink');
  assert.equal(savedColors.find(e=>e.id===overlapEvent.id)?.color,'deep-blue');
  await page.evaluate(async()=>{state.cursor=parseYMD('2026-10-20');await refresh()});
  const monthGeometry=await page.evaluate(()=>{
    const cells=[...document.querySelectorAll('#monthGrid .day-cell')];
    const heights=cells.map(c=>Math.round(c.getBoundingClientRect().height));
    const widths=cells.map(c=>Math.round(c.getBoundingClientRect().width));
    const pill=[...document.querySelectorAll('#monthGrid .event-pill')].find(b=>b.textContent.includes('rendez-vous médical dont'));
    return {count:cells.length,heights:[...new Set(heights)],widths:[...new Set(widths)],
      clipped:!!pill&&pill.scrollWidth>pill.clientWidth,fullTitle:pill?.title,
      pastel:!!pill&&pill.classList.contains('event-color-mauve')};
  });
  assert.equal(monthGeometry.count,42,'Le mensuel doit garder ses 42 cases');
  assert.equal(monthGeometry.heights.length,1,'Toutes les cases doivent garder la même hauteur : '+JSON.stringify(monthGeometry));
  assert.equal(monthGeometry.widths.length,1,'Toutes les cases doivent garder la même largeur : '+JSON.stringify(monthGeometry));
  assert.ok(monthGeometry.clipped&&monthGeometry.pastel&&monthGeometry.fullTitle.includes('médical'),
    'Le titre long doit être tronqué sans perdre son contenu ni sa couleur : '+JSON.stringify(monthGeometry));
  await page.evaluate(()=>renderWeek());
  const weekDuration=await page.evaluate(()=>{
    const grid=document.querySelector('#weekGrid');
    const at=(dayIndex,hour)=>grid.children[8+(hour-7)*8+1+dayIndex];
    const atTen=at(1,10),atEleven=at(1,11),atTwelve=at(1,12),atThirteen=at(1,13);
    const wedHead=grid.children[3],wedSeven=at(2,7),wedTwentyTwo=at(2,22);
    return {
      hasDuration:[atTen,atEleven,atTwelve,atThirteen].map(c=>c.classList.contains('week-duration')),
      started:atTen.classList.contains('week-duration-begin'),
      mauve:!!grid.querySelector('.week-day-layer[data-date="2026-10-20"] .week-timed-event.event-color-mauve'),
      allDayHeader:wedHead.classList.contains('week-all-day-header')&&!!wedHead.querySelector('.event-color-pink'),
      sticky:getComputedStyle(wedHead).position==='sticky',
      notAtSeven:!wedSeven.textContent.includes('Événement toute la journée'),
      allDayLine:wedSeven.classList.contains('week-duration-all-day')&&wedTwentyTwo.classList.contains('week-duration-all-day')
    };
  });
  assert.ok(weekDuration.hasDuration.every(Boolean)&&weekDuration.started&&weekDuration.mauve,
    'Le rendez-vous 10h15–13h15 doit traverser toutes les cases correspondantes : '+JSON.stringify(weekDuration));
  assert.ok(weekDuration.allDayHeader&&weekDuration.sticky&&weekDuration.notAtSeven&&weekDuration.allDayLine,
    'Un événement toute la journée doit rester en en-tête collant, pas dans la case 7h : '+JSON.stringify(weekDuration));


  // Répartition horizontale des rendez-vous chevauchants et durée proportionnelle.
  await page.evaluate(()=>{showView('calendar');setCalendarMode('week');renderWeek()});
  await page.waitForFunction(()=>document.querySelector('.week-day-layer[data-date="2026-10-20"]')?.getBoundingClientRect().width>10);
  const compactWeek=await page.evaluate(()=>{
    const day=document.querySelector('.week-day-layer[data-date="2026-10-20"]');
    const cards=[...day.querySelectorAll('.week-timed-event')];
    const mauve=cards.find(c=>c.classList.contains('event-color-mauve'));
    const blue=cards.find(c=>c.classList.contains('event-color-deep-blue'));
    const r1=mauve?.getBoundingClientRect(),r2=blue?.getBoundingClientRect();
    const scroll=document.querySelector('#weekPanel .week-scroll');
    const hour=document.querySelector('#weekGrid .week-slot').getBoundingClientRect().height;
    return {
      overlapping:!!r1&&!!r2&&r1.bottom>r2.top&&r2.bottom>r1.top,
      adjacent:!!r1&&!!r2&&Math.abs(r1.right-r2.left)<8,
      blue:!!blue,dayWidth:day.getBoundingClientRect().width,
      cardHeight:Math.round(r1?.height||0),hourHeight:hour,
      viewport:window.innerHeight,
      weekHeight:scroll.getBoundingClientRect().height,
      scrollBottom:Math.round(scroll.getBoundingClientRect().bottom),
      scrollHeight:scroll.scrollHeight,clientHeight:scroll.clientHeight,
      overflowY:getComputedStyle(scroll).overflowY,
      noVerticalOverflow:(getComputedStyle(scroll).overflowY==='visible'&&
        scroll.getBoundingClientRect().bottom<=window.innerHeight+10)||
        scroll.scrollHeight<=scroll.clientHeight+3
    };
  });
  assert.ok(compactWeek.overlapping&&compactWeek.adjacent&&compactWeek.blue,
    'Deux rendez-vous simultanés doivent tenir côte à côte : '+JSON.stringify(compactWeek));
  assert.ok(compactWeek.cardHeight>compactWeek.hourHeight*2.7,
    'La hauteur du rendez-vous doit représenter sa durée : '+JSON.stringify(compactWeek));
  assert.ok(compactWeek.noVerticalOverflow,
    'La grille hebdomadaire compacte doit tenir sans défilement interne : '+JSON.stringify(compactWeek));
  const timedCard=page.locator('.week-day-layer[data-date="2026-10-20"] .week-timed-event.event-color-mauve');
  await timedCard.hover();
  assert.ok(await timedCard.locator('.calendar-hover-action.done').isVisible(),
    'Les actions rapides doivent apparaître au survol du rendez-vous');
  assert.ok((await timedCard.locator('.week-card-open').getAttribute('title')).includes('rendez-vous médical'),
    'Un titre complet doit rester consultable comme une infobulle');
  await timedCard.locator('.calendar-hover-action.done').click();
  await page.waitForFunction(async({id})=>{
    const response=await fetch('/api/events?start=2026-10-20&end=2026-10-20');
    const events=await response.json();
    return events.some(e=>e.id===id&&e.instance_done);
  },{id:longEvent.id});
  await page.locator('.week-day-layer[data-date="2026-10-20"] .week-timed-event.event-color-mauve .calendar-hover-action.done').waitFor({state:'detached',timeout:10000});
  assert.ok(await page.locator('.week-day-layer[data-date="2026-10-20"] .week-timed-event.event-color-mauve.event-instance-closed').count(),
    'La coche doit marquer uniquement cette occurrence et fermer ses actions');
  // Ces événements de démonstration sont gardés dans la base de test mais
  // masqués du mensuel : sinon le scénario de glisser-déposer plus loin se
  // retrouve dans le « + autres » au-delà des trois premières étiquettes.
  await api('/api/events/'+longEvent.id,'PUT',{show_in_month:false});
  await api('/api/events/'+overlapEvent.id,'PUT',{show_in_month:false});
  await page.evaluate(()=>setCalendarMode('month'));

  await page.reload({waitUntil:'domcontentloaded'});
  if(await page.locator('#sideNav').evaluate(el=>el.classList.contains('is-collapsed')))await page.locator('#sideNavToggle').click();
  await page.locator('.tabs button[data-view="calendar"]').click();
  await page.evaluate(()=>{state.cursor=parseYMD('2026-10-20');renderMonth()});
  await page.locator('#monthGrid .event-pill').filter({hasText:'Rendez-vous persistant E2E'}).waitFor({timeout:12000});
  // La duplication reprend les rappels liés à l'événement, sans écraser l'original.
  await page.locator('#monthGrid .event-pill').filter({hasText:'Rendez-vous persistant E2E'}).click();
  await page.locator('#eventMore').click();
  await page.locator('#atelierContextMenu').getByText('Dupliquer le rendez-vous').click();
  assert.equal(await page.locator('#reminderEditor .reminder-row-edit').count(),1,'Linked reminder must be copied into the event draft');
  assert.equal(await page.locator('#reminderEditor .reminder-name').inputValue(),'Rappel du rendez-vous E2E');
  // Menu contextuel du rappel : dupliquer, puis retirer uniquement sa copie.
  await page.locator('#reminderEditor .reminder-more').first().click();
  await page.locator('#atelierContextMenu').getByText('Dupliquer le rappel').click();
  assert.equal(await page.locator('#reminderEditor .reminder-row-edit').count(),2,'Reminder duplication must create an editable row');
  await page.locator('#reminderEditor .reminder-more').last().click();
  await page.locator('#atelierContextMenu').getByText('Supprimer le rappel').click();
  assert.equal(await page.locator('#reminderEditor .reminder-row-edit').count(),1,'Deleting copied reminder must preserve original');
  await page.locator('#eventForm input[name="event_date"]').fill('2026-10-22');
  await page.locator('#saveEvent').click();
  await page.locator('#eventForm').waitFor({state:'detached',timeout:12000});
  const copiedEvents=await api('/api/events?start=2026-10-20&end=2026-10-22');
  const original=copiedEvents.find(e=>e.title==='Rendez-vous persistant E2E'&&e.instance_date==='2026-10-20');
  const copied=copiedEvents.find(e=>e.title==='Rendez-vous persistant E2E'&&e.instance_date==='2026-10-22');
  assert.ok(original&&copied&&original.id!==copied.id,'Both appointment and copy should exist');
  const linked=await api('/api/reminders');
  assert.ok(linked.some(r=>r.entity_type==='event'&&r.entity_id===copied.id&&r.title==='Rappel du rendez-vous E2E'),'Copy must save its linked reminder');
  // Supprimer l'original depuis son éditeur et confirmer par la boîte intégrée.
  await page.waitForFunction(id=>state.events.some(item=>item.id===id),original.id,{timeout:12000});
  await page.evaluate(id=>{ const item=state.events.find(ev=>ev.id===id); openEventModal(item); },original.id);
  await page.locator('#eventMore').click();
  await page.locator('#atelierContextMenu').getByText('Supprimer le rendez-vous').click();
  const deleteResponse=page.waitForResponse(r=>r.url().includes('/api/events/'+original.id)&&r.request().method()==='DELETE',{timeout:12000});
  await page.locator('#atelierDialogConfirm').click();
  assert.ok((await deleteResponse).ok(),'DELETE endpoint must confirm successful removal');
  await page.locator('#eventForm').waitFor({state:'detached',timeout:12000});
  await page.waitForFunction(async(id)=>{ const r=await fetch('/api/events?start=2026-10-20&end=2026-10-22'); const list=await r.json(); return r.ok && !list.some(item=>item.id===id); },original.id,{timeout:12000});
  const remainingEvents=await api('/api/events?start=2026-10-20&end=2026-10-22');
  assert.ok(!remainingEvents.some(e=>e.id===original.id)&&remainingEvents.some(e=>e.id===copied.id),'Deleting original must retain copy: '+JSON.stringify({originalId:original.id,copiedId:copied.id,remaining:remainingEvents.map(e=>({id:e.id,date:e.instance_date,title:e.title}))}));
  assert.ok(!(await api('/api/reminders')).some(r=>r.entity_type==='event'&&r.entity_id===original.id),'Deleting an appointment clears its reminders');
  // ALPHA 0.14.4 : la modification d'une seule occurrence récurrente
  // doit préserver le rendez-vous modèle et créer une exception autonome.
  const recurring=await api('/api/events','POST',{
    title:'Série récurrente E2E',event_date:'2026-10-20',start_time:'10:00',
    recurrence:'weekly',show_in_month:true,
    reminders:[{title:'Modèle rappel série',remind_at:'2026-10-19T09:00'}]
  });
  await page.evaluate(async id=>{
    await refresh();
    const instance=state.events.find(e=>e.id===id&&e.instance_date==='2026-10-27');
    if(!instance)throw Error('Missing recurring instance October 27');
    openEventModal(instance);
  },recurring.id);
  await page.locator('#eventForm input[name="title"]').fill('Occurrence isolée E2E');
  await page.locator('#saveEvent').click();
  await page.locator('#recurrenceSingle').click();
  await page.locator('#eventForm').waitFor({state:'detached',timeout:12000});
  // L'animation de fermeture du formulaire peut précéder la réponse API.
  await page.waitForFunction(async ()=>{
    const response=await fetch('/api/events?start=2026-10-20&end=2026-10-27');
    const rows=await response.json();
    return rows.some(e=>e.instance_date==='2026-10-27'&&e.title==='Occurrence isolée E2E');
  },null,{timeout:12000});
  // Rendering a detached recurrence instance is asynchronous: await the
  // distinct exception ID, not merely the title displayed for that date.
  await page.waitForFunction(async masterId=>{
    const response=await fetch('/api/events?start=2026-10-20&end=2026-10-27');
    const rows=await response.json();
    return rows.some(e=>e.id!==masterId&&e.instance_date==='2026-10-27'&&e.title==='Occurrence isolée E2E');
  },recurring.id,{timeout:12000});
  const octoberEvents=await api('/api/events?start=2026-10-20&end=2026-10-27');
  assert.ok(octoberEvents.some(e=>e.id===recurring.id&&e.instance_date==='2026-10-20'&&e.title==='Série récurrente E2E'),'Recurring master must not be changed');
  const exception=octoberEvents.find(e=>e.instance_date==='2026-10-27'&&e.title==='Occurrence isolée E2E'&&e.id!==recurring.id);
  assert.ok(exception,'Editing one instance must create a separate event for that occurrence');
  const exceptionReminders=await api('/api/reminders');
  assert.ok(exceptionReminders.some(r=>r.entity_id===exception.id&&r.entity_type==='event'),'Edited instance must retain a linked reminder');
  // Un rendez-vous simple doit se déplacer en place, sans doublon fantôme.
  const movable=await api('/api/events','POST',{
    title:'Glisser-déposer E2E',event_date:'2026-10-20',start_time:'14:00',
    reminders:[{title:'Rappel à déplacer E2E',remind_at:'2026-10-19T08:00'}]
  });
  await page.evaluate(async()=>{state.cursor=parseYMD('2026-10-20');await refresh()});
  const pill=page.locator('#monthGrid .event-pill').filter({hasText:'Glisser-déposer E2E'});
  const target=page.locator('#monthGrid .day-cell:not(.outside)').filter({has:page.locator('.day-number',{hasText:/^21$/})});
  await pill.dragTo(target);
  await page.waitForFunction(async id=>{
    const r=await fetch('/api/events?start=2026-10-20&end=2026-10-21');
    const items=await r.json();
    return items.some(e=>e.id===id&&e.instance_date==='2026-10-21')&&!items.some(e=>e.id===id&&e.instance_date==='2026-10-20');
  },movable.id,{timeout:12000});
  await page.waitForFunction(async id=>{
    const response=await fetch('/api/reminders');
    const reminders=await response.json();
    return reminders.some(r=>r.entity_type==='event'&&r.entity_id===id&&r.title==='Rappel à déplacer E2E'&&r.remind_at.startsWith('2026-10-20T08:00'));
  },movable.id,{timeout:12000});
  const movedReminder=(await api('/api/reminders')).find(r=>r.entity_type==='event'&&r.entity_id===movable.id&&r.title==='Rappel à déplacer E2E');
  assert.ok(movedReminder&&movedReminder.remind_at.startsWith('2026-10-20T08:00'),'Linked reminder must move by the same time delta');
  // ALPHA 0.14.5 : créer un rappel sans taper d'heure ne doit pas l'effacer.
  await page.evaluate(async()=>{state.cursor=parseYMD('2026-10-20');await refresh()});
  await page.locator('#monthGrid .day-add').first().click();
  await page.locator('#eventForm input[name="title"]').fill('Rappel auto-horaire E2E');
  await page.locator('#eventForm input[name="event_date"]').fill('2026-10-25');
  await page.locator('#addReminder').click();
  assert.equal(await page.locator('#reminderEditor .reminder-time').inputValue(),'09:00','New reminders must have a visible default hour');
  await page.locator('#reminderEditor .reminder-name').fill('Rappel sans heure manuelle');
  await page.locator('#saveEvent').click();
  await page.locator('#eventForm').waitFor({state:'detached',timeout:12000});
  const autoEvent=(await api('/api/events?start=2026-10-25&end=2026-10-25')).find(e=>e.title==='Rappel auto-horaire E2E');
  assert.ok(autoEvent,'Appointment for reminder default test must save');
  assert.ok((await api('/api/reminders')).some(r=>r.entity_id===autoEvent.id&&r.remind_at.endsWith('T09:00')),'Default-time reminder must persist');
  // Une occurrence reportée garde l'heure initiale et sa barre peut être masquée.
  const beforeMove=(await api('/api/events?start=2026-11-03&end=2026-11-04')).find(e=>e.id===recurring.id&&e.instance_date==='2026-11-03');
  assert.ok(beforeMove,'Third weekly occurrence must exist');
  const movedInstance=await api(`/api/events/${recurring.id}/postpone-instance`,'PUT',{
    instance_date:'2026-11-03',new_date:'2026-11-04',new_time:beforeMove.start_time
  });
  const movedEvent=(await api('/api/events?start=2026-11-03&end=2026-11-04')).find(e=>e.id===movedInstance.moved_event_id);
  assert.equal(movedEvent.start_time,'10:00','Postponed occurrence must retain the original hour');
  await page.evaluate(async()=>{state.cursor=parseYMD('2026-11-03');await refresh()});
  const oldPill=page.locator('#monthGrid .day-cell:not(.outside)').filter({has:page.locator('.day-number',{hasText:/^3$/})}).locator('.event-pill.event-instance-closed').filter({hasText:'Série récurrente E2E'});
  await oldPill.click({button:'right'});
  await page.locator('#atelierContextMenu').getByText('Masquer cette occurrence barrée').click();
  await page.waitForFunction(async id=>{
    const r=await fetch('/api/events?start=2026-11-03&end=2026-11-04');
    const rows=await r.json();
    return !rows.some(e=>e.id===id&&e.instance_date==='2026-11-03')
        &&rows.some(e=>e.id!==id&&e.instance_date==='2026-11-04');
  },recurring.id,{timeout:12000});
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
  // ALPHA 0.15.0 — Budget : récurrences, confirmations, solde, dettes et historique.
  await page.evaluate(()=>showView('budget'));
  await page.locator('#budgetView').waitFor({state:'visible'});
  await page.locator('#budgetBalance').waitFor({state:'visible'});
  const budgetMonth=new Date().toISOString().slice(0,7);
  const budgetDate=budgetMonth+'-01';
  const income=await api('/api/budget/rules','POST',{
    kind:'income',title:'Revenu récurrent E2E',category:'Revenus',amount:'1000',
    day_of_month:1,start_date:budgetDate
  });
  await api('/api/budget/rules','POST',{
    kind:'fixed',title:'Abonnement E2E',category:'Abonnements',amount:'19.90',
    day_of_month:1,start_date:budgetDate
  });
  const debt=await api('/api/budget/debts','POST',{
    title:'Dette E2E',total:'100',monthly:'25',day_of_month:1,start_date:budgetDate
  });
  const oneOff=await api('/api/budget/entries','POST',{
    title:'Achat prévu E2E',kind:'expense',amount:'25.50',category:'Loisirs',
    date:budgetDate,planned:true
  });
  const snapshot=await api('/api/budget?month='+budgetMonth);
  const recurringIncome=snapshot.entries.find(x=>x.rule_id===income.id);
  assert.ok(recurringIncome&&recurringIncome.status==='pending','Recurring income remains pending until user confirmation');
  assert.equal(snapshot.entries.filter(x=>x.title==='Abonnement E2E').length,1,'Subscription appears exactly once');
  assert.ok(snapshot.entries.some(x=>x.debt_id===debt.id),'Debt installment must appear');
  assert.equal(snapshot.entries.find(x=>x.id===oneOff.id).status,'pending','One-off planned expense must remain pending');
  assert.equal(snapshot.income_cents,100000,'Monthly income total must use cents');
  await api('/api/budget/'+recurringIncome.id+'/status','PUT',{status:'confirmed',amount:'990',actual_date:budgetDate});
  await api('/api/budget/'+oneOff.id+'/status','PUT',{status:'confirmed',amount:'26',actual_date:budgetDate});
  const updated=await api('/api/budget?month='+budgetMonth);
  assert.equal(updated.entries.find(x=>x.id===recurringIncome.id).amount_cents,99000,'Confirmed income can differ from planned');
  assert.equal(updated.entries.find(x=>x.id===oneOff.id).amount_cents,2600,'Confirmed expense amount must be editable');
  assert.equal(updated.entries.filter(x=>x.title==='Abonnement E2E').length,1,'Reading same month again must not duplicate subscription');
  await api('/api/budget/notes','PUT',{month:budgetMonth,notes:'Mes notes E2E'});
  assert.equal((await api('/api/budget?month='+budgetMonth)).notes,'Mes notes E2E','Monthly notes persist');
  await page.evaluate(async()=>{await loadBudget()});
  await page.locator('#budgetEntries').getByText('Revenu récurrent E2E').waitFor();
  assert.ok((await page.locator('#budgetBalance').innerText()).includes('€'),'Dashboard must show balance');
  await page.reload({waitUntil:'domcontentloaded'});
  await page.evaluate(()=>showView('budget'));
  await page.locator('#budgetEntries').getByText('Achat prévu E2E').waitFor();
  assert.equal(await page.locator('#budgetNotes').inputValue(),'Mes notes E2E','Budget note survives reload');
  // L'éditeur de confirmation interne doit proposer le montant et la date.
  const extra=await api('/api/budget/entries','POST',{
    title:'Confirmation via interface E2E',kind:'expense',amount:'15.20',
    category:'Test',date:budgetDate,planned:true
  });
  await page.evaluate(async()=>{await loadBudget()});
  const pendingRow=page.locator('#budgetEntries .budget-entry').filter({hasText:'Confirmation via interface E2E'});
  await pendingRow.getByRole('button',{name:'Confirmer'}).click();
  await page.locator('#budgetConfirmForm').waitFor({state:'visible'});
  await page.locator('#budgetConfirmForm input[name="amount"]').fill('16.40');
  await page.locator('#budgetConfirmForm button[type="submit"]').click();
  await page.waitForFunction(async id=>{
    const month=new Date().toISOString().slice(0,7);
    const rows=(await (await fetch('/api/budget?month='+month)).json()).entries;
    return rows.some(x=>x.id===id&&x.status==='confirmed'&&x.amount_cents===1640);
  },extra.id,{timeout:12000});
  // Un capital de 100 euros avec 25 euros par mois ne doit jamais
  // générer plus de 100 euros de mensualités planifiées.
  const nextFive=new Date(new Date().getFullYear(),new Date().getMonth()+5,1);
  const futureMonth=nextFive.getFullYear()+'-'+String(nextFive.getMonth()+1).padStart(2,'0');
  await api('/api/budget?month='+futureMonth);
  let scheduled=0;
  for(let offset=0;offset<=5;offset++){
    const m=new Date(new Date().getFullYear(),new Date().getMonth()+offset,1);
    const key=m.getFullYear()+'-'+String(m.getMonth()+1).padStart(2,'0');
    scheduled+=(await api('/api/budget?month='+key)).entries
      .filter(e=>e.debt_id===debt.id&&e.status!=='skipped')
      .reduce((total,e)=>total+e.amount_cents,0);
  }
  assert.equal(scheduled,10000,'Debt scheduled installments must stop at the initial amount');
  await page.evaluate(()=>showView('home'));
  await page.locator('#homeBudgetWidget').waitFor({state:'visible'});
  // ALPHA 0.15.1 — Un seul éditeur : dépense immédiate, revenu récurrent différé.
  await page.evaluate(()=>showView('budget'));
  await page.locator('#budgetAddOperation').click();
  await page.locator('#budgetUnifiedForm').waitFor({state:'visible'});
  await page.locator('#budgetUnifiedForm input[name="amount"]').fill('13.40');
  await page.locator('#budgetUnifiedForm input[name="title"]').fill('Dépense rapide E2E');
  assert.equal(await page.locator('#budgetWhenWrap').isVisible(),false,'A new operation defaults to now');
  await page.locator('#budgetEditorSave').click();
  await page.waitForFunction(async()=>{
    const k=new Date().toISOString().slice(0,7);
    return (await (await fetch('/api/budget?month='+k)).json()).entries.some(e=>e.title==='Dépense rapide E2E'&&e.amount_cents===1340&&e.status==='confirmed');
  },null,{timeout:10000});
  await page.locator('#budgetAddOperation').click();
  await page.locator('#budgetUnifiedForm .budget-kind[data-kind="income"]').click();
  await page.locator('#budgetUnifiedForm input[name="amount"]').fill('550');
  await page.locator('#budgetUnifiedForm input[name="title"]').fill('Revenu futur E2E');
  await page.locator('#budgetUnifiedForm input[value="later"][name="timing"]').check();
  await page.locator('#budgetUnifiedForm input[name="date"]').fill('2026-11-12');
  await page.locator('#budgetUnifiedForm input[name="repeat"]').check();
  await page.locator('#budgetMoreOptions summary').click();
  await page.locator('#budgetUnifiedForm input[name="end_date"]').fill('2027-03-12');
  await page.locator('#budgetEditorSave').click();
  await page.waitForFunction(async()=>{
    return (await (await fetch('/api/budget?month=2026-11')).json()).rules.some(r=>r.title==='Revenu futur E2E'&&r.day_of_month===12&&r.start_date==='2026-11-12'&&r.end_date==='2027-03-12');
  },null,{timeout:10000});
  // Titres du tiroir : modification persistante après rechargement.
  await page.evaluate(()=>setSideNavCollapsed(false));
  await page.locator('#renameNavButton').click();
  await page.locator('#atelierNavRenameForm input[name="budget"]').fill('Mes finances');
  await page.locator('#atelierNavRenameForm button[type="submit"]').click();
  assert.equal((await page.locator('#sideNav [data-view="budget"]').innerText()).trim(),'Mes finances');
  assert.equal(await page.locator('#pageTitle').innerText(),'Mes finances');
  // Renommer et déplacer une carte du Budget via le mode Modifier.
  await page.locator('#globalLayoutEdit').click();
  const ledger=page.locator('#budgetLedgerPanel');
  await ledger.locator(':scope > .layout-controls .layout-rename-handle').click();
  await page.locator('#moduleRenameForm input[name="name"]').fill('Mon historique');
  await page.locator('#moduleRenameForm button[type="submit"]').click();
  assert.equal(await ledger.locator(':scope > h3').innerText(),'Mon historique');
  const grip=ledger.locator(':scope > .layout-controls .layout-move-handle');
  const rect=await grip.boundingBox();
  assert.ok(rect,'The layout drag handle must be displayed');
  await page.mouse.move(rect.x+rect.width/2,rect.y+rect.height/2);
  await page.mouse.down();
  await page.mouse.move(rect.x+rect.width/2+34,rect.y+rect.height/2+12,{steps:4});
  await page.mouse.up();
  assert.ok(await page.evaluate(()=>Math.abs(JSON.parse(localStorage.getItem('atelierModuleLayout_budget_budgetLedgerPanel')).x)>10),'The module position must be saved');
  await page.locator('#globalLayoutEdit').click();
  await page.reload({waitUntil:'domcontentloaded'});
  await page.evaluate(()=>showView('budget'));
  assert.equal((await page.locator('#sideNav [data-view="budget"]').innerText()).trim(),'Mes finances','Drawer rename persists after reload');
  assert.equal(await page.locator('#budgetLedgerPanel > h3').innerText(),'Mon historique','Card title persists after reload');
  assert.ok(await page.evaluate(()=>Math.abs(JSON.parse(localStorage.getItem('atelierModuleLayout_budget_budgetLedgerPanel')).x)>10),'Card position persists after reload');
  // Toutes les rubriques principales reçoivent aussi des poignées de modules.
  await page.evaluate(()=>showView('organisation'));
  assert.equal(await page.locator('#organisationView .organisation-module.layout-object').count(),2,'Habit and cycle modules can be moved');
  await page.evaluate(()=>showView('kitchen'));
  assert.equal(await page.locator('#kitchenView .kitchen-panel.layout-object').count(),3,'All kitchen modules can be moved');
  await page.locator('#globalLayoutEdit').click();
  const shopping=page.locator('#shoppingPanel');
  await shopping.locator(':scope > .layout-controls .layout-rename-handle').click();
  await page.locator('#moduleRenameForm input[name="name"]').fill('Mes courses test');
  await page.locator('#moduleRenameForm button[type="submit"]').click();
  assert.equal(await shopping.locator('.kitchen-head h3').innerText(),'Mes courses test','Kitchen panel title is customizable');
  await page.locator('#globalLayoutEdit').click();
  await page.evaluate(()=>showView('settings'));
  assert.ok(await page.locator('#settingsView .settings-card.layout-object').count()>=2,'Settings modules can be moved');
  await page.evaluate(()=>showView('library'));
  assert.ok(await page.locator('#libraryView .library-side-module.layout-object').count()>=2,'Library side modules can be moved');
  await page.evaluate(()=>showView('home'));
  assert.ok(await page.locator('#homeView .journal-section.layout-object').count()>=4,'Les réglages historiques du Journal restent conservés');

  // ALPHA 0.15.2 : carte Budget compacte sur l'accueil.
  // Attendre la fin du chargement : le placement libre n'est activé qu'après les données.
  await page.waitForFunction(()=>homeCanvasReady);
  const homeCard=page.locator('#homeBudgetWidget');
  const initialRect=await homeCard.boundingBox();
  assert.ok(initialRect&&initialRect.width<=350,'Budget home widget must be a compact card');
  await page.locator('#globalLayoutEdit').click();
  // Replier le tiroir pour qu'il ne masque pas le mini-calendrier sur ce viewport.
  await page.evaluate(()=>setSideNavCollapsed(true));
  await page.waitForTimeout(240);
  // Pendant Modifier, cliquer sur le mini-calendrier NE doit PAS ouvrir Calendrier.
  await page.locator('#openCalendarCard').click();
  assert.equal(await page.evaluate(()=>state.view),'home','Edit mode protects calendar card navigation');
  // ALPHA 0.16.4 : sélectionner ne déclenche aucune navigation.
  assert.ok(await page.locator('#openCalendarCard').evaluate(el=>el.classList.contains('layout-selected')),
    'Un clic sélectionne le calendrier sans naviguer');
  await homeCard.click({position:{x:40,y:40}});
  assert.ok(await homeCard.evaluate(el=>el.classList.contains('layout-selected')),
    'Cliquer sur le Budget le sélectionne');
  assert.ok(!(await page.locator('#openCalendarCard').evaluate(el=>el.classList.contains('layout-selected'))),
    'Un seul module de l’Accueil doit être sélectionné');
  assert.ok(!(await page.locator('#journalBook .journal-section .layout-controls').first().isVisible()),
    'Les nombreuses poignées intérieures du Journal sont masquées');
  const widthHandle=homeCard.locator(':scope > .layout-controls .layout-width-handle');
  const wr=await widthHandle.boundingBox();
  assert.ok(wr,'Width handle appears during editing');
  await page.mouse.move(wr.x+wr.width/2,wr.y+wr.height/2);
  await page.mouse.down();
  await page.mouse.move(wr.x+wr.width/2+90,wr.y+wr.height/2,{steps:6});
  await page.mouse.up();
  let layout=await page.evaluate(()=>JSON.parse(localStorage.getItem('atelierHomeCanvasV2_homeBudgetWidget')));
  assert.ok(layout.width>=initialRect.width+65,'Width can change independently');
  assert.equal(layout.height,null,'Width drag must not change height');
  const nextBlock=page.locator('#homeUpcomingWidget');
  const nextBefore=(await nextBlock.boundingBox()).y;
  const calendarBefore=(await page.locator('#openCalendarCard').boundingBox()).y;
  const heightHandle=homeCard.locator(':scope > .layout-controls .layout-height-handle');
  const hr=await heightHandle.boundingBox();
  await page.mouse.move(hr.x+hr.width/2,hr.y+hr.height/2);
  await page.mouse.down();
  await page.mouse.move(hr.x+hr.width/2,hr.y+hr.height/2+70,{steps:6});
  await page.mouse.up();
  layout=await page.evaluate(()=>JSON.parse(localStorage.getItem('atelierHomeCanvasV2_homeBudgetWidget')));
  assert.ok(layout.height>=120,'Height can be adjusted independently');
  const nextAfter=(await nextBlock.boundingBox()).y;
  const calendarAfter=(await page.locator('#openCalendarCard').boundingBox()).y;
  assert.ok(Math.abs(nextAfter-nextBefore)<3,'Resizing a card vertically must not move the next section: '+JSON.stringify({nextBefore,nextAfter}));
  assert.ok(Math.abs(calendarAfter-calendarBefore)<3,'Resizing a card vertically must not move the adjacent calendar: '+JSON.stringify({calendarBefore,calendarAfter}));
  assert.ok(layout.width>=initialRect.width+65,'Height drag does not remove the width adjustment');
  // Demander confirmation avant la réinitialisation, puis permettre une annulation.
  const beforeReset=JSON.stringify(layout);
  page.once('dialog',dialog=>dialog.dismiss());
  await page.locator('#globalLayoutReset').click();
  assert.equal(JSON.stringify(await page.evaluate(()=>JSON.parse(localStorage.getItem('atelierHomeCanvasV2_homeBudgetWidget')))),beforeReset,'Dismissed reset does not erase the layout');
  page.once('dialog',dialog=>dialog.accept());
  await page.locator('#globalLayoutReset').click();
  assert.ok(await page.locator('#globalLayoutUndo').isVisible(),'Undo is available immediately after reset');
  await page.locator('#globalLayoutUndo').click();
  assert.equal(JSON.stringify(await page.evaluate(()=>JSON.parse(localStorage.getItem('atelierHomeCanvasV2_homeBudgetWidget')))),beforeReset,'Undo restores the exact original dimensions');
  await page.locator('#globalLayoutEdit').click();
  await page.reload({waitUntil:'domcontentloaded'});
  assert.ok(await page.evaluate(initialWidth=>JSON.parse(localStorage.getItem('atelierHomeCanvasV2_homeBudgetWidget')).width>initialWidth,initialRect.width),'Width survives browser reload');
  // Le clic ordinaire doit redevenir fonctionnel hors du mode Modifier.
  await page.locator('#openCalendarCard').click();
  assert.equal(await page.evaluate(()=>state.view),'calendar','Normal calendar navigation works outside edit mode');


  // ALPHA 0.18 : emplacement du tiroir à gauche après un vrai glisser et F5.
  await page.evaluate(()=>{showView('home');setSideNavCollapsed(false)});
  const sideGrip=page.locator('#sideNavDragHandle');
  // Attendre la fin de l'animation d'ouverture avant de commencer à saisir
  // le menu : une coordonnée prise pendant la transition manque la poignée.
  await sideGrip.hover({timeout:10000});
  const gripRect=await sideGrip.boundingBox();
  assert.ok(gripRect,'La poignée du tiroir est accessible');
  await page.mouse.down();
  await page.mouse.move(35,gripRect.y+gripRect.height/2,{steps:24});
  await page.mouse.up();
  const storedLeft=await page.evaluate(()=>JSON.parse(localStorage.getItem('atelierSideNavPosition'))?.left);
  assert.ok(Number.isFinite(storedLeft)&&storedLeft<100,'Le tiroir doit pouvoir aller à gauche: '+storedLeft);
  await page.reload({waitUntil:'domcontentloaded'});
  await page.evaluate(()=>setSideNavCollapsed(false));
  assert.ok(await page.locator('#sideNav').evaluate(el=>el.getBoundingClientRect().left<100),
    'Le tiroir doit rester à gauche après F5');
  assert.ok(await page.locator('#sideNav').evaluate(el=>el.classList.contains('side-nav-on-left')),
    'Le bouton du tiroir doit basculer du bon côté');
  // Une ancienne préférence partielle ne doit pas être interprétée comme x=0.
  await page.evaluate(()=>{localStorage.setItem('atelierSideNavPosition',JSON.stringify({left:null,top:96}));applySideNavPosition()});
  assert.ok(await page.locator('#sideNav').evaluate(el=>el.getBoundingClientRect().left>window.innerWidth/2),
    'Une position latérale null doit reprendre le défaut à droite');
  await page.evaluate(()=>{localStorage.removeItem('atelierSideNavPosition');applySideNavPosition();setSideNavCollapsed(true)});
  // Agrandir le mini-calendrier doit rendre ses cases et son texte plus grands.
  await page.evaluate(()=>showView('home'));
  await page.waitForFunction(()=>homeCanvasReady);
  const calendarAdaptive=await page.evaluate(()=>{
    const item=globalLayoutItems.find(x=>x.id==='calendar'&&isHomeCanvasItem(x));
    const original=readGlobalLayout(item);
    const getMetrics=()=>{
      const cell=document.querySelector('#homeMiniCalendar .hday');
      return {font:parseFloat(getComputedStyle(cell).fontSize),height:cell.getBoundingClientRect().height};
    };
    const before=getMetrics();
    const updated={...original,width:400};
    applyGlobalLayout(item,updated);
    const after=getMetrics();
    applyGlobalLayout(item,original);
    return {before,after};
  });
  assert.ok(calendarAdaptive.after.font>calendarAdaptive.before.font,
    'Le texte du mini-calendrier doit s’adapter à la largeur: '+JSON.stringify(calendarAdaptive));
  assert.ok(calendarAdaptive.after.height>calendarAdaptive.before.height+8,
    'Les cases du calendrier doivent grandir avec la carte: '+JSON.stringify(calendarAdaptive));

  // ALPHA 0.16.1 — Canvas libre : les positions absolues survivent à un rechargement.
  await page.evaluate(()=>showView('home'));
  await page.waitForFunction(()=>homeCanvasReady);
  await page.locator('#homeCanvas').waitFor({state:'visible'});
  assert.ok((await page.title()).includes('Alpha 0.18.0'),'Le titre d’onglet doit être cohérent');
  const canvasCalendar=page.locator('#openCalendarCard');
  const beforeCanvasMove=await canvasCalendar.boundingBox();
  const beforeOtherCanvas=await page.locator('#journalBook').boundingBox();
  await page.locator('#globalLayoutEdit').click();
  // Déplacement directement par la carte, sans devoir viser une minuscule poignée.
  const dragX=beforeCanvasMove.x+75,dragY=beforeCanvasMove.y+100;
  await page.mouse.move(dragX,dragY);
  await page.mouse.down();
  await page.mouse.move(dragX-45,dragY+35,{steps:5});
  await page.mouse.up();
  const afterCanvasMove=await canvasCalendar.boundingBox();
  const afterOtherCanvas=await page.locator('#journalBook').boundingBox();
  assert.ok(Math.abs(afterCanvasMove.y-beforeCanvasMove.y)>20,'Calendrier déplacé en position libre');
  assert.ok(Math.abs(afterOtherCanvas.y-beforeOtherCanvas.y)<3,'Déplacer Calendrier ne déplace pas le Journal');
  const storedCanvas=await page.evaluate(()=>localStorage.getItem('atelierHomeCanvasV2_calendar'));
  assert.ok(storedCanvas,'La position libre est conservée sous une clé indépendante');
  await page.locator('#globalLayoutEdit').click();
  await page.reload({waitUntil:'domcontentloaded'});
  await page.waitForFunction(()=>homeCanvasReady);
  await page.locator('#homeCanvas').waitFor({state:'visible'});
  const restoredCanvas=await canvasCalendar.boundingBox();
  assert.ok(Math.abs(restoredCanvas.x-afterCanvasMove.x)<4&&Math.abs(restoredCanvas.y-afterCanvasMove.y)<4,
    'La position du calendrier doit être identique après rechargement');
  assert.equal(await page.evaluate(()=>localStorage.getItem('atelierHomeCanvasV2_calendar')),storedCanvas,
    'Les coordonnées sauvegardées ne doivent pas changer au redémarrage');

  // ALPHA 0.16.0 — Catalogue sans création de données, Accueil extensible.
  await page.evaluate(()=>{showView('home');setSideNavCollapsed(true)});
  await page.waitForTimeout(260);
  assert.equal(await page.locator('#homeView').evaluate(el=>getComputedStyle(el).maxHeight),'none','Home height must be extensible on desktop');
  assert.equal(await page.evaluate(()=>getComputedStyle(document.body).overflowY),'auto','Home must remain vertically scrollable');
  // ALPHA 0.16.3 — icône maison accompagnée d'un libellé explicite.
  assert.equal(await page.locator('#globalHomeShortcut .home-shortcut-text').innerText(),'Accueil',
    'Le raccourci maison doit être compréhensible sans deviner son symbole');
  // Les contrôles d’édition de « À venir » ne doivent plus cacher le titre.
  await page.locator('#globalLayoutEdit').click();
  assert.ok(await page.locator('#homeUpcomingWidget').evaluate(el=>{
    const title=el.querySelector('#upcomingTitle')?.getBoundingClientRect();
    const controls=el.querySelector(':scope > .layout-controls');
    return title&&controls&&getComputedStyle(controls).display==='none';
  }),'À venir n’est plus recouvert par des commandes lorsqu’il n’est pas sélectionné');
  await page.locator('#globalLayoutEdit').click();
  await page.locator('#openHomeModuleLibrary').click();
  const picker=page.locator('#homeModulePicker');
  await picker.waitFor({state:'visible'});
  assert.equal(await picker.locator('input[data-module]').count(),12,'The home module library lists five widgets (including Post-it) and seven shortcuts');
  await picker.locator('input[data-module="tasks"]').check();
  await picker.locator('input[data-module="upcoming"]').uncheck();
  await picker.locator('button[type="submit"]').click();
  assert.ok(await page.locator('#homeShortcut_tasks').isVisible(),'Tasks shortcut can be added');
  assert.ok(!(await page.locator('#homeUpcomingWidget').isVisible()),'Upcoming widget can be hidden without deleting it');
  assert.ok(await page.locator('#homeView').evaluate(el=>el.classList.contains('layout-editing')),
    'Ajouter un module doit activer automatiquement Modifier');
  const newTaskPosition=await page.evaluate(()=>JSON.parse(localStorage.getItem('atelierHomeCanvasV2_homeShortcut_tasks')));
  assert.equal(newTaskPosition.y,12,'Le module ajouté arrive en haut de la page');
  assert.ok(await page.locator('#homeShortcut_tasks').evaluate(el=>{
    const c=document.querySelector('#homeCanvas').getBoundingClientRect();
    const r=el.getBoundingClientRect();
    return Math.abs((r.left+r.right)/2-(c.left+c.right)/2)<4;
  }),'Le module ajouté est centré dans l’Accueil');
  const shortcut=page.locator('#homeShortcut_tasks');
  // ALPHA 0.16.2 : un raccourci peut être remonté manuellement depuis le bas.
  // Le scénario démarre par un ajout en haut (0.16.3), puis simule un rangement
  // en bas pour vérifier le défilement automatique de la 0.16.2.
  await page.evaluate(()=>{
    const item=globalLayoutItems.find(x=>x.id==='homeShortcut_tasks'&&isHomeCanvasItem(x));
    const d=readGlobalLayout(item);
    d.y=1020;saveGlobalLayout(item,d);applyGlobalLayout(item,d);
  });
  const taskStart=await page.evaluate(()=>JSON.parse(localStorage.getItem('atelierHomeCanvasV2_homeShortcut_tasks')).y);
  assert.ok(taskStart>500,'Le raccourci de test doit se trouver sous la zone visible');
  await shortcut.scrollIntoViewIfNeeded();
  const shortcutRect=await shortcut.boundingBox();
  const dragShortcutX=shortcutRect.x+50,dragShortcutY=shortcutRect.y+105;
  await page.mouse.move(dragShortcutX,dragShortcutY);
  await page.mouse.down();
  await page.mouse.move(dragShortcutX,20,{steps:8});
  await page.waitForFunction(()=>window.scrollY<10,null,{timeout:12000});
  await page.mouse.up();
  const taskTop=await page.evaluate(()=>JSON.parse(localStorage.getItem('atelierHomeCanvasV2_homeShortcut_tasks')).y);
  assert.ok(taskTop<taskStart-350,'Le raccourci doit pouvoir remonter sur plusieurs écrans : '+JSON.stringify({taskStart,taskTop}));
  // Une seule commande discrète est affichée en dehors de la carte sélectionnée.
  assert.ok(await shortcut.evaluate(el=>{
    const title=el.querySelector('h3')?.getBoundingClientRect();
    const settings=el.querySelector('.layout-settings-handle')?.getBoundingClientRect();
    return title&&settings&&settings.bottom<=title.top;
  }),'Les réglages ne recouvrent pas le titre du raccourci');
  assert.ok(await shortcut.locator(':scope > .layout-controls .layout-settings-handle').isVisible(),'New module has an individual settings button');
  await shortcut.locator(':scope > .layout-controls .layout-settings-handle').click();
  await page.locator('#layoutModuleSettingsForm').waitFor({state:'visible'});
  assert.ok(await page.locator('#layoutBringHomeTop').isVisible(),'Un module perdu en bas peut être remonté instantanément');
  await page.locator('#layoutBringHomeTop').click();
  assert.equal(await page.evaluate(()=>JSON.parse(localStorage.getItem('atelierHomeCanvasV2_homeShortcut_tasks')).y),12,'Remonter en haut conserve le module sans reset');
  await shortcut.locator(':scope > .layout-controls .layout-settings-handle').click();
  await page.locator('#layoutModuleSettingsForm input[name="name"]').fill('Mes tâches rapides');
  await page.locator('#layoutModuleSettingsForm button[type="submit"]').click();
  assert.equal(await shortcut.locator('h3').innerText(),'Mes tâches rapides','Individual settings rename module');
  await shortcut.dblclick({position:{x:70,y:100}});
  assert.ok(await page.locator('#layoutModuleSettingsForm').isVisible(),'Edit-mode double-click on a selected card opens individual settings');
  await page.locator('#layoutSettingsCancel').click();
  await shortcut.click({position:{x:70,y:100}});
  assert.equal(await page.evaluate(()=>state.view),'home','Module click selects it without navigating during edit mode');
  await page.locator('#globalLayoutEdit').click();
  await page.reload({waitUntil:'domcontentloaded'});
  assert.ok(await page.locator('#homeShortcut_tasks').isVisible(),'Home library selection persists after reload');
  assert.ok(!(await page.locator('#homeUpcomingWidget').isVisible()),'Home hidden module persists after reload');
  assert.equal(await page.locator('#homeShortcut_tasks h3').innerText(),'Mes tâches rapides','Renamed shortcut persists after reload');
  await page.locator('#homeShortcut_tasks button[data-home-open]').click();
  assert.equal(await page.evaluate(()=>state.view),'tasks','Shortcut navigation resumes after editing');
  // Les modules masqués restent accessibles depuis le catalogue.
  await page.evaluate(()=>showView('home'));
  await page.locator('#openHomeModuleLibrary').click();
  await page.locator('#homeModulePicker input[data-module="upcoming"]').check();
  await page.locator('#homeModulePicker button[type="submit"]').click();
  assert.ok(await page.locator('#homeUpcomingWidget').isVisible(),'Hidden original widget can be restored');
  assert.ok(await page.locator('#homeView').evaluate(el=>el.classList.contains('layout-editing')),
    'Réafficher À venir doit proposer immédiatement le mode Modifier');
  await page.locator('#globalLayoutEdit').click();



  // ALPHA 0.16.3 — la barre n'existe que si un module déborde réellement.
  // Les coordonnées sont modifiées uniquement dans cette base navigateur isolée.
  await page.setViewportSize({width:1280,height:900});
  await page.evaluate(()=>{showView('home');setSideNavCollapsed(true)});
  await page.waitForFunction(()=>homeCanvasReady);
  await page.evaluate(()=>{
    for(const item of globalLayoutItems.filter(isHomeCanvasItem)){
      if(item.el.classList.contains('home-module-off'))continue;
      const d=readGlobalLayout(item);
      d.y=12;
      saveGlobalLayout(item,d);
      applyGlobalLayout(item,d);
    }
    requestHomeCanvasMeasure();
  });
  await page.waitForFunction(()=>document.documentElement.scrollHeight<=window.innerHeight+2);
  assert.ok(await page.evaluate(()=>document.documentElement.scrollHeight<=window.innerHeight+2),
    'Aucun défilement en lecture quand tous les modules tiennent à l’écran');
  await page.locator('#globalLayoutEdit').click();
  await page.waitForFunction(()=>document.documentElement.scrollHeight>window.innerHeight+150);
  await page.evaluate(()=>{
    const item=globalLayoutItems.find(x=>x.id==='homeShortcut_tasks'&&isHomeCanvasItem(x));
    const d=readGlobalLayout(item);
    d.y=window.innerHeight+260;
    saveGlobalLayout(item,d);
    applyGlobalLayout(item,d);
  });
  await page.locator('#globalLayoutEdit').click();
  await page.waitForFunction(()=>document.documentElement.scrollHeight>window.innerHeight+100);
  assert.ok(await page.evaluate(()=>document.documentElement.scrollHeight>window.innerHeight+100),
    'Le défilement apparaît après Terminer lorsqu’un module est placé plus bas');
  await page.evaluate(()=>{
    const item=globalLayoutItems.find(x=>x.id==='homeShortcut_tasks'&&isHomeCanvasItem(x));
    const d=readGlobalLayout(item);
    d.y=12;
    saveGlobalLayout(item,d);
    applyGlobalLayout(item,d);
  });
  await page.waitForFunction(()=>document.documentElement.scrollHeight<=window.innerHeight+2);
  assert.ok(await page.evaluate(()=>document.documentElement.scrollHeight<=window.innerHeight+2),
    'La barre disparaît à nouveau quand le module revient en haut');
  await page.reload({waitUntil:'domcontentloaded'});
  await page.waitForFunction(()=>homeCanvasReady);
  await page.waitForFunction(()=>document.documentElement.scrollHeight<=window.innerHeight+2);
  assert.ok(await page.evaluate(()=>document.documentElement.scrollHeight<=window.innerHeight+2),
    'Absence de barre inutile conservée après rechargement');

  // ALPHA 0.17.0 — tests transversaux en instance temporaire.
  await page.evaluate(()=>showView('calendar'));
  await page.locator('#calendarToday').click();
  assert.equal(await page.evaluate(()=>ymd(state.cursor)),await page.evaluate(()=>ymd(new Date())),'Calendrier : retour au jour courant en mode mois');
  await page.evaluate(()=>setCalendarMode('week'));
  await page.locator('#weekToday').click();
  assert.equal(await page.evaluate(()=>ymd(state.cursor)),await page.evaluate(()=>ymd(new Date())),'Calendrier : retour au jour courant en mode semaine');
  await page.evaluate(()=>showView('tasks'));
  assert.ok(await page.locator('#taskSummary').isVisible(),'Tâches : le récapitulatif est visible');
  await page.locator('#taskFilter').selectOption('active');
  assert.equal(await page.locator('#taskList .task-row.done').count(),0,'Tâches : filtre à faire');
  await page.locator('#taskFilter').selectOption('done');
  assert.equal(await page.locator('#taskList .task-row:not(.done)').count(),0,'Tâches : filtre terminées');
  await page.locator('#taskFilter').selectOption('all');
  await page.evaluate(()=>showView('reminders'));
  assert.ok((await page.locator('#reminderSummary').innerText()).length>4,'Rappels : compteur visible');
  await page.evaluate(()=>showView('kitchen'));
  for(const selector of ['#shoppingSummary','#foodSummary','#mealSummary']){
    assert.ok((await page.locator(selector).innerText()).length>4,'Cuisine : récapitulatif '+selector);
  }
  await page.evaluate(()=>showView('organisation'));
  await page.waitForFunction(()=>document.querySelector('#habitsSummary')?.textContent.length>2);
  await page.evaluate(()=>showView('budget'));
  await page.waitForFunction(()=>document.querySelector('#budgetMonth')?.value.length===7);
  const originalBudgetMonth=await page.locator('#budgetMonth').inputValue();
  await page.locator('#budgetPrevMonth').click();
  await page.waitForFunction(prev=>document.querySelector('#budgetMonth')?.value!==prev,originalBudgetMonth);
  await page.locator('#budgetNextMonth').click();
  await page.waitForFunction(prev=>document.querySelector('#budgetMonth')?.value===prev,originalBudgetMonth);
  await page.locator('#budgetCurrentMonth').click();
  assert.equal(await page.locator('#budgetMonth').inputValue(),await page.evaluate(()=>ymd(new Date()).slice(0,7)),'Budget : mois courant');
  await page.evaluate(()=>showView('settings'));
  assert.ok(await page.locator('.atelier-settings-shortcuts').isVisible(),'Paramètres : aide aux raccourcis');

    assert.deepEqual(pageErrors,[],'Unexpected JavaScript exception during editor navigation');
  console.log('OK — editor saves across navigation, immediate exit and restart');
 } finally {if(browser)await browser.close();proc.kill();rmSync(data,{recursive:true,force:true})}
})().catch(e=>{console.error(e);process.exitCode=1});
