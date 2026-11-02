/* JDR ambiences: MJ-only editable YouTube links, exclusive player, persistence. */
const {chromium}=require('playwright');
const assert=require('node:assert/strict');
const {spawn}=require('node:child_process');
const {mkdtempSync,rmSync}=require('node:fs');
const {join,resolve}=require('node:path');
const {tmpdir}=require('node:os');
const PORT=18872,BASE='http://127.0.0.1:'+PORT,db=mkdtempSync(join(tmpdir(),'atelier-jdr-ambiences-'));
const server=spawn('python',[resolve(__dirname,'..','app','app.py')],{env:{...process.env,ATELIER_DATA_DIR:db,ATELIER_PORT:String(PORT),ATELIER_NO_BROWSER:'1'},stdio:'ignore'});
async function ready(){for(let i=0;i<120;i++){try{if((await fetch(BASE+'/api/version')).ok)return}catch(e){}await new Promise(r=>setTimeout(r,120))}throw Error('Server startup timeout')}
async function getState(){return (await (await fetch(BASE+'/api/jdr/manoir')).json()).state}
async function waitSaved(test,description){for(let i=0;i<90;i++){const state=await getState();if(state&&test(state))return state;await new Promise(r=>setTimeout(r,160))}throw Error('Persistence timeout: '+description)}
async function main(){
 let browser;
 try {
  await ready();browser=await chromium.launch({headless:true});
  const mj=await browser.newPage({viewport:{width:1440,height:920}});
  mj.on('pageerror',e=>{throw new Error('MJ script error: '+e.message)});
  // Do not call YouTube servers: this test checks the HTML player and URL,
  // not copyrighted media playback or third-party network availability.
  await mj.route('**/youtube-nocookie.com/**',route=>route.abort());
  await mj.goto(BASE+'/jdr-manoir.html?mode=mj',{waitUntil:'domcontentloaded'});
  await mj.waitForFunction(()=>document.getElementById('ambienceButtons').querySelectorAll('button').length>=6);
  await mj.waitForFunction(()=>document.getElementById('syncStatus').textContent.includes('Relié à L’Atelier'),null,{timeout:16000});
  assert.ok(await mj.locator('#ambiencePanel').isVisible());
  assert.equal(await mj.locator('#ambiencePlayback').isVisible(),false);
  await mj.locator('#ambienceButtons button').filter({hasText:'Marché'}).first().click();
  assert.ok((await mj.locator('#ambienceStatus').innerText()).includes('Ajoute une URL'));
  await mj.locator('#ambienceName').fill('Marché médiéval');
  await mj.locator('#ambienceUrl').fill('https://www.youtube.com/watch?v=dQw4w9WgXcQ');
  await mj.locator('#ambienceSave').click();
  await waitSaved(s=>s.ambiences?.some(x=>x.name==='Marché médiéval'&&x.url.includes('dQw4w9WgXcQ')),'market URL');
  await mj.locator('#ambienceButtons button').filter({hasText:'Marché médiéval'}).first().click();
  let frame=mj.locator('#ambienceFrameHolder iframe');
  assert.equal(await frame.count(),1);
  assert.ok((await frame.getAttribute('src')).includes('dQw4w9WgXcQ'));
  assert.equal(await mj.locator('#ambiencePlayback').isVisible(),true);
  await mj.locator('#ambienceButtons button[aria-label="Modifier Forêt"]').click();
  await mj.locator('#ambienceName').fill('Forêt mystérieuse');
  await mj.locator('#ambienceUrl').fill('https://youtu.be/5qap5aO4i9A');
  await mj.locator('#ambienceSave').click();
  await waitSaved(s=>s.ambiences?.some(x=>x.name==='Forêt mystérieuse'&&x.url.includes('5qap5aO4i9A')),'forest URL');
  await mj.locator('#ambienceButtons button').filter({hasText:'Forêt mystérieuse'}).first().click();
  assert.equal(await frame.count(),1,'previous YouTube iframe must be removed');
  assert.ok((await frame.getAttribute('src')).includes('5qap5aO4i9A'));
  assert.ok(!(await frame.getAttribute('src')).includes('dQw4w9WgXcQ'),'old ambience should be stopped');
  await mj.locator('[data-tab="sheets"]').click();
  assert.equal(await frame.count(),1,'tab navigation must not stop the music');
  assert.ok(await mj.locator('#ambiencePanel').isVisible());
  await mj.locator('#ambienceButtons .ambience-stop').click();
  assert.equal(await frame.count(),0,'stop must remove YouTube iframe');
  assert.equal(await mj.locator('#ambiencePlayback').isVisible(),false);
  // Persisted in the Atelier server after closing and reopening.
  await mj.reload({waitUntil:'domcontentloaded'});
  await mj.waitForFunction(()=>document.querySelector('#ambienceButtons')?.innerText.includes('Forêt mystérieuse'));
  assert.ok((await mj.locator('#ambienceButtons').innerText()).includes('Marché médiéval'));
  // Invalid third-party URLs are not accepted.
  await mj.locator('#ambienceButtons button[aria-label="Modifier Forêt mystérieuse"]').click();
  await mj.locator('#ambienceUrl').fill('https://not-youtube.example/something');
  await mj.locator('#ambienceSave').click();
  assert.ok((await mj.locator('#ambienceStatus').innerText()).includes('URL non reconnue'));
  // Streaming window cannot show the MJ-only sound manager.
  const player=await browser.newPage({viewport:{width:1200,height:800}});
  await player.goto(BASE+'/jdr-manoir.html?mode=players',{waitUntil:'domcontentloaded'});
  assert.equal(await player.locator('#ambiencePanel').isVisible(),false);
  assert.equal(await player.locator('#ambiencePlayback').isVisible(),false);
  assert.equal(await player.locator('#playerStageCanvas').isVisible(),true);
  console.log('PASS: MJ ambience buttons, saved YouTube URLs, exclusive iframe, tab navigation, stop, invalid host, and player-only privacy');
 }finally{
  if(browser)await browser.close();
  server.kill();rmSync(db,{recursive:true,force:true,maxRetries:5,retryDelay:100});
 }
}
main().catch(e=>{console.error(e);process.exitCode=1});
