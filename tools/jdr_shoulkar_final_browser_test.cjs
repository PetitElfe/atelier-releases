/* Validate ready-to-play 3-PJ roster and the complete Shoulkar statblock in MJ console. */
const {chromium}=require('playwright');
const assert=require('node:assert/strict');
const {spawn}=require('node:child_process');
const {mkdtempSync,rmSync}=require('node:fs');
const {join,resolve}=require('node:path');
const {tmpdir}=require('node:os');
const PORT=18873,BASE='http://127.0.0.1:'+PORT,db=mkdtempSync(join(tmpdir(),'atelier-shoulkar-'));
const server=spawn('python',[resolve(__dirname,'..','app','app.py')],{env:{...process.env,ATELIER_DATA_DIR:db,ATELIER_PORT:String(PORT),ATELIER_NO_BROWSER:'1'},stdio:'ignore'});
async function ready(){for(let i=0;i<110;i++){try{if((await fetch(BASE+'/api/version')).ok)return}catch(e){}await new Promise(r=>setTimeout(r,120))}throw Error('server startup timeout')}
async function state(){return (await(await fetch(BASE+'/api/jdr/manoir')).json()).state}
async function saved(test,what){for(let i=0;i<100;i++){const s=await state();if(s&&test(s))return s;await new Promise(r=>setTimeout(r,160))}throw Error('No persisted '+what)}
async function main(){
 let browser;
 try{
  await ready();browser=await chromium.launch({headless:true});
  const mj=await browser.newPage({viewport:{width:1600,height:1050}});
  const errors=[];mj.on('pageerror',e=>errors.push(e.message));
  await mj.goto(BASE+'/jdr-manoir.html?mode=mj');
  let s=await saved(s=>s.sheets?.some(p=>p.name==='Ponga')&&s.sheets?.some(p=>p.name==='Lyko'),'three player sheets');
  const ponga=s.sheets.find(p=>p.name==='Ponga');
  assert.equal(ponga.hp,26);assert.ok(ponga.biography.includes('kobold'));assert.ok(ponga.biography.includes('cirque'));
  assert.ok(!JSON.stringify(ponga.features).includes('Fée florale'));
  assert.equal(s.sheets.find(p=>p.name==='Lyko').passivePerception,11);
  await mj.locator('[data-tab="sheets"]').click();
  await mj.locator('#sheetTabs button').filter({hasText:'Ponga'}).click();
  assert.ok((await mj.locator('#sheetContent').innerText()).includes('Passé et personnalité'));
  assert.ok((await mj.locator('#sheetContent textarea').first().inputValue()).includes('cirque'));
  await mj.locator('[data-tab="shoulkar"]').click();
  assert.equal(await mj.locator('#shHp').inputValue(),'48');
  assert.ok((await mj.locator('[data-panel="shoulkar"]').innerText()).includes('1d6+2'));
  await mj.locator('#shDelta').fill('7');
  await mj.locator('#shDamage').click();
  await mj.locator('#shUseTp').click();
  await mj.locator('#shUseShadow').click();
  await mj.locator('#shUseNightmare').click();
  s=await saved(s=>s.shoulkar.hp===41&&s.shoulkar.teleports===1&&s.shoulkar.shadowCharges===1&&s.shoulkar.nightmareUsed===true,'Shoulkar resources and 7 damage');
  await mj.reload();
  await mj.locator('[data-tab="shoulkar"]').click();
  await mj.waitForFunction(()=>document.getElementById('shHp').value==='41');
  assert.equal(await mj.locator('#shTp').inputValue(),'1');
  assert.equal(await mj.locator('#shShadow').inputValue(),'1');
  assert.equal(await mj.locator('#shNightmare').isChecked(),true);
  assert.ok((await mj.locator('[data-tab="shoulkar"]').innerText()).includes('41/48 PV'));
  await mj.locator('#shResetAbilities').click();
  s=await saved(s=>s.shoulkar.teleports===2&&s.shoulkar.shadowCharges===2&&s.shoulkar.nightmareUsed===false,'Shoulkar reset abilities');
  const players=await browser.newPage();
  await players.goto(BASE+'/jdr-manoir.html?mode=players');
  assert.equal(await players.locator('[data-panel="shoulkar"]').isVisible(),false);
  assert.ok(await players.locator('#playerStageCanvas').isVisible());
  assert.deepEqual(errors,[]);
  console.log('PASS: all 3 canonical characters, original Ponga circus RP, Lyko perception, detailed Shoulkar stats, 7 damage, charge use/reset and server reload');
 }finally{if(browser)await browser.close();server.kill();rmSync(db,{recursive:true,force:true,maxRetries:5,retryDelay:100})}
}
main().catch(e=>{console.error(e);process.exitCode=1});
