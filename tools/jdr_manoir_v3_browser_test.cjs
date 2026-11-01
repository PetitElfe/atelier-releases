/* Manor V3: exercise the real MJ/player window and isolated server persistence. */
const {chromium}=require('playwright');
const assert=require('node:assert/strict');
const {spawn}=require('node:child_process');
const {mkdtempSync,rmSync}=require('node:fs');
const {tmpdir}=require('node:os');
const {join,resolve}=require('node:path');
const PORT=18870,BASE='http://127.0.0.1:'+PORT;
const data=mkdtempSync(join(tmpdir(),'atelier-manoir-v3-'));
const proc=spawn('python',[resolve(__dirname,'..','app','app.py')],{env:{...process.env,ATELIER_DATA_DIR:data,ATELIER_PORT:String(PORT),ATELIER_NO_BROWSER:'1'},stdio:'ignore'});
async function ready(){for(let i=0;i<130;i++){try{if((await fetch(BASE+'/api/version')).ok)return}catch(_){}await new Promise(r=>setTimeout(r,130))}throw Error('server timeout')}
async function getState(){return (await (await fetch(BASE+'/api/jdr/manoir')).json()).state}
async function main(){
 let browser;
 try{
  await ready();
  browser=await chromium.launch({headless:true});
  const page=await browser.newPage({viewport:{width:1600,height:1000}});
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto(BASE+'/jdr-manoir.html',{waitUntil:'domcontentloaded'});
  // Ensure initial empty-state write is finished before testing a new action.
  await page.waitForFunction(()=>document.getElementById('syncStatus').textContent.includes('sauvegarde réussie'),null,{timeout:15000});
  assert.equal(await page.locator('.tabstrip button').count(),4);
  assert.ok(await page.locator('#miniBoard').isVisible());
  const atlas=await page.locator('#board').evaluate(el=>({width:el.width,height:el.height}));
  assert.deepEqual(atlas,{width:1120,height:770});
  await page.locator('#roomSelect').selectOption('hall');
  await page.locator('#spawnParty').click();
  await page.waitForFunction(async()=>{
   const state=(await (await fetch('/api/jdr/manoir')).json()).state;
   return state&&state.seen.hall&&state.tokens.filter(x=>x.kind==='PJ').every(x=>x.x!==null);
  },{timeout:15000});
  let state=await getState();
  const pj=state.tokens.filter(x=>x.kind==='PJ');
  assert.equal(pj.length,3);
  assert.equal(new Set(pj.map(t=>t.x+','+t.y)).size,3,'Group is not stacked: '+JSON.stringify(pj));
  assert.ok(pj.every(t=>t.y>=10&&t.y<=12),'Spawned in south hall');
  const popupPromise=page.waitForEvent('popup');
  await page.locator('#openPlayers').click();
  const popup=await popupPromise; await popup.waitForLoadState();
  assert.equal(await popup.locator('#playerCanvas').count(),1);
  assert.ok(!(await popup.locator('body').innerText()).includes('PV actuels'),'No secret MJ stats in stream');

  const first=pj[0],canvas=popup.locator('#playerCanvas');
  const points=await canvas.evaluate((el,{source})=>{
    const rect=el.getBoundingClientRect(),scale=Math.min(rect.width/el.width,rect.height/el.height),ox=rect.x+(rect.width-el.width*scale)/2,oy=rect.y+(rect.height-el.height*scale)/2;
    const pixel=(x,y)=>({x:ox+(85+(x+.5)*46)*scale,y:oy+(76+(y+.5)*46)*scale});
    return {from:pixel(source.x,source.y),to:pixel(source.x,source.y+1)};
  },{source:first});
  await popup.mouse.move(points.from.x,points.from.y);await popup.mouse.down();
  await popup.mouse.move(points.to.x,points.to.y,{steps:8});await popup.mouse.up();
  await page.waitForFunction(async({id,y})=>{
    const state=(await (await fetch('/api/jdr/manoir')).json()).state;
    return state?.tokens.find(t=>t.id===id)?.y===y+1;
  },{id:first.id,y:first.y},{timeout:12000});
  state=await getState();
  assert.equal(state.tokens.find(x=>x.id===first.id).y,first.y+1,'Drag moved token independently');
  await page.locator('#roomSelect').selectOption('salon');
  await page.locator('#revealRoom').click();
  await page.waitForFunction(async()=>{
    const state=(await (await fetch('/api/jdr/manoir')).json()).state;
    return state?.seen?.salon===true;
  },{timeout:12000});

  await page.locator('[data-tab="shoulkar"]').click();
  assert.ok(await page.locator('#miniBoard').isVisible());
  assert.equal(await page.locator('#shHp').inputValue(),'48');
  await page.locator('#shDmg5').click();
  assert.equal(await page.locator('#shHp').inputValue(),'43');
  await page.locator('[data-tab="sheets"]').click();
  assert.ok(await page.locator('#miniBoard').isVisible(),'Map remains visible above every sheet');
  await page.locator('#addSheet').click();
  await page.locator('#sheetContent input').first().fill('Sorcière du groupe');
  await page.locator('#sheetContent input').first().press('Tab');
  const imported={name:'Rôdeur',level:3,hp:18,armorClass:15,speed:9};
  await page.locator('#sheetFiles').setInputFiles({name:'rodeur.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(imported))});
  await page.waitForFunction(()=>document.querySelectorAll('#sheetTabs button').length>=2);
  assert.ok((await page.locator('#sheetTabs').innerText()).includes('Rôdeur'));
  await page.reload({waitUntil:'domcontentloaded'});
  await page.waitForFunction(()=>document.getElementById('syncStatus').textContent.includes('Relié à L’Atelier'));
  state=await getState();
  assert.equal(state.shoulkar.hp,43);
  assert.ok(state.sheets.some(s=>s.name==='Sorcière du groupe'));
  assert.ok(state.sheets.some(s=>s.name==='Rôdeur'));
  assert.equal(state.seen.salon,true);
  assert.deepEqual(errors,[]);
  console.log('PASS: Manor MJ map, 3 PJ spawn, player drag, reveal, Shoulkar, sheets, sticky map and API persistence');
 }finally{if(browser)await browser.close();proc.kill();rmSync(data,{recursive:true,force:true,maxRetries:5,retryDelay:150})}
}
main().catch(e=>{console.error(e);process.exitCode=1});
