/* Check that the native Atelier page is the players' full map and MJ runs separately. */
const {chromium}=require('playwright');
const assert=require('node:assert/strict');
const {spawn}=require('node:child_process');
const {mkdtempSync,rmSync}=require('node:fs');
const {join,resolve}=require('node:path');
const {tmpdir}=require('node:os');
const PORT=18871,BASE='http://127.0.0.1:'+PORT,db=mkdtempSync(join(tmpdir(),'atelier-players-mj-'));
const server=spawn('python',[resolve(__dirname,'..','app','app.py')],{env:{...process.env,ATELIER_DATA_DIR:db,ATELIER_PORT:String(PORT),ATELIER_NO_BROWSER:'1'},stdio:'ignore'});
async function ready(){for(let i=0;i<110;i++){try{if((await fetch(BASE+'/api/version')).ok)return}catch(e){}await new Promise(r=>setTimeout(r,120))}throw Error('Server did not start')}
async function remote(){return (await (await fetch(BASE+'/api/jdr/manoir')).json()).state}
async function waitFor(f,desc){for(let i=0;i<80;i++){const s=await remote();if(f(s))return s;await new Promise(r=>setTimeout(r,180))}throw Error('State timeout: '+desc)}
async function main(){let browser;
 try{
  await ready();browser=await chromium.launch({headless:true});
  const player=await browser.newPage({viewport:{width:1480,height:890}});
  const errors=[];player.on('pageerror',e=>errors.push('player: '+e.message));
  await player.goto(BASE+'/jdr.html',{waitUntil:'domcontentloaded'});
  await player.waitForURL(/jdr-manoir\.html\?mode=players/);
  assert.equal(await player.locator('#playerStageCanvas').isVisible(),true,'Main Atelier window must display full player map');
  assert.equal(await player.locator('#miniBoard').isVisible(),false,'Main window must not display MJ mini map');
  assert.equal(await player.locator('#shHp').isVisible(),false,'Player stream must not display Shoulkar stats');
  assert.equal(await player.locator('#playerFullscreen').isVisible(),true);
  assert.equal(await player.locator('#playerStage .player-return').isVisible(),true,'The game window must provide a return to Atelier');
  assert.equal(await player.locator('#playerModeStatus').isVisible(),false,'Private sync status must not appear on the streamed map');
  assert.equal(await player.locator('#launchMjConsole').isVisible(),false,'MJ launcher must stay tucked away until the host opens setup');
  assert.equal(await player.locator('.jdr-head-actions').isVisible(),false,'MJ actions must never appear in player mode');
  await waitFor(s=>s&&Array.isArray(s.tokens),'initial manor save');
  const initial=await player.locator('#playerStageCanvas').evaluate(c=>c.toDataURL('image/png'));
  // On Linux the native Edge launcher is unavailable; button must gracefully use popup.
  const mjPopup=player.waitForEvent('popup',{timeout:12000});
  await player.locator('#playerStage .host-tools summary').click();
  await player.locator('#launchMjConsole').click();
  const mj=await mjPopup;await mj.waitForLoadState();
  mj.on('pageerror',e=>errors.push('MJ: '+e.message));
  assert.ok(mj.url().includes('mode=mj'),'MJ uses separate console URL');
  assert.equal(await mj.locator('#miniBoard').isVisible(),true);
  assert.equal(await mj.locator('#playerStageCanvas').isVisible(),false);
  assert.equal(await mj.locator('.jdr-top .mj-return').isVisible(),true,'MJ console must provide a return to Atelier');
  assert.equal(await mj.locator('#syncStatus').isVisible(),true,'Connection diagnostics should stay in MJ console');
  await mj.locator('#roomSelect').selectOption('hall');
  await mj.locator('#spawnParty').click();
  const withPlayers=await waitFor(s=>s?.seen?.hall===true&&s?.tokens?.filter(t=>t.kind==='PJ').every(t=>t.x!=null),'3 PJ in hall');
  await player.waitForFunction(before=>document.getElementById('playerStageCanvas').toDataURL('image/png')!==before,initial,{timeout:10000});
  const pj=withPlayers.tokens.find(t=>t.kind==='PJ');
  assert.ok(pj&&pj.x!=null&&pj.y!=null);
  // Moving a pawn in the main player window must persist to MJ server state.
  const canvas=player.locator('#playerStageCanvas');
  const pts=await canvas.evaluate((el,t)=>{
   const rect=el.getBoundingClientRect(),factor=Math.min(rect.width/el.width,rect.height/el.height);
   const x0=rect.x+(rect.width-el.width*factor)/2,y0=rect.y+(rect.height-el.height*factor)/2;
   const p=(x,y)=>({x:x0+(85+(x+.5)*46)*factor,y:y0+(76+(y+.5)*46)*factor});
   return {from:p(t.x,t.y),to:p(t.x,t.y-1)};
  },pj);
  await player.mouse.move(pts.from.x,pts.from.y);await player.mouse.down();await player.mouse.move(pts.to.x,pts.to.y,{steps:5});await player.mouse.up();
  // If moved within the hall, one row up is valid (unless the spawn was against top wall).
  await waitFor(s=>s?.tokens.find(t=>t.id===pj.id)?.y===pj.y-1,'player window drag');
  assert.deepEqual(errors,[]);
  // Full-screen player sharing must hide all preparation / navigation chrome.
  await player.locator('#playerFullscreen').click();
  await player.waitForFunction(()=>document.fullscreenElement?.id==='playerStage',{timeout:10000});
  assert.equal(await player.locator('#playerStage .player-bar').first().isVisible(),false,'No host/MJ toolbar should be streamed in fullscreen');
  assert.equal(await player.locator('#playerStageCanvas').isVisible(),true);
  await player.keyboard.press('Escape');
  await player.waitForFunction(()=>!document.fullscreenElement);
  // Both return links are functional, not merely decorative.
  await player.locator('#playerStage .player-return').click();
  await player.waitForURL(url=>url.pathname==='/',{timeout:10000});
  assert.ok(await player.locator('#homeView').count(),'Player return should open Atelier');
  await mj.locator('.jdr-top .mj-return').click();
  await mj.waitForURL(url=>url.pathname==='/',{timeout:10000});
  assert.ok(await mj.locator('#homeView').count(),'MJ return should open Atelier');
  console.log('PASS: separate streamed map, GM-only controls/status, return links and fullscreen without chrome.');
 }finally{if(browser)await browser.close();server.kill();rmSync(db,{recursive:true,force:true,maxRetries:5,retryDelay:100})}}
main().catch(e=>{console.error(e);process.exitCode=1});
