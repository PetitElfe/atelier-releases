/* Accueil : parcours E2E depuis une SQLite et un navigateur jetables. */
const {chromium}=require('playwright');
const {spawn}=require('node:child_process');
const {mkdtempSync,rmSync}=require('node:fs');
const {tmpdir}=require('node:os');
const {join,resolve}=require('node:path');
const assert=require('node:assert/strict');
const port=18912,base='http://127.0.0.1:'+port;
const data=mkdtempSync(join(tmpdir(),'atelier-accueil-ref-'));
const server=spawn('python',[resolve(__dirname,'..','app','app.py')],{
  env:{...process.env,ATELIER_DATA_DIR:data,ATELIER_PORT:String(port),ATELIER_NO_BROWSER:'1'},stdio:'ignore'
});
const ymd=d=>[d.getFullYear(),String(d.getMonth()+1).padStart(2,'0'),String(d.getDate()).padStart(2,'0')].join('-');
const api=async(path,method='GET',body)=>{
  const response=await fetch(base+path,{method,headers:{'Content-Type':'application/json'},
    body:body===undefined?undefined:JSON.stringify(body)});
  const text=await response.text();
  if(!response.ok)throw Error(method+' '+path+' : '+response.status+' '+text);
  return JSON.parse(text||'{}');
};
(async()=>{
 let browser;
 try{
  let ready=false;for(let i=0;i<120;i++){try{if((await fetch(base+'/api/version')).ok){ready=true;break}}catch(_){}await new Promise(r=>setTimeout(r,140))}
  assert.ok(ready,'Le serveur TEST temporaire démarre');
  const now=new Date(),today=ymd(now),yesterday=new Date(now);yesterday.setDate(yesterday.getDate()-1);
  const task=await api('/api/tasks','POST',{title:'Tâche d’hier à terminer',due_date:ymd(yesterday)});
  const domain=await api('/api/objective-nodes','POST',{node_type:'domain',title:'Accueil visuel'});
  for(let i=1;i<=5;i++)await api('/api/objective-nodes','POST',{node_type:'objective',parent_id:domain.id,title:'Objectif '+i,progress:i*10});
  const future=new Date(now);future.setDate(future.getDate()+1);
  for(let i=1;i<=6;i++)await api('/api/events','POST',{title:'Accueil rendez-vous '+i,event_date:ymd(future),
    start_time:String(9+i).padStart(2,'0')+':00',show_in_month:true});
  browser=await chromium.launch({headless:true});
  const page=await browser.newPage({viewport:{width:1550,height:960}});
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto(base,{waitUntil:'domcontentloaded'});
  await page.waitForFunction(()=>homeCanvasReady&&!!document.getElementById('homeCanvas'),null,{timeout:15000});
  await page.evaluate(async()=>{await refresh();showView('home');renderHome()});
  await page.waitForFunction(()=>document.querySelectorAll('#homeObjectiveSuggestions .objective-note').length===3);
  assert.equal(await page.locator('#homeObjectiveSuggestions .objective-note').count(),3,'Seulement trois objectifs prioritaires');
  assert.equal((await page.locator('#journalBook .journal-primary-content .journal-heading').allTextContents()).includes('Activité'),true);
  assert.equal(await page.locator('#homeMealIdeaPicker').isVisible(),false,'Les recettes ne sont plus sur la première double page');
  assert.ok(await page.locator('#sideNavHeaderToggle').isVisible(),'Menu hamburger visible');
  assert.ok(await page.locator('#quickPostitsHeader').isVisible(),'Raccourci Post-it visible');
  assert.ok(await page.locator('#homeJournalWeekLink').isVisible(),'Semaine accessible depuis le carnet');
  await page.waitForFunction(()=>document.querySelector('#topXpLevel .top-xp-track'));
  assert.ok(await page.locator('#topXpLevel [role=progressbar]').count()===1,'La barre XP est réelle');
  const drawer=page.locator('#sideNav');
  await page.locator('#sideNavHeaderToggle').click();
  assert.equal(await drawer.evaluate(el=>el.classList.contains('is-collapsed')),true);
  await page.locator('#sideNavHeaderToggle').click();
  assert.equal(await drawer.evaluate(el=>el.classList.contains('is-collapsed')),false);
  await page.locator('#sideNavHeaderToggle').click();
  assert.equal(await page.locator('#homeObjectiveSuggestions .objective-progress-track').count(),3,'Jauges de progression lisibles');
  assert.ok(await page.locator('#homeAllObjectives').isVisible(),'Accès à tous les objectifs');
  await page.locator('#homeAllObjectives').click();
  assert.ok(await page.locator('#libraryView').isVisible(),'Le lien de bibliothèque est fonctionnel');
  await page.evaluate(()=>showView('home'));
  const taskRow=page.locator('#homeTodayTasks .journal-task').filter({hasText:'Tâche d’hier à terminer'});
  assert.ok(await page.locator('#homeTodoPreview .home-todo-row').filter({hasText:'Tâche d’hier à terminer'}).isVisible(),'La To-do list montre les vraies tâches');
  await taskRow.locator('input').check();
  await page.waitForFunction(async id=>(await (await fetch('/api/tasks',{cache:'no-store'})).json()).find(x=>x.id===id)?.completed,task.id);
  await page.reload({waitUntil:'domcontentloaded'});
  await page.waitForFunction(()=>document.querySelector('#homeTodayTasks .journal-task.is-completed'),null,{timeout:15000});
  assert.equal(await taskRow.locator('input').isChecked(),true,'Le journal garde la tâche cochée après F5');
  await taskRow.locator('input').uncheck();
  await page.waitForFunction(async id=>!(await (await fetch('/api/tasks',{cache:'no-store'})).json()).find(x=>x.id===id)?.completed,task.id);
  await page.locator('#homeUpcoming .home-upcoming-toggle').waitFor();
  assert.equal(await page.locator('#homeUpcoming .home-appt-row').count(),3);
  await page.locator('#homeUpcoming .home-upcoming-toggle').click();
  assert.equal(await page.locator('#homeUpcoming .home-appt-row').count(),6);
  assert.ok(await page.locator('#homeUpcoming').evaluate(el=>el.getBoundingClientRect().height<=375),
    'Le volet des rendez-vous garde une hauteur compacte');
  await page.locator('#homeUpcoming .home-upcoming-toggle').click();
  assert.equal(await page.locator('#homeUpcoming .home-appt-row').count(),3);
  await page.locator('#journalNextPage').click();
  assert.ok(await page.locator('#journalBook').evaluate(el=>el.classList.contains('journal-page-2')));
  assert.ok(await page.locator('#homeMealIdeaPicker').isVisible(),'Recettes conservées aux pages suivantes');
  await page.locator('#journalPrevPage').click();
  assert.equal(await page.locator('#journalPageNumber').innerText(),'1–2');
  const before=await page.evaluate(()=>JSON.parse(localStorage.getItem('atelierHomeCanvasV2_journal')));
  await page.locator('#quickAddHomeModule').click();
  await page.locator('#homeApplyReferenceLayout').waitFor();
  assert.equal(await page.locator('#homeRestorePreviousLayout').isDisabled(),true);
  await page.locator('#homeApplyReferenceLayout').click();
  const applied=await page.evaluate(()=>({layout:JSON.parse(localStorage.getItem('atelierHomeCanvasV2_journal')),
    backup:localStorage.getItem('atelierHomeReferenceBackup_20261029')}));
  assert.ok(applied.layout.width>=570,'Le livre prend une vraie largeur de double page');
  assert.ok(applied.backup,'Les anciennes positions sont sauvegardées');
  await page.locator('#quickAddHomeModule').click();
  await page.locator('#homeRestorePreviousLayout').click();
  assert.deepEqual(await page.evaluate(()=>JSON.parse(localStorage.getItem('atelierHomeCanvasV2_journal'))),before,
    'Restauration exacte de l’ancienne disposition');
  assert.deepEqual(errors,[],'Aucune erreur JS sur les fonctions de l’Accueil');
  console.log('PASS: Accueil — trois objectifs, tâche cochée après F5, volet compact, livre et disposition réversible');
 }finally{if(browser)await browser.close();server.kill();rmSync(data,{recursive:true,force:true})}
})().catch(error=>{console.error(error);process.exitCode=1});
