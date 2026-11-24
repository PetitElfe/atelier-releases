const {chromium}=require('playwright');
const {spawn}=require('node:child_process');
const {mkdtempSync,rmSync,mkdirSync}=require('node:fs');
const {tmpdir}=require('node:os');
const {join,resolve}=require('node:path');
const assert=require('node:assert/strict');
const data=mkdtempSync(join(tmpdir(),'atelier-moodboard-')),base='http://127.0.0.1:18942';
const server=spawn('python',[resolve('app/app.py')],{env:{...process.env,ATELIER_DATA_DIR:data,ATELIER_NO_BROWSER:'1',ATELIER_PORT:'18942'},stdio:'ignore'});
async function api(path,method='GET',body){const r=await fetch(base+path,{method,headers:{'Content-Type':'application/json'},body:body===undefined?undefined:JSON.stringify(body)});const result=await r.json();if(!r.ok)throw Error(path+' '+JSON.stringify(result));return result}
async function saved(id,predicate){for(let i=0;i<100;i++){const board=await api('/api/library-moodboard?domain_id='+id);if(predicate(board))return board;await new Promise(r=>setTimeout(r,100))}throw Error('Moodboard save did not match expected state')}
(async()=>{let browser;try{
 for(let i=0;i<100;i++){try{await api('/api/runtime-version');break}catch{}await new Promise(r=>setTimeout(r,100))}
 const domain=await api('/api/objective-nodes','POST',{node_type:'domain',title:'Anglais'});
 const other=await api('/api/objective-nodes','POST',{node_type:'domain',title:'Autre espace'});
 await api('/api/objective-nodes','POST',{parent_id:domain.id,node_type:'objective',title:'A1'});
 const book=await api('/api/objective-library-sections','POST',{node_id:domain.id,title:'Cours',section_type:'notes'});
 const entry=await api('/api/objective-library-entries','POST',{section_id:book.id,title:'Articles',notes:'Ancien cours conservé'});
 browser=await chromium.launch({headless:true});const page=await browser.newPage({viewport:{width:1920,height:1080}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto(base);await page.waitForFunction(()=>state.objectiveNodes.length>0);
 async function open(id){await page.evaluate(id=>{showView('library');openLibraryDomain(id)},id);await page.waitForFunction(()=>document.querySelector('[data-mood-add=text]')?.disabled===false)}
 await open(domain.id);
 const mood=page.locator('#libraryMoodboardPanel'),bookButton=page.locator('#libraryRealShelf [data-notebook-id="'+book.id+'"]');
 await bookButton.waitFor();assert.equal(await page.locator('#pageTitle').innerText(),'Anglais');assert.ok(await mood.isVisible());assert.equal(await page.locator('#libraryOverviewPanel').isVisible(),false);
 assert.ok((await page.locator('.library-domain-head').boundingBox()).height<100,'Shelf/navigation must remain compact');
 await page.locator('[data-mood-add=text]').click();const note=mood.locator('textarea').first();await note.fill('My English corner\nDes images, des mots, des envies.');
 let persisted=await saved(domain.id,b=>b.items[0]?.text.startsWith('My English corner'));
 const card=mood.locator('.domain-mood-item').first(),handle=card.locator('.mood-move');
 const handleBox=await handle.boundingBox();await page.mouse.move(handleBox.x+20,handleBox.y+10);await page.mouse.down();await page.mouse.move(handleBox.x+210,handleBox.y+100,{steps:8});await page.mouse.up();
 persisted=await saved(domain.id,b=>b.items[0]?.x>100&&b.items[0]?.y>80);
 const resize=await card.locator('.mood-resize').boundingBox();await page.mouse.move(resize.x+10,resize.y+10);await page.mouse.down();await page.mouse.move(resize.x+90,resize.y+50,{steps:6});await page.mouse.up();
 await saved(domain.id,b=>b.items[0]?.w>300);
 const png=await page.evaluate(()=>{const c=document.createElement('canvas');c.width=280;c.height=170;const ctx=c.getContext('2d');ctx.fillStyle='#78977d';ctx.fillRect(0,0,280,170);ctx.fillStyle='#e3d8bd';ctx.fillRect(30,30,220,110);ctx.fillStyle='#394c3f';ctx.font='24px Georgia';ctx.fillText('Inspiration',70,96);return c.toDataURL('image/png').split(',')[1]});
 await page.locator('[data-mood-file]').setInputFiles({name:'Inspiration.png',mimeType:'image/png',buffer:Buffer.from(png,'base64')});await saved(domain.id,b=>b.items.length===2&&b.items[1].kind==='image');
 // Position the image separately from the text for the actual UI screenshot.
 const imageHandle=mood.locator('.domain-mood-item').nth(1).locator('.mood-move');const ib=await imageHandle.boundingBox();await page.mouse.move(ib.x+15,ib.y+10);await page.mouse.down();await page.mouse.move(ib.x+520,ib.y+65,{steps:8});await page.mouse.up();await saved(domain.id,b=>b.items[1]?.x>400);
 await page.locator('[data-mood-add=link]').click();await page.locator('#moodLinkForm input').fill('https://example.com/english');await page.locator('#moodLinkForm button[type=submit]').click();await saved(domain.id,b=>b.items.length===3);
 mkdirSync('artifacts',{recursive:true});await page.screenshot({path:'artifacts/domain-moodboard.png',fullPage:false});
 await bookButton.click();await page.locator('#libraryPageBody').waitFor();assert.ok(await page.locator('#libraryNotebookPanel').isVisible());assert.equal(await mood.isVisible(),false);assert.match(await page.locator('#libraryPageBody').innerText(),/Ancien cours conservé/);
 const editorGeometry=await page.locator('#libraryNotebookPanel').boundingBox();assert.ok(editorGeometry.width>1700&&editorGeometry.y<300,'Editor uses remaining full workspace');
 await page.screenshot({path:'artifacts/domain-notebook.png',fullPage:false});
 await page.locator('[data-domain-view=map]').click();await page.locator('#objectiveMapRoot .objective-map-node').first().waitFor();assert.ok(await page.locator('#libraryOverviewPanel').isVisible());assert.equal(await mood.isVisible(),false);await page.screenshot({path:'artifacts/domain-map.png',fullPage:false});
 await page.locator('[data-domain-view=home]').click();assert.equal(await mood.locator('.domain-mood-item').count(),3);
 await open(other.id);assert.equal(await mood.locator('.domain-mood-item').count(),0);
 await open(domain.id);assert.equal(await mood.locator('.domain-mood-item').count(),3);
 // A pending text save must not capture intermediate drag coordinates.
 const beforeCancel=await api('/api/library-moodboard?domain_id='+domain.id),origin=beforeCancel.items[0];
 await mood.locator('textarea').first().fill('Texte gardé malgré le déplacement annulé');
 const cancelHandle=mood.locator('.domain-mood-item').first().locator('.mood-move'),cb=await cancelHandle.boundingBox();
 await page.mouse.move(cb.x+20,cb.y+10);await page.mouse.down();await page.mouse.move(cb.x+150,cb.y+60,{steps:6});await page.waitForTimeout(650);
 const during=await api('/api/library-moodboard?domain_id='+domain.id);assert.equal(during.items[0].x,origin.x,'No in-progress coordinate save');
 await cancelHandle.dispatchEvent('pointercancel',{pointerId:1});await page.mouse.up();
 await saved(domain.id,b=>b.items[0]?.text==='Texte gardé malgré le déplacement annulé'&&b.items[0].x===origin.x&&b.items[0].y===origin.y);
 // Network failures retain a draft, recovered and persisted after reload.
 await page.route('**/api/library-moodboard',route=>route.request().method()==='PUT'?route.abort():route.continue());await mood.locator('textarea').first().fill('Texte conservé pendant une coupure');
 await page.waitForFunction(()=>document.querySelector('[data-mood-status]')?.textContent.includes('brouillon conservé'));
 await page.unroute('**/api/library-moodboard');await page.reload();await page.waitForFunction(()=>state.objectiveNodes.length>0);await open(domain.id);await saved(domain.id,b=>b.items[0]?.text==='Texte conservé pendant une coupure');
 // A second window's newer revision is never overwritten by the stale editor.
 const current=await api('/api/library-moodboard?domain_id='+domain.id);current.items[0].text='Version écrite dans une autre fenêtre';await api('/api/library-moodboard','PUT',current);
 await mood.locator('textarea').first().fill('Mon brouillon concurrent');await page.waitForFunction(()=>document.querySelector('[data-mood-status]')?.textContent.includes('Modifié ailleurs'));
 assert.equal((await api('/api/library-moodboard?domain_id='+domain.id)).items[0].text,'Version écrite dans une autre fenêtre');assert.equal(await mood.locator('textarea').first().inputValue(),'Mon brouillon concurrent');
 await page.reload();await page.waitForFunction(()=>state.objectiveNodes.length>0);await open(domain.id);
 await page.waitForFunction(()=>document.querySelector('[data-mood-status]')?.textContent.includes('Modifié ailleurs'));
 assert.equal(await mood.locator('textarea').first().inputValue(),'Mon brouillon concurrent');
 await page.setViewportSize({width:1280,height:800});
 assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth+1),'Compact domain must fit a smaller window');
 assert.deepEqual(errors,[]);console.log('PASS: compact header, moodboard CRUD/drag/resize/images/links, notebook preservation, route view, domain isolation, offline draft and conflict protection');
}finally{if(browser)await browser.close();server.kill();rmSync(data,{recursive:true,force:true})}})().catch(e=>{console.error(e);process.exitCode=1});
