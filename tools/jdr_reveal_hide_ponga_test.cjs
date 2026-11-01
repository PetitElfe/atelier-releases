const {chromium}=require('playwright');
const assert=require('node:assert/strict');
const {spawn}=require('node:child_process');
const {mkdtempSync,rmSync}=require('node:fs');
const {join,resolve}=require('node:path');
const {tmpdir}=require('node:os');
const PORT=18874,BASE='http://127.0.0.1:'+PORT;
const dir=mkdtempSync(join(tmpdir(),'atelier-reveal-mask-'));
const processServer=spawn('python',[resolve(__dirname,'..','app','app.py')],{env:{...process.env,ATELIER_DATA_DIR:dir,ATELIER_PORT:String(PORT),ATELIER_NO_BROWSER:'1'},stdio:'ignore'});
async function waitReady(){for(let i=0;i<130;i++){try{if((await fetch(BASE+'/api/version')).ok)return}catch(_){}await new Promise(r=>setTimeout(r,100))}throw Error('server start timeout')}
async function get(){return (await (await fetch(BASE+'/api/jdr/manoir')).json()).state}
async function wait(test,name){for(let i=0;i<110;i++){const x=await get();if(x&&test(x))return x;await new Promise(r=>setTimeout(r,130))}throw Error('Missing state: '+name)}
async function canvasClick(page,col,row){
  const canvas=page.locator('#board');await canvas.scrollIntoViewIfNeeded();
  const pt=await canvas.evaluate((el,p)=>{const r=el.getBoundingClientRect();return {x:r.x+(85+(p.col+0.5)*46)*(r.width/el.width),y:r.y+(76+(p.row+0.5)*46)*(r.height/el.height)}},{col,row});
  await page.mouse.click(pt.x,pt.y);
}
async function main(){
 let browser;
 try{
 await waitReady();browser=await chromium.launch({headless:true});
 const p=await browser.newPage({viewport:{width:1600,height:980}});
 const errs=[];p.on('pageerror',e=>errs.push(e.message));
 await p.goto(BASE+'/jdr-manoir.html?mode=mj');
 await wait(s=>s.sheets?.some(c=>c.name==='Ponga'),'roster');
 assert.equal(await p.locator('#tool').inputValue(),'toggle');
 await canvasClick(p,14,9);await wait(s=>s.seen.salon===true,'first click reveals');
 await canvasClick(p,14,9);await wait(s=>s.seen.salon===false,'second click hides');
 await p.locator('#roomSelect').selectOption('library');
 await p.locator('#revealRoom').click();
 assert.equal(await p.locator('#tool').inputValue(),'reveal');
 await wait(s=>s.seen.library===true,'reveal button');
 await canvasClick(p,14,9);await wait(s=>s.seen.salon===true,'reveal mode applied on map');
 await p.locator('#roomSelect').selectOption('salon');
 await p.locator('#hideRoom').click();
 assert.equal(await p.locator('#tool').inputValue(),'hide');
 await wait(s=>s.seen.salon===false,'hide button');
 await canvasClick(p,3,9);await wait(s=>s.seen.library===false,'hide mode applied on map');
 await p.locator('[data-tab="sheets"]').click();
 await p.locator('#sheetTabs button').filter({hasText:'Ponga'}).click();
 const panel=p.locator('#sheetContent');
 for(const name of ['Attaque de poussée','Provocation','Ralliement'])assert.ok((await panel.innerText()).includes(name));
 assert.equal(await p.locator('#pongaEquipmentOption').inputValue(),'');
 const st=await get();const ponga=st.sheets.find(c=>c.name==='Ponga');
 assert.equal(ponga.equipmentConfirmed,false);assert.equal(ponga.maneuvers.length,3);
 assert.ok(!ponga.equipment.length);
 await p.locator('#pongaEquipmentOption').selectOption('scale');
 await p.locator('#pongaEquipmentConfirm').click();
 const confirmed=await wait(s=>s.sheets.some(c=>c.name==='Ponga'&&c.equipmentConfirmed&&c.equipmentChoice==='scale'),'Ponga equipment confirmed explicitly');
 assert.ok(confirmed.sheets.find(c=>c.name==='Ponga').equipment.includes("Armure d'écailles"));
 await p.reload();
 await wait(s=>s.seen.library===false&&s.seen.salon===false,'room visibility persisted');
 await p.locator('[data-tab="sheets"]').click();await p.locator('#sheetTabs button').filter({hasText:'Ponga'}).click();
 assert.equal(await p.locator('#pongaEquipmentOption').inputValue(),'scale');
 assert.deepEqual(errs,[]);
 console.log('PASS: click toggle reveals/hides, Hide/Revealer buttons control map, Ponga 3 maneuvers, equipment confirmation opt-in, persistent room states');
 }finally{if(browser)await browser.close();processServer.kill();rmSync(dir,{recursive:true,force:true,maxRetries:5,retryDelay:100})}
}
main().catch(e=>{console.error(e);process.exitCode=1});
