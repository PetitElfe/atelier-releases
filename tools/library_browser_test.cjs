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
  await page.locator('.tabs button[data-view="library"]').click();
  await page.locator('.library-domain-open').filter({hasText:'Test E2E'}).click();
  await page.locator('.library-notebook-link').filter({hasText:'Carnet E2E'}).click();
  const editor=page.locator('#libraryPageBody');
  await editor.waitFor();
  await editor.fill('Test sauvegarde navigateur 0124');
  await page.waitForTimeout(1300);
  const status=await page.locator('#librarySaveState').textContent();
  assert.equal(status.trim(),'Enregistré','Save status after typing: '+status);
  await page.locator('.tabs button[data-view="home"]').click();
  await page.locator('.tabs button[data-view="library"]').click();
  await page.locator('#libraryPageBody').waitFor();
  const restored=await page.locator('#libraryPageBody').innerText();
  assert.ok(restored.includes('Test sauvegarde navigateur 0124'),'Text missing after returning from Accueil: '+restored);
  const back=await api('/api/objective-library?node_id='+domain.id);
  assert.ok(back.sections[0].entries[0].notes.includes('Test sauvegarde navigateur 0124'),'Text missing in persisted database');
  // Tester aussi la navigation avant la fin des 650 ms d'autosauvegarde.
  await page.locator('#libraryPageBody').fill('Brouillon 0124 navigation rapide');
  await page.locator('.tabs button[data-view="home"]').click();
  await page.locator('.tabs button[data-view="library"]').click();
  await page.locator('#libraryPageBody').waitFor();
  assert.match(await page.locator('#libraryPageBody').innerText(),/Brouillon 0124 navigation rapide/);
  await page.waitForTimeout(1500);
  await page.reload({waitUntil:'domcontentloaded'});
  await page.locator('.tabs button[data-view="library"]').click();
  await page.locator('.library-domain-open').filter({hasText:'Test E2E'}).click();
  await page.locator('.library-notebook-link').filter({hasText:'Carnet E2E'}).click();
  assert.match(await page.locator('#libraryPageBody').innerText(),/Brouillon 0124 navigation rapide/);
  // Une feuille supplémentaire est toujours créée explicitement.
  const beforeA4=await api('/api/objective-library?node_id='+domain.id);
  const previousId=beforeA4.sections[0].entries[0].id;
  await page.locator('#libraryAddA4Sheet').click();
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
  // Vérifier les trois téléchargements sans boîte d'impression.
  for(const format of ['HTML','TXT','PDF']){
    await page.locator('#libraryExportPage').click();
    const downloadPromise=page.waitForEvent('download');
    await page.locator('.library-export-choice').filter({hasText:format}).click();
    const download=await downloadPromise;
    assert.ok(download.suggestedFilename().toLowerCase().endsWith('.'+format.toLowerCase()),'Wrong export name: '+download.suggestedFilename());
  }
  assert.deepEqual(pageErrors,[],'Unexpected JavaScript exception during editor navigation');
  console.log('OK — editor saves across navigation, immediate exit and restart');
 } finally {if(browser)await browser.close();proc.kill();rmSync(data,{recursive:true,force:true})}
})().catch(e=>{console.error(e);process.exitCode=1});
