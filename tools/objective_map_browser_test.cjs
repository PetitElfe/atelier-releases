/* Integration regression for 0.18 map: isolated temp database, no local user data. */
const { chromium }=require('playwright');
const { spawn }=require('node:child_process');
const { mkdtempSync, rmSync }=require('node:fs');
const { tmpdir }=require('node:os');
const { join,resolve }=require('node:path');
const assert=require('node:assert/strict');
const port=18791,base='http://127.0.0.1:'+port;
const data=mkdtempSync(join(tmpdir(),'atelier-0180-map-'));
const appPath=resolve(__dirname,'..','app','app.py');
const server=spawn('python',[appPath],{env:{...process.env,ATELIER_DATA_DIR:data,ATELIER_NO_BROWSER:'1',ATELIER_PORT:String(port)},stdio:'ignore'});
async function ready(){for(let i=0;i<120;i++){try{if((await fetch(base+'/api/runtime-version')).ok)return}catch{}await new Promise(r=>setTimeout(r,120))}throw Error('Server startup timeout')}
async function api(path,method='GET',body){
 const response=await fetch(base+path,{method,cache:'no-store',headers:{'Content-Type':'application/json'},body:body===undefined?undefined:JSON.stringify(body)});
 const result=await response.json();if(!response.ok)throw Error(path+' '+response.status+' '+JSON.stringify(result));return result;
}
(async()=>{
 let browser;
 try{
  await ready();
  // End-to-end habit reward: one XP event per day, even if unchecked/rechecked.
  const habit=await api('/api/habits','POST',{title:'Habitude XP E2E',frequency:'daily',target_per_week:7});
  const today=new Date().toISOString().slice(0,10);
  const check='/api/habits/'+habit.id+'/check';
  await api(check,'PUT',{date:today,done:true});
  assert.equal((await api('/api/progression')).total_xp,5);
  await api(check,'PUT',{date:today,done:true});
  assert.equal((await api('/api/progression')).total_xp,5);
  await api(check,'PUT',{date:today,done:false});
  await api(check,'PUT',{date:today,done:true});
  assert.equal((await api('/api/progression')).total_xp,5);
  const tooOld=new Date(Date.now()-9*86400000).toISOString().slice(0,10);
  await api(check,'PUT',{date:tooOld,done:true});
  assert.equal((await api('/api/progression')).total_xp,5);
  const domain=await api('/api/objective-nodes','POST',{node_type:'domain',title:'Cartes E2E'});
  const a=await api('/api/objective-nodes','POST',{node_type:'step',parent_id:domain.id,title:'Étape initiale'});
  const b=await api('/api/objective-nodes','POST',{node_type:'step',parent_id:domain.id,title:'Étape finale'});
  browser=await chromium.launch({headless:true});const page=await browser.newPage();
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto(base,{waitUntil:'domcontentloaded'});
  if(await page.locator('#sideNav').evaluate(el=>el.classList.contains('is-collapsed')))await page.locator('#sideNavToggle').click();
  await page.locator('.tabs button[data-view="library"]').click();
  await page.locator('.library-domain-open').filter({hasText:'Cartes E2E'}).click();
  const root=page.locator('#objectiveMapRoot');
  await root.locator('.objective-map-node').first().waitFor({timeout:10000});
  assert.equal(await root.locator('.objective-map-node').count(),2);
  assert.ok(await root.locator('[data-action="ordering"]').isVisible());
  await root.locator('[data-action="ordering"]').selectOption('sequential');
  await page.waitForFunction(async id=>{const response=await fetch('/api/objective-map?domain_id='+id,{cache:'no-store'});return (await response.json()).ordering==='sequential'},domain.id,{timeout:10000});
  await root.locator('[data-action="from"]').selectOption(String(a.id));
  await root.locator('[data-action="to"]').selectOption(String(b.id));
  // Vérifier la réponse 201 ET la persistance réelle par une seconde connexion.
  const posted=page.waitForResponse(r=>r.url().includes('/api/objective-map/edges')&&r.request().method()==='POST',{timeout:10000});
  await root.locator('[data-action="link"]').click();
  const created=await posted;
  assert.equal(created.status(),201,'La création de liaison doit être confirmée par le serveur');
  const map=await api('/api/objective-map?domain_id='+domain.id);
  assert.deepEqual(map.edges,[{from_id:a.id,to_id:b.id}],'La liaison doit être persistée avant le rendu graphique');
  await page.waitForFunction(async({id,fromId,toId})=>{
    const fresh=await fetch('/api/objective-map?domain_id='+id,{cache:'no-store'});
    return (await fresh.json()).edges.some(e=>e.from_id===fromId&&e.to_id===toId);
  },{id:domain.id,fromId:a.id,toId:b.id},{timeout:10000});
  assert.equal(await root.locator('[data-action="from"]').inputValue(),String(a.id));
  assert.equal(await root.locator('[data-action="to"]').inputValue(),String(b.id));
  await root.locator('path[marker-end]').first().waitFor({state:'attached',timeout:10000});
  await root.locator('[data-node="'+a.id+'"]').hover();
  const dragRequests=[];
  page.on('request',request=>{if(request.url().includes('/api/objective-map/node'))dragRequests.push({method:request.method(),body:request.postData()})});
  const events=[];
  await page.evaluate(()=>{window.__mapEvents=[];for(const type of ['pointerdown','pointermove','pointerup'])document.addEventListener(type,e=>{if(e.target.closest?.('#objectiveMapRoot'))window.__mapEvents.push({type,target:e.target.tagName,node:e.target.closest('[data-node]')?.dataset.node,x:e.clientX,y:e.clientY})},true)});
  // Persist a real pointer drag and verify that coordinates survive refresh.
  const firstNode=root.locator('[data-node="'+a.id+'"]');
  const beforeDrag=await firstNode.boundingBox();
  assert.ok(beforeDrag,'Map node must have a visible bounding box');
  const px=beforeDrag.x+beforeDrag.width/2,py=beforeDrag.y+beforeDrag.height/2;
  await page.mouse.move(px,py);
  await page.mouse.down();
  await page.mouse.move(px+48,py+22,{steps:6});
  await page.mouse.up();
  let savedCoords;
  for(let attempt=0;attempt<60;attempt++){
    savedCoords=(await api('/api/objective-map?domain_id='+domain.id)).nodes.find(n=>n.id===a.id);
    if(Number.isFinite(savedCoords.x)&&Number.isFinite(savedCoords.y))break;
    await page.waitForTimeout(150);
  }
  console.log('DRAG E2E COORDINATES:',JSON.stringify(savedCoords),'PAGE ERRORS:',JSON.stringify(errors),'DRAG REQUESTS:',JSON.stringify(dragRequests),'POINTERS:',JSON.stringify((await page.evaluate(()=>window.__mapEvents)).filter(e=>e.type!=='pointermove').slice(-10)));
  assert.ok(Number.isFinite(savedCoords.x)&&Number.isFinite(savedCoords.y));

  await root.locator('[data-node="'+a.id+'"]').click();
  await root.locator('[data-action="validation"]').selectOption('tasks');
  await page.waitForFunction(async({domainId,nodeId})=>{const response=await fetch('/api/objective-map?domain_id='+domainId,{cache:'no-store'});const map=await response.json();return map.nodes.find(x=>x.id===nodeId)?.validation_mode==='tasks'},{domainId:domain.id,nodeId:a.id},{timeout:10000});
  await root.locator('[data-action="required"]').uncheck();
  await page.waitForFunction(async({domainId,nodeId})=>{
    const response=await fetch('/api/objective-map?domain_id='+domainId,{cache:'no-store'});
    return (await response.json()).nodes.find(x=>x.id===nodeId)?.required===0;
  },{domainId:domain.id,nodeId:a.id},{timeout:10000});
  await page.reload({waitUntil:'domcontentloaded'});
  if(await page.locator('#sideNav').evaluate(el=>el.classList.contains('is-collapsed')))await page.locator('#sideNavToggle').click();
  await page.locator('.tabs button[data-view="library"]').click();
  await page.locator('.library-domain-open').filter({hasText:'Cartes E2E'}).click();
  await root.locator('.objective-map-node').first().waitFor();
  assert.equal(await root.locator('[data-action="ordering"]').inputValue(),'sequential');
  assert.deepEqual((await api('/api/objective-map?domain_id='+domain.id)).edges,[{from_id:a.id,to_id:b.id}],
    'La liaison doit persister après rechargement complet du navigateur');
  assert.equal((await api('/api/objective-map?domain_id='+domain.id)).nodes.find(n=>n.id===a.id).required,0);

  assert.ok(await root.locator('path[marker-end]').count()>0);
  await root.locator('[data-action="from"]').selectOption(String(a.id));
  await root.locator('[data-action="to"]').selectOption(String(b.id));
  const beforeUnlinkCanvas=await root.locator('.objective-map-canvas').elementHandle();
  await root.locator('[data-action="unlink"]').click();
  await page.waitForFunction(async id=>{
    const response=await fetch('/api/objective-map?domain_id='+id,{cache:'no-store'});
    return (await response.json()).edges.length===0;
  },domain.id,{timeout:10000});
  await page.waitForFunction(async id=>(await(await fetch('/api/objective-map?domain_id='+id,{cache:'no-store'})).json()).edges.length===0,domain.id,{timeout:10000});
  // Wait for the previous asynchronous UI refresh before starting a new gesture.
  await page.waitForFunction(element=>!element.isConnected,beforeUnlinkCanvas,{timeout:10000});
  await page.waitForFunction(()=>document.querySelectorAll('#objectiveMapRoot .objective-map-edge').length===0,null,{timeout:10000});
  // Visual handle linking, then right-click on the line to remove it.
  const handle=root.locator('[data-node="'+a.id+'"] .objective-map-handle');
  const targetNode=root.locator('[data-node="'+b.id+'"]');
  const h=await handle.boundingBox(), t=await targetNode.boundingBox();
  assert.ok(h&&t,'Both connection endpoints should be visible');
  await page.mouse.move(h.x+h.width/2,h.y+h.height/2);
  await page.mouse.down();
  await page.mouse.move(t.x+t.width/2,t.y+t.height/2,{steps:8});
  await page.mouse.up();
  await page.waitForFunction(async id=>(await(await fetch('/api/objective-map?domain_id='+id,{cache:'no-store'})).json()).edges.length===1,domain.id,{timeout:10000});
  console.log('AFTER VISUAL LINK',JSON.stringify(await root.evaluate(el=>({edges:el.querySelectorAll('.objective-map-edge').length,handles:el.querySelectorAll('.objective-map-handle').length,notices:[...el.querySelectorAll('[role=alert]')].map(x=>x.textContent)}))),JSON.stringify((await api('/api/objective-map?domain_id='+domain.id)).edges));
  // Le test peut conserver le scroll de la Bibliothèque après F5 :
  // il faut repositionner la carte SOUS l'en-tête fixe avant le clic droit.
  await page.evaluate(async()=>{
    const viewport=document.querySelector('#objectiveMapRoot .objective-map-viewport');
    const header=document.querySelector('.topbar');
    const desiredTop=(header?.getBoundingClientRect().height||100)+25;
    const absoluteTop=viewport.getBoundingClientRect().top+window.scrollY;
    window.scrollTo({top:Math.max(0,absoluteTop-desiredTop),behavior:'instant'});
    await new Promise(resolve=>requestAnimationFrame(resolve));
  });
  const edge=root.locator('.objective-map-edge').first();
  await edge.waitFor({state:'attached',timeout:10000});
  // Le trait ne mesure que quelques pixels ; selon le zoom du navigateur,
  // son milieu peut être masqué par une étape. Essayer plusieurs points du
  // trait par de VRAIS clics droits avant de conclure à un défaut du menu.
  let contextOpened=false;
  for(const fraction of [.5,.55,.45,.6,.4]){
    const point=await edge.evaluate((path,part)=>{
      const local=path.getPointAtLength(path.getTotalLength()*part);
      const global=new DOMPoint(local.x,local.y).matrixTransform(path.getScreenCTM());
      return {x:global.x,y:global.y};
    },fraction);
    await page.mouse.click(point.x,point.y,{button:'right'});
    contextOpened=await root.locator('.objective-map-context').count()>0;
    if(contextOpened)break;
  }
  if(!contextOpened){
    const debug=await edge.evaluate(path=>{
      const point=path.getPointAtLength(path.getTotalLength()/2);
      const loc=new DOMPoint(point.x,point.y).matrixTransform(path.getScreenCTM());
      const hit=document.elementFromPoint(loc.x,loc.y);
      const vp=path.closest('.objective-map-viewport');
      const rect=vp?.getBoundingClientRect();
      return {midpoint:{x:loc.x,y:loc.y},target:hit?.outerHTML.slice(0,240),
        viewport:rect&&{left:rect.left,right:rect.right,top:rect.top,bottom:rect.bottom},
        hits:[...vp.querySelectorAll('.objective-map-edge')].map(x=>x.getAttribute('d'))};
    });
    console.log('OBJECTIVE CONTEXT RIGHT CLICK DEBUG',JSON.stringify(debug));
  }
  assert.ok(contextOpened,'Un clic droit sur le tracé doit ouvrir Supprimer la liaison');
  await root.locator('.objective-map-context').click();
  await page.waitForFunction(async id=>(await(await fetch('/api/objective-map?domain_id='+id,{cache:'no-store'})).json()).edges.length===0,domain.id,{timeout:10000});
  assert.deepEqual(errors,[]);
  console.log('PASS: objective map integration, links, validation and reload persistence');
 }finally{
  if(browser)await browser.close();
  server.kill();rmSync(data,{recursive:true,force:true});
 }
})().catch(e=>{console.error(e);process.exitCode=1});
