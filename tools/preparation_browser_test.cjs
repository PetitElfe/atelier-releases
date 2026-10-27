/* End-to-end: rendez-vous + préparatifs J-1, vraie UI, base SQLite temporaire. */
const {chromium}=require('playwright');
const {spawn}=require('node:child_process');
const {mkdtempSync,rmSync}=require('node:fs');
const {tmpdir}=require('node:os');
const {join,resolve}=require('node:path');
const assert=require('node:assert/strict');
const port=18807,base='http://127.0.0.1:'+port;
const data=mkdtempSync(join(tmpdir(),'atelier-preparations-'));
const server=spawn('python',[resolve(__dirname,'..','app','app.py')],{
  env:{...process.env,ATELIER_DATA_DIR:data,ATELIER_NO_BROWSER:'1',ATELIER_PORT:String(port)},stdio:'ignore'
});
async function ready(){for(let i=0;i<120;i++){try{if((await fetch(base+'/api/version')).ok)return}catch{}await new Promise(r=>setTimeout(r,150))}throw Error('Startup timeout')}
async function api(path,method='GET',body){
 const r=await fetch(base+path,{method,headers:{'Content-Type':'application/json'},body:body===undefined?undefined:JSON.stringify(body)});
 const j=await r.json();if(!r.ok)throw Error(path+' '+r.status+' '+JSON.stringify(j));return j;
}
function ymd(date){return date.getFullYear()+'-'+String(date.getMonth()+1).padStart(2,'0')+'-'+String(date.getDate()).padStart(2,'0')}
(async()=>{
 let browser;
 try{
  await ready();
  browser=await chromium.launch({headless:true});
  const page=await browser.newPage({viewport:{width:1400,height:900}});
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto(base,{waitUntil:'domcontentloaded'});
  if(await page.locator('#sideNav').evaluate(el=>el.classList.contains('is-collapsed')))await page.locator('#sideNavToggle').click();
  await page.locator('.tabs button[data-view="calendar"]').click();
  await page.locator('.calendar-modes button[data-calendar-mode="week"]').click();
  await page.locator('#addEventWeek').click();
  const tomorrow=new Date();tomorrow.setDate(tomorrow.getDate()+1);
  await page.locator('#eventForm [name="title"]').fill('Rendez-vous préparation E2E');
  await page.locator('#eventForm [name="event_date"]').fill(ymd(tomorrow));
  await page.locator('#eventForm [name="start_time"]').fill('10:00');
  await page.locator('#eventForm [name="end_time"]').fill('11:00');
  await page.locator('#eventForm [name="recurrence"]').selectOption('weekly');
  await page.locator('#eventAddPreparation').click();
  await page.locator('#eventPreparationFields input').fill('Préparer le dossier');
  await page.locator('#saveEvent').click();
  await page.locator('#eventForm').waitFor({state:'detached'});
  const next=new Date(tomorrow);next.setDate(next.getDate()+7);
  const events=await api('/api/events?start='+ymd(tomorrow)+'&end='+ymd(next));
  assert.equal(events.length,2);
  assert.equal(events[0].preparations.length,1);
  assert.equal(events[1].preparations_remaining,1);
  // Le tiroir du semainier ne change pas la hauteur des créneaux.
  const card=page.locator('.week-timed-event').filter({hasText:'Rendez-vous préparation E2E'}).first();
  await card.hover();
  const weekHeight=await page.locator('#weekGrid').evaluate(el=>el.getBoundingClientRect().height);
  await card.locator('.calendar-hover-action.prepare').click();
  await page.locator('.event-prep-drawer').waitFor({state:'visible'});
  assert.match(await page.locator('.event-prep-drawer').innerText(),/Préparer le dossier/);
  assert.equal(await page.locator('#weekGrid').evaluate(el=>el.getBoundingClientRect().height),weekHeight);
  await page.locator('.event-prep-drawer-head button').click();
  const badge=page.locator('#homePreparationBadge');
  await page.locator('#globalHomeShortcut').click();
  await badge.waitFor({state:'visible'});
  assert.match(await badge.innerText(),/1/);
  await badge.click();
  await page.locator('#upcomingPreparationList input[type=checkbox]').check();
  await page.waitForFunction(async()=>{
    const r=await fetch('/api/preparations/upcoming');
    return (await r.json()).length===0;
  });
  await page.locator('#closeUpcomingPreparation').click();
  await page.reload();
  await page.locator('#homePreparationBadge').waitFor({state:'hidden'});
  const updated=await api('/api/events?start='+ymd(tomorrow)+'&end='+ymd(next));
  assert.equal(updated[0].preparations_remaining,0);
  assert.equal(updated[1].preparations_remaining,1);
  assert.deepEqual(errors,[]);
  console.log('PASS: preparation editor, J-1 badge, independent weekly checks, reload');
 }finally{
  if(browser)await browser.close();
  server.kill();
  rmSync(data,{recursive:true,force:true,maxRetries:5,retryDelay:150});
 }
})().catch(e=>{console.error(e);process.exitCode=1});
