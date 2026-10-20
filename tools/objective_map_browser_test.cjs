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
 const response=await fetch(base+path,{method,headers:{'Content-Type':'application/json'},body:body===undefined?undefined:JSON.stringify(body)});
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
  await page.waitForFunction(async id=>{const response=await fetch('/api/objective-map?domain_id='+id);return (await response.json()).ordering==='sequential'},domain.id,{timeout:10000});
  await root.locator('[data-action="from"]').selectOption(String(a.id));
  await root.locator('[data-action="to"]').selectOption(String(b.id));
  await root.locator('[data-action="link"]').click();
  await page.waitForFunction(async({id})=>{const response=await fetch('/api/objective-map?domain_id='+id);return (await response.json()).edges.length===1},{id:domain.id});
  const map=await api('/api/objective-map?domain_id='+domain.id);
  assert.deepEqual(map.edges,[{from_id:a.id,to_id:b.id}]);
  // Persist a real pointer drag and verify that coordinates survive refresh.
  const firstNode=root.locator('[data-node="'+a.id+'"]');
  const beforeDrag=await firstNode.boundingBox();
  assert.ok(beforeDrag,'Map node must have a visible bounding box');
  const px=beforeDrag.x+beforeDrag.width/2,py=beforeDrag.y+beforeDrag.height/2;
  await page.mouse.move(px,py);
  await page.mouse.down();
  await page.mouse.move(px+48,py+22,{steps:6});
  await page.mouse.up();
  await page.waitForFunction(async ({domainId,nodeId})=>{
    const response=await fetch('/api/objective-map?domain_id='+domainId);
    return (await response.json()).nodes.some(n=>n.id===nodeId&&n.x!==null&&n.y!==null);
  },{domainId:domain.id,nodeId:a.id},{timeout:10000});
  const savedCoords=(await api('/api/objective-map?domain_id='+domain.id)).nodes.find(n=>n.id===a.id);
  console.log('DRAG E2E COORDINATES:',JSON.stringify(savedCoords),'PAGE ERRORS:',JSON.stringify(errors));
  assert.ok(Number.isFinite(savedCoords.x)&&Number.isFinite(savedCoords.y));

  await root.locator('[data-node="'+a.id+'"]').click();
  await root.locator('[data-action="validation"]').selectOption('tasks');
  await page.waitForFunction(async({domainId,nodeId})=>{const response=await fetch('/api/objective-map?domain_id='+domainId);const map=await response.json();return map.nodes.find(x=>x.id===nodeId)?.validation_mode==='tasks'},{domainId:domain.id,nodeId:a.id},{timeout:10000});
  await root.locator('[data-action="required"]').uncheck();
  await page.waitForFunction(async({domainId,nodeId})=>{
    const response=await fetch('/api/objective-map?domain_id='+domainId);
    return (await response.json()).nodes.find(x=>x.id===nodeId)?.required===0;
  },{domainId:domain.id,nodeId:a.id},{timeout:10000});
  await page.reload({waitUntil:'domcontentloaded'});
  if(await page.locator('#sideNav').evaluate(el=>el.classList.contains('is-collapsed')))await page.locator('#sideNavToggle').click();
  await page.locator('.tabs button[data-view="library"]').click();
  await page.locator('.library-domain-open').filter({hasText:'Cartes E2E'}).click();
  await root.locator('.objective-map-node').first().waitFor();
  assert.equal(await root.locator('[data-action="ordering"]').inputValue(),'sequential');
  assert.equal((await api('/api/objective-map?domain_id='+domain.id)).nodes.find(n=>n.id===a.id).required,0);

  assert.ok(await root.locator('path[marker-end]').count()>0);
  await root.locator('[data-action="from"]').selectOption(String(a.id));
  await root.locator('[data-action="to"]').selectOption(String(b.id));
  await root.locator('[data-action="unlink"]').click();
  await page.waitForFunction(async id=>{
    const response=await fetch('/api/objective-map?domain_id='+id);
    return (await response.json()).edges.length===0;
  },domain.id,{timeout:10000});
  assert.equal((await api('/api/objective-map?domain_id='+domain.id)).edges.length,0);
  assert.deepEqual(errors,[]);
  console.log('PASS: objective map integration, links, validation and reload persistence');
 }finally{
  if(browser)await browser.close();
  server.kill();rmSync(data,{recursive:true,force:true});
 }
})().catch(e=>{console.error(e);process.exitCode=1});
