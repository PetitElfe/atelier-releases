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
  // Retired calendar-preparation controls are hidden, not erased from SQLite.
  assert.equal(await page.locator('#eventAddPreparation').count(),0);
  assert.equal(await page.locator('#sideNav [data-view="preparations"]').count(),0);
  const tomorrow=new Date();tomorrow.setDate(tomorrow.getDate()+1);
  const next=new Date(tomorrow);next.setDate(next.getDate()+7);
  const created=await api('/api/events','POST',{
    title:'Ancien rendez-vous avec préparatifs',
    event_date:ymd(tomorrow),start_time:'10:00',end_time:'11:00',
    recurrence:'weekly',preparations:[{title:'Préparer le dossier'}]
  });
  let events=await api('/api/events?start='+ymd(tomorrow)+'&end='+ymd(next));
  assert.equal(events.length,2);assert.equal(events[0].preparations.length,1);
  assert.equal(events[1].preparations_remaining,1);
  // Saving the appointment WITHOUT a preparations field must NEVER erase
  // existing preparative templates.
  await api('/api/events/'+created.id,'PUT',{
    title:'Ancien rendez-vous avec préparatifs',event_date:ymd(tomorrow),
    start_time:'10:00',end_time:'11:00',recurrence:'weekly',notes:'Mise à jour sans perte'
  });
  events=await api('/api/events?start='+ymd(tomorrow)+'&end='+ymd(next));
  assert.equal(events[0].preparations.length,1);
  const id=events[0].preparations[0].id;
  await api('/api/events/'+created.id+'/preparations/'+id,'PUT',
    {instance_date:ymd(tomorrow),done:true});
  events=await api('/api/events?start='+ymd(tomorrow)+'&end='+ymd(next));
  assert.equal(events[0].preparations_remaining,0);
  assert.equal(events[1].preparations_remaining,1);
  await page.reload({waitUntil:'domcontentloaded'});
  assert.equal(await page.locator('#homePreparationBadge').count(),0);
  const preserved=await api('/api/events?start='+ymd(tomorrow)+'&end='+ymd(next));
  assert.equal(preserved[0].preparations_remaining,0);
  assert.deepEqual(errors,[]);
  console.log('PASS: retired appointment prep UI hides old controls, preserves historical templates and per-occurrence checks');
 }finally{
  if(browser)await browser.close();
  server.kill();
  rmSync(data,{recursive:true,force:true,maxRetries:5,retryDelay:150});
 }
})().catch(e=>{console.error(e);process.exitCode=1});
