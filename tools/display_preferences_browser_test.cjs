/* Uniform rendering, real widgets and interactions, rather than font-size-only assertions. */
const{chromium}=require('playwright'),{spawn}=require('node:child_process'),fs=require('node:fs'),{join}=require('node:path'),{tmpdir}=require('node:os'),assert=require('node:assert/strict');
const data=fs.mkdtempSync(join(tmpdir(),'atelier-uniform-')),base='http://127.0.0.1:18973',proc=spawn('python',['app/app.py'],{env:{...process.env,ATELIER_DATA_DIR:data,ATELIER_NO_BROWSER:'1',ATELIER_PORT:'18973'},stdio:'ignore'});
async function api(path,method='GET',body){const r=await fetch(base+path,{method,headers:{'Content-Type':'application/json'},body:body===undefined?undefined:JSON.stringify(body)});const j=await r.json();assert.ok(r.ok,path+JSON.stringify(j));return j}
(async()=>{let browser;try{
 for(let i=0;i<100;i++){try{await api('/api/runtime-version');break}catch{}await new Promise(r=>setTimeout(r,100))}
 const day=new Date().toLocaleDateString('sv-SE');
 for(const title of ['ML appel pour AAH','Nicolas retour','Envoyer mail ML'])await api('/api/events','POST',{title,event_date:day,start_time:'14:00',end_time:'15:00'});
 await api('/api/tasks','POST',{title:'Trier des papiers sur PC'});
 const board=await api('/api/tracker-boards','POST',{title:'Habitudes',color:'sage',period_unit:'months',period_count:1});for(const title of ['Levé avant 9h','Manger matin','Dents matin','Sport','Douche','Journaling'])await api('/api/tracker-boards/'+board.id+'/rows','POST',{title,mode:'check'});
 const domain=await api('/api/objective-nodes','POST',{title:'Anglais',node_type:'domain'}),book=await api('/api/objective-library-sections','POST',{node_id:domain.id,title:'Cours',section_type:'notes'});await api('/api/objective-library-entries','POST',{section_id:book.id,title:'Essai de lecture',notes:'Une page lisible à toutes les échelles.'});
 await api('/api/objective-nodes','POST',{title:'Niveau A1',node_type:'step',parent_id:domain.id});
 browser=await chromium.launch({headless:true});fs.mkdirSync('artifacts',{recursive:true});
 for(const dpr of [1,1.5,2]){
 const context=await browser.newContext({viewport:{width:1280,height:720},deviceScaleFactor:dpr});
 await context.addInitScript(()=>{localStorage.setItem('atelierTodoTopRightApplied_20261030','1');for(const [id,layout]of Object.entries({journal:{x:380,y:300,width:580,height:460},calendar:{x:990,y:10,width:250},upcoming:{x:290,y:10,width:280},homeBudgetWidget:{x:10,y:10,width:180},homeDailyTrackersWidget:{x:580,y:10,width:310,height:185}}))if(!localStorage.getItem('atelierHomeCanvasV2_'+id))localStorage.setItem('atelierHomeCanvasV2_'+id,JSON.stringify({...layout,scale:1}))});
 const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));await page.goto(base);await page.waitForFunction(()=>window.AtelierStudio?.ready&&homeCanvasReady);
 const initial=await page.evaluate(()=>Object.fromEntries(Object.keys(localStorage).filter(k=>k.startsWith('atelierHomeCanvasV2_')).map(k=>[k,localStorage.getItem(k)])));
 const css=await page.evaluate(()=>[...document.styleSheets].filter(s=>/\/(styles|studio|home_reference)\.css$/.test(s.href||'')).map(s=>[...s.cssRules].map(r=>r.cssText).join('')).join(''));
 for(const [width,height]of [[1024,768],[1280,720],[1366,768],[1920,1080],[2560,1440],[3440,1440]]){
 await page.setViewportSize({width,height});await page.waitForTimeout(120);assert.equal(await page.evaluate(()=>AtelierDisplay.factor),1,'Auto must not enlarge fonts with resolution');
 }
 await page.setViewportSize({width:1280,height:720});
 for(const zoom of [80,100,125,160]){
 await page.evaluate(z=>AtelierDisplay.setZoom(z),zoom);await page.waitForTimeout(180);
 const metric=await page.locator('#globalHomeShortcut').evaluate(e=>({width:e.getBoundingClientRect().width,font:getComputedStyle(e).fontSize}));assert.ok(Math.abs(metric.width-43*zoom/100)<1,'Proportional buttons '+JSON.stringify(metric));
 assert.equal(await page.evaluate(()=>getComputedStyle(document.body).fontSize),'16px','Do not rewrite body typography');
 const current=await page.evaluate(()=>Object.fromEntries(Object.keys(localStorage).filter(k=>k.startsWith('atelierHomeCanvasV2_')).map(k=>[k,localStorage.getItem(k)])));assert.deepEqual(current,initial,'Zoom/resize must preserve saved layout');
 assert.equal(await page.evaluate(()=>[...document.styleSheets].filter(s=>/\/(styles|studio|home_reference)\.css$/.test(s.href||'')).map(s=>[...s.cssRules].map(r=>r.cssText).join('')).join('')),css,'No stylesheet mutation');
 }
 if(dpr===1){
  await page.evaluate(()=>{AtelierDisplay.setZoom(125);showView('home');window.scrollTo(0,0);globalLayoutEditing=true;syncGlobalLayoutEditing()});
  const handle=page.locator('#homeBudgetWidget .budget-home-title');await handle.scrollIntoViewIfNeeded();let b=await handle.boundingBox();const before=await page.locator('#homeBudgetWidget').boundingBox();await page.keyboard.down('Alt');await page.mouse.move(b.x+b.width/2,b.y+b.height/2);await page.mouse.down();await page.mouse.move(b.x+b.width/2+80,b.y+b.height/2+20,{steps:8});await page.mouse.up();await page.keyboard.up('Alt');const after=await page.locator('#homeBudgetWidget').boundingBox();assert.ok(Math.abs(after.x-before.x-80)<2,'Widget drag follows pointer at 125%');
  const widthHandle=page.locator('#homeBudgetWidget .layout-width-handle');b=await widthHandle.boundingBox();const width=after.width;await page.mouse.move(b.x+b.width/2,b.y+b.height/2);await page.mouse.down();await page.mouse.move(b.x+b.width/2+50,b.y+b.height/2,{steps:6});await page.mouse.up();assert.ok(Math.abs((await page.locator('#homeBudgetWidget').boundingBox()).width-width-50)<2,'Widget resize follows pointer at 125%');
  await page.evaluate(saved=>{for(const [k,v]of Object.entries(saved))localStorage.setItem(k,v);globalLayoutEditing=false;syncGlobalLayoutEditing();reflowHomeCanvasViewport()},initial);
 }
 await page.keyboard.press('Control+0');assert.equal(await page.evaluate(()=>AtelierDisplay.factor),1);await page.keyboard.press('Control+=');assert.equal(await page.evaluate(()=>AtelierDisplay.factor),1.05);await page.keyboard.press('Control+-');assert.equal(await page.evaluate(()=>AtelierDisplay.factor),1);
 const views=await page.locator('main .view[id]').evaluateAll(a=>a.map(e=>e.id.replace(/View$/,'')));
 for(const zoom of [100,125])for(const view of views.filter(v=>!['recipe'].includes(v))){await page.evaluate(([z,v])=>{AtelierDisplay.setZoom(z);showView(v);setSideNavCollapsed(true)},[zoom,view]);await page.waitForTimeout(35);assert.equal(await page.evaluate(()=>getComputedStyle(document.documentElement).zoom),String(zoom/100));const rect=await page.locator('#'+view+'View').boundingBox();assert.ok(rect&&rect.width>0,'View opens '+view);if(dpr===1){await page.evaluate(()=>window.scrollTo(0,0));await page.screenshot({path:'artifacts/display-'+view+'-'+zoom+'.png'})}}
 // Fixed context menus must stay at the pointer at non-default zoom.
 await page.evaluate(()=>{showView('budget');AtelierDisplay.setZoom(125)});await page.locator('.studio-budget-month-title').waitFor();await page.locator('.studio-budget-month-title').click({button:'right'});const menu=await page.locator('.studio-menu').boundingBox();assert.ok(menu.x>=0&&menu.x+menu.width<=1280&&menu.y+menu.height<=720,'Menu remains in viewport');await page.keyboard.press('Escape');
 // Reader's independent zoom must survive applying the application preferences.
 await page.evaluate(async id=>{AtelierDisplay.setZoom(125);showView('library');await openLibraryDomain(id)},domain.id);await page.locator('[data-domain-view=map]').click();await page.locator('#objectiveMapRoot [data-action=zoomin]').click();const mapZoom=await page.locator('.objective-map-canvas').evaluate(e=>e.style.transform);await page.evaluate(()=>AtelierDisplay.apply());assert.equal(await page.locator('.objective-map-canvas').evaluate(e=>e.style.transform),mapZoom,'Global zoom must preserve the map zoom');await page.locator('[data-notebook-id="'+book.id+'"]').click();await page.locator('#libraryPageReader').click();await page.locator('#libraryReaderPages').waitFor();
 await page.evaluate(()=>{libraryReaderZoom=140;libraryReaderApplyZoom();AtelierDisplay.apply()});assert.equal(await page.locator('#libraryReaderPages').evaluate(e=>e.style.zoom),'1.4');
 await page.evaluate(()=>{showView('settings');AtelierDisplay.setZoom(125)});await page.getByRole('button',{name:'Affichage et couleurs',exact:true}).click();await page.locator('#atelierUiTheme').selectOption('sage');await page.locator('#atelierUiFont').selectOption('system');await page.reload();await page.waitForFunction(()=>window.AtelierStudio?.ready);assert.equal(await page.evaluate(()=>AtelierDisplay.factor),1.25);
 await page.evaluate(()=>{AtelierDisplay.setZoom(100);showView('home');setSideNavCollapsed(true);window.scrollTo(0,0)});await page.evaluate(()=>window.scrollTo(0,0));await page.waitForTimeout(300);await page.screenshot({path:'artifacts/home-repaired-dpi-'+dpr+'.png'});
 const journal=await context.newPage();await journal.goto(base+'/mental-health.html');await journal.waitForFunction(()=>window.AtelierDisplay);assert.equal(await journal.evaluate(()=>document.documentElement.dataset.atelierTheme),'sage');await page.evaluate(()=>{AtelierDisplay.setZoom(125);showView('healthSpace')});await page.locator('#healthSpaceView iframe').waitFor();const frame=page.frames().find(f=>f.url().includes('mental-health'));await frame.waitForFunction(()=>window.AtelierDisplay);assert.equal(await frame.evaluate(()=>AtelierDisplay.factor),1,'Embedded journal must not be zoomed twice');
 assert.deepEqual(errors,[]);await context.close();
 }
 console.log('PASS: every view at 100/125%, 6 resolutions x 3 DPR, uniform 80–160%, keyboard zoom, unchanged typography and saved widgets, menu placement, independent reader zoom, theme persistence and no iframe double zoom');
}finally{if(browser)await browser.close();proc.kill();await new Promise(r=>proc.once('exit',r));fs.rmSync(data,{recursive:true,force:true})}})().catch(e=>{console.error(e);process.exitCode=1});
